import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { getDefaultUserKey } from './user-mode.config';

export interface UserScopedRequest extends Request {
  resolvedUserId?: string;
}

@Injectable()
export class UserIdMiddleware implements NestMiddleware {
  private readonly defaultUserKey: string;

  constructor(config: ConfigService) {
    this.defaultUserKey = getDefaultUserKey(config);
  }

  use(req: UserScopedRequest, _res: Response, next: NextFunction) {
    // 当前运行时明确为单用户：统一收敛到 DEFAULT_USER_KEY，
    // 不再从请求头承诺多用户边界。
    req.resolvedUserId = this.defaultUserKey;
    next();
  }
}
