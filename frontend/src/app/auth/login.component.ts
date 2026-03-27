import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { AppModeService } from '../core/services/app-mode.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <h2 class="login-title">切换用户</h2>
        <p class="login-desc">
          @if (appMode.mode().userMode === 'multi') {
            输入你的用户 ID，进入属于自己的对话和记忆空间。
          } @else {
            你也可以切换一个 user ID 来查看隔离后的多用户数据；留空时会回到 default-user。
          }
        </p>
        <input
          class="login-input"
          type="text"
          [(ngModel)]="userId"
          placeholder="user-id（如 alice）"
          (keydown.enter)="confirm()"
          autofocus
        />
        <div class="login-actions">
          <button class="btn-primary" (click)="confirm()">确认</button>
          @if (appMode.mode().userMode === 'single') {
            <button class="btn-ghost" (click)="reset()">重置为 default-user</button>
          }
        </div>
        <p class="login-current">当前用户：<code>{{ auth.userId() ?? '未登录' }}</code></p>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--color-bg);
    }

    .login-card {
      width: 360px;
      padding: var(--space-6);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .login-title {
      margin: 0;
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }

    .login-desc {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
    }

    .login-input {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-input-bg, var(--color-surface-2));
      color: var(--color-text-primary);
      font-size: var(--font-size-sm);
      box-sizing: border-box;
      outline: none;
    }

    .login-input:focus {
      border-color: var(--color-primary);
    }

    .login-actions {
      display: flex;
      gap: var(--space-2);
    }

    .btn-primary {
      flex: 1;
      padding: var(--space-2) var(--space-4);
      background: var(--color-primary);
      color: var(--color-on-primary, #fff);
      border: none;
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      cursor: pointer;
    }

    .btn-ghost {
      padding: var(--space-2) var(--space-3);
      background: transparent;
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      cursor: pointer;
    }

    .login-current {
      margin: 0;
      font-size: var(--font-size-xs, 12px);
      color: var(--color-text-secondary);
    }

    .login-current code {
      color: var(--color-primary);
    }
  `],
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  readonly appMode = inject(AppModeService);
  private readonly router = inject(Router);

  userId = this.auth.currentUserId ?? '';

  confirm() {
    this.auth.setUserId(this.userId);
    if (!this.auth.isLoggedIn() && this.appMode.mode().userMode === 'multi') {
      return;
    }
    this.router.navigate(['/']);
  }

  reset() {
    this.auth.resetToDefault();
    this.userId = this.auth.currentUserId ?? '';
  }
}
