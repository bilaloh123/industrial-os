import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ---- Security hardening (PHASE 55) ----
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // strip unknown properties -> mass-assignment protection
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ---- API docs (PHASE 62) ----
  const config = new DocumentBuilder()
    .setTitle('INDUSTRIAL OS API')
    .setDescription('Industrial Distribution Intelligence Platform — REST API')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Industrial OS API running on port ${port}`);
}
bootstrap();
