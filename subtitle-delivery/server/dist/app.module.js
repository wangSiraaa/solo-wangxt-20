"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("./db/db");
const projects_service_1 = require("./modules/projects/projects.service");
const versions_service_1 = require("./modules/versions/versions.service");
const segments_service_1 = require("./modules/segments/segments.service");
const review_service_1 = require("./modules/review/review.service");
const glossary_service_1 = require("./modules/glossary/glossary.service");
const deliveries_service_1 = require("./modules/deliveries/deliveries.service");
const seed_1 = require("./seed");
const controllers_1 = require("./modules/controllers");
let AppModule = class AppModule {
    seed;
    constructor(seed) {
        this.seed = seed;
    }
    async onApplicationBootstrap() {
        await this.seed.run();
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        controllers: [
            controllers_1.ProjectsController,
            controllers_1.SegmentsController,
            controllers_1.ConflictsController,
            controllers_1.IssuesController,
            controllers_1.DeliveriesController,
            controllers_1.SamplesController,
        ],
        providers: [
            { provide: db_1.DB, useFactory: () => (0, db_1.createDb)() },
            { provide: projects_service_1.ProjectsService, useFactory: (db) => new projects_service_1.ProjectsService(db), inject: [db_1.DB] },
            { provide: versions_service_1.VersionsService, useFactory: (db) => new versions_service_1.VersionsService(db), inject: [db_1.DB] },
            { provide: segments_service_1.SegmentsService, useFactory: (db) => new segments_service_1.SegmentsService(db), inject: [db_1.DB] },
            { provide: review_service_1.ReviewService, useFactory: (db) => new review_service_1.ReviewService(db), inject: [db_1.DB] },
            { provide: glossary_service_1.GlossaryService, useFactory: (db) => new glossary_service_1.GlossaryService(db), inject: [db_1.DB] },
            {
                provide: deliveries_service_1.DeliveriesService,
                useFactory: (db, glossary) => new deliveries_service_1.DeliveriesService(db, glossary),
                inject: [db_1.DB, glossary_service_1.GlossaryService],
            },
            {
                provide: seed_1.SeedService,
                useFactory: (db, projects, versions, glossary, deliveries) => new seed_1.SeedService(db, projects, versions, glossary, deliveries),
                inject: [db_1.DB, projects_service_1.ProjectsService, versions_service_1.VersionsService, glossary_service_1.GlossaryService, deliveries_service_1.DeliveriesService],
            },
        ],
    }),
    __metadata("design:paramtypes", [seed_1.SeedService])
], AppModule);
