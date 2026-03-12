/** 允许执行的命令白名单（首个参数） */
export const ALLOWED_SHELL_COMMANDS = [
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'find', 'echo',
  'pwd', 'whoami', 'date', 'env',
  'node', 'npx', 'npm', 'pnpm',
  'git',
  'curl',
  'mkdir', 'cp', 'mv', 'touch',
] as const;

/** 禁止的危险命令 */
export const BLOCKED_SHELL_COMMANDS = [
  'rm', 'rmdir', 'dd', 'mkfs', 'fdisk',
  'shutdown', 'reboot', 'halt', 'poweroff',
  'kill', 'killall', 'pkill',
  'sudo', 'su', 'chmod', 'chown',
] as const;

const ALLOWED_SET = new Set<string>(ALLOWED_SHELL_COMMANDS);
const BLOCKED_SET = new Set<string>(BLOCKED_SHELL_COMMANDS);
const PYTHON_LIKE = new Set(['python', 'python3']);

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

export function inspectShellCommand(input: string): ShellCommandPolicyResult {
  const { command, args } = parseShellCommand(input);
  if (!command) {
    return {
      command: '',
      args: [],
      reason: 'empty',
      allowed: false,
      suggestion: '请提供可执行命令，例如：ls、cat、grep、node、npm、git。',
      suggestedCommand: null,
    };
  }

  if (BLOCKED_SET.has(command)) {
    return {
      command,
      args,
      reason: 'blocked',
      allowed: false,
      suggestion: `命令 "${command}" 属于危险命令，被安全策略禁止。`,
      suggestedCommand: null,
    };
  }

  if (!ALLOWED_SET.has(command)) {
    const fallback = suggestForDisallowedCommand(input, command);
    return {
      command,
      args,
      reason: 'not_allowed',
      allowed: false,
      suggestion: fallback.suggestion,
      suggestedCommand: fallback.command,
    };
  }

  return {
    command,
    args,
    reason: 'ok',
    allowed: true,
    suggestion: null,
    suggestedCommand: null,
  };
}

export function parseShellCommand(input: string): { command: string; args: string[] } {
  const trimmed = input.trim();
  const tokens = tokenizeShell(trimmed);
  return {
    command: tokens[0] || '',
    args: tokens.slice(1),
  };
}

export function planShellAutoFix(command: string, args: string[]): ShellAutoFixPlan {
  if (!command || args.length === 0) {
    return noFix();
  }

  const highRisk = detectHighRiskToken(args);
  if (highRisk) {
    return {
      risk: 'high',
      shouldApply: false,
      reason: `检测到高风险 shell 语法（${highRisk}），不自动修复`,
      fixedArgs: args,
      suppressStderr: false,
      headLimit: null,
      notes: [],
    };
  }

  let changed = false;
  let suppressStderr = false;
  let headLimit: number | null = null;
  const notes: string[] = [];

  let normalizedArgs = args.map((arg) => {
    if (arg === '\\(') {
      changed = true;
      return '(';
    }
    if (arg === '\\)') {
      changed = true;
      return ')';
    }
    return arg;
  });

  const strippedRedirectArgs: string[] = [];
  for (let i = 0; i < normalizedArgs.length; i++) {
    const match = consumeDevNullStderrRedirect(normalizedArgs, i);
    if (match > 0) {
      suppressStderr = true;
      changed = true;
      i += match - 1;
      continue;
    }
    strippedRedirectArgs.push(normalizedArgs[i]);
  }
  normalizedArgs = strippedRedirectArgs;

  const pipeIndex = normalizedArgs.indexOf('|');
  if (pipeIndex >= 0) {
    const right = normalizedArgs.slice(pipeIndex + 1);
    const parsedHead = parseHeadClause(right);
    if (!parsedHead.ok) {
      return {
        risk: 'high',
        shouldApply: false,
        reason: '检测到非白名单可修复管道，仅支持 `| head [-n] N`',
        fixedArgs: args,
        suppressStderr: false,
        headLimit: null,
        notes: [],
      };
    }
    headLimit = parsedHead.limit;
    normalizedArgs = normalizedArgs.slice(0, pipeIndex);
    changed = true;
  }

  if (!changed) {
    return noFix();
  }

  if (suppressStderr) {
    notes.push('已移除 `2>/dev/null`（执行器内部抑制 stderr）');
  }
  if (headLimit !== null) {
    notes.push(`已将管道 \`| head\` 转为内部截断（前 ${headLimit} 行）`);
  }

  return {
    risk: 'low',
    shouldApply: true,
    reason: null,
    fixedArgs: normalizedArgs,
    suppressStderr,
    headLimit,
    notes,
  };
}

function tokenizeShell(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }

    // execFile 不经过 shell，外层反斜杠转义需要在这里还原。
    // 例如 `\(` 应传给 find 为 `(`，否则会被当作未知 primary。
    if (ch === '\\') {
      const next = input[i + 1];
      if (next !== undefined) {
        current += next;
        i++;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current) tokens.push(current);
  return tokens;
}

function suggestForDisallowedCommand(rawCommand: string, command: string): {
  suggestion: string;
  command: string | null;
} {
  if (PYTHON_LIKE.has(command)) {
    const extracted = extractPythonPrintLiteral(rawCommand);
    if (extracted) {
      return {
        suggestion: '检测到该命令仅用于输出文本，建议改用 echo（已给出可替代命令）。',
        command: `echo ${quoteForSingleShell(extracted)}`,
      };
    }

    if (rawCommand.includes('-c') || rawCommand.includes('print(')) {
      return {
        suggestion: '请将 python 命令改为 allowlist 内命令；纯文本输出用 echo，简单脚本可用 node -e "console.log(...)"。',
        command: null,
      };
    }
  }

  return {
    suggestion: `命令 "${command}" 不在允许列表中。可用命令：${ALLOWED_SHELL_COMMANDS.join(', ')}`,
    command: null,
  };
}

function extractPythonPrintLiteral(input: string): string | null {
  const singleQuoted = input.match(/print\(\s*'([\s\S]*?)'\s*\)/);
  if (singleQuoted?.[1] !== undefined) {
    return unescapeBasic(singleQuoted[1]);
  }
  const doubleQuoted = input.match(/print\(\s*"([\s\S]*?)"\s*\)/);
  if (doubleQuoted?.[1] !== undefined) {
    return unescapeBasic(doubleQuoted[1]);
  }
  return null;
}

function unescapeBasic(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function quoteForSingleShell(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function noFix(): ShellAutoFixPlan {
  return {
    risk: 'none',
    shouldApply: false,
    reason: null,
    fixedArgs: [],
    suppressStderr: false,
    headLimit: null,
    notes: [],
  };
}

function detectHighRiskToken(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (
      token === '&&'
      || token === '||'
      || token === ';'
      || token.includes('&&')
      || token.includes('||')
      || token.includes(';')
      || token.includes('`')
      || token.includes('$(')
      || token === '<'
      || token === '<<'
      || token === '>>'
      || token === '>|'
      || token.includes('|&')
    ) {
      return token;
    }

    if (token.includes('|') && token !== '|') {
      return token;
    }

    if (isRedirectionToken(token) && !isDevNullRedirectToken(token, args[i + 1])) {
      return token;
    }
  }

  return null;
}

function consumeDevNullStderrRedirect(args: string[], index: number): number {
  const token = args[index];
  const next = args[index + 1];
  if (token === '2>/dev/null') return 1;
  if (token === '2>' && next === '/dev/null') return 2;
  return 0;
}

function isRedirectionToken(token: string): boolean {
  return token === '>'
    || token === '1>'
    || token === '2>'
    || token === '>>'
    || token.startsWith('>/')
    || token.startsWith('1>/')
    || token.startsWith('2>/');
}

function isDevNullRedirectToken(token: string, next?: string): boolean {
  return token === '2>/dev/null' || (token === '2>' && next === '/dev/null');
}

function parseHeadClause(args: string[]): { ok: true; limit: number } | { ok: false } {
  if (args.length === 0) return { ok: false };
  if (args[0] !== 'head') return { ok: false };
  if (args.length === 1) return { ok: true, limit: 10 };

  const second = args[1];
  if (second.startsWith('-') && /^\-\d+$/.test(second)) {
    const limit = Number.parseInt(second.slice(1), 10);
    return Number.isFinite(limit) && limit > 0 ? { ok: true, limit } : { ok: false };
  }

  if (second === '-n' && args.length >= 3) {
    const limit = Number.parseInt(args[2], 10);
    if (!Number.isFinite(limit) || limit <= 0) return { ok: false };
    return args.length === 3 ? { ok: true, limit } : { ok: false };
  }

  return { ok: false };
}
