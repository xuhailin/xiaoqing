export declare const ALLOWED_SHELL_COMMANDS: readonly ["ls", "cat", "head", "tail", "wc", "grep", "find", "echo", "pwd", "whoami", "date", "env", "node", "npx", "npm", "pnpm", "git", "curl", "mkdir", "cp", "mv", "touch"];
export declare const BLOCKED_SHELL_COMMANDS: readonly ["rm", "rmdir", "dd", "mkfs", "fdisk", "shutdown", "reboot", "halt", "poweroff", "kill", "killall", "pkill", "sudo", "su", "chmod", "chown"];
export type ShellCommandPolicyReason = 'empty' | 'blocked' | 'not_allowed' | 'ok';
export interface ShellCommandPolicyResult {
    command: string;
    args: string[];
    reason: ShellCommandPolicyReason;
    allowed: boolean;
    suggestion: string | null;
    suggestedCommand: string | null;
}
export type ShellFixRisk = 'none' | 'low' | 'high';
export interface ShellAutoFixPlan {
    risk: ShellFixRisk;
    shouldApply: boolean;
    reason: string | null;
    fixedArgs: string[];
    suppressStderr: boolean;
    headLimit: number | null;
    notes: string[];
}
export declare function inspectShellCommand(input: string): ShellCommandPolicyResult;
export declare function parseShellCommand(input: string): {
    command: string;
    args: string[];
};
export declare function planShellAutoFix(command: string, args: string[]): ShellAutoFixPlan;
