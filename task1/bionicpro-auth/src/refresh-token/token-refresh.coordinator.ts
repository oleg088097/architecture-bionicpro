import {Inject, Injectable} from '@nestjs/common';
import * as client from 'openid-client';
import type {Request} from 'express';
import {type OidcSessionUser,} from '../oidc/session-user';
import jwt from 'jsonwebtoken';

@Injectable()
export class TokenRefreshCoordinator {
  private readonly pending = new Map<string, Promise<OidcSessionUser>>();

  constructor(
    @Inject('OIDC_CONFIGURATION')
    private readonly oidcConfig: client.Configuration,
  ) {
  }

  async ensureFreshAccessToken(req: Request, skewMs: number): Promise<void> {
    const user = req.user as OidcSessionUser;
    const sessionId = req.sessionID;

    if (!user?.refresh_token) {
      throw new Error('Missing refresh token');
    }

    const expiresAt = this.decodeJwtExpMs(user.access_token);
    if (Date.now() < expiresAt - skewMs) {
      return;
    }

    let refreshPromise = this.pending.get(sessionId);
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const tokens = await client.refreshTokenGrant(
          this.oidcConfig,
          user.refresh_token,
        );
        req.user = {
          ...user,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? user.refresh_token,
        };
        if (req.session.passport) {
          req.session.passport.user = req.user;
        }
        return req.user;
      })().finally(() => {
        if (this.pending.get(sessionId) === refreshPromise) {
          this.pending.delete(sessionId);
        }
      });
      this.pending.set(sessionId, refreshPromise);
    }

    const refreshed = await refreshPromise;
    if (req.user !== refreshed) {
      req.user = refreshed;
      if (req.session.passport) {
        req.session.passport.user = refreshed;
      }
    }
  }

  decodeJwtExpMs(accessToken: string): number {
    try {
      const payload = jwt.decode(accessToken, {json: true});
      if (payload && typeof payload.exp === 'number') {
        return payload.exp * 1000;
      }
    } catch {
      // ignore
    }
    return Date.now();
  }
}
