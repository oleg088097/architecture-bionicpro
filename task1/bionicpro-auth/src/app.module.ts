import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {AppController} from './app.controller';
import {PassportModule} from "@nestjs/passport";
import {buildOpenIdClient, OidcStrategy} from "./oidc/oidc.strategy";
import {SessionSerializer} from "./session.serializer";
import {TokenRefreshCoordinator} from "./refresh-token/token-refresh.coordinator";
import {RefreshAccessTokenGuard} from "./refresh-token/refresh-access-token.guard";

const OidcConfigurationProvider = {
  provide: 'OIDC_CONFIGURATION',
  useFactory: buildOpenIdClient,
  inject: [ConfigService],
};

const OidcStrategyFactory = {
  provide: OidcStrategy,
  useFactory: (configuration: Awaited<ReturnType<typeof buildOpenIdClient>>) =>
    new OidcStrategy(configuration),
  inject: ['OIDC_CONFIGURATION'],
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PassportModule.register({session: true, defaultStrategy: 'oidc'}),
  ],
  providers: [
    OidcConfigurationProvider,
    OidcStrategyFactory,
    SessionSerializer,
    TokenRefreshCoordinator,
    RefreshAccessTokenGuard,
  ],
  controllers: [AppController],
})
export class AppModule {
}
