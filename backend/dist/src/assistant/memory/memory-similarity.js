"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCoreTerms = extractCoreTerms;
exports.computeSimilarity = computeSimilarity;
const memory_category_1 = require("./memory-category");
const CJK_REGEX = /[\u3400-\u9fff\u3040-\u30ff]/;
const EN_STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'for', 'in', 'on', 'at', 'by', 'with',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'this', 'that', 'these', 'those',
    'as', 'from', 'about', 'into', 'than', 'then', 'so', 'if', 'can', 'could', 'will', 'would',
    'i', 'you', 'he', 'she', 'we', 'they', 'me', 'my', 'your', 'our', 'their',
]);
const ZH_STOPWORDS = new Set([
    '的', '了', '和', '是', '我', '你', '他', '她', '它', '我们', '你们', '他们', '她们', '它们',
    '在', '有', '就', '也', '都', '而', '及', '与', '并', '或', '但', '呢', '啊', '呀', '吧',
    '吗', '哦', '嘛', '这', '那', '一个', '一些', '这个', '那个', '因为', '所以', '如果', '然后',
]);
const CATEGORY_CJK_WEIGHT = {
    [memory_category_1.MemoryCategory.IDENTITY_ANCHOR]: 0.45,
    [memory_category_1.MemoryCategory.SHARED_FACT]: 0.35,
    [memory_category_1.MemoryCategory.COMMITMENT]: 0.35,
    [memory_category_1.MemoryCategory.CORRECTION]: 0.45,
    [memory_category_1.MemoryCategory.SOFT_PREFERENCE]: 0.5,
    [memory_category_1.MemoryCategory.GENERAL]: 0.4,
    [memory_category_1.MemoryCategory.JUDGMENT_PATTERN]: 0.55,
    [memory_category_1.MemoryCategory.VALUE_PRIORITY]: 0.5,
    [memory_category_1.MemoryCategory.RHYTHM_PATTERN]: 0.55,
    [memory_category_1.MemoryCategory.COGNITIVE_PROFILE]: 0.5,
    [memory_category_1.MemoryCategory.RELATIONSHIP_STATE]: 0.5,
    [memory_category_1.MemoryCategory.BOUNDARY_EVENT]: 0.45,
};
function splitTokens(text) {
    return text
        .toLowerCase()
        .split(/[\s！？，。、；：""''【】《》（）\-_.,!?;:'"()[\]{}]+/)
        .filter(Boolean);
}
function extractCoreTerms(text) {
    const tokens = splitTokens(text);
    const result = new Set();
    for (const token of tokens) {
        if (token.length === 0)
            continue;
        const isCjk = CJK_REGEX.test(token);
        if (isCjk) {
            if (ZH_STOPWORDS.has(token))
                continue;
            if (token.length >= 2)
                result.add(token);
            continue;
        }
        if (token.length < 3)
            continue;
        if (EN_STOPWORDS.has(token))
            continue;
        result.add(token);
    }
    return result;
}
function toCjkChars(text) {
    return Array.from(text)
        .filter((ch) => CJK_REGEX.test(ch))
        .join('');
}
function buildNgrams(text, n) {
    const normalized = toCjkChars(text);
    const grams = new Set();
    if (normalized.length < n)
        return grams;
    for (let i = 0; i <= normalized.length - n; i++) {
        grams.add(normalized.slice(i, i + n));
    }
    return grams;
}
function jaccard(a, b) {
    if (a.size === 0 || b.size === 0)
        return 0;
    let overlap = 0;
    for (const x of a) {
        if (b.has(x))
            overlap++;
    }
    return overlap / (new Set([...a, ...b]).size || 1);
}
function computeSimilarity(queryText, targetText, category) {
    const coreA = extractCoreTerms(queryText);
    const coreB = extractCoreTerms(targetText);
    const lexical = jaccard(coreA, coreB);
    const bigramA = buildNgrams(queryText, 2);
    const bigramB = buildNgrams(targetText, 2);
    const cjkBigram = jaccard(bigramA, bigramB);
    const trigramA = buildNgrams(queryText, 3);
    const trigramB = buildNgrams(targetText, 3);
    const cjkTrigram = jaccard(trigramA, trigramB);
    const cjkWeight = CATEGORY_CJK_WEIGHT[category] ?? CATEGORY_CJK_WEIGHT[memory_category_1.MemoryCategory.GENERAL];
    const lexicalWeight = 1 - cjkWeight;
    const cjkScore = 0.7 * cjkBigram + 0.3 * cjkTrigram;
    const finalScore = lexicalWeight * lexical + cjkWeight * cjkScore;
    return { lexical, cjkBigram, cjkTrigram, finalScore };
}
//# sourceMappingURL=memory-similarity.js.map