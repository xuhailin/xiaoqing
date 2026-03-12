import { Observable } from 'rxjs';
export type PetState = 'idle' | 'speaking' | 'thinking';
export interface PetStateEvent {
    data: string;
    type: string;
}
export declare class PetService {
    private readonly state$;
    private idleTimer;
    getStateStream(): Observable<PetStateEvent>;
    setState(state: PetState): void;
    setStateWithAutoIdle(state: PetState, delayMs?: number): void;
    getCurrentState(): PetState;
    private clearIdleTimer;
}
