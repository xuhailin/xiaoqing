import { Body, Controller, Get, Post, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PetService, PetState, PetStateEvent } from './pet.service';

@Controller('pet')
export class PetController {
  constructor(private readonly petService: PetService) {}

  /** SSE 端点：向桌面端推送状态变化 */
  @Sse('state-stream')
  stateStream(): Observable<PetStateEvent> {
    return this.petService.getStateStream();
  }

  /** 获取当前状态 */
  @Get('state')
  getState(): { state: PetState } {
    return { state: this.petService.getCurrentState() };
  }

  /** 手动设置状态（调试用） */
  @Post('state')
  setState(@Body() body: { state: string }): { ok: boolean } {
    const validStates: PetState[] = ['idle', 'speaking', 'thinking'];
    const state = body.state as PetState;
    if (validStates.includes(state)) {
      this.petService.setState(state);
    }
    return { ok: true };
  }
}
