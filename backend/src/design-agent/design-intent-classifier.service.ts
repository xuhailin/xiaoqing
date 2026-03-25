import { Injectable, Logger } from '@nestjs/common';
import type {
  DesignConversationMessage,
  DesignConversationResponse,
  DesignUserIntent,
  ProjectPage,
} from './design-agent.types';
import { DesignKnowledgeLoader } from './knowledge/design-knowledge-loader';
import { LlmService } from '../infra/llm/llm.service';

export interface DesignIntentClassifierContext {
  conversation: DesignConversationResponse;
  messages: DesignConversationMessage[];
  pageContext?: {
    pageName: string;
    pageType: string;
    pageUrl?: string;
    preset?: string;
  };
}

type LlmIntentType =
  | 'audit_request'
  | 'describe_issue'
  | 'request_modification'
  | 'ask_question'
  | 'unknown';

interface LlmIntentPayload {
  type: LlmIntentType;
  rawTarget?: string;
  notes?: string;
}

const LLM_INTENT_TYPES: LlmIntentType[] = [
  'audit_request',
  'describe_issue',
  'request_modification',
  'ask_question',
  'unknown',
];

function matchProjectPage(rawTarget: string, pages: ProjectPage[]): ProjectPage | null {
  const n = rawTarget.trim().toLowerCase();
  if (!n) return null;
  for (const p of pages) {
    const candidates: string[] = [p.name.toLowerCase(), p.route.toLowerCase()];
    const routeNorm = p.route.replace(/^\/+/, '').toLowerCase();
    if (routeNorm) candidates.push(routeNorm);
    for (const a of p.aliases) {
      if (a.trim()) candidates.push(a.toLowerCase());
    }
    for (const c of candidates) {
      if (!c) continue;
      if (n.includes(c) || c.includes(n)) return p;
    }
  }
  return null;
}

function parseLlmIntentJson(raw: string): LlmIntentPayload | null {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const type = String(obj.type ?? '').trim() as LlmIntentType;
    if (!LLM_INTENT_TYPES.includes(type)) return null;
    const rawTarget = obj.rawTarget != null ? String(obj.rawTarget).trim() : undefined;
    const notes = obj.notes != null ? String(obj.notes).trim() : undefined;
    return { type, rawTarget, notes };
  } catch {
    return null;
  }
}

@Injectable()
export class DesignIntentClassifier {
  private readonly logger = new Logger(DesignIntentClassifier.name);

  constructor(
    private readonly llm: LlmService,
    private readonly knowledge: DesignKnowledgeLoader,
  ) {}

  async classify(
    message: DesignConversationMessage,
    context: DesignIntentClassifierContext,
  ): Promise<DesignUserIntent> {
    const content = message.content ?? '';
    const hasImages = (message.metadata?.images?.length ?? 0) > 0;

    if (hasImages && message.metadata?.images) {
      return { type: 'upload_screenshot', images: message.metadata.images };
    }

    if (content.includes('确认') || content.includes('改吧') || content.includes('执行修改')) {
      return { type: 'confirm_changes' };
    }

    const pages = this.knowledge.getProjectPages();

    // 规则优先：常见审查请求模式，无需 LLM
    const ruleResult = this.classifyByRules(content, pages);
    if (ruleResult) return ruleResult;

    const llmResult = await this.classifyWithLlm(content, context, pages);
    if (!llmResult) {
      this.logger.warn('Design intent LLM parse failed; falling back to unknown');
      return { type: 'unknown', raw: content };
    }

    return this.mapLlmIntentToUserIntent(llmResult, content, pages);
  }

  /**
   * 规则匹配：处理"审查 X 页面"等常见中文模式，不依赖 LLM。
   */
  private classifyByRules(content: string, pages: ProjectPage[]): DesignUserIntent | null {
    const AUDIT_PREFIXES = ['审查', '审阅', '检查', '看看', '分析', 'review', 'audit', 'check'];
    const normalized = content.trim().toLowerCase();

    for (const prefix of AUDIT_PREFIXES) {
      if (!normalized.startsWith(prefix)) continue;
      // 提取 prefix 之后的内容，去掉"页面""界面"等后缀词
      const rest = content.trim().slice(prefix.length).replace(/[页界面的]+$/u, '').trim();
      if (!rest) continue;
      const hit = matchProjectPage(rest, pages);
      if (hit) {
        return {
          type: 'audit_page',
          pageName: hit.name,
          pageType: hit.pageType,
          pageUrl: hit.route,
          preset: hit.preset,
        };
      }
      // 无法匹配已知页面，但意图明确——返回 audit_page 并让后续流程处理
      return {
        type: 'audit_page',
        pageName: rest,
        pageType: 'workbench',
        pageUrl: null,
        preset: 'serious-workbench',
      };
    }

    return null;
  }

  private async classifyWithLlm(
    userContent: string,
    context: DesignIntentClassifierContext,
    pages: ProjectPage[],
  ): Promise<LlmIntentPayload | null> {
    const pagesBlock = pages
      .map((p) => `- ${p.name} (${p.route}): aliases=[${p.aliases.join(', ')}]`)
      .join('\n');

    const ctxBlock = context.pageContext
      ? `当前审查页面：${context.pageContext.pageName}（${context.pageContext.pageType}）`
      : '无页面上下文';

    const userPrompt = `你是 Design Agent 的意图识别模块。根据用户消息判断意图类型。

## 已知项目页面
${pagesBlock || '(无注册页面)'}

## 当前对话上下文
${ctxBlock}

## 用户消息
${userContent}

## 输出（仅 JSON，无其他文字）
{
  "type": "audit_request | describe_issue | request_modification | ask_question | unknown",
  "rawTarget": "<仅 audit_request 时填写，用户提到的页面名或路径片段>",
  "notes": "<可选，用户的补充说明>"
}`;

    try {
      const raw = await this.llm.generate(
        [
          {
            role: 'system',
            content: '你只输出合法 JSON 对象，不要代码块，不要解释。',
          },
          { role: 'user', content: userPrompt },
        ],
        { scenario: 'fast' },
      );
      return parseLlmIntentJson(raw);
    } catch (err) {
      this.logger.warn(`Design intent LLM call failed: ${String(err)}`);
      return null;
    }
  }

  private mapLlmIntentToUserIntent(parsed: LlmIntentPayload, userContent: string, pages: ProjectPage[]): DesignUserIntent {
    const notesSuffix = parsed.notes ? `\n\n${parsed.notes}` : '';

    switch (parsed.type) {
      case 'audit_request': {
        const rawTarget = (parsed.rawTarget ?? '').trim();
        if (!rawTarget) {
          return { type: 'unknown', raw: userContent };
        }
        const hit = matchProjectPage(rawTarget, pages);
        if (hit) {
          return {
            type: 'audit_page',
            pageName: hit.name,
            pageType: hit.pageType,
            pageUrl: hit.route,
            preset: hit.preset,
          };
        }
        return {
          type: 'audit_page',
          pageName: rawTarget,
          pageType: 'workbench',
          pageUrl: null,
          preset: 'serious-workbench',
        };
      }
      case 'describe_issue':
        return { type: 'describe_issue', description: userContent + notesSuffix };
      case 'request_modification':
        return { type: 'request_modification', description: userContent + notesSuffix };
      case 'ask_question':
        return { type: 'ask_question', question: userContent + notesSuffix };
      default:
        return { type: 'unknown', raw: userContent };
    }
  }
}
