import {UnauthorizedException} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import {Strategy} from 'openid-client/passport';
import * as client from 'openid-client';
import {fetchUserInfo} from 'openid-client';
import {ConfigService} from "@nestjs/config";
import {skipSubjectCheck} from "oauth4webapi";
import {type OidcSessionUser} from './session-user';

export const buildOpenIdClient = async (configService: ConfigService) => {
  return await client.discovery(
    new URL(configService.get<string>("KEYCLOAK_AUTH_SERVER_URL")!),
    configService.get<string>("KEYCLOAK_CLIENT_ID")!,
    {
      client_secret:
        configService.get<string>("KEYCLOAK_CLIENT_SECRET", {infer: true}),
    },
    undefined,
    {
      execute: [client.allowInsecureRequests],
    }
  )
};

export class OidcStrategy extends PassportStrategy<any, OidcSessionUser>(Strategy, 'oidc') {
  config: client.Configuration;

  constructor(config: client.Configuration) {
    super({
      config: config,
      scope: process.env.OAUTH2_CLIENT_REGISTRATION_LOGIN_SCOPE,
      passReqToCallback: false,
      callbackURL: process.env.OIDC_CALLBACK_URL,
    });

    this.config = config;
  }

  async validate(verifyPayload: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers): Promise<OidcSessionUser> {
    const access_token = verifyPayload.access_token;
    const refresh_token = verifyPayload.refresh_token;

    let userinfo: OidcSessionUser['userinfo'];
    try {
      userinfo = await fetchUserInfo(this.config, access_token, skipSubjectCheck);
    } catch (e) {
      console.log(e)
      throw new UnauthorizedException();
    }

    if (!refresh_token) {
      throw new UnauthorizedException();
    }

    return {
      access_token,
      refresh_token,
      userinfo
    };
  }
}
