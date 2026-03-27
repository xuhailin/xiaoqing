import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideAppInitializer,
  provideEnvironmentInitializer,
  inject,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { ThemeService } from './core/services/theme.service';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AppModeService } from './core/services/app-mode.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(AppModeService).load()),
    provideEnvironmentInitializer(() => {
      inject(ThemeService).init();
    }),
  ],
};
