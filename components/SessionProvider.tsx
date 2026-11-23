'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { SessionRecord, UserPreferences } from '@/lib/types';
import { getSessions, saveSession, getSession, deleteSession, clearOldSessions, getPreferences, savePreferences } from '@/lib/session-store';
import { defaultPreferences } from '@/lib/types';

type SessionContextValue = {
  sessions: SessionRecord[];
  currentSessionId: string | null;
  preferences: UserPreferences;
  addSession: (session: SessionRecord) => void;
  loadSession: (id: string) => void;
  removeSession: (id: string) => void;
  clearCurrentSession: () => void;
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
};

const SessionContext = createContext<SessionContextValue>({
  sessions: [],
  currentSessionId: null,
  preferences: defaultPreferences,
  addSession: () => {},
  loadSession: () => {},
  removeSession: () => {},
  clearCurrentSession: () => {},
  setPreference: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedSessions = getSessions();
    setSessions(storedSessions);

    const storedPrefs = getPreferences();
    if (storedPrefs) {
      setPreferences(storedPrefs);
    }

    clearOldSessions();
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      savePreferences(preferences);
    }
  }, [preferences, hydrated]);

  const addSession = useCallback((session: SessionRecord) => {
    saveSession(session);
    setSessions(getSessions());
    setCurrentSessionId(session.id);
  }, []);

  const loadSession = useCallback((id: string) => {
    const session = getSession(id);
    if (session) {
      setCurrentSessionId(id);
    }
  }, []);

  const removeSession = useCallback((id: string) => {
    deleteSession(id);
    setSessions(getSessions());
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
  }, [currentSessionId]);

  const clearCurrentSession = useCallback(() => {
    setCurrentSessionId(null);
  }, []);

  const setPreference = useCallback(<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }, []);

  return (
    <SessionContext.Provider value={{
      sessions,
      currentSessionId,
      preferences,
      addSession,
      loadSession,
      removeSession,
      clearCurrentSession,
      setPreference,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}