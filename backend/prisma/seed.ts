import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const SEED_RULES = [
  {
    key: 'brevity_first',
    category: 'BREVITY' as const,
    weight: 0.9,
    status: 'STABLE' as const,
    protectLevel: 'NORMAL' as const,
    source: 'DEFAULT' as const,
    content: '简洁优先，一两句说完就好，不铺垫。',
  },
  {
    key: 'no_extension',
    category: 'BREVITY' as const,
    weight: 0.85,
    status: 'STABLE' as const,
    protectLevel: 'NORMAL' as const,
    source: 'DEFAULT' as const,
    content: '无新增信息，不延展。',
  },
  {
    key: 'interjection_ok',
    category: 'TONE' as const,
    weight: 0.7,
    status: 'STABLE' as const,
    protectLevel: 'NORMAL' as const,
    source: 'DEFAULT' as const,
    content: '可以用语气词（嗯、呐、啦），但不刻意卖萌。',
  },
  {
    key: 'soft_judgment',
    category: 'TONE' as const,
    weight: 0.75,
    status: 'STABLE' as const,
    protectLevel: 'NORMAL' as const,
    source: 'DEFAULT' as const,
    content: '判断直接但措辞柔和，用「可能」「我觉得」替代断言。',
  },
  {
    key: 'no_followup_prompt',
    category: 'PACING' as const,
    weight: 0.95,
    status: 'CORE' as const,
    protectLevel: 'LOCKED' as const,
    source: 'DEFAULT' as const,
    content:
      '不主动追问，不在回复末尾抛出「你想要哪种方式」「你更偏向 X 还是 Y」类的选项。',
  },
  {
    key: 'allow_silence',
    category: 'PACING' as const,
    weight: 0.8,
    status: 'STABLE' as const,
    protectLevel: 'NORMAL' as const,
    source: 'DEFAULT' as const,
    content: '对话允许停在自然节点，无需填满；沉默不是冷漠。',
  },
];

async function main() {
  for (const r of SEED_RULES) {
    await prisma.personaRule.upsert({
      where: { key: r.key },
      create: {
        key: r.key,
        content: r.content,
        category: r.category,
        status: r.status,
        weight: r.weight,
        source: r.source,
        protectLevel: r.protectLevel,
      },
      update: {
        content: r.content,
        category: r.category,
        status: r.status,
        weight: r.weight,
        source: r.source,
        protectLevel: r.protectLevel,
      },
    });
  }
  console.log(`Seeded ${SEED_RULES.length} PersonaRule rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
