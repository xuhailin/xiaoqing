import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import type { DesignKnowledge, DesignPreset, DesignPageType, ProjectPage } from '../design-agent.types';

const VALID_PAGE_TYPES: DesignPageType[] = ['chat', 'workbench', 'memory'];
const VALID_PRESETS: DesignPreset[] = ['warm-tech', 'serious-workbench', 'quiet-personal'];

function isDesignPageType(v: string): v is DesignPageType {
  return (VALID_PAGE_TYPES as string[]).includes(v);
}

function isDesignPreset(v: string): v is DesignPreset {
  return (VALID_PRESETS as string[]).includes(v);
}

function normalizeProjectPages(raw: unknown, log: Logger): ProjectPage[] {
  const root = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const pagesRaw = root?.pages;
  if (!Array.isArray(pagesRaw)) {
    log.error('project-pages.yaml: missing or invalid "pages" array');
    return [];
  }
  const out: ProjectPage[] = [];
  for (const row of pagesRaw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const p = row as Record<string, unknown>;
    const name = String(p.name ?? '').trim();
    const route = String(p.route ?? '').trim();
    const pageTypeStr = String(p.pageType ?? '').trim();
    const presetStr = String(p.preset ?? '').trim();
    const componentPath = String(p.componentPath ?? '').trim();
    const aliasesRaw = p.aliases;
    const aliases = Array.isArray(aliasesRaw)
      ? aliasesRaw.filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean)
      : [];
    if (!name || !route || !isDesignPageType(pageTypeStr) || !isDesignPreset(presetStr) || !componentPath) {
      log.warn(`project-pages.yaml: skip invalid page entry: ${name || '(no name)'}`);
      continue;
    }
    out.push({
      name,
      route,
      pageType: pageTypeStr,
      preset: presetStr,
      componentPath,
      aliases,
    });
  }
  return out;
}

/**
 * 加载 design-agent/knowledge/ 下的设计知识资产。
 *
 * 知识文件与代码同目录，不再从外部 skills/ 读取。
 * 启动时一次性加载并缓存。
 */
@Injectable()
export class DesignKnowledgeLoader implements OnModuleInit {
  private readonly logger = new Logger(DesignKnowledgeLoader.name);

  /** knowledge/ 目录的绝对路径 */
  private readonly knowledgeRoot: string;

  private cache: {
    coreRules: string;
    pageTypePatterns: string;
    themeTokens: string;
    sharedPrimitives: string;
    presets: Record<DesignPreset, string>;
    projectPages: ProjectPage[];
  } | null = null;

  constructor() {
    // 编译后 JS 位于 dist/src/design-agent/knowledge/，知识资产位于 dist/design-agent/knowledge/
    // ts-node 开发时 __dirname 直接指向源文件目录，无需跳层
    const compiled = resolve(__dirname, '..', '..', '..', 'design-agent', 'knowledge');
    this.knowledgeRoot = existsSync(resolve(compiled, 'project-pages.yaml')) ? compiled : __dirname;
  }

  async onModuleInit() {
    try {
      await this.load();
      this.logger.log(`Design knowledge loaded from ${this.knowledgeRoot}`);
    } catch (err) {
      this.logger.warn(`Failed to preload design knowledge: ${String(err)}`);
    }
  }

  async getKnowledge(preset: DesignPreset): Promise<DesignKnowledge> {
    if (!this.cache) {
      await this.load();
    }
    const c = this.cache!;
    return {
      coreRules: c.coreRules,
      pageTypePatterns: c.pageTypePatterns,
      themeTokens: c.themeTokens,
      sharedPrimitives: c.sharedPrimitives,
      preset: c.presets[preset] ?? '',
      presetName: preset,
    };
  }

  /** 项目页面注册表（Design Intent 解析用） */
  getProjectPages(): ProjectPage[] {
    if (!this.cache?.projectPages) {
      return [];
    }
    return this.cache.projectPages;
  }

  private async load() {
    const [
      coreRules,
      pageTypePatterns,
      themeTokens,
      sharedPrimitives,
      warmTech,
      seriousWorkbench,
      quietPersonal,
      projectPagesYaml,
    ] = await Promise.all([
      this.readFile('rules/core-ui-rules.md'),
      this.readFile('rules/page-type-patterns.md'),
      this.readFile('tokens/theme-tokens.yaml'),
      this.readFile('shared-primitives.md'),
      this.readFile('presets/warm-tech.yaml'),
      this.readFile('presets/serious-workbench.yaml'),
      this.readFile('presets/quiet-personal.yaml'),
      this.readFile('project-pages.yaml'),
    ]);

    let projectPages: ProjectPage[] = [];
    try {
      const parsed = parseYaml(projectPagesYaml) as unknown;
      projectPages = normalizeProjectPages(parsed, this.logger);
      if (projectPages.length === 0) {
        this.logger.error('project-pages.yaml: no valid pages after parse');
      }
    } catch (err) {
      this.logger.error(`project-pages.yaml: parse failed: ${String(err)}`);
    }

    this.cache = {
      coreRules,
      pageTypePatterns,
      themeTokens,
      sharedPrimitives,
      presets: {
        'warm-tech': warmTech,
        'serious-workbench': seriousWorkbench,
        'quiet-personal': quietPersonal,
      },
      projectPages,
    };
  }

  private async readFile(relativePath: string): Promise<string> {
    const fullPath = resolve(this.knowledgeRoot, relativePath);
    return readFile(fullPath, 'utf-8');
  }
}
