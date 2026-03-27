import type { CreativePackageDto } from './video-agent.models';

export type WorkbenchTab = 'create' | 'history' | 'assets';
export type WorkbenchCreateMode = 'text' | 'image' | 'storyboard';

export interface WorkbenchScene {
  id: string;
  prompt: string;
  duration?: number;
  description?: string;
  cameraMovement?: string;
  status?: 'pending' | 'generating' | 'done' | 'failed';
  videoUrl?: string;
}

export interface WorkbenchHistoryItem {
  id: string;
  type: 'single' | 'storyboard';
  title: string;
  subtitle: string;
  status: string;
  createdAt: number;
  scenes: WorkbenchScene[];
}

export interface WorkbenchPackageDraft {
  id?: string;
  name: string;
  description: string;
  characterSummary: string;
  keywordText: string;
  shotStyle: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
}

export function createPackageDraft(
  pkg?: CreativePackageDto,
): WorkbenchPackageDraft {
  if (!pkg) {
    return {
      name: '',
      description: '',
      characterSummary: '',
      keywordText: '',
      shotStyle: 'cinematic',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: 5,
    };
  }

  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description || '',
    characterSummary: pkg.characters.map((item) => item.appearancePrompt).join('\n'),
    keywordText: pkg.worldStyle.sceneKeywords.join(', '),
    shotStyle: pkg.stylePreset.shotStyle,
    aspectRatio: pkg.stylePreset.aspectRatio,
    resolution: pkg.stylePreset.resolution,
    duration: pkg.stylePreset.duration,
  };
}
