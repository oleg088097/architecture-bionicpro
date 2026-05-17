import type {OidcSessionUser} from '../oidc/session-user';

declare module 'express-session' {
  interface SessionData {
    redirectUrl?: string;
    passport?: {
      user: OidcSessionUser;
    };
  }
}

declare global {
  namespace Express {
    interface User extends OidcSessionUser {
    }
  }
}

export {};
