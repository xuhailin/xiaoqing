import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  PersonaRuleCategory as PrismaPersonaRuleCategory,
  PersonaRuleProtect as PrismaPersonaRuleProtect,
  PersonaRuleSource as PrismaPersonaRuleSource,
  PersonaRuleStatus as PrismaPersonaRuleStatus,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';
import { stringSimilarity } from './persona-rule-similarity';
import { migrateExpressionRulesToPersonaRule } from './migrations/migrate-expression-rules';
import type {
  PersonaRuleMergeDraft,
  PersonaRuleRecord,
  PersonaRuleUpdateActor,
  PersonaRuleCategory,
  PersonaRuleProtect,
  PersonaRuleSource,
  PersonaRuleStatus,
} from './persona-rule.types';

@Injectable()
export class PersonaRuleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 构建表达纪律正文（仅 bullet 行，不含「你的表达纪律」标题）。
   * STABLE + CORE，weight 降序。无记录时返回 null。
   */
  async buildExpressionPrompt(): Promise<string | null> {
    try {
      const rules = await this.prisma.personaRule.findMany({
        where: { status: { in: ['STABLE', 'CORE'] } },
        orderBy: { weight: 'desc' },
      });
      if (rules.length === 0) return null;
      return rules.map((r) => `- ${r.content}`).join('\n');
    } catch {
      return null;
    }
  }

  async ensureInitialized(seedText?: string | null): Promise<void> {
    const count = await this.prisma.personaRule.count();
    if (count > 0) {
      return;
    }

    const seed = seedText?.trim();
    if (!seed) {
      return;
    }

    await migrateExpressionRulesToPersonaRule(this.prisma, seed);
  }

  async replaceFromText(
    text: string,
    actor: PersonaRuleUpdateActor,
  ): Promise<string> {
    const normalizedLines = text
      .split('\n')
      .map((line) => line.trim().replace(/^[\-\d\.\s]+/, ''))
      .filter(Boolean);

    await this.prisma.$transaction(async (tx) => {
      await tx.personaRule.updateMany({
        data: {
          status: 'DEPRECATED',
          pendingContent: null,
        },
      });

      for (const [index, line] of normalizedLines.entries()) {
        const key = `manual_rule_${index + 1}`;
        await tx.personaRule.upsert({
          where: { key },
          create: {
            key,
            content: line,
            category: this.inferCategory(line),
            status: 'STABLE',
            weight: Math.max(0.4, 0.9 - index * 0.05),
            source: actor === 'user' ? 'USER' : 'DEFAULT',
            protectLevel: 'NORMAL',
          },
          update: {
            content: line,
            category: this.inferCategory(line),
            status: 'STABLE',
            weight: Math.max(0.4, 0.9 - index * 0.05),
            source: actor === 'user' ? 'USER' : 'DEFAULT',
            protectLevel: 'NORMAL',
            pendingContent: null,
          },
        });
      }
    });

    return normalizedLines.map((line) => `- ${line}`).join('\n');
  }

  async list(): Promise<PersonaRuleRecord[]> {
    try {
      const rows = await this.prisma.personaRule.findMany({
        orderBy: { weight: 'desc' },
      });
      return rows.map((r) => this.toRecord(r));
    } catch {
      return [];
    }
  }

  async update(
    key: string,
    patch: {
      content?: string;
      weight?: number;
      status?: PersonaRuleStatus;
      protectLevel?: PersonaRuleProtect;
      pendingContent?: string | null;
      category?: PersonaRuleCategory;
      source?: PersonaRuleSource;
    },
    actor: PersonaRuleUpdateActor,
  ): Promise<PersonaRuleRecord> {
    const existing = await this.prisma.personaRule.findUnique({ where: { key } });
    if (!existing) {
      throw new BadRequestException(`PersonaRule not found: ${key}`);
    }
    if (existing.protectLevel === 'LOCKED' && actor !== 'user') {
      throw new ForbiddenException(`Rule ${key} is LOCKED and cannot be modified by system`);
    }

    const data: Prisma.PersonaRuleUpdateInput = {};
    if (patch.content !== undefined) data.content = patch.content;
    if (patch.weight !== undefined) data.weight = patch.weight;
    if (patch.status !== undefined) data.status = patch.status as PrismaPersonaRuleStatus;
    if (patch.protectLevel !== undefined) {
      data.protectLevel = patch.protectLevel as PrismaPersonaRuleProtect;
    }
    if (patch.pendingContent !== undefined) data.pendingContent = patch.pendingContent;
    if (patch.category !== undefined) data.category = patch.category as PrismaPersonaRuleCategory;
    if (patch.source !== undefined) data.source = patch.source as PrismaPersonaRuleSource;
    if (actor === 'user' && Object.keys(data).length > 0 && patch.source === undefined) {
      data.source = 'USER';
    }

    const updated = await this.prisma.personaRule.update({
      where: { key },
      data,
    });
    return this.toRecord(updated);
  }

  async applyEvolutionDraft(drafts: PersonaRuleMergeDraft[]): Promise<{
    skipped: string[];
    merged: string[];
    staged: string[];
    conflicted: string[];
  }> {
    const result = { skipped: [] as string[], merged: [] as string[], staged: [] as string[], conflicted: [] as string[] };

    for (const draft of drafts) {
      const existing = await this.prisma.personaRule.findUnique({ where: { key: draft.key } });

      if (existing?.protectLevel === 'LOCKED') {
        result.skipped.push(draft.key);
        continue;
      }

      if (!existing) {
        await this.prisma.personaRule.create({
          data: {
            key: draft.key,
            content: draft.content,
            category: draft.category as PrismaPersonaRuleCategory,
            weight: draft.weight ?? 0.5,
            status: 'CANDIDATE',
            source: 'EVOLVED',
            protectLevel: 'NORMAL',
          },
        });
        result.staged.push(draft.key);
        continue;
      }

      const sim = stringSimilarity(existing.content, draft.content);
      if (sim > 0.8) {
        await this.prisma.personaRule.update({
          where: { key: draft.key },
          data: { weight: Math.min(1.0, existing.weight + 0.05) },
        });
        result.merged.push(draft.key);
        continue;
      }

      await this.prisma.personaRule.update({
        where: { key: draft.key },
        data: {
          status: 'CANDIDATE',
          pendingContent: draft.content,
        },
      });
      result.conflicted.push(draft.key);
    }

    return result;
  }

  async promote(key: string): Promise<PersonaRuleRecord> {
    const existing = await this.prisma.personaRule.findUnique({ where: { key } });
    if (!existing) throw new BadRequestException(`PersonaRule not found: ${key}`);
    const updated = await this.prisma.personaRule.update({
      where: { key },
      data: {
        status: 'STABLE',
        pendingContent: null,
      },
    });
    return this.toRecord(updated);
  }

  async deprecate(key: string, actor: PersonaRuleUpdateActor): Promise<void> {
    const existing = await this.prisma.personaRule.findUnique({ where: { key } });
    if (!existing) throw new BadRequestException(`PersonaRule not found: ${key}`);
    if (existing.protectLevel === 'LOCKED' && actor !== 'user') {
      throw new ForbiddenException(`Rule ${key} is LOCKED`);
    }
    await this.prisma.personaRule.update({
      where: { key },
      data: { status: 'DEPRECATED', pendingContent: null },
    });
  }

  private toRecord(r: {
    id: string;
    key: string;
    content: string;
    category: PrismaPersonaRuleCategory;
    status: PrismaPersonaRuleStatus;
    weight: number;
    source: PrismaPersonaRuleSource;
    protectLevel: PrismaPersonaRuleProtect;
    pendingContent: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PersonaRuleRecord {
    return {
      id: r.id,
      key: r.key,
      content: r.content,
      category: r.category as PersonaRuleCategory,
      status: r.status as PersonaRuleStatus,
      weight: r.weight,
      source: r.source as PersonaRuleSource,
      protectLevel: r.protectLevel as PersonaRuleProtect,
      pendingContent: r.pendingContent,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private inferCategory(text: string): PersonaRuleCategory {
    if (/简短|简洁|不铺垫|少展开|不延展/.test(text)) return 'BREVITY';
    if (/口语|语气|温柔|柔和|卖萌|断言/.test(text)) return 'TONE';
    if (/追问|节奏|停在|留白|等待|确认一句/.test(text)) return 'PACING';
    if (/边界|拒绝|不要|不该|不做/.test(text)) return 'BOUNDARY';
    if (/失败|报错|异常|出错/.test(text)) return 'ERROR_HANDLING';
    return 'TONE';
  }
}
