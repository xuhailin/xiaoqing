import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import { LlmService } from '../../infra/llm/llm.service';
import type { DialogueTaskIntent } from '../intent/intent.types';
import type { QuickRouterOutput } from './quick-intent-router.types';

/**
 * Quick Intent Router
 *
 * 整个链路的第一关，在加载任何 Session State 之前执行。
 * 职责：分流，不做理解。
 *
 * 两阶段判断：
 *   1. 规则预筛 — 关键词/正则，不调用 LLM
 *   2. 轻量 LLM — scenario: 'fast'，max_tokens: 60，超时 200ms 降级 chat
 *
 * 置信度低于阈值（默认 0.7，可由 QUICK_ROUTER_CONFIDENCE_THRESHOLD 覆盖）一律降级 chat。
 */

// ─── 规则表 ────────────────────────────────────────────────────────────────────

interface RuleEntry {
  patterns: RegExp[];
  toolHint: DialogueTaskIntent;
  confidence: number;
}

/** 强信号规则，按优先级排列，首次命中即返回。 */
const RULE_TABLE: RuleEntry[] = [
  // dev_task — /dev 或 /task 前缀（最高优先级，与 message-router 约定对齐）
  {
    patterns: [/^\/dev\b/i, /^\/task\b/i],
    toolHint: 'dev_task',
    confidence: 0.98,
  },
  // set_reminder
  {
    patterns: [
      /提醒(我|一下)?[^\s]*?(点|时|分|后|早上|中午|下午|晚上|明天|今天)/,
      /定个?(闹钟|提醒)/,
      /remind\s+me/i,
      /每天.*提醒/,
      /定时提醒/,
    ],
    toolHint: 'set_reminder',
    confidence: 0.92,
  },
  // weather_query
  {
    patterns: [
      /今天.*(天气|下雨|气温|温度)/,
      /明天.*(天气|下雨|会不会冷)/,
      /要不要带伞/,
      /出门(需要|要)带伞/,
      /天气怎么样/,
      /下雨(了吗|吗|天)/,
      /(气温|温度)多少/,
      /穿(什么|多少)/,
    ],
    toolHint: 'weather_query',
    confidence: 0.90,
  },
  // checkin
  {
    patterns: [
      /^打卡$/,
      /^签到$/,
      /^上班打卡$/,
      /我(来了|到了|上班了)/,
    ],
    toolHint: 'checkin',
    confidence: 0.95,
  },
  // timesheet
  {
    patterns: [
      /工时(上报|填写|提交|查询)/,
      /填(一下|下)?工时/,
      /本月工时/,
      /缺勤|出勤记录/,
    ],
    toolHint: 'timesheet',
    confidence: 0.90,
  },
  // book_download
  {
    patterns: [
      /下载.{1,30}(书|epub|mobi|pdf)/i,
      /(电子书|epub|mobi).{0,20}下载/i,
      /帮我(找|下).{1,30}(书|epub)/i,
    ],
    toolHint: 'book_download',
    confidence: 0.88,
  },
  // page_screenshot
  {
    patterns: [
      /截(取|图|屏).{0,20}网页/,
      /网页.{0,10}截图/,
      /截图.{0,10}(https?:\/\/|www\.)/i,
    ],
    toolHint: 'page_screenshot',
    confidence: 0.90,
  },
];

// ─── LLM Prompt ───────────────────────────────────────────────────────────────

const QUICK_ROUTER_PROMPT = `你是意图分流路由器。只输出 JSON，不解释。

path 枚举：
- "chat"：纯对话、聊天、情感陪伴、询问意见、讨论想法
- "tool"：明确要求执行某项工具任务

toolHint 枚举（仅 path="tool" 时填写）：
- "weather_query"：查询天气、降雨、气温、是否需要带伞
- "set_reminder"：设置提醒、定时、闹钟
- "book_download"：下载电子书
- "timesheet"：工时上报、填写工时
- "checkin"：打卡、签到
- "page_screenshot"：截取网页图片
- "dev_task"：开发任务、写代码、技术实现
- "general_tool"：其他工具型请求

输出格式：
{"path":"chat","confidence":0.9}
{"path":"tool","toolHint":"weather_query","confidence":0.92}

示例：
输入：今天出门要带伞吗 → {"path":"tool","toolHint":"weather_query","confidence":0.91}
输入：你觉得我该不该换工作 → {"path":"chat","confidence":0.95}
输入：帮我明天早上8点提醒我开会 → {"path":"tool","toolHint":"set_reminder","confidence":0.93}
输入：最近感觉好累啊 → {"path":"chat","confidence":0.97}
输入：下载一本三体 → {"path":"tool","toolHint":"book_download","confidence":0.88}`;

// ─── Service ──────────────────────────────────────────────────────────────────

const CHAT_FALLBACK: QuickRouterOutput = {
  path: 'chat',
  confidence: 1.0,
  source: 'fallback',
};

@Injectable()
export class QuickIntentRouterService {
  private readonly logger = new Logger(QuickIntentRouterService.name);
  private readonly confidenceThreshold: number;
  private readonly llmTimeoutMs: number;

  constructor(
    private readonly llm: LlmService,
    config: ConfigService,
  ) {
    this.confidenceThreshold =
      Number(config.get('QUICK_ROUTER_CONFIDENCE_THRESHOLD')) || 0.7;
    this.llmTimeoutMs =
      Number(config.get('QUICK_ROUTER_LLM_TIMEOUT_MS')) || 200;
  }

  async route(userInput: string): Promise<QuickRouterOutput> {
    // 阶段一：规则预筛
    const ruleResult = this.applyRules(userInput);
    if (ruleResult) {
      this.logger.debug(
        `[QuickRouter] rule hit: ${ruleResult.toolHint} (${ruleResult.confidence})`,
      );
      return ruleResult;
    }

    // 阶段二：轻量 LLM，带超时兜底
    try {
      const llmResult = await this.callLlmWithTimeout(userInput);
      if (llmResult && llmResult.confidence >= this.confidenceThreshold) {
        this.logger.debug(
          `[QuickRouter] llm result: path=${llmResult.path} hint=${llmResult.toolHint ?? '-'} conf=${llmResult.confidence}`,
        );
        return llmResult;
      }
    } catch (err) {
      this.logger.warn(`[QuickRouter] llm failed, fallback chat: ${String(err)}`);
    }

    return CHAT_FALLBACK;
  }

  private applyRules(input: string): QuickRouterOutput | null {
    for (const rule of RULE_TABLE) {
      if (rule.patterns.some((re) => re.test(input))) {
        return {
          path: 'tool',
          confidence: rule.confidence,
          toolHint: rule.toolHint,
          source: 'rule',
        };
      }
    }
    return null;
  }

  private async callLlmWithTimeout(userInput: string): Promise<QuickRouterOutput | null> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: QUICK_ROUTER_PROMPT },
      { role: 'user', content: userInput },
    ];

    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), this.llmTimeoutMs),
    );

    const llmCall = this.llm
      .generate(messages, { scenario: 'fast' })
      .then((raw) => this.parseLlmOutput(raw))
      .catch(() => null);

    const result = await Promise.race([llmCall, timeout]);
    return result;
  }

  private parseLlmOutput(raw: string): QuickRouterOutput | null {
    const trimmed = raw.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) return null;

    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;

      const path = parsed.path === 'tool' ? 'tool' : 'chat';
      const rawConf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
      const confidence = Math.max(0, Math.min(1, rawConf));

      const validToolHints: DialogueTaskIntent[] = [
        'weather_query', 'book_download', 'general_tool', 'timesheet',
        'dev_task', 'set_reminder', 'checkin', 'device_screenshot', 'page_screenshot',
      ];
      const toolHint =
        path === 'tool' &&
        typeof parsed.toolHint === 'string' &&
        validToolHints.includes(parsed.toolHint as DialogueTaskIntent)
          ? (parsed.toolHint as DialogueTaskIntent)
          : undefined;

      return { path, confidence, toolHint, source: 'llm' };
    } catch {
      return null;
    }
  }
}
