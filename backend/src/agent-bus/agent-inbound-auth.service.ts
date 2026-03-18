import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AgentInboundAuthService {
  private readonly configuredTokens: Record<string, string>;

  constructor(private readonly config: ConfigService) {
    this.configuredTokens = this.loadConfiguredTokens();
  }

  authenticateOrThrow(agentId: string, authorizationHeader?: string | null) {
    const expectedToken = this.configuredTokens[agentId];
    if (!expectedToken) {
      throw new ForbiddenException(`agent "${agentId}" is not allowed to call inbound delegation`);
    }

    const providedToken = this.extractBearerToken(authorizationHeader);
    if (!providedToken) {
      throw new UnauthorizedException('missing bearer token');
    }
    if (providedToken !== expectedToken) {
      throw new UnauthorizedException('invalid bearer token');
    }
  }

  private loadConfiguredTokens(): Record<string, string> {
    const configured: Record<string, string> = {};
    const raw = this.config.get<string>('AGENT_BUS_INBOUND_TOKENS');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const [agentId, token] of Object.entries(parsed)) {
          if (typeof token === 'string' && token.trim()) {
            configured[agentId] = token.trim();
          }
        }
      } catch {
        // Ignore malformed JSON and keep fallback envs.
      }
    }

    const xiaoqinToken = this.config.get<string>('XIAOQIN_AGENT_BUS_TOKEN');
    if (xiaoqinToken?.trim()) {
      configured.xiaoqin = xiaoqinToken.trim();
    }

    return configured;
  }

  private extractBearerToken(authorizationHeader?: string | null): string | null {
    if (!authorizationHeader) return null;
    const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }
    return token;
  }
}

