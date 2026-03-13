import type { DialogueIntentState } from '../../assistant/intent/intent.types';

export interface ToolRequest {
  conversationId: string;
  turnId: string;
  userInput: string;
  executor: 'local-weather' | 'local-book-download' | 'local-general-action' | 'local-timesheet' | 'local-reminder' | 'openclaw';
  capability: 'weather_query' | 'book_download' | 'general_tool' | 'timesheet' | 'set_reminder';
  intentState: DialogueIntentState;
  recentMessages?: Array<{ role: string; content: string }>;
  params: Record<string, unknown>;
}

export interface ToolExecutionResult {
  conversationId: string;
  turnId: string;
  executor: 'local-weather' | 'local-book-download' | 'local-general-action' | 'local-timesheet' | 'local-reminder' | 'openclaw';
  capability: 'weather_query' | 'book_download' | 'general_tool' | 'timesheet' | 'set_reminder';
  success: boolean;
  content: string | null;
  error: string | null;
  meta?: Record<string, unknown>;
}
