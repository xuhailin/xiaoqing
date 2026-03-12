import { MemoryCategory } from './memory-category';
export interface SimilarityFeatures {
    lexical: number;
    cjkBigram: number;
    cjkTrigram: number;
    finalScore: number;
}
export declare function extractCoreTerms(text: string): Set<string>;
export declare function computeSimilarity(queryText: string, targetText: string, category: MemoryCategory): SimilarityFeatures;
