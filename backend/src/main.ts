import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:4200', 'http://localhost:1420', 'tauri://localhost'],
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
