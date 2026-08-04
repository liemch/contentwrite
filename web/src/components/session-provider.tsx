"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ShellUser = {
  role?: string;
  email?: string;
  name?: string | null;
};

type SessionContextValue = {
  user: ShellUser | null;
  ready: boolean;
};

const SessionContext = createContext<SessionContextValue>({ user: null, ready: false });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<SessionContextValue>({ user: null, ready: false });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((response) => response.ok ? response.json() : null)
      .then((data: { user?: ShellUser } | null) => {
        if (!cancelled) setValue({ user: data?.user ?? null, ready: true });
      })
      .catch(() => {
        if (!cancelled) setValue({ user: null, ready: true });
      });
    return () => { cancelled = true; };
  }, []);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useShellSession(): SessionContextValue {
  return useContext(SessionContext);
}
