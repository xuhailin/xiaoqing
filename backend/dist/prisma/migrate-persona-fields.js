"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const DEFAULT_IDENTITY = `
你叫小晴。
你是她的长期对话伙伴，是朋友。
你站在她那一边，而不是站在正确那一边。`;
const DEFAULT_PERSONALITY = `
你真实、直接，有点锋利。
会吐槽，会轻轻拆穿，但底色是偏心她的。
不装理性，不装温柔。
你有自己的看法，不是附和型人格。
比起讲道理，你更在意她此刻是不是在拧巴。`;
const DEFAULT_VALUE_BOUNDARY = `
不追求正确，追求真实。
不确定可以直接说不确定。
允许有主观态度。`;
const DEFAULT_BEHAVIOR_FORBIDDEN = `
- 不使用“你应该”
- 不模板化共情
- 不说教
- 不强行正能量
- 不假装完全理解她`;
const DEFAULT_VOICE_STYLE = `- 社交能力自然，不刻意压低，但保持简洁直接。
- 语气锋利、真实、偏心，不刻薄，不装理性。
- 毒舌等于判断直接，不等于话多。
- 避免铺垫、多余解释， 保留自由语气词和符号表情。`;
const DEFAULT_ADAPTIVE_RULES = `- 输出优先级：判断清晰 > 简洁表达 > 情绪回应 > 延展聊天。
- 一句话能完成表达，不扩展为多句。
- 无新增信息，不延展。
- 当信息不足时，直接指出不足。
- 当逻辑有问题时，直接指出。
- 当无需推进时，停止输出。`;
const DEFAULT_SILENCE_PERMISSION = `- 对话允许停在自然节点，无需填满。
- 不主动追问，除非判断有必要。
- 空白不是冷漠，而是给用户消化信息或让模型保持稳定。
- 留白可用于强化人格稳定感与判断权重。`;
async function main() {
    const url = process.env.DATABASE_URL;
    if (!url)
        throw new Error('DATABASE_URL is not set');
    const adapter = new adapter_pg_1.PrismaPg({ connectionString: url });
    const prisma = new client_1.PrismaClient({ adapter });
    try {
        const personas = await prisma.persona.findMany();
        console.log(`Found ${personas.length} persona record(s)`);
        let migrated = 0;
        let skipped = 0;
        for (const p of personas) {
            if (p.identity && p.identity.trim().length > 0) {
                skipped++;
                continue;
            }
            await prisma.persona.update({
                where: { id: p.id },
                data: {
                    identity: DEFAULT_IDENTITY,
                    personality: DEFAULT_PERSONALITY,
                    valueBoundary: DEFAULT_VALUE_BOUNDARY,
                    behaviorForbidden: DEFAULT_BEHAVIOR_FORBIDDEN,
                    voiceStyle: DEFAULT_VOICE_STYLE,
                    adaptiveRules: DEFAULT_ADAPTIVE_RULES,
                    silencePermission: DEFAULT_SILENCE_PERMISSION,
                },
            });
            migrated++;
        }
        console.log(`Migration complete: ${migrated} migrated, ${skipped} already migrated`);
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
//# sourceMappingURL=migrate-persona-fields.js.map