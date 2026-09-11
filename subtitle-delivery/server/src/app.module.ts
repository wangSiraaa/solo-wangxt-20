import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { createDb, DB, Db } from './db/db';
import { ProjectsService } from './modules/projects/projects.service';
import { VersionsService } from './modules/versions/versions.service';
import { SegmentsService } from './modules/segments/segments.service';
import { ReviewService } from './modules/review/review.service';
import { GlossaryService } from './modules/glossary/glossary.service';
import { DeliveriesService } from './modules/deliveries/deliveries.service';
import { SeedService } from './seed';
import {
  ProjectsController,
  SegmentsController,
  ConflictsController,
  IssuesController,
  DeliveriesController,
  SamplesController,
} from './modules/controllers';

@Module({
  controllers: [
    ProjectsController,
    SegmentsController,
    ConflictsController,
    IssuesController,
    DeliveriesController,
    SamplesController,
  ],
  providers: [
    { provide: DB, useFactory: () => createDb() },
    { provide: ProjectsService, useFactory: (db: Db) => new ProjectsService(db), inject: [DB] },
    { provide: VersionsService, useFactory: (db: Db) => new VersionsService(db), inject: [DB] },
    { provide: SegmentsService, useFactory: (db: Db) => new SegmentsService(db), inject: [DB] },
    { provide: ReviewService, useFactory: (db: Db) => new ReviewService(db), inject: [DB] },
    { provide: GlossaryService, useFactory: (db: Db) => new GlossaryService(db), inject: [DB] },
    {
      provide: DeliveriesService,
      useFactory: (db: Db, glossary: GlossaryService) => new DeliveriesService(db, glossary),
      inject: [DB, GlossaryService],
    },
    {
      provide: SeedService,
      useFactory: (
        db: Db,
        projects: ProjectsService,
        versions: VersionsService,
        glossary: GlossaryService,
        deliveries: DeliveriesService,
      ) => new SeedService(db, projects, versions, glossary, deliveries),
      inject: [DB, ProjectsService, VersionsService, GlossaryService, DeliveriesService],
    },
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private seed: SeedService) {}

  async onApplicationBootstrap() {
    await this.seed.run();
  }
}
