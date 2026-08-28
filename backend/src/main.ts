import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser'; // <--- IMPORT INI

import type { RequestHandler } from 'express';
import * as express from 'express';

import { AppModule } from './app.module.js';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { getTrustedOrigins } from './config/environment.js';

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function (this: bigint): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const trustedOrigins = getTrustedOrigins();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const expressApp = app.getHttpAdapter().getInstance() as express.Express;
    expressApp.set('trust proxy', 1);
  }

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ limit: '5mb', extended: true }));

  app.use(helmet());
  app.use(cookieParser()); // <--- AKTIFKAN COOKIE PARSER

  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
      const origin = req.headers.origin;

      if (
        !safeMethods.has(req.method) &&
        origin &&
        !trustedOrigins.includes(origin)
      ) {
        res.status(403).json({
          success: false,
          category: 'Security Error',
          message: 'Origin request tidak diizinkan.',
        });
        return;
      }

      next();
    },
  );

  const corsOptions = {
    origin: trustedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // <--- WAJIB TRUE AGAR COOKIE BISA DITERIMA/DIKIRIM FRONTEND
  };
  app.enableCors(corsOptions);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  const compressionHandler = (compression as unknown as () => RequestHandler)();
  app.use(compressionHandler);

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on port: ${port}`);
}

void bootstrap();
