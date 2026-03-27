import type { CharacterAsset, StylePreset, WorldStyle } from '../video-agent.types';

export class CreateCreativePackageDto {
  name!: string;
  description?: string;
  coverImage?: string;
  source?: string;
  characters?: CharacterAsset[];
  worldStyle?: Partial<WorldStyle>;
  stylePreset?: Partial<StylePreset>;
}
