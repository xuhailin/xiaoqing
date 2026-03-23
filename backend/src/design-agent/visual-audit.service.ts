import { Injectable, Logger } from '@nestjs/common';
import type OpenAI from 'openai';
import { LlmService } from '../infra/llm/llm.service';
import { DesignKnowledgeLoader } from './knowledge/design-knowledge-loader';
import type {
  DesignAuditResult,
  DesignKnowledge,
  DesignPageType,
  DesignPreset,
} from './design-agent.types';

export interface VisualAuditInput {
  pageName: string;
  pageType: DesignPageType;
  preset: DesignPreset;
  /** light mode 截图 base64 */
  lightScreenshot: string;
  /** dark mode 截图 base64，可选 */
  darkScreenshot?: string | null;
  notes?: string;
}

export interface VisualAuditOutput {
  success: boolean;
  auditResult: DesignAuditResult | null;
  rawContent: string | null;
  error: string | null;
}

/**
 * 视觉审查：将截图 + 设计规则发送给多模态 LLM，获取视觉层面的 findings。
 *
 * 与代码审查互补：
 * - 代码审查（Claude Code）看 .ts/.scss 的 token/primitive 使用
 * - 视觉审查（此服务）看实际渲染效果的层级、密度、一致性
 */
@Injectable()
export class VisualAuditService {
  private readonly logger = new Logger(VisualAuditService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly knowledgeLoader: DesignKnowledgeLoader,
  ) {}

  async audit(input: VisualAuditInput): Promise<VisualAuditOutput> {
    let knowledge: DesignKnowledge;
    try {
      knowledge = await this.knowledgeLoader.getKnowledge(input.preset);
    } catch (err) {
      return {
        success: false,
        auditResult: null,
        rawContent: null,
        error: `Failed to load design knowledge: ${String(err)}`,
      };
    }

    const systemPrompt = this.buildSystemPrompt(input, knowledge);
    const userContent = this.buildUserContent(input);

    try {
      const rawContent = await this.llm.generate(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        { scenario: 'reasoning' },
      );

      const auditResult = this.parseAuditResult(rawContent);
      if (!auditResult) {
        this.logger.warn('Visual audit: failed to parse audit_result JSON');
        return {
          success: false,
          auditResult: null,
          rawContent,
          error: 'Failed to parse audit_result JSON from LLM output',
        };
      }

      this.logger.log(
        `Visual audit complete: status=${auditResult.summary.status} findings=${auditResult.findings.length}`,
      );

      return { success: true, auditResult, rawContent, error: null };
    } catch (err) {
      const error = `Visual audit LLM call failed: ${String(err)}`;
      this.logger.error(error);
      return { success: false, auditResult: null, rawContent: null, error };
    }
  }

  private buildSystemPrompt(input: VisualAuditInput, knowledge: DesignKnowledge): string {
    return `You are the DesignAuditor for XiaoQing, performing a VISUAL audit. You will receive screenshots of a page and must evaluate them against the design rules below.

## Design System Knowledge

### Core UI Rules
${knowledge.coreRules}

### Page Type Patterns
${knowledge.pageTypePatterns}

### Theme Tokens
${knowledge.themeTokens}

### Shared UI Primitives
${knowledge.sharedPrimitives}

### Active Preset: ${knowledge.presetName}
${knowledge.preset}

## Visual Audit Instructions

**Page under audit:** ${input.pageName}
**Page type:** ${input.pageType}
**Preset:** ${knowledge.presetName}
${input.notes ? `**Notes:** ${input.notes}` : ''}

Examine the screenshot(s) and evaluate:
1. **Page hierarchy** — Is the header lighter than the content area? Are there too many visual layers?
2. **Card usage** — Are cards used appropriately? Any "card inside card" or unnecessary panel wrapping?
3. **Gradients & shadows** — Are they within the rules? Any overuse?
4. **Information density** — Does it match the expected density for this page type?
5. **Theme consistency** — If both light/dark screenshots are provided, do they feel like the same product?
6. **Spacing & alignment** — Is spacing consistent? Are elements properly aligned?
7. **Overdesign** — Any unnecessary visual decoration (glow, heavy shadows, excessive gradients)?
8. **Shared primitive usage** — Do elements look like they use the standard components (AppPanel, AppButton, etc.) or custom one-offs?

## Output Format

Output a single JSON object matching this exact schema. No markdown code fences, no extra text.

${JSON.stringify({
  schemaVersion: 1,
  task: 'audit_result',
  page: { name: '<page name>', pageType: '<chat|workbench|memory>', preset: '<preset>' },
  summary: { status: '<pass|needs_refine|needs_structure_change|blocked>', riskLevel: '<low|medium|high>', overallAssessment: '<3 sentences max>' },
  findings: [{ id: '<id>', rule: '<rule name>', severity: '<high|medium|low>', location: '<visual area description>', problem: '<what is wrong visually>', impact: '<why it breaks consistency>', evidence: '<what you see in the screenshot>' }],
  minimalFixPlan: [{ action: '<what to change>', target: '<file or area>', type: '<token-reuse|layout-adjust|class-remove|component-replace>' }],
  noChangeZones: ['<areas that look correct and should not be touched>'],
  primitiveMapping: { preferredTokens: ['--token'], preferredPrimitives: ['AppPanel'] },
  nextAction: { recommendedTask: '<refine|none>', changeBudget: '<minimal|medium>', handoffPrompt: '<instruction>' },
}, null, 2)}

## Constraints
- Focus on VISUAL issues you can see in the screenshots, not code structure
- Reference specific visual areas ("top header area", "left sidebar", "message list") not file paths
- Maximum 5 findings
- If the page looks consistent and well-designed, output status: "pass"`;
  }

  private buildUserContent(
    input: VisualAuditInput,
  ): OpenAI.Chat.ChatCompletionContentPart[] {
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: `Please audit the "${input.pageName}" page (${input.pageType} type). ${input.darkScreenshot ? 'I am providing both light and dark mode screenshots.' : 'I am providing the light mode screenshot.'}`,
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${input.lightScreenshot}`,
          detail: 'high',
        },
      },
    ];

    if (input.darkScreenshot) {
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${input.darkScreenshot}`,
          detail: 'high',
        },
      });
    }

    return parts;
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
