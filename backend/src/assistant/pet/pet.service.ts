import { Injectable } from '@nestjs/common';
import { BehaviorSubject, Observable, map } from 'rxjs';

export type PetState = 'idle' | 'speaking' | 'thinking';

export interface PetStateEvent {
  data: string;
  type: string;
}

@Injectable()
export class PetService {
  private readonly state$ = new BehaviorSubject<PetState>('idle');
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  getStateStream(): Observable<PetStateEvent> {
    return this.state$.pipe(
      map((state) => ({
        data: JSON.stringify({ state, timestamp: Date.now() }),
        type: 'state',
      })),
    );
  }

  setState(state: PetState): void {
    this.clearIdleTimer();
    this.state$.next(state);
  }

  /**
   * 设置状态并在指定毫秒后自动回到 idle。
   * 用于 speaking 等短暂状态。
   */
  setStateWithAutoIdle(state: PetState, delayMs = 3000): void {
    this.clearIdleTimer();
    this.state$.next(state);
    this.idleTimer = setTimeout(() => {
      this.state$.next('idle');
      this.idleTimer = null;
    }, delayMs);
  }

  getCurrentState(): PetState {
    return this.state$.getValue();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
