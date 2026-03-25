import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const before = await prisma.persona.count();
    const { count } = await prisma.persona.deleteMany({ where: { isActive: false } });
    const after = await prisma.persona.count();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ deletedInactive: count, before, after }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

