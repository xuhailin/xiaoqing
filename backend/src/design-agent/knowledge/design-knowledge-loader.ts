import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { DesignKnowledge, DesignPreset } from '../design-agent.types';

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
  } | null = null;

  constructor() {
    // 编译后此文件位于 dist/design-agent/knowledge/，知识资产由 nest-cli assets 复制到同目录
    this.knowledgeRoot = __dirname;
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

  private async load() {
    const [coreRules, pageTypePatterns, themeTokens, sharedPrimitives, warmTech, seriousWorkbench, quietPersonal] =
      await Promise.all([
        this.readFile('rules/core-ui-rules.md'),
        this.readFile('rules/page-type-patterns.md'),
        this.readFile('tokens/theme-tokens.yaml'),
        this.readFile('shared-primitives.md'),
        this.readFile('presets/warm-tech.yaml'),
        this.readFile('presets/serious-workbench.yaml'),
        this.readFile('presets/quiet-personal.yaml'),
      ]);

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
    };
  }

  private async readFile(relativePath: string): Promise<string> {
    const fullPath = resolve(this.knowledgeRoot, relativePath);
    return readFile(fullPath, 'utf-8');
  }
}
