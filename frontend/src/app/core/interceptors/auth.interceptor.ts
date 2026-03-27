import { inject } from '@angular/core';
import { type HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const userId = inject(AuthService).currentUserId;
  if (!userId) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { 'X-User-Id': userId },
    }),
  );
};
