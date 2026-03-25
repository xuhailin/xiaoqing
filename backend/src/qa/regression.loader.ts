import { readdir, readFile } from 'fs/promises';
import { resolve } from 'path';
import { parseRegressionScenario } from './regression.schema';
import type { RegressionDatasetFilters, RegressionScenario } from './regression.types';

function effectiveGateSuite(scenario: RegressionScenario): 'core' | 'agents' {
  if (scenario.gateSuite === 'core' || scenario.gateSuite === 'agents') {
    return scenario.gateSuite;
  }
  return scenario.category === 'devagent' ? 'agents' : 'core';
}

const SCENARIO_DIRS = [
  ['cases', 'curated'],
  ['cases', 'promoted'],
  ['replays'],
] as const;

export class RegressionDatasetLoader {
  constructor(private readonly qaRoot: string) {}

  async load(filters: RegressionDatasetFilters): Promise<RegressionScenario[]> {
    const files = await this.collectScenarioFiles();
    const scenarios: RegressionScenario[] = [];

    for (const filePath of files) {
      const rawContent = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(rawContent) as unknown;
      const scenario = parseRegressionScenario(parsed, filePath);
      if (!this.matchesFilters(scenario, filters)) {
        continue;
      }
      scenarios.push(scenario);
    }

    return scenarios.sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'));
  }

  private matchesFilters(
    scenario: RegressionScenario,
    filters: RegressionDatasetFilters,
  ): boolean {
    if (filters.mode === 'gate' || filters.mode === 'gate-agents') {
      if (!scenario.releaseGate) {
        return false;
      }
      const suite = effectiveGateSuite(scenario);
      if (filters.mode === 'gate' && suite !== 'core') {
        return false;
      }
      if (filters.mode === 'gate-agents' && suite !== 'agents') {
        return false;
      }
    }

    if (filters.mode === 'replay' && scenario.sourceType !== 'replay') {
      return false;
    }

    if (filters.sourceTypes?.length && !filters.sourceTypes.includes(scenario.sourceType)) {
      return false;
    }

    if (filters.scenarioIds?.length && !filters.scenarioIds.includes(scenario.id)) {
      return false;
    }

    return true;
  }

  private async collectScenarioFiles(): Promise<string[]> {
    const files: string[] = [];

    for (const segments of SCENARIO_DIRS) {
      const root = resolve(this.qaRoot, ...segments);
      await this.walkJsonFiles(root, files);
    }

    return files;
  }

  private async walkJsonFiles(
    dirPath: string,
    collector: string[],
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = resolve(dirPath, entry.name);
      if (entry.isDirectory()) {
        await this.walkJsonFiles(fullPath, collector);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.json')) {
        collector.push(fullPath);
      }
    }
  }
}
