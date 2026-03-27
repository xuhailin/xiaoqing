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

  // Production Docker images only copy the backend directory, so the repo root
  // needs to be inferred from the backend working directory.
  if (existsSync(resolve(cwd, 'src')) && existsSync(resolve(cwd, 'prisma')) && existsSync(resolve(cwd, 'package.json'))) {
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
