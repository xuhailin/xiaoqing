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

export interface RelationshipReflectionDto {
  id: string;
  title: string;
  summary: string;
  impact: 'deepened' | 'neutral' | 'strained' | 'repaired';
  rhythmNote: string | null;
  trustDelta: number;
  closenessDelta: number;
  sharedMoment: boolean;
  momentHint: string | null;
  happenedAt: string;
}

export interface RelationshipMomentPreviewDto {
  id: string;
  title: string;
  summary: string;
  category: string;
  emotionalTone: string | null;
  significance: number;
  happenedAt: string;
}

export interface RelationshipOverviewDto {
  stage: 'early' | 'familiar' | 'steady';
  trustScore: number;
  closenessScore: number;
  rhythmPreferences: RhythmPreferenceDto[];
  rhythmObservations: string[];
  milestones: MilestoneDto[];
  recentReflections: RelationshipReflectionDto[];
  recentSharedMoments: RelationshipMomentPreviewDto[];
  lastMeaningfulMomentAt: string | null;
  summary: string;
}
