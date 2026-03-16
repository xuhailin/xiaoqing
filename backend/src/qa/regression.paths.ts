import { existsSync } from 'fs';
import { resolve } from 'path';

export function resolveProjectRoot(cwd = process.cwd()): string {
  if (existsSync(resolve(cwd, 'qa')) && existsSync(resolve(cwd, 'backend'))) {
    return cwd;
  }

  const parent = resolve(cwd, '..');
  if (existsSync(resolve(parent, 'qa')) && existsSync(resolve(parent, 'backend'))) {
    return parent;
  }

  throw new Error(`Unable to resolve project root from cwd: ${cwd}`);
}

export function resolveBackendRoot(cwd = process.cwd()): string {
  const projectRoot = resolveProjectRoot(cwd);
  return resolve(projectRoot, 'backend');
}

export function resolveQaRoot(cwd = process.cwd()): string {
  const projectRoot = resolveProjectRoot(cwd);
  return resolve(projectRoot, 'qa');
}
