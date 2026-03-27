import { Injectable, type NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { getAppUserMode, getDefaultUserKey } from './user-mode.config';

export interface UserScopedRequest extends Request {
  resolvedUserId?: string;
}

@Injectable()
export class UserIdMiddleware implements NestMiddleware {
  private readonly appUserMode: string;
  private readonly defaultUserKey: string;

  constructor(config: ConfigService) {
    this.appUserMode = getAppUserMode(config);
    this.defaultUserKey = getDefaultUserKey(config);
  }

  use(req: UserScopedRequest, _res: Response, next: NextFunction) {
    const xUserId = req.headers['x-user-id'];
    const headerUserId = Array.isArray(xUserId) ? xUserId[0] : xUserId;

    if (this.appUserMode === 'multi') {
      if (!headerUserId?.trim()) {
        throw new UnauthorizedException('X-User-Id header is required in multi-user mode');
      }
      req.resolvedUserId = headerUserId.trim();
      next();
      return;
    }

    req.resolvedUserId = headerUserId?.trim() || this.defaultUserKey;
    next();
  }
}
