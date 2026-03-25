import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DEFAULT_IDENTITY,
  DEFAULT_PERSONALITY,
  DEFAULT_VALUE_BOUNDARY,
  DEFAULT_BEHAVIOR_FORBIDDEN,
  DEFAULT_EXPRESSION_RULES,
  DEFAULT_META_FILTER_POLICY,
  DEFAULT_EVOLUTION_ALLOWED,
  DEFAULT_EVOLUTION_FORBIDDEN,
} from '../src/assistant/persona/persona.service';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const active = await prisma.persona.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    });

    const nextVersion = (active?.version ?? 0) + 1;

    const txResult = await prisma.$transaction([
      prisma.persona.create({
        data: {
          identity: DEFAULT_IDENTITY,
          personality: DEFAULT_PERSONALITY,
          valueBoundary: DEFAULT_VALUE_BOUNDARY,
          behaviorForbidden: DEFAULT_BEHAVIOR_FORBIDDEN,
          expressionRules: DEFAULT_EXPRESSION_RULES,
          metaFilterPolicy: DEFAULT_META_FILTER_POLICY,
          evolutionAllowed: DEFAULT_EVOLUTION_ALLOWED,
          evolutionForbidden: DEFAULT_EVOLUTION_FORBIDDEN,
          personaKey: active?.personaKey ?? 'default',
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

    console.log(
      JSON.stringify(
        {
          previousActiveId: active?.id ?? null,
          previousVersion: active?.version ?? null,
          createdId: created.id,
          createdVersion: created.version,
          nowActive,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
