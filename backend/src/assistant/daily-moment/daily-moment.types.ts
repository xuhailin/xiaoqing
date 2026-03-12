export type DailyMomentTriggerMode = 'manual' | 'implicit-suggested' | 'accepted';

export type DailyMomentDecision = 'none' | 'candidate' | 'suggest';

export type DailyMomentSuppressionReason =
  | 'tool_or_task_context'
  | 'serious_or_sensitive_context'
  | 'high_negative_emotion'
  | 'cooldown_active'
  | 'important_issue_in_progress'
  | 'policy_blocked';

export type DailyMomentMoodTag =
  | '轻松'
  | '被逗了一下'
  | '温柔'
  | '小反转'
  | '被接住'
  | '安静的小幸福';

export type DailyMomentFeedback = 'like' | 'neutral' | 'awkward' | 'ignored';
export type DailyMomentEngagementSignalType =
  | 'positive'
  | 'negative'
  | 'accepted_suggestion'
  | 'repeat_request'
  | 'bookmark_or_view';

export interface DailyMomentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface DailyMomentSnippet {
  id: string;
  conversationId: string;
  messageIds: string[];
  messages: DailyMomentChatMessage[];
  summaryHint: string;
  turnCount: number;
}

export interface DailyMomentScoreBreakdown {
  fun: number;
  atmosphere: number;
  completeness: number;
  companionship: number;
  initiative: number;
  total: number;
}

export interface DailyMomentTriggerContext {
  now: Date;
  intentMode?: string | null;
  intentRequiresTool?: boolean;
  intentSeriousness?: string | null;
  detectedEmotion?: string | null;
  isImportantIssueInProgress?: boolean;
  hasRecentTriggerInSession?: boolean;
  policyBlocked?: boolean;
}

export interface DailyMomentTriggerEvaluation {
  decision: DailyMomentDecision;
  breakdown: DailyMomentScoreBreakdown;
  score: number;
  threshold: {
    low: number;
    high: number;
  };
  suppressionReason?: DailyMomentSuppressionReason;
  reasons: string[];
  moodTag?: DailyMomentMoodTag;
}

export interface DailyMomentDraft {
  title: string;
  body: string;
  closingNote: string;
  moodTag?: DailyMomentMoodTag;
  sourceSnippetIds?: string[];
}

export interface DailyMomentRecord extends DailyMomentDraft {
  id: string;
  conversationId: string;
  triggerMode: DailyMomentTriggerMode;
  sourceMessageIds: string[];
  createdAt: Date;
  feedback?: DailyMomentFeedback;
}

export interface DailyMomentSuggestion {
  id: string;
  conversationId: string;
  hint: string;
  createdAt: Date;
  score: number;
  moodTag?: DailyMomentMoodTag;
  sourceMessageIds: string[];
  accepted: boolean;
}

export interface DailyMomentFeedbackSummary {
  likeCount: number;
  awkwardCount: number;
  ignoredCount: number;
  neutralCount: number;
  positiveSignalCount: number;
  negativeSignalCount: number;
  acceptedSuggestionCount: number;
  repeatRequestCount: number;
  bookmarkOrViewCount: number;
}

export interface DailyMomentEngagementSignal {
  id: string;
  conversationId: string;
  type: DailyMomentEngagementSignalType;
  createdAt: Date;
  sourceText?: string;
}

export interface DailyMomentPolicyInput {
  conversationId: string;
  now: Date;
  isSeriousTopic: boolean;
  shortReplyStreak: number;
  feedbackSummary: DailyMomentFeedbackSummary;
  recentSuggestions: DailyMomentSuggestion[];
}

export interface DailyMomentPolicyDecision {
  allow: boolean;
  reason?: string;
  // 对触发阈值做轻量自适应，值越大越保守
  scoreBias: number;
}

export interface DailyMomentGeneratorInput {
  now: Date;
  triggerMode: DailyMomentTriggerMode;
  snippet: DailyMomentSnippet;
  moodTag?: DailyMomentMoodTag;
  lightweightFallback?: boolean;
}

export interface DailyMomentSuggestionCheckResult {
  shouldSuggest: boolean;
  evaluation: DailyMomentTriggerEvaluation;
  suggestion?: DailyMomentSuggestion;
}

export interface DailyMomentRepository {
  saveRecord(record: DailyMomentRecord): Promise<void>;
  listRecordsByConversation(conversationId: string): Promise<DailyMomentRecord[]>;
  saveSuggestion(suggestion: DailyMomentSuggestion): Promise<void>;
  listSuggestionsByConversation(conversationId: string): Promise<DailyMomentSuggestion[]>;
  markSuggestionAccepted(suggestionId: string): Promise<void>;
  saveFeedback(recordId: string, feedback: DailyMomentFeedback): Promise<void>;
  saveSignal(signal: DailyMomentEngagementSignal): Promise<void>;
  listSignalsByConversation(conversationId: string): Promise<DailyMomentEngagementSignal[]>;
}
