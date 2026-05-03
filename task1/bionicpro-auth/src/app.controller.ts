import {Controller, Get, Req, Res, UnauthorizedException, UseGuards} from '@nestjs/common';
import {OauthAuthGuard} from "./login-strategy/oauth-auth.guard";
import {Request, Response} from 'express';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return {status: 'ok'};
  }

  @Get('login')
  @UseGuards(OauthAuthGuard)
  login() {
  }

  @Get('/user')
  @UseGuards(OauthAuthGuard)
  user(@Req() req: Request): unknown {
    if (!req.user?.userinfo) {
      throw new UnauthorizedException();
    }
    return req.user;
  }

  @UseGuards(OauthAuthGuard)
  @Get('/callback')
  loginCallback(@Req() req: Request, @Res() res: Response) {
    const origin = (req as Request).session.redirectUrl || '/';
    return res.redirect(origin as string);
  }
}
