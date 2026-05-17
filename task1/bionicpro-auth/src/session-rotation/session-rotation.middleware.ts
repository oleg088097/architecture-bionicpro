import type {Request, Response} from 'express';
import {Session} from 'express-session';

const SKIP = new Set(['cookie', 'id', 'req']);

function snapshotSessionPayload(session: Session): Record<string, unknown> | null {
  const snap: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(session)) {
    if (SKIP.has(key)) {
      continue;
    }
    const value = (session as unknown as Record<string, unknown>)[key];
    if (value !== undefined) {
      snap[key] = value;
    }
  }
  return Object.keys(snap).length > 0 ? snap : null;
}

function restorePassportUser(req: Request): void {
  const passportUser = req.session?.passport?.user;
  if (passportUser !== undefined) {
    req.user = passportUser;
  }
}

export class SessionRotationMiddleware {
  public next(
    req: Request,
    res: Response,
    next: (err?: unknown) => void,
  ) {
    const previousEnd = res.end.bind(res);
    const that = this;
    res.end = function (
      this: Response,
      chunk?: unknown,
      encoding?: unknown,
      cb?: unknown,
    ) {
      void that
        .rotateAfterRequest(req)
        .then(
          () => (previousEnd as (...a: unknown[]) => Response).call(
            res,
            chunk,
            encoding,
            cb,
          ),
          (err: unknown) => {
            if (!res.headersSent) {
              next(err);
            }
          },
        );
      return res;
    } as Response['end'];
    next();
  }

  /** New session id + persisted payload; no-op if there is nothing to persist yet. */
  private async rotateAfterRequest(req: Request): Promise<void> {
    if (!req.session) {
      return;
    }

    const snap = snapshotSessionPayload(req.session);
    if (!snap) {
      return;
    }

    return new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          reject(err);
          return;
        }
        Object.assign(req.session, snap);
        restorePassportUser(req);
        req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
      });
    });
  }
}
