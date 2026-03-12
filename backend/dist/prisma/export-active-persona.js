"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
async function main() {
    const url = process.env.DATABASE_URL;
    if (!url)
        throw new Error('DATABASE_URL is not set');
    const adapter = new adapter_pg_1.PrismaPg({ connectionString: url });
    const prisma = new client_1.PrismaClient({ adapter });
    try {
        const persona = await prisma.persona.findFirst({
            where: { isActive: true },
            orderBy: { version: 'desc' },
        });
        if (!persona) {
            console.log('No active persona found');
            return;
        }
        const { identity, personality, valueBoundary, behaviorForbidden, voiceStyle, adaptiveRules, silencePermission, metaFilterPolicy, evolutionAllowed, evolutionForbidden, version, id, } = persona;
        console.log(JSON.stringify({
            id,
            version,
            identity,
            personality,
            valueBoundary,
            behaviorForbidden,
            voiceStyle,
            adaptiveRules,
            silencePermission,
            metaFilterPolicy,
            evolutionAllowed,
            evolutionForbidden,
        }, null, 2));
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch((err) => {
    console.error('Export active persona failed:', err);
    process.exit(1);
});
//# sourceMappingURL=export-active-persona.js.map