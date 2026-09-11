import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ProjectsService } from './projects/projects.service';
import { VersionsService, ImportVersionDto } from './versions/versions.service';
import { SegmentsService, SubmitResult } from './segments/segments.service';
import { ReviewService } from './review/review.service';
import { GlossaryService } from './glossary/glossary.service';
import { DeliveriesService } from './deliveries/deliveries.service';

function toHttp(err: any): never {
  if (err?.code === 'ALREADY_CLAIMED') {
    throw new ConflictException({ message: err.message, claimedBy: err.claimedBy });
  }
  if (err?.code === 'ALREADY_RESOLVED') {
    throw new ConflictException({ message: err.message });
  }
  if (err?.gate) {
    throw new UnprocessableEntityException(err.gate);
  }
  if (typeof err?.message === 'string' && err.message.includes('不存在')) {
    throw new NotFoundException(err.message);
  }
  throw err;
}

function userOf(headers: Record<string, any>): string {
  const raw = (headers['x-user'] as string) || '';
  if (!raw) return '匿名';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

@Controller('projects')
export class ProjectsController {
  constructor(
    private projects: ProjectsService,
    private versions: VersionsService,
    private segments: SegmentsService,
    private review: ReviewService,
    private glossary: GlossaryService,
    private deliveries: DeliveriesService,
  ) {}

  @Get()
  list() {
    return this.projects.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    try {
      return this.projects.get(id);
    } catch (e) {
      toHttp(e);
    }
  }

  // ---- 画面版本 ----
  @Get(':id/versions')
  listVersions(@Param('id') id: string) {
    return this.versions.listVersions(id);
  }

  @Post(':id/versions/import')
  async importVersion(
    @Param('id') id: string,
    @Body() dto: ImportVersionDto,
    @Headers() headers: Record<string, any>,
  ) {
    try {
      return await this.versions.importVersion(id, dto, userOf(headers));
    } catch (e) {
      toHttp(e);
    }
  }

  @Get(':id/versions/compare')
  async compare(
    @Param('id') id: string,
    @Query('a') a: string,
    @Query('b') b: string,
  ) {
    try {
      return await this.versions.compare(id, Number(a), Number(b));
    } catch (e) {
      toHttp(e);
    }
  }

  // ---- 片段 ----
  @Get(':id/segments')
  segmentsList(
    @Param('id') id: string,
    @Query('language') language: string,
    @Query('version') version?: string,
  ) {
    return this.segments.list(id, language, version ? Number(version) : undefined);
  }

  @Get(':id/conflicts')
  conflicts(@Param('id') id: string, @Query('status') status?: string) {
    return this.segments.listConflicts(id, status ?? 'open');
  }

  // ---- 校对问题 ----
  @Get(':id/issues')
  issues(
    @Param('id') id: string,
    @Query('language') language?: string,
    @Query('status') status?: string,
  ) {
    return this.review.list(id, language, status);
  }

  @Post(':id/issues')
  async createIssue(
    @Param('id') id: string,
    @Body() body: { segmentId: string; language: string; type: any; note: string },
    @Headers() headers: Record<string, any>,
  ) {
    try {
      return await this.review.create(
        body.segmentId,
        body.language,
        body.type,
        body.note,
        userOf(headers),
      );
    } catch (e) {
      toHttp(e);
    }
  }

  // ---- 术语表 ----
  @Get(':id/glossary')
  glossaryTerms(@Param('id') id: string, @Query('language') language?: string) {
    return this.glossary.listTerms(id, language);
  }

  @Post(':id/glossary')
  addTerm(
    @Param('id') id: string,
    @Body() body: { language: string; source: string; target: string },
  ) {
    return this.glossary.addTerm(id, body.language, body.source, body.target);
  }

  // ---- 交付 ----
  @Get(':id/deliveries')
  deliveriesList(@Param('id') id: string) {
    return this.deliveries.list(id);
  }

  @Post(':id/deliveries')
  async createDelivery(
    @Param('id') id: string,
    @Body() body: { language: string },
    @Headers() headers: Record<string, any>,
  ) {
    try {
      return await this.deliveries.create(id, body.language, userOf(headers));
    } catch (e) {
      toHttp(e);
    }
  }
}

@Controller('segments')
export class SegmentsController {
  constructor(private segments: SegmentsService) {}

  @Post(':id/claim')
  async claim(
    @Param('id') id: string,
    @Body() body: { language: string },
    @Headers() headers: Record<string, any>,
  ) {
    try {
      return await this.segments.claim(id, body.language, userOf(headers));
    } catch (e) {
      toHttp(e);
    }
  }

  @Delete(':id/claim')
  async release(
    @Param('id') id: string,
    @Query('language') language: string,
    @Headers() headers: Record<string, any>,
  ) {
    return this.segments.release(id, language, userOf(headers));
  }

  @Post(':id/submissions')
  async submit(
    @Param('id') id: string,
    @Body()
    body: {
      language: string;
      text: string;
      baseRevision: number;
      idempotencyKey?: string;
    },
    @Headers() headers: Record<string, any>,
  ) {
    const result: SubmitResult = await this.segments.submit(
      id,
      body.language,
      userOf(headers),
      body.text,
      body.baseRevision,
      body.idempotencyKey,
    );
    if (result.status === 'conflict') {
      throw new ConflictException(result);
    }
    return result;
  }

  @Post(':id/retime')
  async retime(
    @Param('id') id: string,
    @Body() body: { startMs?: number; endMs?: number },
    @Headers() headers: Record<string, any>,
  ) {
    try {
      return await this.segments.retime(id, userOf(headers), body.startMs, body.endMs);
    } catch (e) {
      toHttp(e);
    }
  }
}

@Controller('conflicts')
export class ConflictsController {
  constructor(private segments: SegmentsService) {}

  @Post(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @Body() body: { strategy: 'take_mine' | 'take_current' | 'merge'; mergedText?: string },
    @Headers() headers: Record<string, any>,
  ) {
    try {
      return await this.segments.resolveConflict(
        id,
        body.strategy,
        body.mergedText,
        userOf(headers),
      );
    } catch (e) {
      toHttp(e);
    }
  }
}

@Controller('issues')
export class IssuesController {
  constructor(private review: ReviewService) {}

  @Post(':id/resolve')
  async resolve(@Param('id') id: string, @Headers() headers: Record<string, any>) {
    try {
      return await this.review.resolve(id, userOf(headers));
    } catch (e) {
      toHttp(e);
    }
  }
}

@Controller('deliveries')
export class DeliveriesController {
  constructor(private deliveries: DeliveriesService) {}

  @Get(':id/impact')
  async impact(@Param('id') id: string) {
    try {
      return await this.deliveries.impact(id);
    } catch (e) {
      toHttp(e);
    }
  }

  @Get(':id/download')
  async download(@Param('id') id: string) {
    const delivery = await this.deliveries.get(id);
    const fs = await import('fs');
    const path = await import('path');
    if (!fs.existsSync(delivery.file_path)) {
      throw new NotFoundException('交付包文件不存在');
    }
    const stream = fs.createReadStream(delivery.file_path);
    const { StreamableFile } = await import('@nestjs/common');
    return new StreamableFile(stream, {
      type: 'application/zip',
      disposition: `attachment; filename="delivery_${delivery.language}_v${delivery.version_no}_${path.basename(delivery.file_path)}"`,
    });
  }
}

@Controller('samples')
export class SamplesController {
  @Get(':name')
  async getSample(@Param('name') name: string) {
    const allowed = ['picture_v1.json', 'picture_v2.json', 'glossary.csv', 'source_v1.srt'];
    if (!allowed.includes(name)) throw new NotFoundException('样例不存在');
    const { samplesDir } = await import('../seed');
    const fs = await import('fs');
    const path = await import('path');
    const file = path.join(samplesDir(), name);
    if (!fs.existsSync(file)) throw new NotFoundException('样例文件缺失');
    const content = fs.readFileSync(file, 'utf-8');
    if (name.endsWith('.json')) return JSON.parse(content);
    return content;
  }
}
