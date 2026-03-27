import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AppModeState {
  devAgentEnabled: boolean;
  designAgentEnabled: boolean;
}

const DEFAULT_MODE: AppModeState = {
  devAgentEnabled: true,
  designAgentEnabled: true,
};

@Injectable({ providedIn: 'root' })
export class AppModeService {
  private readonly _mode = signal<AppModeState>(DEFAULT_MODE);
  private loaded = false;

  readonly mode = this._mode.asReadonly();

  constructor(private readonly http: HttpClient) {}

  async load(): Promise<void> {
    if (this.loaded) return;

    const state = await firstValueFrom(
      this.http
        .get<AppModeState>(`${environment.apiUrl}/app/mode`)
        .pipe(catchError(() => of(DEFAULT_MODE))),
    );

    this._mode.set({
      devAgentEnabled: Boolean(state.devAgentEnabled),
      designAgentEnabled: Boolean(state.designAgentEnabled),
    });
    this.loaded = true;
  }
}
