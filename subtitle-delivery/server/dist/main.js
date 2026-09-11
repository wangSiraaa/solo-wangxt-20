"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api');
    app.enableCors();
    const port = Number(process.env.PORT ?? 3001);
    await app.listen(port);
    console.log(`[server] 字幕版本交付系统 API 已启动: http://localhost:${port}/api`);
}
bootstrap();
