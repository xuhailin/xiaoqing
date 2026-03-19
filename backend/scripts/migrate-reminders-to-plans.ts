/**
 * 数据迁移脚本：将 DevReminder 表中的数据迁移到 Plan 表。
 *
 * 使用方式：
 *   npx tsx scripts/migrate-reminders-to-plans.ts [--dry-run]
 *
 * --dry-run: 只打印迁移计划，不实际写入
 */

import 'dotenv/config';
import { PrismaClient, PlanDispatchType, PlanStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const dryRun = process.argv.includes('--dry-run');

function reminderScopeToDispatchType(scope: string): PlanDispatchType {
  switch (scope) {
    case 'dev':    return PlanDispatchType.dev_run;
    case 'chat':   return PlanDispatchType.notify;
    case 'system': return PlanDispatchType.noop;
    default:       return PlanDispatchType.notify;
  }
}

function resolveRecurrence(reminder: { cronExpr: string | null; runAt: Date | null }): string {
  if (reminder.runAt && !reminder.cronExpr) return 'once';
  if (!reminder.cronExpr) return 'once';

  // 尝试从 cron 表达式推断 recurrence 类型
  const parts = reminder.cronExpr.trim().split(/\s+/);
  if (parts.length === 5) {
    const [, , , , dow] = parts;
    if (dow === '*') return 'daily';
    if (dow === '1-5') return 'weekday';
    if (/^\d$/.test(dow)) return 'weekly';
  }
  return 'cron';
}

async function main() {
  console.log(`\n🔄 DevReminder → Plan 数据迁移${dryRun ? '（DRY RUN）' : ''}\n`);

  const reminders = await prisma.devReminder.findMany({
    orderBy: { createdAt: 'asc' },
  });

  console.log(`📊 找到 ${reminders.length} 条 DevReminder 记录\n`);

  if (reminders.length === 0) {
    console.log('✅ 无需迁移');
    return;
  }

  // 检查已迁移的记录
  const existingPlans = await prisma.plan.findMany({
    where: { sourceReminderId: { not: null } },
    select: { sourceReminderId: true },
  });
  const alreadyMigrated = new Set(existingPlans.map((p) => p.sourceReminderId));

  let migrated = 0;
  let skipped = 0;

  for (const r of reminders) {
    if (alreadyMigrated.has(r.id)) {
      console.log(`  ⏭ ${r.id} "${r.title ?? r.message.slice(0, 30)}" — 已迁移，跳过`);
      skipped++;
      continue;
    }

    const recurrence = resolveRecurrence(r);
    const dispatchType = reminderScopeToDispatchType(r.scope);
    const status = r.enabled ? PlanStatus.active : PlanStatus.archived;

    console.log(
      `  📝 ${r.id} "${r.title ?? r.message.slice(0, 30)}" → ` +
      `scope=${r.scope} dispatch=${dispatchType} recurrence=${recurrence} status=${status}`,
    );

    if (!dryRun) {
      await prisma.plan.create({
        data: {
          title: r.title,
          description: r.message,
          scope: r.scope,
          dispatchType,
          recurrence,
          cronExpr: r.cronExpr,
          runAt: recurrence === 'once' ? r.runAt : null,
          timezone: r.timezone,
          status,
          nextRunAt: r.nextRunAt,
          lastTriggeredAt: r.lastTriggeredAt,
          lastError: r.lastError,
          sessionId: r.sessionId,
          conversationId: r.conversationId,
          sourceReminderId: r.id,
        },
      });
    }

    migrated++;
  }

  console.log(`\n✅ 迁移完成：${migrated} 条迁移，${skipped} 条跳过`);

  if (dryRun) {
    console.log('\n⚠️  这是 DRY RUN，未实际写入。去掉 --dry-run 参数以执行迁移。');
  }
}

main()
  .catch((err) => {
    console.error('❌ 迁移失败：', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
