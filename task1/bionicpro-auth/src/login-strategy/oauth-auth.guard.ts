import {ExecutionContext, Injectable} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {Request} from 'express';

@Injectable()
export class OauthAuthGuard extends AuthGuard('oidc') {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    (request as Request).session.redirectUrl = (request.query.redirectUrl || (request as Request).session.redirectUrl || request.headers.referer) as string;
    const result = (await super.canActivate(context)) as boolean;
    const redirectUrl = (request as Request).session.redirectUrl;
    await super.logIn(request);
    (request as Request).session.redirectUrl = redirectUrl;
    return result;
  }
}