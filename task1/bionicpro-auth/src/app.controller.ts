import {Controller, Get, Req, Res, UnauthorizedException, UseGuards} from '@nestjs/common';
import {Request, Response} from 'express';
import {RefreshAccessTokenGuard} from "./refresh-token/refresh-access-token.guard";
import {LoginAuthGuard} from "./oidc/login-auth-guard.service";

@Controller()
export class AppController {
  @Get('health')
  health() {
    return {status: 'ok'};
  }

  @Get('login')
  @UseGuards(LoginAuthGuard)
  login() {
  }

  @Get('/user')
  @UseGuards(RefreshAccessTokenGuard)
  user(@Req() req: Request): unknown {
    if (!req.user?.userinfo) {
      throw new UnauthorizedException();
    }
    return req.user.userinfo;
  }

  @UseGuards(LoginAuthGuard)
  @Get('/callback')
  loginCallback(@Req() req: Request, @Res() res: Response) {
    const origin = (req as Request).session.redirectUrl || '/';
    return res.redirect(origin as string);
  }
}
