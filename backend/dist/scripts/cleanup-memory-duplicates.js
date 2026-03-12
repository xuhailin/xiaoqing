"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const CJK_REGEX = /[\u3400-\u9fff\u3040-\u30ff]/;
const DEFAULT_CATEGORY_THRESHOLD = {
    identity_anchor: 0.72,
    correction: 0.68,
    shared_fact: 0.66,
    soft_preference: 0.7,
    judgment_pattern: 0.74,
    value_priority: 0.74,
    rhythm_pattern: 0.74,
    cognitive_profile: 0.74,
    relationship_state: 0.72,
    boundary_event: 0.7,
    commitment: 0.66,
    general: 0.64,
};
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
function parseArgs() {
    const args = process.argv.slice(2);
    const kv = {};
    for (const a of args) {
        if (!a.startsWith('--'))
            continue;
        const eq = a.indexOf('=');
        if (eq > 0) {
            kv[a.slice(2, eq)] = a.slice(eq + 1);
        }
        else {
            kv[a.slice(2)] = 'true';
        }
    }
    const highHitCap = Number(kv['high-hit-cap'] || '20');
    return {
        apply: kv.apply === 'true',
        category: kv.category,
        type: kv.type,
        threshold: kv.threshold ? Number(kv.threshold) : null,
        highHitCap: Number.isFinite(highHitCap) ? highHitCap : 20,
    };
}
function splitTokens(text) {
    return String(text || '')
        .toLowerCase()
        .split(/[\s！？，。、；：""''【】《》（）\-_.,!?;:'"()[\]{}]+/)
        .filter(Boolean);
}
function extractCoreTerms(text) {
    const tokens = splitTokens(text);
    const result = new Set();
    for (const token of tokens) {
        if (!token)
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
    return Array.from(String(text || ''))
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
function categoryCjkWeight(category) {
    if (category === 'judgment_pattern' ||
        category === 'value_priority' ||
        category === 'rhythm_pattern' ||
        category === 'cognitive_profile' ||
        category === 'relationship_state') {
        return 0.5;
    }
    if (category === 'soft_preference')
        return 0.5;
    return 0.4;
}
function similarity(a, b, category) {
    const lexical = jaccard(extractCoreTerms(a), extractCoreTerms(b));
    const cjkBigram = jaccard(buildNgrams(a, 2), buildNgrams(b, 2));
    const cjkTrigram = jaccard(buildNgrams(a, 3), buildNgrams(b, 3));
    const cjkScore = 0.7 * cjkBigram + 0.3 * cjkTrigram;
    const cjkWeight = categoryCjkWeight(category);
    const lexicalWeight = 1 - cjkWeight;
    return lexicalWeight * lexical + cjkWeight * cjkScore;
}
function normalizeHitCount(totalHits, keeperHitCount, highHitCap) {
    const softened = Math.round(4 * Math.log2(1 + totalHits));
    return Math.min(highHitCap, Math.max(keeperHitCount, softened));
}
function createDisjointSet(n) {
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    };
    const union = (a, b) => {
        const pa = find(a);
        const pb = find(b);
        if (pa !== pb)
            parent[pb] = pa;
    };
    return { find, union };
}
async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set');
    }
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const args = parseArgs();
    const where = {
        frozen: false,
        decayScore: { gt: 0 },
    };
    if (args.category)
        where.category = args.category;
    if (args.type)
        where.type = args.type;
    try {
        const memories = await prisma.memory.findMany({
            where,
            select: {
                id: true,
                type: true,
                category: true,
                content: true,
                confidence: true,
                sourceMessageIds: true,
                hitCount: true,
                updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 500,
        });
        if (memories.length === 0) {
            console.log('No memories matched filters.');
            return;
        }
        const grouped = new Map();
        for (const m of memories) {
            const key = `${m.type}::${m.category}`;
            const list = grouped.get(key) || [];
            list.push(m);
            grouped.set(key, list);
        }
        const plans = [];
        for (const [groupKey, list] of grouped.entries()) {
            if (list.length < 2)
                continue;
            const ds = createDisjointSet(list.length);
            const thresholdBase = args.threshold;
            const cat = list[0].category || 'general';
            const threshold = thresholdBase ?? (DEFAULT_CATEGORY_THRESHOLD[cat] ?? DEFAULT_CATEGORY_THRESHOLD.general);
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const s = similarity(list[i].content, list[j].content, cat);
                    if (s >= threshold)
                        ds.union(i, j);
                }
            }
            const clusters = new Map();
            for (let i = 0; i < list.length; i++) {
                const p = ds.find(i);
                const c = clusters.get(p) || [];
                c.push(list[i]);
                clusters.set(p, c);
            }
            for (const cluster of clusters.values()) {
                if (cluster.length < 2)
                    continue;
                const sorted = [...cluster].sort((a, b) => {
                    if (b.confidence !== a.confidence)
                        return b.confidence - a.confidence;
                    if (b.hitCount !== a.hitCount)
                        return b.hitCount - a.hitCount;
                    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                });
                const keeper = sorted[0];
                const removed = sorted.slice(1);
                const totalHits = sorted.reduce((sum, x) => sum + x.hitCount, 0);
                const mergedSources = [...new Set(sorted.flatMap((x) => x.sourceMessageIds || []))];
                const nextHitCount = normalizeHitCount(totalHits, keeper.hitCount, args.highHitCap);
                plans.push({
                    groupKey,
                    threshold,
                    keeper,
                    removed,
                    mergedSources,
                    totalHits,
                    nextHitCount,
                });
            }
        }
        console.log(`Scanned memories: ${memories.length}`);
        console.log(`Duplicate clusters: ${plans.length}`);
        if (plans.length === 0)
            return;
        for (const p of plans.slice(0, 30)) {
            console.log('\n---');
            console.log(`group=${p.groupKey} threshold=${p.threshold.toFixed(2)}`);
            console.log(`keeper=${p.keeper.id} conf=${p.keeper.confidence.toFixed(2)} hit=${p.keeper.hitCount}`);
            console.log(`remove=${p.removed.map((x) => `${x.id}(hit=${x.hitCount})`).join(', ')}`);
            console.log(`hits: total=${p.totalHits} -> normalized=${p.nextHitCount}`);
            console.log(`content: ${String(p.keeper.content || '').slice(0, 60)}`);
        }
        if (plans.length > 30) {
            console.log(`\n... ${plans.length - 30} more clusters omitted`);
        }
        if (!args.apply) {
            console.log('\nDry-run mode. Re-run with --apply to execute changes.');
            return;
        }
        let mergedCount = 0;
        let deletedCount = 0;
        for (const p of plans) {
            const deleteIds = p.removed.map((x) => x.id);
            await prisma.$transaction([
                prisma.memory.update({
                    where: { id: p.keeper.id },
                    data: {
                        sourceMessageIds: p.mergedSources,
                        hitCount: p.nextHitCount,
                        lastAccessedAt: new Date(),
                    },
                }),
                prisma.memory.deleteMany({
                    where: { id: { in: deleteIds } },
                }),
            ]);
            mergedCount += 1;
            deletedCount += deleteIds.length;
        }
        console.log(`\nApplied: merged clusters=${mergedCount}, deleted memories=${deletedCount}`);
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=cleanup-memory-duplicates.js.map