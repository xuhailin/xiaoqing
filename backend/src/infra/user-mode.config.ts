import type { ConfigService } from '@nestjs/config';

export type AppUserMode = 'single' | 'multi';

export const DEFAULT_USER_KEY_FALLBACK = 'default-user';

export function getAppUserMode(config: Pick<ConfigService, 'get'>): AppUserMode {
  void config;
  return 'single';
}

export function getDefaultUserKey(config: Pick<ConfigService, 'get'>): string {
  return config.get<string>('DEFAULT_USER_KEY') || DEFAULT_USER_KEY_FALLBACK;
}
