import { Injectable, Logger } from '@nestjs/common';
import { appendFile, mkdir } from 'fs/promises';
import { resolve } from 'path';

/** 写入 DevAgent 执行 transcript（与聊天上下文隔离）。 */
@Injectable()
export class DevTranscriptWriter {
  private readonly logger = new Logger(DevTranscriptWriter.name);

  async write(runDir: string, entry: Record<string, unknown>): Promise<void> {
    try {
      await mkdir(runDir, { recursive: true });
      const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
      await appendFile(resolve(runDir, 'transcript.jsonl'), line, 'utf8');
    } catch (err) {
      this.logger.warn(`Failed to write transcript: ${err}`);
    }
  }
}
