import { Injectable, Logger } from '@nestjs/common';

/**
 * 每个 item 的执行回调签名。
 * 接收 itemId，执行完成后 resolve。
 */
export type QueueItemExecutor = (itemId: string) => Promise<void>;

/**
 * 通用 per-key FIFO 队列。
 *
 * - 同一 key 下的 item 串行执行（FIFO）
 * - 不同 key 之间完全并行
 * - 单个 item 抛异常不影响队列中后续 item
 * - 队列清空后自动回调 onKeyDrained
 *
 * 典型用法：DevAgent 按 sessionId 排队，聊天按 conversationId 排队。
 */
@Injectable()
export class KeyedFifoQueueService {
  private readonly logger = new Logger(KeyedFifoQueueService.name);

  /** key → 待执行 itemId 列表 */
  private readonly queues = new Map<string, string[]>();

  /** 正在运行 drain 循环的 key 集合 */
  private readonly activeWorkers = new Set<string>();

  /** 正在执行中的 itemId（全局去重） */
  private readonly inFlight = new Set<string>();

  /**
   * 将 item 入队。
   *
   * @param key 分组键（如 sessionId）
   * @param itemId 任务 ID（如 runId）
   * @param executor 执行回调
   * @param onKeyDrained 该 key 的队列完全清空后的回调（如释放 workspace）
   */
  enqueue(
    key: string,
    itemId: string,
    executor: QueueItemExecutor,
    onKeyDrained?: (key: string) => void,
  ): void {
    if (this.inFlight.has(itemId)) {
      this.logger.debug(`Skip duplicate (in-flight): key=${key} item=${itemId}`);
      return;
    }

    const queue = this.queues.get(key) ?? [];
    if (!this.queues.has(key)) {
      this.queues.set(key, queue);
    }

    if (queue.includes(itemId)) {
      this.logger.debug(`Skip duplicate (queued): key=${key} item=${itemId}`);
      return;
    }

    queue.push(itemId);
    this.logger.debug(`Enqueued: key=${key} item=${itemId} queueSize=${queue.length}`);

    if (this.activeWorkers.has(key)) {
      return;
    }

    this.activeWorkers.add(key);
    setImmediate(() => void this.drain(key, executor, onKeyDrained));
  }

  /**
   * 检查某个 item 是否正在执行中。
   */
  isInFlight(itemId: string): boolean {
    return this.inFlight.has(itemId);
  }

  private async drain(
    key: string,
    executor: QueueItemExecutor,
    onKeyDrained?: (key: string) => void,
  ): Promise<void> {
    try {
      while (true) {
        const queue = this.queues.get(key);
        const itemId = queue?.shift();
        if (!itemId) {
          break;
        }

        this.inFlight.add(itemId);
        try {
          await executor(itemId);
        } catch (err) {
          this.logger.error(
            `Queue item failed: key=${key} item=${itemId} err=${String(err)}`,
          );
        } finally {
          this.inFlight.delete(itemId);
        }
      }
    } finally {
      this.activeWorkers.delete(key);
      const queue = this.queues.get(key);
      if (!queue || queue.length === 0) {
        this.queues.delete(key);
        onKeyDrained?.(key);
        return;
      }
      // 队列在 drain 期间又有新 item，重启
      if (!this.activeWorkers.has(key)) {
        this.activeWorkers.add(key);
        setImmediate(() => void this.drain(key, executor, onKeyDrained));
      }
    }
  }
}
