import type { Profile } from './types';

const KEY = 'procurement_session';

export function getSession(): Profile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function setSession(profile: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
