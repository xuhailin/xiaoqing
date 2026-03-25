import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    const persona = await prisma.persona.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!persona) {
      console.log('No active persona found');
      return;
    }

    console.log(
      JSON.stringify(
        {
          id: persona.id,
          personaKey: (persona as any).personaKey,
          version: persona.version,
          identity: persona.identity,
          personality: persona.personality,
          valueBoundary: persona.valueBoundary,
          behaviorForbidden: persona.behaviorForbidden,
          expressionRules: (persona as any).expressionRules,
          metaFilterPolicy: persona.metaFilterPolicy,
          evolutionAllowed: persona.evolutionAllowed,
          evolutionForbidden: persona.evolutionForbidden,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Export active persona failed:', err);
  process.exit(1);
});
