import { Observable } from 'rxjs';
import { PetService, PetState, PetStateEvent } from './pet.service';
export declare class PetController {
    private readonly petService;
    constructor(petService: PetService);
    stateStream(): Observable<PetStateEvent>;
    getState(): {
        state: PetState;
    };
    setState(body: {
        state: string;
    }): {
        ok: boolean;
    };
}
