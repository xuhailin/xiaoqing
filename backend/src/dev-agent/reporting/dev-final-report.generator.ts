import { Injectable } from '@nestjs/common';
import { LlmService } from '../../infra/llm/llm.service';
import { REPORT_USER_INPUT_MAX_CHARS } from '../dev-agent.constants';

const FINAL_REPORT_TIMEOUT_MS = 12_000;

/** 基于最终 summary 生成面向用户的汇总回复。 */
@Injectable()
export class DevFinalReportGenerator {
  constructor(private readonly llm: LlmService) {}

  async generateReport(userInput: string, summary: Record<string, unknown>): Promise<string> {
    const safeUserInput = String(userInput ?? '').slice(0, REPORT_USER_INPUT_MAX_CHARS);
    try {
      return await Promise.race([
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
      return `任务处理完成，摘要：${JSON.stringify(summary)}`;
    }
  }
}
