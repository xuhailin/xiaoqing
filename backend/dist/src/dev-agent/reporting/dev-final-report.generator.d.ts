import { LlmService } from '../../infra/llm/llm.service';
export declare class DevFinalReportGenerator {
    private readonly llm;
    constructor(llm: LlmService);
    generateReport(userInput: string, summary: Record<string, unknown>): Promise<string>;
}
