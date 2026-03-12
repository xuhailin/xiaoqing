import { Injectable, Logger } from '@nestjs/common';

// ──────────────────────────────────────────────
// ConversationLockService
// Per-conversation FIFO Mutex，借鉴 NeoClaw 的设计。
// 保证同一会话的请求串行处理，防止并发冲突。
// 不同会话之间互不阻塞。
// ──────────────────────────────────────────────

@Injectable()
export class ConversationLockService {
  private readonly logger = new Logger(ConversationLockService.name);

  /** conversationId → FIFO 锁队列 */
  private readonly locks = new Map<string, FifoMutex>();

  /**
   * 获取指定会话的锁。
   * 返回一个 release 函数，调用者必须在 finally 中调用。
   */
  async acquire(conversationId: string): Promise<() => void> {
    let mutex = this.locks.get(conversationId);
    if (!mutex) {
      mutex = new FifoMutex();
      this.locks.set(conversationId, mutex);
    }

    this.logger.debug(`Acquiring lock for conversation ${conversationId}`);
    await mutex.acquire();
    this.logger.debug(`Lock acquired for conversation ${conversationId}`);

    return () => {
      mutex!.release();
      this.logger.debug(`Lock released for conversation ${conversationId}`);

      // 清理空闲锁，防止内存泄漏
      if (!mutex!.isLocked && !mutex!.hasWaiters) {
        this.locks.delete(conversationId);
      }
    };
  }
}

/**
 * 简单的 FIFO 异步互斥锁。
 * acquire() 返回 Promise，FIFO 排队保证公平性。
 */
class FifoMutex {
  private _locked = false;
  private readonly _queue: Array<() => void> = [];

  get isLocked(): boolean {
    return this._locked;
  }

  get hasWaiters(): boolean {
    return this._queue.length > 0;
  }

  acquire(): Promise<void> {
    if (!this._locked) {
      this._locked = true;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this._queue.push(resolve);
    });
  }

  release(): void {
    if (this._queue.length > 0) {
      // 唤醒下一个等待者，保持 locked 状态
      const next = this._queue.shift()!;
      next();
    } else {
      this._locked = false;
    }
  }
}
