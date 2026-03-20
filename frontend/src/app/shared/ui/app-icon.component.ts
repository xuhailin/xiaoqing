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
  lucideMessageCircle,
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
  appMessage: lucideMessageCircle,
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
  message: 'appMessage',
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

export type AppIconName = keyof typeof APP_ICON_NAMES;

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [NgIcon],
  providers: [provideIcons(APP_ICONS)],
  template: `
    <ng-icon
      [name]="resolvedName()"
      [size]="size"
      [strokeWidth]="strokeWidth"
      [attr.aria-hidden]="label ? null : 'true'"
      [attr.aria-label]="label || null"
    />
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      flex-shrink: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppIconComponent {
  @Input({ required: true }) name: AppIconName = 'message';
  @Input() size = '1em';
  @Input() strokeWidth: string | number = 2;
  @Input() label: string | null = null;

  protected resolvedName() {
    return APP_ICON_NAMES[this.name];
  }
}
