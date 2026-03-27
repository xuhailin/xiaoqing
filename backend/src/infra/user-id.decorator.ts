import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { UserScopedRequest } from './user-id.middleware';

export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<UserScopedRequest>();
    if (request.resolvedUserId) {
      return request.resolvedUserId;
    }
    throw new UnauthorizedException('User context not resolved');
  },
);
