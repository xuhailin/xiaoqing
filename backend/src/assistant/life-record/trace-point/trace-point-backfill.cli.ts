import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../../infra/prisma.service';
import { LlmModule } from '../../../infra/llm/llm.module';
import { TracePointService } from './trace-point.service';
import { TracePointExtractorService } from './trace-point-extractor.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), LlmModule],
  providers: [PrismaService, TracePointService, TracePointExtractorService],
  exports: [PrismaService],
})
class BackfillModule {}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let days = 3;
  let conversationId: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--days=')) {
      days = Number(arg.slice('--days='.length)) || 3;
    }
    if (arg.startsWith('--conversation=')) {
      conversationId = arg.slice('--conversation='.length);
    }
  }

  process.stdout.write(`TracePoint backfill: days=${days}, conversation=${conversationId ?? 'all'}\n`);

  const app = await NestFactory.createApplicationContext(BackfillModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const extractor = app.get(TracePointExtractorService);
    const result = await extractor.backfill({ days, conversationId });

    process.stdout.write(
      `Done: conversations=${result.conversations}, extracted=${result.extracted}\n`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
