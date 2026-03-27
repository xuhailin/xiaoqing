import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../infra/llm/llm.service';
import { buildShotPlannerPrompt } from './prompts/shot-planner.prompt';
import type { CreativePackageDto, PlannedShot } from './video-agent.types';

const DEFAULT_FALLBACK_MOVEMENTS = ['static', 'push in', 'pull back'] as const;
const ALLOWED_MOVEMENTS = new Set([
  'push in',
  'pull back',
  'pan left',
  'pan right',
  'tilt up',
  'tilt down',
  'static',
  'hand-held',
]);

@Injectable()
export class ShotPlannerService {
  private readonly logger = new Logger(ShotPlannerService.name);

  constructor(private readonly llm: LlmService) {}

  async planShots(pkg: CreativePackageDto, storyBrief?: string): Promise<PlannedShot[]> {
    const prompt = buildShotPlannerPrompt({
      packageName: pkg.name,
      colorTone: pkg.worldStyle.colorTone,
      era: pkg.worldStyle.era,
      atmosphere: pkg.worldStyle.atmosphere,
      sceneKeywords: pkg.worldStyle.sceneKeywords,
      characters: pkg.characters.map((character) => ({
        name: character.name,
        appearancePrompt: character.appearancePrompt,
      })),
      shotStyle: pkg.stylePreset.shotStyle,
      aspectRatio: pkg.stylePreset.aspectRatio,
      duration: pkg.stylePreset.duration,
      storyBrief,
    });

    try {
      const content = await this.llm.generate([
        {
          role: 'system',
          content: 'You are a professional AI video storyboard planner. Output JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('no JSON array found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('empty planned shot list');
      }

      return parsed.slice(0, 5).map((item, index) => this.normalizeShot(item, index + 1, pkg));
    } catch (error) {
      this.logger.warn(
        `shot planning failed for package ${pkg.id}, fallback enabled: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.buildFallbackShots(pkg);
    }
  }

  private normalizeShot(raw: unknown, shotIndex: number, pkg: CreativePackageDto): PlannedShot {
    const fallback = this.buildFallbackShots(pkg)[shotIndex - 1] ?? this.buildFallbackShots(pkg)[0];
    const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const description =
      typeof value.description === 'string' && value.description.trim().length > 0
        ? value.description.trim()
        : fallback.description;
    const cameraMovement =
      typeof value.cameraMovement === 'string' && ALLOWED_MOVEMENTS.has(value.cameraMovement.trim())
        ? value.cameraMovement.trim()
        : fallback.cameraMovement;
    const duration =
      typeof value.duration === 'number' && value.duration > 0
        ? Math.round(value.duration)
        : fallback.duration;

    return {
      shotIndex,
      description,
      cameraMovement,
      duration,
    };
  }

  private buildFallbackShots(pkg: CreativePackageDto): PlannedShot[] {
    const keywordLine = pkg.worldStyle.sceneKeywords.join(', ') || pkg.worldStyle.atmosphere || 'cinematic scene';
    const characterLine =
      pkg.characters.map((character) => character.appearancePrompt).join(', ') || 'consistent protagonist';
    const duration = pkg.stylePreset.duration || 5;

    return [
      `Wide establishing shot of ${keywordLine}, ${characterLine}, cinematic lighting`,
      `Medium shot of the main action unfolding inside ${keywordLine}, expressive motion, atmospheric light`,
      `Close-up emotional payoff shot, detailed subject, immersive background, dramatic mood`,
    ].map((description, index) => ({
      shotIndex: index + 1,
      description,
      cameraMovement: DEFAULT_FALLBACK_MOVEMENTS[index] ?? 'static',
      duration,
    }));
  }
}
