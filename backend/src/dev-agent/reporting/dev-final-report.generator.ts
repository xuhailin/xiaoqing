import { Injectable } from '@nestjs/common';
import { LlmService } from '../../infra/llm/llm.service';
import { REPORT_USER_INPUT_MAX_CHARS } from '../dev-agent.constants';

const FINAL_REPORT_TIMEOUT_MS = 12_000;

/** 基于最终 summary 生成面向用户的汇总回复。 */
@Injectable()
export class DevFinalReportGenerator {
  constructor(private readonly llm: LlmService) {}

  async generateReport(
    userInput: string,
    summary: Record<string, unknown>,
    options?: {
      onFinalReplyChunk?: (chunk: string, fullSoFar: string) => void | Promise<void>;
      onFinalReplyDone?: (fullText: string) => void | Promise<void>;
      /**
       * Chunk interval for progressive rendering (backend generated, non-LLM streaming).
       * Lower means more frequent SSE events.
       */
      chunkIntervalMs?: number;
      /**
       * If provided, skip LLM generation and just return this text.
       * Used to directly surface executor output as final reply.
       */
      overrideFinalText?: string | null;
    },
  ): Promise<string> {
    const safeUserInput = String(userInput ?? '').slice(0, REPORT_USER_INPUT_MAX_CHARS);
    let finalText = '';

    if (typeof options?.overrideFinalText === 'string' && options.overrideFinalText.trim().length > 0) {
      finalText = options.overrideFinalText;
      this.startProgressiveReplay(finalText, options);
      return finalText;
    }

    try {
      finalText = await Promise.race([
        this.llm.generate([
          {
            role: 'system',
            content: '你是开发助手小晴。仅基于最终摘要，给出简洁执行汇报。成功时简短确认；失败时说明原因并给一条建议。',
          },
          {
            role: 'user',
            content: `任务：${safeUserInput}\n最终摘要：${JSON.stringify(summary, null, 2)}`,
          },
        ], { scenario: 'dev' }),
        new Promise<string>((_, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`final report generation timed out after ${FINAL_REPORT_TIMEOUT_MS}ms`));
          }, FINAL_REPORT_TIMEOUT_MS);
          timer.unref?.();
        }),
      ]);
    } catch {
      finalText = `任务处理完成，摘要：${JSON.stringify(summary)}`;
    }

    this.startProgressiveReplay(finalText, options);
    return finalText;
  }

  private startProgressiveReplay(
    fullText: string,
    options?: {
      onFinalReplyChunk?: (chunk: string, fullSoFar: string) => void | Promise<void>;
      onFinalReplyDone?: (fullText: string) => void | Promise<void>;
      chunkIntervalMs?: number;
    },
  ): void {
    const onChunk = options?.onFinalReplyChunk;
    const onDone = options?.onFinalReplyDone;
    if (!onChunk && !onDone) return;

    const intervalMs = typeof options?.chunkIntervalMs === 'number' && options.chunkIntervalMs >= 0
      ? options.chunkIntervalMs
      : 15;

    void (async () => {
      try {
        let fullSoFar = '';
        for (const chunk of fullText) {
          fullSoFar += chunk;
          await Promise.resolve(onChunk?.(chunk, fullSoFar));
          if (intervalMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
          }
        }
        await Promise.resolve(onDone?.(fullSoFar));
      } catch {
        // Swallow: SSE progressive rendering must not break run completion.
      }
    })();
  }
}
