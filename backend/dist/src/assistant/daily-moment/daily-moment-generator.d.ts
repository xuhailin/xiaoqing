import { LlmService } from '../../infra/llm/llm.service';
import { type DailyMomentDraft, type DailyMomentGeneratorInput } from './daily-moment.types';
export declare class DailyMomentGenerator {
    private readonly llm;
    constructor(llm: LlmService);
    generate(input: DailyMomentGeneratorInput): Promise<DailyMomentDraft>;
    private generateWithLlm;
    private parseJson;
    private generateFallback;
    private pickTitle;
    private composeBody;
    private pickClosing;
    private sanitizeDraft;
    private cleanText;
    private normalizeMoodTag;
}
