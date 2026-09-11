"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SamplesController = exports.DeliveriesController = exports.IssuesController = exports.ConflictsController = exports.SegmentsController = exports.ProjectsController = void 0;
const common_1 = require("@nestjs/common");
const projects_service_1 = require("./projects/projects.service");
const versions_service_1 = require("./versions/versions.service");
const segments_service_1 = require("./segments/segments.service");
const review_service_1 = require("./review/review.service");
const glossary_service_1 = require("./glossary/glossary.service");
const deliveries_service_1 = require("./deliveries/deliveries.service");
function toHttp(err) {
    if (err?.code === 'ALREADY_CLAIMED') {
        throw new common_1.ConflictException({ message: err.message, claimedBy: err.claimedBy });
    }
    if (err?.code === 'ALREADY_RESOLVED') {
        throw new common_1.ConflictException({ message: err.message });
    }
    if (err?.gate) {
        throw new common_1.UnprocessableEntityException(err.gate);
    }
    if (typeof err?.message === 'string' && err.message.includes('不存在')) {
        throw new common_1.NotFoundException(err.message);
    }
    throw err;
}
function userOf(headers) {
    const raw = headers['x-user'] || '';
    if (!raw)
        return '匿名';
    try {
        return decodeURIComponent(raw);
    }
    catch {
        return raw;
    }
}
let ProjectsController = class ProjectsController {
    projects;
    versions;
    segments;
    review;
    glossary;
    deliveries;
    constructor(projects, versions, segments, review, glossary, deliveries) {
        this.projects = projects;
        this.versions = versions;
        this.segments = segments;
        this.review = review;
        this.glossary = glossary;
        this.deliveries = deliveries;
    }
    list() {
        return this.projects.list();
    }
    get(id) {
        try {
            return this.projects.get(id);
        }
        catch (e) {
            toHttp(e);
        }
    }
    // ---- 画面版本 ----
    listVersions(id) {
        return this.versions.listVersions(id);
    }
    async importVersion(id, dto, headers) {
        try {
            return await this.versions.importVersion(id, dto, userOf(headers));
        }
        catch (e) {
            toHttp(e);
        }
    }
    async compare(id, a, b) {
        try {
            return await this.versions.compare(id, Number(a), Number(b));
        }
        catch (e) {
            toHttp(e);
        }
    }
    // ---- 片段 ----
    segmentsList(id, language, version) {
        return this.segments.list(id, language, version ? Number(version) : undefined);
    }
    conflicts(id, status) {
        return this.segments.listConflicts(id, status ?? 'open');
    }
    // ---- 校对问题 ----
    issues(id, language, status) {
        return this.review.list(id, language, status);
    }
    async createIssue(id, body, headers) {
        try {
            return await this.review.create(body.segmentId, body.language, body.type, body.note, userOf(headers));
        }
        catch (e) {
            toHttp(e);
        }
    }
    // ---- 术语表 ----
    glossaryTerms(id, language) {
        return this.glossary.listTerms(id, language);
    }
    addTerm(id, body) {
        return this.glossary.addTerm(id, body.language, body.source, body.target);
    }
    // ---- 交付 ----
    deliveriesList(id) {
        return this.deliveries.list(id);
    }
    async createDelivery(id, body, headers) {
        try {
            return await this.deliveries.create(id, body.language, userOf(headers));
        }
        catch (e) {
            toHttp(e);
        }
    }
};
exports.ProjectsController = ProjectsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProjectsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProjectsController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':id/versions'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProjectsController.prototype, "listVersions", null);
__decorate([
    (0, common_1.Post)(':id/versions/import'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "importVersion", null);
__decorate([
    (0, common_1.Get)(':id/versions/compare'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('a')),
    __param(2, (0, common_1.Query)('b')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "compare", null);
__decorate([
    (0, common_1.Get)(':id/segments'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('language')),
    __param(2, (0, common_1.Query)('version')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], ProjectsController.prototype, "segmentsList", null);
__decorate([
    (0, common_1.Get)(':id/conflicts'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ProjectsController.prototype, "conflicts", null);
__decorate([
    (0, common_1.Get)(':id/issues'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('language')),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], ProjectsController.prototype, "issues", null);
__decorate([
    (0, common_1.Post)(':id/issues'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "createIssue", null);
__decorate([
    (0, common_1.Get)(':id/glossary'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ProjectsController.prototype, "glossaryTerms", null);
__decorate([
    (0, common_1.Post)(':id/glossary'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProjectsController.prototype, "addTerm", null);
__decorate([
    (0, common_1.Get)(':id/deliveries'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProjectsController.prototype, "deliveriesList", null);
__decorate([
    (0, common_1.Post)(':id/deliveries'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "createDelivery", null);
exports.ProjectsController = ProjectsController = __decorate([
    (0, common_1.Controller)('projects'),
    __metadata("design:paramtypes", [projects_service_1.ProjectsService,
        versions_service_1.VersionsService,
        segments_service_1.SegmentsService,
        review_service_1.ReviewService,
        glossary_service_1.GlossaryService,
        deliveries_service_1.DeliveriesService])
], ProjectsController);
let SegmentsController = class SegmentsController {
    segments;
    constructor(segments) {
        this.segments = segments;
    }
    async claim(id, body, headers) {
        try {
            return await this.segments.claim(id, body.language, userOf(headers));
        }
        catch (e) {
            toHttp(e);
        }
    }
    async release(id, language, headers) {
        return this.segments.release(id, language, userOf(headers));
    }
    async submit(id, body, headers) {
        const result = await this.segments.submit(id, body.language, userOf(headers), body.text, body.baseRevision, body.idempotencyKey);
        if (result.status === 'conflict') {
            throw new common_1.ConflictException(result);
        }
        return result;
    }
    async retime(id, body, headers) {
        try {
            return await this.segments.retime(id, userOf(headers), body.startMs, body.endMs);
        }
        catch (e) {
            toHttp(e);
        }
    }
};
exports.SegmentsController = SegmentsController;
__decorate([
    (0, common_1.Post)(':id/claim'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], SegmentsController.prototype, "claim", null);
__decorate([
    (0, common_1.Delete)(':id/claim'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('language')),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], SegmentsController.prototype, "release", null);
__decorate([
    (0, common_1.Post)(':id/submissions'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], SegmentsController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)(':id/retime'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], SegmentsController.prototype, "retime", null);
exports.SegmentsController = SegmentsController = __decorate([
    (0, common_1.Controller)('segments'),
    __metadata("design:paramtypes", [segments_service_1.SegmentsService])
], SegmentsController);
let ConflictsController = class ConflictsController {
    segments;
    constructor(segments) {
        this.segments = segments;
    }
    async resolve(id, body, headers) {
        try {
            return await this.segments.resolveConflict(id, body.strategy, body.mergedText, userOf(headers));
        }
        catch (e) {
            toHttp(e);
        }
    }
};
exports.ConflictsController = ConflictsController;
__decorate([
    (0, common_1.Post)(':id/resolve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ConflictsController.prototype, "resolve", null);
exports.ConflictsController = ConflictsController = __decorate([
    (0, common_1.Controller)('conflicts'),
    __metadata("design:paramtypes", [segments_service_1.SegmentsService])
], ConflictsController);
let IssuesController = class IssuesController {
    review;
    constructor(review) {
        this.review = review;
    }
    async resolve(id, headers) {
        try {
            return await this.review.resolve(id, userOf(headers));
        }
        catch (e) {
            toHttp(e);
        }
    }
};
exports.IssuesController = IssuesController;
__decorate([
    (0, common_1.Post)(':id/resolve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], IssuesController.prototype, "resolve", null);
exports.IssuesController = IssuesController = __decorate([
    (0, common_1.Controller)('issues'),
    __metadata("design:paramtypes", [review_service_1.ReviewService])
], IssuesController);
let DeliveriesController = class DeliveriesController {
    deliveries;
    constructor(deliveries) {
        this.deliveries = deliveries;
    }
    async impact(id) {
        try {
            return await this.deliveries.impact(id);
        }
        catch (e) {
            toHttp(e);
        }
    }
    async download(id) {
        const delivery = await this.deliveries.get(id);
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        if (!fs.existsSync(delivery.file_path)) {
            throw new common_1.NotFoundException('交付包文件不存在');
        }
        const stream = fs.createReadStream(delivery.file_path);
        const { StreamableFile } = await Promise.resolve().then(() => __importStar(require('@nestjs/common')));
        return new StreamableFile(stream, {
            type: 'application/zip',
            disposition: `attachment; filename="delivery_${delivery.language}_v${delivery.version_no}_${path.basename(delivery.file_path)}"`,
        });
    }
};
exports.DeliveriesController = DeliveriesController;
__decorate([
    (0, common_1.Get)(':id/impact'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DeliveriesController.prototype, "impact", null);
__decorate([
    (0, common_1.Get)(':id/download'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DeliveriesController.prototype, "download", null);
exports.DeliveriesController = DeliveriesController = __decorate([
    (0, common_1.Controller)('deliveries'),
    __metadata("design:paramtypes", [deliveries_service_1.DeliveriesService])
], DeliveriesController);
let SamplesController = class SamplesController {
    async getSample(name) {
        const allowed = ['picture_v1.json', 'picture_v2.json', 'glossary.csv', 'source_v1.srt'];
        if (!allowed.includes(name))
            throw new common_1.NotFoundException('样例不存在');
        const { samplesDir } = await Promise.resolve().then(() => __importStar(require('../seed')));
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        const file = path.join(samplesDir(), name);
        if (!fs.existsSync(file))
            throw new common_1.NotFoundException('样例文件缺失');
        const content = fs.readFileSync(file, 'utf-8');
        if (name.endsWith('.json'))
            return JSON.parse(content);
        return content;
    }
};
exports.SamplesController = SamplesController;
__decorate([
    (0, common_1.Get)(':name'),
    __param(0, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SamplesController.prototype, "getSample", null);
exports.SamplesController = SamplesController = __decorate([
    (0, common_1.Controller)('samples')
], SamplesController);
