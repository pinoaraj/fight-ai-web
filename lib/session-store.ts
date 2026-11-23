'use client';

import type { SessionRecord, UserPreferences } from './types';

const STORAGE_KEY = 'fight-ai-sessions';
const PREFS_KEY = 'fight-ai-preferences';
const MAX_SESSIONS = 50;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function readRaw(): SessionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(sessions: SessionRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error('[session-store] Failed to write sessions:', e);
  }
}

export function getPreferences(): UserPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserPreferences;
  } catch {
    return null;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('[session-store] Failed to write preferences:', e);
  }
}

function prune(sessions: SessionRecord[]): SessionRecord[] {
  const now = Date.now();
  let filtered = sessions
    .filter(s => now - s.createdAt < MAX_AGE_MS)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (filtered.length > MAX_SESSIONS) {
    filtered = filtered.slice(0, MAX_SESSIONS);
  }
  return filtered;
}

export function getSessions(): SessionRecord[] {
  const sessions = readRaw();
  const pruned = prune(sessions);
  if (pruned.length !== sessions.length) writeRaw(pruned);
  return pruned;
}

export function saveSession(session: SessionRecord): void {
  const sessions = readRaw();
  const existingIndex = sessions.findIndex(s => s.id === session.id);
  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.unshift(session);
  }
  writeRaw(prune(sessions));
}

export function getSession(id: string): SessionRecord | null {
  const sessions = readRaw();
  return sessions.find(s => s.id === id) || null;
}

export function deleteSession(id: string): void {
  const sessions = readRaw().filter(s => s.id !== id);
  writeRaw(sessions);
}

export function clearOldSessions(): void {
  const sessions = readRaw();
  const pruned = prune(sessions);
  if (pruned.length !== sessions.length) writeRaw(pruned);
}