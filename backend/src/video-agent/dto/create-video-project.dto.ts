import type { StoryboardSceneInput } from '../video-agent.types';

export class CreateVideoProjectDto {
  packageId!: string;
  storyBrief?: string;
  scenes?: StoryboardSceneInput[];
}
