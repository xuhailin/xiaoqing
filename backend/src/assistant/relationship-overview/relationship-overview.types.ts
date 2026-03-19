export interface RhythmPreferenceDto {
  key: string;
  level: string;
  confidence: number;
}

export interface MilestoneDto {
  label: string;
  date: string;
  type: 'stage_change' | 'shared_experience' | 'rhythm_shift';
}

export interface RelationshipOverviewDto {
  stage: 'early' | 'familiar' | 'steady';
  trustScore: number;
  closenessScore: number;
  rhythmPreferences: RhythmPreferenceDto[];
  milestones: MilestoneDto[];
  summary: string;
}
