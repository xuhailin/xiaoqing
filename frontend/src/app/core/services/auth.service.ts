import { Injectable, signal } from '@angular/core';
const DEFAULT_USER_ID = 'default-user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly userId = signal(DEFAULT_USER_ID).asReadonly();

  get currentUserId(): string | null {
    return DEFAULT_USER_ID;
  }

  setUserId(_id: string) {}

  clearUserId() {}

  resetToDefault() {}

  isLoggedIn(): boolean {
    return true;
  }
}
