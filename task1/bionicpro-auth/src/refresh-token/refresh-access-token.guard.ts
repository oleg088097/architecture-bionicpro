import {CanActivate, ExecutionContext, Injectable, UnauthorizedException,} from '@nestjs/common';
import {Request} from 'express';
import {promisify} from 'node:util';
import {TokenRefreshCoordinator} from './token-refresh.coordinator';

@Injectable()
export class RefreshAccessTokenGuard implements CanActivate {
  private static readonly SKEW_MS = 60_000;

  constructor(
    private readonly tokenRefresh: TokenRefreshCoordinator,
  ) {
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    try {
      await this.tokenRefresh.ensureFreshAccessToken(
        req,
        RefreshAccessTokenGuard.SKEW_MS,
      );
    } catch {
      const logout = promisify(req.logout.bind(req));
      await logout().catch(() => undefined);
      throw new UnauthorizedException();
    }
    return true;
  }
}
