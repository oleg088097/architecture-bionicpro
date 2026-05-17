import type {UserInfoResponse} from 'oauth4webapi';

export type OidcSessionUser = {
  access_token: string;
  refresh_token: string;
  userinfo: UserInfoResponse;
};
