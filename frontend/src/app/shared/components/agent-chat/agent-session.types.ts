export interface AgentSession {
  id: string;
  title: string;
  status: 'running' | 'success' | 'failed';
  createdAt: string;
  lastMessage?: string | null;
}
