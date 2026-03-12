export interface OpenClawTaskRequest {
    message: string;
    sessionKey?: string;
    timeoutSeconds?: number;
}
export interface OpenClawTaskResult {
    success: boolean;
    content: string;
    error?: string;
}
export interface OpenClawToolInvokeRequest {
    tool: string;
    args?: Record<string, unknown>;
    sessionKey?: string;
}
