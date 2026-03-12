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

    const {
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
      version,
      id,
    } = persona;

    console.log(
      JSON.stringify(
        {
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
