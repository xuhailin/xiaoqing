import { basename, resolve } from 'path';

export interface DevWorkspaceMeta {
  workspaceRoot: string;
  projectScope: string;
}

export interface DevWorkspaceInput {
  workspaceRoot?: unknown;
  projectScope?: unknown;
}

export function normalizeWorkspaceInput(input?: DevWorkspaceInput | null): DevWorkspaceMeta | null {
  if (!input) return null;
  if (typeof input.workspaceRoot !== 'string') return null;

  const rawRoot = input.workspaceRoot.trim();
  if (!rawRoot) return null;

  const workspaceRoot = resolve(rawRoot);
  const projectScope = normalizeProjectScope(input.projectScope, workspaceRoot);
  return { workspaceRoot, projectScope };
}

export function parseWorkspaceMetaFromRunResult(result: unknown): DevWorkspaceMeta | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return null;
  }

  const workspace = (result as Record<string, unknown>)['workspace'];
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
    return null;
  }

  const root = (workspace as Record<string, unknown>)['workspaceRoot'];
  if (typeof root !== 'string' || root.trim().length === 0) {
    return null;
  }

  const normalizedRoot = resolve(root.trim());
  const projectScope = normalizeProjectScope(
    (workspace as Record<string, unknown>)['projectScope'],
    normalizedRoot,
  );

  return {
    workspaceRoot: normalizedRoot,
    projectScope,
  };
}

export function withWorkspaceMeta<T extends Record<string, unknown>>(
  payload: T,
  workspace: DevWorkspaceMeta | null,
): T & { workspace: DevWorkspaceMeta | null } {
  return {
    ...payload,
    workspace,
  };
}

function normalizeProjectScope(raw: unknown, workspaceRoot: string): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed) return trimmed.slice(0, 120);
  }
  const name = basename(workspaceRoot);
  return name || workspaceRoot;
}
