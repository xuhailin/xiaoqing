"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const persona_service_1 = require("../src/assistant/persona/persona.service");
async function main() {
    const url = process.env.DATABASE_URL;
    if (!url)
        throw new Error('DATABASE_URL is not set');
    const prisma = new client_1.PrismaClient({ adapter: new adapter_pg_1.PrismaPg({ connectionString: url }) });
    try {
        const active = await prisma.persona.findFirst({
            where: { isActive: true },
            orderBy: { version: 'desc' },
        });
        const nextVersion = (active?.version ?? 0) + 1;
        const txResult = await prisma.$transaction([
            prisma.persona.create({
                data: {
                    identity: persona_service_1.DEFAULT_IDENTITY,
                    personality: persona_service_1.DEFAULT_PERSONALITY,
                    valueBoundary: persona_service_1.DEFAULT_VALUE_BOUNDARY,
                    behaviorForbidden: persona_service_1.DEFAULT_BEHAVIOR_FORBIDDEN,
                    voiceStyle: persona_service_1.DEFAULT_VOICE_STYLE,
                    adaptiveRules: persona_service_1.DEFAULT_ADAPTIVE_RULES,
                    silencePermission: persona_service_1.DEFAULT_SILENCE_PERMISSION,
                    metaFilterPolicy: persona_service_1.DEFAULT_META_FILTER_POLICY,
                    evolutionAllowed: persona_service_1.DEFAULT_EVOLUTION_ALLOWED,
                    evolutionForbidden: persona_service_1.DEFAULT_EVOLUTION_FORBIDDEN,
                    version: nextVersion,
                    isActive: true,
                },
            }),
            ...(active
                ? [
                    prisma.persona.update({
                        where: { id: active.id },
                        data: { isActive: false },
                    }),
                ]
                : []),
        ]);
        const created = txResult[0];
        const nowActive = await prisma.persona.findFirst({
            where: { isActive: true },
            orderBy: { version: 'desc' },
            select: { id: true, version: true, isActive: true, updatedAt: true },
        });
        console.log(JSON.stringify({
            previousActiveId: active?.id ?? null,
            previousVersion: active?.version ?? null,
            createdId: created.id,
            createdVersion: created.version,
            nowActive,
        }, null, 2));
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=set-persona-v2-default.js.map