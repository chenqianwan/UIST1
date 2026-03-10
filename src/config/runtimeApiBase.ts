const DEFAULT_LOCAL_API_BASE = 'http://127.0.0.1:8008';
const SESSION_STORAGE_KEY = 'uist_runtime_api_base';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readApiBaseFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const queryParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash || '';
  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const hashParams = new URLSearchParams(hashQuery);
  const raw = queryParams.get('api')
    ?? queryParams.get('api_base')
    ?? queryParams.get('backend')
    ?? hashParams.get('api')
    ?? hashParams.get('api_base')
    ?? hashParams.get('backend');
  const normalized = raw?.trim();
  if (!normalized) return null;
  if (!/^https?:\/\//i.test(normalized)) return null;
  return stripTrailingSlash(normalized);
}

export function getRuntimeApiBase(): string {
  const fromEnv = import.meta.env.VITE_SEMANTIC_API_BASE?.trim();
  if (typeof window === 'undefined') {
    return stripTrailingSlash(fromEnv || DEFAULT_LOCAL_API_BASE);
  }

  const fromLocation = readApiBaseFromLocation();
  if (fromLocation) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, fromLocation);
    return fromLocation;
  }

  const fromSession = sessionStorage.getItem(SESSION_STORAGE_KEY)?.trim();
  if (fromSession && /^https?:\/\//i.test(fromSession)) {
    return stripTrailingSlash(fromSession);
  }

  if (fromEnv) return stripTrailingSlash(fromEnv);
  return DEFAULT_LOCAL_API_BASE;
}

