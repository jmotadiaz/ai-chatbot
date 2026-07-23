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
  scope: "uncommitted",
  pathStack: [],
  activeFile: null,
  pendingComments: [],
};

export interface FileBrowserInitialLocation {
  scope?: FileBrowserScope;
  file?: string;
}

/**
 * Build the store's initial state from a deep link. Opening a file in the
 * tree scope also seeds the breadcrumb path so "back" lands in the file's
 * containing folder instead of the project root.
 */
function initialStateFrom(location?: FileBrowserInitialLocation): FileBrowserState {
  const state = { ...INITIAL_STATE };
  if (!location) return state;
  if (location.scope) state.scope = location.scope;
  if (location.file) {
    state.activeFile = location.file;
    if (state.scope === "tree") {
      state.pathStack = location.file.split("/").slice(0, -1);
    }
  }
  return state;
}

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
  setScope: (scope: FileBrowserScope) => void;
  pushPath: (dirName: string) => void;
  truncatePath: (length: number) => void;
  openFile: (path: string) => void;
  closeFile: () => void;
  upsertComment: (comment: PendingComment) => void;
  removeComment: (id: string) => void;
  clearComments: () => void;
}

export function createFileBrowserStore(
  sessionId: string,
  initialLocation?: FileBrowserInitialLocation,
): FileBrowserStore {
  let state = initialStateFrom(initialLocation);
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
    setScope: (scope) => set({ scope, pathStack: [], activeFile: null }),
    pushPath: (dirName) => set({ pathStack: [...state.pathStack, dirName] }),
    truncatePath: (length) =>
      set({ pathStack: state.pathStack.slice(0, length), activeFile: null }),
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
  initialLocation?: FileBrowserInitialLocation;
  children: React.ReactNode;
}

export const FileBrowserProvider: React.FC<FileBrowserProviderProps> = ({
  project,
  sessionId,
  initialLocation,
  children,
}) => {
  const value = useMemo(
    () => ({
      store: createFileBrowserStore(sessionId, initialLocation),
      project,
      sessionId,
    }),
    // Deep-link state is only meaningful on first mount; later URL changes
    // must not rebuild the store (that would drop pending comments).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Server snapshot delegates to the store: during SSR it holds the initial
  // (possibly deep-linked) state, so server and first client render match.
  const state = useSyncExternalStore(
    ctx.store.subscribe,
    ctx.store.getSnapshot,
    ctx.store.getSnapshot,
  );
  return { state, actions: ctx.store, project: ctx.project, sessionId: ctx.sessionId };
}
