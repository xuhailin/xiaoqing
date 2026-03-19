import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AppIconComponent } from './app-icon.component';

@Component({
  selector: 'app-xiaoqing-avatar',
  standalone: true,
  imports: [AppIconComponent],
  template: `
    <span
      class="avatar"
      [class.avatar--circle]="shape === 'circle'"
      [style.width]="size"
      [style.height]="size"
      [attr.aria-hidden]="decorative ? 'true' : null"
      [attr.aria-label]="decorative ? null : label"
      [attr.role]="decorative ? null : 'img'"
    >
      <app-icon name="sun" [size]="iconSize" strokeWidth="1.8" />
    </span>
  `,
  styles: [`
    :host {
      display: inline-flex;
      line-height: 0;
      flex-shrink: 0;
    }

    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    app-icon {
      color: var(--color-xiaoqing-avatar-line);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XiaoqingAvatarComponent {
  @Input() size = '2rem';
  @Input() iconSize = '1.05rem';
  @Input() shape: 'rounded' | 'circle' = 'rounded';
  @Input() decorative = true;
  @Input() label = '小晴头像';
}
