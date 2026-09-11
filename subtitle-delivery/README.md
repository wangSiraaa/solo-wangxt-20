# 字幕版本交付系统

译制工作室的字幕版本交付系统：译员按片段领取翻译，校对员标记术语/时间轴问题，
制片追踪已交付语言受哪些改动影响。新版画面（剪辑）导入后自动 diff，
插入镜头导致的偏移字幕必须重打轴，纯文字变更保留已通过的时间轴检查。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite（双版本字幕对照、翻译工作台、校对、交付） |
| 服务端 | NestJS 10（片段分配、提交冲突、交付接口） |
| 数据库 | PostgreSQL —— 默认内嵌 PGlite（真实 Postgres WASM，落盘 `server/data/pg`）；设 `DATABASE_URL` 可切换真实实例（见 `docker-compose.yml`） |

## 快速开始

```bash
cd subtitle-delivery
npm install          # 安装全部 workspace 依赖
npm run dev:server   # 启动 API（:3001），首次启动自动灌入样例项目
npm run dev:web      # 另开终端，启动前端（:5173）
```

打开 http://localhost:5173 ，右上角可切换身份（译员A / 译员B / 校对员 / 制片）。

运行测试：

```bash
npm test             # 16 个用例：跨镜头字幕、重复提交、并发冲突、交付门禁等
```

## 样例项目与演示流程

种子数据：《午夜列车》第8集（源语言 zh，目标 en/ja），V1 画面 + 英文译文 +
**V1 英文交付基线**。`samples/` 目录：

- `picture_v1.json` / `picture_v2.json` —— 剪辑表（镜头 + 片段时间码）
- `glossary.csv` —— 术语表；`source_v1.srt` —— 源字幕参考

V2 导演剪辑版在 **00:30 处插入 12 秒航拍镜头**，其后 6 条字幕整体 +12s；
2 号片段仅改台词；9 号片段为新增；5 号片段横跨镜头边界。

### 一次完整演示

1. **导入新版画面**（版本导入页 →「导入样例 V2」）
   导入报告：插入 1 个镜头；片段 3–8 偏移 +12s 标记「待重打轴」（旧时间码不可沿用）；
   片段 2 仅文字变更，**已通过的时间轴检查保留**；片段 5 跨镜头警告；片段 9 新增。
2. **制片看影响**（交付页 → V1 交付包 →「影响分析」）
   列出影响已交付英文的全部改动：源文变更（片段2）、时间码变动+待重打轴（3–8）、新增（9）。
3. **翻译与冲突**（翻译工作台，语言选 ja）
   - 译员A 领取片段 1 并提交；右上角切换为 **译员B**，对同一片段提交不同译文 →
     弹出**冲突解决框**（当前版本 vs 你的版本），选择「采用我的 / 采用当前 / 合并文本」显式解决。
   - 同一提交重复点击/重试会被幂等键去重，不会产生重复版本。
4. **校对**（校对页）标记术语/时间轴问题；提交译文时若未使用术语表约定译法，
   系统自动生成术语问题。
5. **重打轴**（翻译工作台）对「待重打轴」片段点「确认新时间码」。
6. **交付**（交付页）生成 en 交付包：门禁校验（译文齐全 / 无待重打轴 / 无未解决问题）→
   绑定 **V2 画面版本 + 术语表快照**，下载 zip（`subtitles_en.srt` + `glossary.csv` + `manifest.json`）。
   日语因译文不全会被门禁拦截并列出缺口。

## 关键设计

### 版本关系（PostgreSQL）

```
picture_versions 1─N shots            镜头表，导入时按时长配对 diff 出 inserted
segments          1─N segment_timings 时间码按画面版本保存：timing_status + timeline_check
segments          1─N segment_texts   每语言当前译文 + revision（冲突检测基准）
deliveries        ── 绑定 picture_version_id + glossary_snapshot_id
delivery_items                      冻结交付时每条片段的 text/source revision 与时间码
```

### 新画面导入 diff 规则

- 片段时间码变化（如前方插入镜头）→ `timing_status=needs_retime`，`timeline_check=invalidated`；
- 仅源文字变化、时间码未动 → 保留上一版本的 `timeline_check`（含已通过状态），`source_revision+1`；
- 片段入点严格落在片段时间范围内 → `cross_shot` 跨镜头标记，导入报告给出警告。

### 并发提交与冲突

提交必须携带编辑时看到的 `baseRevision`：与当前 revision 一致则合并（revision+1）；
不一致则生成 `conflicts` 记录返回 409，必须显式 `take_mine / take_current / merge` 解决，
不允许静默覆盖。`idempotencyKey` 保证重复提交（双击/重试）幂等。

### 交付包

门禁：目标语言译文齐全、无待重打轴、无未解决校对问题。通过后冻结术语表快照，
按 `delivery_items` 记录每条片段的 revision，打包 zip。
**影响分析**对比交付时冻结的 revision 与当前状态，告诉制片哪些改动（译文更新 /
源文变更 / 时间码变动 / 片段增删）影响已交付语言。

## API 摘要

```
POST /api/projects/:id/versions/import     导入画面版本（body: 剪辑表 JSON）
GET  /api/projects/:id/versions/compare    双版本对照 ?a=1&b=2
GET  /api/projects/:id/segments            片段列表 ?language=ja
POST /api/segments/:id/claim               领取片段
POST /api/segments/:id/submissions         提交译文（baseRevision + idempotencyKey）
POST /api/conflicts/:id/resolve            显式解决冲突
POST /api/segments/:id/retime              确认新时间码
GET/POST /api/projects/:id/issues          校对问题
POST /api/issues/:id/resolve               解决问题
POST /api/projects/:id/deliveries          生成交付包（门禁 422 返回缺口明细）
GET  /api/deliveries/:id/download          下载 zip
GET  /api/deliveries/:id/impact            影响分析
GET  /api/samples/:name                    本地样例文件
```

请求头 `x-user` 标识操作人（URI 编码的中文名）。

## 切换真实 PostgreSQL

```bash
docker compose up -d postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/subtitle_delivery npm run dev:server
```

## 目录

```
subtitle-delivery/
├── samples/                 本地样例：V1/V2 剪辑表、术语表、源 SRT
├── server/                  NestJS API
│   ├── src/db/              PGlite / pg 双驱动 + schema
│   ├── src/modules/         versions(导入diff) segments(领取/冲突) review glossary deliveries
│   └── test/                vitest：跨镜头、重复提交、并发冲突、交付门禁与影响
└── web/                     React + TS 前端（导入/对照/翻译/校对/交付五个页面）
```
