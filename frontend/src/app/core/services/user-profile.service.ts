import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface UserProfileDto {
  userKey: string;
  preferredPersonaKey: string;
  preferredVoiceStyle: string;
  praisePreference: string;
  responseRhythm: string;
  impressionCore: string | null;
  impressionDetail: string | null;
  pendingImpressionCore: string | null;
  pendingImpressionDetail: string | null;
}

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private base = `${environment.apiUrl}/persona/profile`;

  constructor(private http: HttpClient) {}

  get() {
    return this.http.get<UserProfileDto>(this.base);
  }

  update(data: Partial<UserProfileDto>) {
    return this.http.patch<UserProfileDto>(this.base, data);
  }

  confirmImpression(target: 'core' | 'detail') {
    return this.http.patch<UserProfileDto>(`${this.base}/impression/confirm`, { target });
  }

  rejectImpression(target: 'core' | 'detail') {
    return this.http.patch<UserProfileDto>(`${this.base}/impression/reject`, { target });
  }
}
