import { Body, Controller, Get, Post, Patch, Delete, Query } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import {
  PersonaService,
  PERSONA_FIELD_LABELS,
  type EvolutionChange,
  type EvolutionPreview,
} from './persona.service';
import { EvolutionSchedulerService } from './evolution-scheduler.service';
import {
  UserProfileService,
  type UserProfileDto,
} from './user-profile.service';

@Controller('persona')
export class PersonaController {
  constructor(
    private persona: PersonaService,
    private prisma: PrismaService,
    private evolutionScheduler: EvolutionSchedulerService,
    private userProfile: UserProfileService,
  ) {}

  @Get()
  async get(@Query('personaKey') personaKey?: string) {
    return this.persona.getOrCreate(personaKey);
  }

  @Get('options')
  getOptions() {
    return {
      fieldLabels: PERSONA_FIELD_LABELS,
    };
  }

  @Get('profile')
  async getProfile(): Promise<UserProfileDto> {
    return this.userProfile.getOrCreate();
  }

  @Patch('profile')
  async updateProfile(
    @Body()
    body: {
      preferredVoiceStyle?: string;
      praisePreference?: string;
      responseRhythm?: string;
      preferredPersonaKey?: string;
      impressionCore?: string | null;
      impressionDetail?: string | null;
      pendingImpressionCore?: string | null;
      pendingImpressionDetail?: string | null;
    },
  ): Promise<UserProfileDto> {
    return this.userProfile.update(body);
  }

  @Patch()
  async update(
    @Body()
    body: {
      identity?: string;
      personality?: string;
      valueBoundary?: string;
      behaviorForbidden?: string;
      expressionRules?: string;
      metaFilterPolicy?: string;
      evolutionAllowed?: string;
      evolutionForbidden?: string;
    },
    @Query('personaKey') personaKey?: string,
  ) {
    return this.persona.update(body, personaKey);
  }

  /**
   * 获取所有激活的 persona（每个 personaKey 仅保留一个 isActive=true 版本）
   * 用于配置页切换人格。
   */
  @Get('list')
  listActive() {
    return this.persona.listActivePersonas();
  }

  /**
   * 创建一个新的 personaKey（默认从当前 preferred persona 复制一份内容）
   */
  @Post('create')
  create(
    @Body()
    body: {
      personaKey?: string;
      basePersonaKey?: string;
    },
  ) {
    return this.persona.createPersonaSlot(body?.personaKey, body?.basePersonaKey);
  }

  @Post('evolve/suggest')
  async suggestEvolution(@Body() body: { conversationId: string }) {
    const msgs = await this.prisma.message.findMany({
      where: { conversationId: body.conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const recent = msgs
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }));
    return this.persona.suggestEvolution(recent);
  }

  @Post('evolve/confirm')
  async confirmEvolution(@Body() body: { changes: EvolutionChange[] }) {
    if (!body?.changes?.length) return { error: 'changes array is required' };
    return this.persona.confirmEvolution(body.changes);
  }

  @Post('evolve/preview')
  async previewEvolution(
    @Body() body: { changes: EvolutionChange[] },
  ): Promise<{ accepted: boolean; reason?: string; preview?: EvolutionPreview } | { error: string }> {
    if (!body?.changes?.length) return { error: 'changes array is required' };
    return this.persona.previewEvolution(body.changes);
  }

  /**
   * PATCH /persona/impression
   * 增量更新印象总结（核心印象或可选细节）。
   */
  @Patch('profile/impression')
  async updateImpression(
    @Body() body: { action: 'replace' | 'append'; target: 'core' | 'detail'; content: string },
  ) {
    if (!body?.action || !body?.target || !body?.content) {
      return { error: 'action, target, content are required' };
    }
    return this.userProfile.updateImpression(body);
  }

  /** 确认待定印象更新 */
  @Patch('profile/impression/confirm')
  async confirmImpression(@Body() body: { target: 'core' | 'detail' }) {
    if (body?.target !== 'core' && body?.target !== 'detail') {
      return { error: 'target must be "core" or "detail"' };
    }
    return this.userProfile.confirmPendingImpression(body.target);
  }

  /** 拒绝待定印象更新 */
  @Patch('profile/impression/reject')
  async rejectImpression(@Body() body: { target: 'core' | 'detail' }) {
    if (body?.target !== 'core' && body?.target !== 'detail') {
      return { error: 'target must be "core" or "detail"' };
    }
    return this.userProfile.rejectPendingImpression(body.target);
  }

  /** B2: 获取记忆密度触发的待确认进化建议 */
  @Get('evolve/pending')
  getPendingEvolution() {
    return this.evolutionScheduler.getPendingSuggestion();
  }

  /** B2: 清除待确认进化建议（用户已确认或拒绝后调用） */
  @Delete('evolve/pending')
  clearPendingEvolution() {
    this.evolutionScheduler.clearPendingSuggestion();
    return { ok: true };
  }
}
