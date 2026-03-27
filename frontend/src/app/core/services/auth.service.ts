import { Injectable, computed, signal } from '@angular/core';
import { AppModeService } from './app-mode.service';

const STORAGE_KEY = 'xq_user_id';
const DEFAULT_USER_ID = 'default-user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _storedUserId = signal<string | null>(this.loadUserId());
  private readonly resolvedUserId = computed(() => {
    const storedUserId = this._storedUserId()?.trim() || null;
    if (storedUserId) {
      return storedUserId;
    }
    return this.appMode.mode().userMode === 'single' ? DEFAULT_USER_ID : null;
  });

  readonly userId = this.resolvedUserId;

  constructor(private readonly appMode: AppModeService) {}

  get currentUserId(): string | null {
    return this.resolvedUserId();
  }

  /** 切换用户（登录页调用），持久化到 localStorage */
  setUserId(id: string) {
    const normalized = id.trim();
    if (!normalized) {
      this.clearUserId();
      return;
    }

    localStorage.setItem(STORAGE_KEY, normalized);
    this._storedUserId.set(normalized);
  }

  clearUserId() {
    localStorage.removeItem(STORAGE_KEY);
    this._storedUserId.set(null);
  }

  /** single 模式下回退到 default-user；multi 模式下清空登录态 */
  resetToDefault() {
    this.clearUserId();
  }

  isLoggedIn(): boolean {
    return this.currentUserId !== null;
  }

  private loadUserId(): string | null {
    return localStorage.getItem(STORAGE_KEY);
  }
}
