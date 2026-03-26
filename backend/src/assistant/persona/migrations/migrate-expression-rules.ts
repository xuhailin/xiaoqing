import type { PrismaService } from '../../../infra/prisma.service';
import type { PersonaRuleCategory } from '../persona-rule.types';

export async function migrateExpressionRulesToPersonaRule(
  prisma: PrismaService,
  seedText: string,
): Promise<void> {
  const lines = seedText
    .split('\n')
    .map((line) => line.trim().replace(/^[\-\d\.\s]+/, ''))
    .filter((line) => line.length >= 4);

  for (const [index, line] of lines.entries()) {
    await prisma.personaRule.create({
      data: {
        key: buildMigratedKey(line, index),
        content: line,
        category: inferCategory(line),
        status: 'STABLE',
        weight: Math.max(0.4, 0.9 - index * 0.05),
        source: 'DEFAULT',
        protectLevel: 'NORMAL',
      },
    });
  }
}

function buildMigratedKey(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return slug ? `migrated_${slug}` : `migrated_rule_${index + 1}`;
}

function inferCategory(text: string): PersonaRuleCategory {
  if (/简短|简洁|不铺垫|不延展/.test(text)) return 'BREVITY';
  if (/语气|温柔|柔和|断言|卖萌/.test(text)) return 'TONE';
  if (/追问|节奏|停在|沉默|填满/.test(text)) return 'PACING';
  if (/边界|拒绝|不要|不该|不做/.test(text)) return 'BOUNDARY';
  if (/失败|报错|出错|异常/.test(text)) return 'ERROR_HANDLING';
  return 'TONE';
}
