import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBadgeInfo,
  lucideBell,
  lucideBookmark,
  lucideBrain,
  lucideCalendarCheck,
  lucideCheck,
  lucideChevronRight,
  lucideFootprints,
  lucideHeartPulse,
  lucideLightbulb,
  lucideLayoutTemplate,
  lucideMessageCircle,
  lucideMenu,
  lucideMinus,
  lucideMoonStar,
  lucidePlus,
  lucideRoute,
  lucideSparkles,
  lucideSunMedium,
  lucideTrendingUp,
  lucideTriangleAlert,
  lucideUserRound,
  lucideUserCircle2,
  lucideWrench,
  lucideX,
} from '@ng-icons/lucide';

const APP_ICONS = {
  appArrowLeft: lucideArrowLeft,
  appInfo: lucideBadgeInfo,
  appBell: lucideBell,
  appBookmark: lucideBookmark,
  appBrain: lucideBrain,
  appCalendarCheck: lucideCalendarCheck,
  appCheck: lucideCheck,
  appChevronRight: lucideChevronRight,
  appFootprints: lucideFootprints,
  appHeartPulse: lucideHeartPulse,
  appLightbulb: lucideLightbulb,
  appLayoutTemplate: lucideLayoutTemplate,
  appMessage: lucideMessageCircle,
  appMenu: lucideMenu,
  appMinus: lucideMinus,
  appMoon: lucideMoonStar,
  appPlus: lucidePlus,
  appRoute: lucideRoute,
  appSparkles: lucideSparkles,
  appSun: lucideSunMedium,
  appTrendingUp: lucideTrendingUp,
  appAlert: lucideTriangleAlert,
  appUser: lucideUserRound,
  appUserCircle: lucideUserCircle2,
  appTool: lucideWrench,
  appClose: lucideX,
} as const;

const APP_ICON_NAMES = {
  arrowLeft: 'appArrowLeft',
  info: 'appInfo',
  bell: 'appBell',
  bookmark: 'appBookmark',
  brain: 'appBrain',
  calendarCheck: 'appCalendarCheck',
  check: 'appCheck',
  chevronRight: 'appChevronRight',
  footprints: 'appFootprints',
  heartPulse: 'appHeartPulse',
  lightbulb: 'appLightbulb',
  layoutTemplate: 'appLayoutTemplate',
  message: 'appMessage',
  menu: 'appMenu',
  minus: 'appMinus',
  moon: 'appMoon',
  plus: 'appPlus',
  route: 'appRoute',
  sparkles: 'appSparkles',
  sun: 'appSun',
  trendingUp: 'appTrendingUp',
  alert: 'appAlert',
  user: 'appUser',
  userCircle: 'appUserCircle',
  tool: 'appTool',
  close: 'appClose',
} as const;

const BRAND_ICON_NAMES = ['openai', 'claude', 'claw'] as const;

type BrandIconName = (typeof BRAND_ICON_NAMES)[number];

export type AppIconName = keyof typeof APP_ICON_NAMES | BrandIconName;

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [NgIcon],
  providers: [provideIcons(APP_ICONS)],
  template: `
    @if (isBrandIcon()) {
      <span class="app-icon__brand-shell" [style.width]="size" [style.height]="size">
        <img
          class="app-icon__brand"
          [class.app-icon__brand--openai]="name === 'openai'"
          [class.app-icon__brand--claude]="name === 'claude'"
          [class.app-icon__brand--claw]="name === 'claw'"
          [src]="brandIconSrc()"
          [alt]="label || ''"
          [attr.aria-hidden]="label ? null : 'true'"
        />
      </span>
    } @else {
      <ng-icon
        [name]="resolvedName()"
        [size]="size"
        [strokeWidth]="strokeWidth"
        [attr.aria-hidden]="label ? null : 'true'"
        [attr.aria-label]="label || null"
      />
    }
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      flex-shrink: 0;
    }

    .app-icon__brand {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      transform-origin: center;
    }

    .app-icon__brand-shell {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .app-icon__brand--openai {
      transform: scale(0.92);
    }

    .app-icon__brand--claude {
      transform: scale(0.82);
    }

    .app-icon__brand--claw {
      transform: scale(0.9);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppIconComponent {
  @Input({ required: true }) name: AppIconName = 'message';
  @Input() size = '16px';
  @Input() strokeWidth: string | number = 2;
  @Input() label: string | null = null;

  protected resolvedName() {
    return APP_ICON_NAMES[this.name as keyof typeof APP_ICON_NAMES];
  }

  protected isBrandIcon(): boolean {
    return BRAND_ICON_NAMES.includes(this.name as BrandIconName);
  }

  protected brandIconSrc(): string {
    return `assets/icons/brands/${this.name}.svg`;
  }
}
