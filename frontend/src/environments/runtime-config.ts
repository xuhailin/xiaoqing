declare global {
  interface Window {
    __APP_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

function resolveRuntimeApiUrl(): string {
  const runtimeApiUrl = window.__APP_CONFIG__?.apiUrl?.trim();
  if (runtimeApiUrl) {
    return runtimeApiUrl.replace(/\/$/, '');
  }

  return `${window.location.protocol}//${window.location.hostname}:3000`;
}

export function resolveApiUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }

  return resolveRuntimeApiUrl();
}
