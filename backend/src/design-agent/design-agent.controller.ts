import { Body, Controller, Get, Param, Post, Delete, BadRequestException, NotFoundException } from '@nestjs/common';
import { DesignAgentService } from './design-agent.service';
import { DesignConversationService } from './design-conversation.service';
import { DesignOrchestratorService } from './design-orchestrator.service';
import type { DesignAuditRequest, DesignPageType, DesignAuditMode, CreateDesignConversationRequest, SendDesignMessageRequest } from './design-agent.types';

const VALID_PAGE_TYPES: DesignPageType[] = ['chat', 'workbench', 'memory'];
const VALID_MODES: DesignAuditMode[] = ['code', 'visual', 'full'];

@Controller('design-agent')
export class DesignAgentController {
  constructor(
    private readonly designAgent: DesignAgentService,
    private readonly conversation: DesignConversationService,
    private readonly orchestrator: DesignOrchestratorService,
  ) {}

  // ── 对话 API ────────────────────────────────────

  /**
   * POST /design-agent/conversations
   * 创建新的设计审查对话
   */
  @Post('conversations')
  async createConversation(
    @Body() body: CreateDesignConversationRequest & { initialMessage?: string },
  ) {
    return this.orchestrator.startConversation(body);
  }

  /**
   * GET /design-agent/conversations
   * 获取对话列表
   */
  @Get('conversations')
  async listConversations() {
    return this.conversation.listConversations('default-user');
  }

  /**
   * GET /design-agent/conversations/:id
   * 获取对话详情
   */
  @Get('conversations/:id')
  async getConversation(@Param('id') id: string) {
    const conversation = await this.conversation.getConversation(id);
    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    return conversation;
  }

  /**
   * POST /design-agent/conversations/:id/messages
   * 发送消息到对话
   */
  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id') conversationId: string,
    @Body() body: SendDesignMessageRequest,
  ) {
    if (!body.content?.trim() && !body.images?.length) {
      throw new BadRequestException('content or images is required');
    }

    return this.orchestrator.sendMessage(conversationId, body);
  }

  /**
   * POST /design-agent/conversations/:id/apply
   * 应用修改
   */
  @Post('conversations/:id/apply')
  async applyChanges(
    @Param('id') conversationId: string,
    @Body() body: { changeIds?: string[]; notes?: string },
  ) {
    return this.orchestrator.applyChanges(conversationId, body.changeIds, body.notes);
  }

  /**
   * POST /design-agent/conversations/:id/preview
   * 预览修改（生成 diff）
   */
  @Post('conversations/:id/preview')
  async previewChanges(
    @Param('id') conversationId: string,
    @Body() body: { changeIds?: string[] },
  ) {
    return this.orchestrator.previewChanges(conversationId, body.changeIds);
  }

  /**
   * DELETE /design-agent/conversations/:id
   * 删除对话
   */
  @Delete('conversations/:id')
  async deleteConversation(@Param('id') id: string) {
    await this.conversation.deleteConversation(id);
    return { success: true };
  }

  // ── 原有审查 API（保留向后兼容）────────────────────────

  /**
   * POST /design-agent/audits
   *
   * 发起一次设计审查。
   * - mode=code：只审查代码（~30-60s）
   * - mode=visual：只看截图（~10-20s，需要 pageUrl）
   * - mode=full：代码+视觉并行审查（~30-60s，需要 pageUrl）
   */
  @Post('audits')
  async runAudit(@Body() body: DesignAuditRequest) {
    if (!body.pageName?.trim()) {
      throw new BadRequestException('pageName is required');
    }
    if (!body.pageType || !VALID_PAGE_TYPES.includes(body.pageType)) {
      throw new BadRequestException(`pageType must be one of: ${VALID_PAGE_TYPES.join(', ')}`);
    }
    if (body.mode && !VALID_MODES.includes(body.mode)) {
      throw new BadRequestException(`mode must be one of: ${VALID_MODES.join(', ')}`);
    }
    if ((body.mode === 'visual' || body.mode === 'full') && !body.pageUrl) {
      throw new BadRequestException('pageUrl is required for visual/full mode audit');
    }

    return this.designAgent.runAudit({
      pageName: body.pageName.trim(),
      pageType: body.pageType,
      preset: body.preset,
      mode: body.mode,
      pageUrl: body.pageUrl,
      targetFiles: body.targetFiles,
      notes: body.notes,
      workspaceRoot: body.workspaceRoot,
    });
  }

  /**
   * POST /design-agent/audits/run
   *
   * MVP：通过 devAgent 执行一次设计审查任务（agent 模式），前端轮询获取最终 audit_result JSON。
   *
   * - mode=visual/full：当前 MVP 不保证截图能力；后端会按 promptBuilder 的代码审查方式执行。
   */
  @Post('audits/run')
  async runAuditViaDevAgent(@Body() body: DesignAuditRequest) {
    if (!body.pageName?.trim()) {
      throw new BadRequestException('pageName is required');
    }
    if (!body.pageType || !VALID_PAGE_TYPES.includes(body.pageType)) {
      throw new BadRequestException(`pageType must be one of: ${VALID_PAGE_TYPES.join(', ')}`);
    }
    if (body.mode && !VALID_MODES.includes(body.mode)) {
      throw new BadRequestException(`mode must be one of: ${VALID_MODES.join(', ')}`);
    }

    return this.designAgent.startAuditRun({
      pageName: body.pageName.trim(),
      pageType: body.pageType,
      preset: body.preset,
      mode: body.mode,
      pageUrl: body.pageUrl,
      targetFiles: body.targetFiles,
      notes: body.notes,
      workspaceRoot: body.workspaceRoot,
    });
  }
}
