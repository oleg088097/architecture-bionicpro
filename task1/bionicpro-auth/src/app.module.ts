import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {AppController} from './app.controller';
import {PassportModule} from "@nestjs/passport";
import {buildOpenIdClient, OidcStrategy} from "./login-strategy/oidc.strategy";
import {SessionSerializer} from "./session.serializer";

const OidcStrategyFactory = {
  provide: 'OidcStrategy',
  useFactory: async (configService: ConfigService) => {
    const client = await buildOpenIdClient(configService);
    return new OidcStrategy(client);
  },
  inject: [ConfigService]
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PassportModule.register({session: true, defaultStrategy: 'oidc'}),
  ],
  providers: [OidcStrategyFactory, SessionSerializer],
  controllers: [AppController],
})
export class AppModule {
}
