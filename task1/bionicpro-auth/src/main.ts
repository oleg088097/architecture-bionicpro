import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {memoryStore} from "./memory-store";
import session from "express-session";
import passport from 'passport';
import {UserInfoResponse} from "oauth4webapi";

declare module 'express-session' {
  interface SessionData {
    redirectUrl: string;
  }
}
declare global {
  namespace Express {
    interface User {
      userinfo: UserInfoResponse;
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins?.length ? corsOrigins : ['http://localhost:4000'],
    credentials: true,
  });

  app.use(
    session({
      secret: 'my-secret',
      resave: false,
      saveUninitialized: false,
      store: memoryStore,
      cookie: {
        maxAge: 30 * 60 * 1000,
        httpOnly: true,
        // secure не работает с http
        // secure: true
      }
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

bootstrap();
