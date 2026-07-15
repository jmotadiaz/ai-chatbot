"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type {
  FileBrowserScope,
  FileBrowserState,
  PendingComment,
} from "./types";

const INITIAL_STATE: FileBrowserState = {
  isOpen: false,
  scope: "last-turn",
  pathStack: [],
  activeFile: null,
  pendingComments: [],
};

function storageKey(sessionId: string): string {
  return `coding-agent:comments:${sessionId}`;
}

function loadComments(sessionId: string): PendingComment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingComment[]) : [];
  } catch {
    return [];
  }
}

function persistComments(sessionId: string, comments: PendingComment[]): void {
  if (typeof window === "undefined") return;
  try {
    if (comments.length === 0) {
      window.localStorage.removeItem(storageKey(sessionId));
    } else {
      window.localStorage.setItem(storageKey(sessionId), JSON.stringify(comments));
    }
  } catch {
    // Storage full or unavailable: comments just won't survive a refresh.
  }
}

export interface FileBrowserStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => FileBrowserState;
  hydrateComments: () => void;
  open: () => void;
  close: () => void;
  setScope: (scope: FileBrowserScope) => void;
  pushPath: (dirName: string) => void;
  truncatePath: (length: number) => void;
  openFile: (path: string) => void;
  closeFile: () => void;
  upsertComment: (comment: PendingComment) => void;
  removeComment: (id: string) => void;
  clearComments: () => void;
}

export function createFileBrowserStore(sessionId: string): FileBrowserStore {
  let state = INITIAL_STATE;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<FileBrowserState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const setComments = (pendingComments: PendingComment[]) => {
    persistComments(sessionId, pendingComments);
    set({ pendingComments });
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    hydrateComments() {
      const stored = loadComments(sessionId);
      if (stored.length > 0) {
        set({ pendingComments: stored });
      }
    },
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    setScope: (scope) => set({ scope, pathStack: [], activeFile: null }),
    pushPath: (dirName) => set({ pathStack: [...state.pathStack, dirName] }),
    truncatePath: (length) => set({ pathStack: state.pathStack.slice(0, length) }),
    openFile: (path) => set({ activeFile: path }),
    closeFile: () => set({ activeFile: null }),
    upsertComment(comment) {
      const existing = state.pendingComments.some((c) => c.id === comment.id);
      setComments(
        existing
          ? state.pendingComments.map((c) => (c.id === comment.id ? comment : c))
          : [...state.pendingComments, comment],
      );
    },
    removeComment(id) {
      setComments(state.pendingComments.filter((c) => c.id !== id));
    },
    clearComments() {
      setComments([]);
    },
  };
}

interface FileBrowserContextValue {
  store: FileBrowserStore;
  project: string;
  sessionId: string;
}

const FileBrowserContext = createContext<FileBrowserContextValue | null>(null);

export interface FileBrowserProviderProps {
  project: string;
  sessionId: string;
  children: React.ReactNode;
}

export const FileBrowserProvider: React.FC<FileBrowserProviderProps> = ({
  project,
  sessionId,
  children,
}) => {
  const value = useMemo(
    () => ({ store: createFileBrowserStore(sessionId), project, sessionId }),
    [project, sessionId],
  );

  // Hydrate after mount so the server-rendered markup matches the first
  // client render (localStorage is only readable on the client).
  useEffect(() => {
    value.store.hydrateComments();
  }, [value]);

  return (
    <FileBrowserContext.Provider value={value}>
      {children}
    </FileBrowserContext.Provider>
  );
};

export function useFileBrowser() {
  const ctx = useContext(FileBrowserContext);
  if (!ctx) {
    throw new Error("useFileBrowser must be used within FileBrowserProvider");
  }
  const state = useSyncExternalStore(
    ctx.store.subscribe,
    ctx.store.getSnapshot,
    () => INITIAL_STATE,
  );
  return { state, actions: ctx.store, project: ctx.project, sessionId: ctx.sessionId };
}
