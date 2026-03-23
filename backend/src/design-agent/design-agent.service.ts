import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { ClaudeCodeStreamService } from '../dev-agent/executors/claude-code-stream.service';
import { DesignKnowledgeLoader } from './knowledge/design-knowledge-loader';
import { DesignAuditPromptBuilder } from './design-audit-prompt.builder';
import { PageScreenshotService } from './screenshot/page-screenshot.service';
import { VisualAuditService } from './visual-audit.service';
import type {
  DesignAuditRequest,
  DesignAuditResult,
  DesignAuditMode,
  DesignFinding,
  RunDesignAuditResult,
} from './design-agent.types';
import { defaultPresetForPageType } from './design-agent.types';

/** 内部中间结果，各阶段独立使用 */
interface PhaseResult {
  success: boolean;
  auditResult: DesignAuditResult | null;
  rawContent: string | null;
  error: string | null;
  costUsd: number;
}

@Injectable()
export class DesignAgentService {
  private readonly logger = new Logger(DesignAgentService.name);
  private readonly workspaceRoot: string;

  constructor(
    private readonly knowledgeLoader: DesignKnowledgeLoader,
    private readonly promptBuilder: DesignAuditPromptBuilder,
    private readonly stream: ClaudeCodeStreamService,
    private readonly screenshot: PageScreenshotService,
    private readonly visualAudit: VisualAuditService,
    config: ConfigService,
  ) {
    this.workspaceRoot =
      config.get<string>('DESIGN_AGENT_WORKSPACE_ROOT') ??
      resolve(process.cwd(), '..');
  }

  async runAudit(request: DesignAuditRequest): Promise<RunDesignAuditResult> {
    const startTime = Date.now();
    const preset = request.preset ?? defaultPresetForPageType(request.pageType);
    const requestedMode = request.mode ?? 'full';

    const canVisual = !!request.pageUrl;
    const actualMode: DesignAuditMode =
      requestedMode === 'full' && !canVisual ? 'code' :
      requestedMode === 'visual' && !canVisual ? 'code' :
      requestedMode;

    if (actualMode !== requestedMode) {
      this.logger.warn(
        `DesignAgent: mode=${requestedMode} but no pageUrl, falling back to mode=${actualMode}`,
      );
    }

    this.logger.log(
      `DesignAgent audit: page=${request.pageName} type=${request.pageType} preset=${preset} mode=${actualMode}`,
    );

    const [codeResult, visualResult] = await Promise.all([
      actualMode === 'visual' ? null : this.runCodeAudit(request, preset),
      actualMode === 'code' ? null : this.runVisualAudit(request, preset),
    ]);

    const durationMs = Date.now() - startTime;
    const costUsd = (codeResult?.costUsd ?? 0) + (visualResult?.costUsd ?? 0);

    if (actualMode === 'code') {
      return {
        success: codeResult!.success,
        auditResult: codeResult!.auditResult,
        error: codeResult!.error,
        actualMode,
        codeAuditRaw: codeResult!.rawContent,
        visualAuditRaw: null,
        durationMs,
        costUsd,
      };
    }

    if (actualMode === 'visual') {
      return {
        success: visualResult!.success,
        auditResult: visualResult!.auditResult,
        error: visualResult!.error,
        actualMode,
        codeAuditRaw: null,
        visualAuditRaw: visualResult!.rawContent,
        durationMs,
        costUsd,
      };
    }

    return this.mergeResults(codeResult, visualResult, request, preset, durationMs, costUsd);
  }

  private async runCodeAudit(request: DesignAuditRequest, preset: string): Promise<PhaseResult> {
    let knowledge;
    try {
      knowledge = await this.knowledgeLoader.getKnowledge(preset as any);
    } catch (err) {
      return { success: false, auditResult: null, rawContent: null, error: `Failed to load knowledge: ${err}`, costUsd: 0 };
    }

    const prompt = this.promptBuilder.build({ ...request, preset: preset as any }, knowledge);
    const cwd = request.workspaceRoot ?? this.workspaceRoot;

    const result = await this.stream.execute(prompt, {
      cwd,
      allowedTools: ['Read', 'Glob', 'Grep'],
      maxTurns: 20,
    });

    if (!result.success || !result.content) {
      return {
        success: false,
        auditResult: null,
        rawContent: result.content,
        error: result.error ?? 'No content returned',
        costUsd: result.costUsd,
      };
    }

    const auditResult = this.parseAuditResult(result.content);
    if (auditResult) {
      auditResult.findings.forEach((f) => { f.source = 'code'; });
    }

    return {
      success: !!auditResult,
      auditResult,
      rawContent: result.content,
      error: auditResult ? null : 'Failed to parse code audit_result JSON',
      costUsd: result.costUsd,
    };
  }

  private async runVisualAudit(request: DesignAuditRequest, preset: string): Promise<PhaseResult> {
    let screenshots;
    try {
      screenshots = await this.screenshot.capture({ url: request.pageUrl! });
    } catch (err) {
      const error = `Screenshot failed: ${String(err)}`;
      this.logger.error(error);
      return { success: false, auditResult: null, rawContent: null, error, costUsd: 0 };
    }

    const result = await this.visualAudit.audit({
      pageName: request.pageName,
      pageType: request.pageType,
      preset: preset as any,
      lightScreenshot: screenshots.light,
      darkScreenshot: screenshots.dark,
      notes: request.notes,
    });

    if (result.auditResult) {
      result.auditResult.findings.forEach((f) => { f.source = 'visual'; });
    }

    return { ...result, costUsd: 0 };
  }

  private mergeResults(
    codeResult: PhaseResult | null,
    visualResult: PhaseResult | null,
    request: DesignAuditRequest,
    preset: string,
    durationMs: number,
    costUsd: number,
  ): RunDesignAuditResult {
    const codeAudit = codeResult?.auditResult;
    const visualAudit = visualResult?.auditResult;

    if (!codeAudit && !visualAudit) {
      const errors = [codeResult?.error, visualResult?.error].filter(Boolean).join('; ');
      return {
        success: false, auditResult: null,
        error: errors || 'Both code and visual audit failed',
        actualMode: 'full',
        codeAuditRaw: codeResult?.rawContent ?? null,
        visualAuditRaw: visualResult?.rawContent ?? null,
        durationMs, costUsd,
      };
    }

    if (!codeAudit) {
      return {
        success: true, auditResult: visualAudit!,
        error: codeResult?.error ? `Code audit failed: ${codeResult.error}` : null,
        actualMode: 'full',
        codeAuditRaw: codeResult?.rawContent ?? null,
        visualAuditRaw: visualResult?.rawContent ?? null,
        durationMs, costUsd,
      };
    }

    if (!visualAudit) {
      return {
        success: true, auditResult: codeAudit,
        error: visualResult?.error ? `Visual audit failed: ${visualResult.error}` : null,
        actualMode: 'full',
        codeAuditRaw: codeResult?.rawContent ?? null,
        visualAuditRaw: visualResult?.rawContent ?? null,
        durationMs, costUsd,
      };
    }

    const merged = this.buildMergedResult(codeAudit, visualAudit, request, preset);

    return {
      success: true, auditResult: merged, error: null,
      actualMode: 'full',
      codeAuditRaw: codeResult?.rawContent ?? null,
      visualAuditRaw: visualResult?.rawContent ?? null,
      durationMs, costUsd,
    };
  }

  private buildMergedResult(
    code: DesignAuditResult,
    visual: DesignAuditResult,
    request: DesignAuditRequest,
    preset: string,
  ): DesignAuditResult {
    const allFindings: DesignFinding[] = [...code.findings, ...visual.findings];
    const seen = new Set<string>();
    const deduped = allFindings.filter((f) => {
      const key = `${f.rule}::${f.problem.slice(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const statusOrder: Record<string, number> = { pass: 0, needs_refine: 1, needs_structure_change: 2, blocked: 3 };
    const mergedStatus =
      statusOrder[visual.summary.status] >= statusOrder[code.summary.status]
        ? visual.summary.status : code.summary.status;

    const riskOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };
    const mergedRisk =
      riskOrder[visual.summary.riskLevel] >= riskOrder[code.summary.riskLevel]
        ? visual.summary.riskLevel : code.summary.riskLevel;

    return {
      schemaVersion: 1,
      task: 'audit_result',
      page: { name: request.pageName, pageType: request.pageType, preset: preset as any },
      summary: {
        status: mergedStatus,
        riskLevel: mergedRisk,
        overallAssessment: `[Code] ${code.summary.overallAssessment} [Visual] ${visual.summary.overallAssessment}`,
      },
      findings: deduped,
      minimalFixPlan: [...code.minimalFixPlan, ...visual.minimalFixPlan],
      noChangeZones: [...new Set([...code.noChangeZones, ...visual.noChangeZones])],
      primitiveMapping: {
        preferredTokens: [...new Set([...code.primitiveMapping.preferredTokens, ...visual.primitiveMapping.preferredTokens])],
        preferredPrimitives: [...new Set([...code.primitiveMapping.preferredPrimitives, ...visual.primitiveMapping.preferredPrimitives])],
      },
      nextAction: deduped.length > 0
        ? (code.nextAction.recommendedTask === 'refine' ? code.nextAction : visual.nextAction)
        : { recommendedTask: 'none', changeBudget: 'minimal', handoffPrompt: '' },
    };
  }

  private parseAuditResult(content: string): DesignAuditResult | null {
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ??
        content.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      const parsed = JSON.parse(jsonStr);

      if (parsed?.task === 'audit_result' && parsed?.schemaVersion === 1) {
        return parsed as DesignAuditResult;
      }
      return null;
    } catch {
      return null;
    }
  }
}
