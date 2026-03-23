import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { DesignAgentService } from './design-agent.service';
import type { DesignAuditRequest, DesignPageType, DesignAuditMode } from './design-agent.types';

const VALID_PAGE_TYPES: DesignPageType[] = ['chat', 'workbench', 'memory'];
const VALID_MODES: DesignAuditMode[] = ['code', 'visual', 'full'];

@Controller('design-agent')
export class DesignAgentController {
  constructor(private readonly designAgent: DesignAgentService) {}

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
}
