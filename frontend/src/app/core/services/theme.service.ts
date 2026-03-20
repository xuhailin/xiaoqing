import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type AppTheme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'xiaoqing-theme';
  private readonly document = inject(DOCUMENT);
  private readonly themeColorByMode: Record<AppTheme, string> = {
    light: '#5c67f2',
    dark: '#161d31',
  };

  readonly theme = signal<AppTheme>('light');

  init() {
    const storedTheme = this.readStoredTheme();
    const domTheme = this.readDomTheme();
    this.applyTheme(storedTheme ?? domTheme ?? 'light', false);
  }

  toggleTheme() {
    this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: AppTheme) {
    this.applyTheme(theme, true);
  }

  private readStoredTheme(): AppTheme | null {
    try {
      const stored = window.localStorage.getItem(this.storageKey);
      return stored === 'light' || stored === 'dark' ? stored : null;
    } catch {
      return null;
    }
  }

  private readDomTheme(): AppTheme | null {
    const theme = this.document.documentElement.dataset['theme'];
    return theme === 'light' || theme === 'dark' ? theme : null;
  }

  private applyTheme(theme: AppTheme, persist: boolean) {
    const root = this.document.documentElement;
    root.dataset['theme'] = theme;
    root.style.colorScheme = theme;
    this.document.body?.setAttribute('data-theme', theme);
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', this.themeColorByMode[theme]);

    this.theme.set(theme);

    if (!persist) {
      return;
    }

    try {
      window.localStorage.setItem(this.storageKey, theme);
    } catch {
      // Ignore storage failures and keep the in-memory theme state.
    }
  }
}
