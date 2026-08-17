import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Request, Response } from 'express';
import { AppModule } from '../src/app.module';

// Vercel Node functions keep the module scope warm between invocations on
// the same instance, so the Nest app is bootstrapped once and reused —
// exactly the same setup as main.ts, just without app.listen().
const expressApp = express();
let bootstrapped: Promise<express.Express> | null = null;

async function bootstrap(): Promise<express.Express> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('INDUSTRIAL OS API')
    .setDescription('Industrial Distribution Intelligence Platform — REST API')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.init();
  return expressApp;
}

export default async function handler(req: Request, res: Response) {
  if (!bootstrapped) bootstrapped = bootstrap();
  const app = await bootstrapped;
  app(req, res);
}
