import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type AppSettings,
  type AiProvider,
  type GitStatus,
  type LibrarySnapshot,
  type PromptFull,
  type SearchHit,
  PromptSearch,
  ensureHighlighter,
  getSettings,
  patchSettings,
  onLibraryChanged,
  listLibrary,
  listSearchPayload,
  readPrompt,
  setLibraryPath,
  getLibraryPath,
  defaultLibraryPath,
  pickFolder,
  createCategory as apiCreateCategory,
  renameCategory as apiRenameCategory,
  deleteCategory as apiDeleteCategory,
  createPrompt as apiCreatePrompt,
  renamePrompt as apiRenamePrompt,
  deletePrompt as apiDeletePrompt,
  movePrompt as apiMovePrompt,
  savePrompt,
  providersWithKeys,
  gitStatus,
  isWeb,
  currentSession,
  signOut as supabaseSignOut,
} from "@spl/shared-ui";

export type View = "library" | "community" | "settings";
export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
}

interface AppCtx {
  ready: boolean;
  libraryPath: string | null;
  snapshot: LibrarySnapshot | null;

  view: View;
  setView: (v: View) => void;

  query: string;
  setQuery: (q: string) => void;
  results: SearchHit[];

  selectedId: string | null;
  selected: PromptFull | null;
  select: (id: string | null) => Promise<void>;

  editing: boolean;
  draft: string;
  startEdit: () => void;
  cancelEdit: () => void;
  setDraft: (s: string) => void;
  saveEdit: (note?: string) => Promise<void>;
  /** Replace the selected prompt's content+save (used by Optimize / restore). */
  applyContent: (content: string, note?: string) => Promise<void>;

  settings: AppSettings;
  resolvedTheme: "light" | "dark";
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;

  providerKeys: AiProvider[];
  refreshProviderKeys: () => Promise<void>;

  git: GitStatus | null;
  refreshGit: () => Promise<void>;

  /** True when running as the website rather than the desktop app. */
  web: boolean;
  /** Signed-in account email on web (null on desktop or when signed out). */
  account: string | null;
  /** Web only: a session is required and the user isn't signed in yet. */
  needsAuth: boolean;
  /** Web: call after a successful sign-in to (re)load the library. */
  signedIn: () => Promise<void>;
  /** Web: sign out and return to the auth gate. */
  signOutApp: () => Promise<void>;

  openLibrary: (path: string) => Promise<void>;
  pickLibrary: () => Promise<void>;
  refresh: () => Promise<void>;

  newCategory: (name: string) => Promise<void>;
  renameCategory: (oldName: string, newName: string) => Promise<void>;
  deleteCategory: (name: string) => Promise<void>;
  newPrompt: (category: string | null, name: string) => Promise<void>;
  renamePrompt: (id: string, newName: string) => Promise<void>;
  deletePrompt: (id: string) => Promise<void>;
  movePrompt: (id: string, category: string | null) => Promise<void>;

  toast: (message: string, kind?: Toast["kind"]) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be used inside <AppProvider>");
  return c;
};

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => setDark(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return dark;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [libraryPath, setLibPath] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [view, setView] = useState<View>("library");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PromptFull | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [settings, setSettings] = useState<AppSettings>({
    theme: "system",
    lastLibraryPath: null,
    aiProvider: "openai",
    aiModels: {},
    defaultOpenTarget: "chatgpt",
  });
  const [providerKeys, setProviderKeys] = useState<AiProvider[]>([]);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const web = isWeb();
  const [account, setAccount] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const search = useRef(new PromptSearch());
  const editingRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  editingRef.current = editing;
  selectedIdRef.current = selectedId;

  const prefersDark = usePrefersDark();
  const resolvedTheme: "light" | "dark" =
    settings.theme === "system" ? (prefersDark ? "dark" : "light") : settings.theme;

  // Apply theme to <html>.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const toast = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const dismissToast = useCallback(
    (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    [],
  );

  const runSearch = useCallback((q: string) => {
    setResults(search.current.search(q));
  }, []);

  const refresh = useCallback(async () => {
    const [snap, payload] = await Promise.all([listLibrary(), listSearchPayload()]);
    setSnapshot(snap);
    search.current.replaceAll(payload);
    setResults(search.current.search(query));
    // Refresh the open prompt if the user isn't mid-edit.
    const id = selectedIdRef.current;
    if (id && !editingRef.current) {
      try {
        setSelected(await readPrompt(id));
      } catch {
        setSelected(null);
        setSelectedId(null);
      }
    }
  }, [query]);

  const openLibrary = useCallback(
    async (path: string) => {
      const snap = await setLibraryPath(path);
      setLibPath(snap.root);
      setSnapshot(snap);
      const payload = await listSearchPayload();
      search.current.replaceAll(payload);
      setResults(search.current.search(""));
      await patchSettings({ lastLibraryPath: snap.root });
      setSettings((s) => ({ ...s, lastLibraryPath: snap.root }));
      try {
        setGit(await gitStatus());
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const pickLibrary = useCallback(async () => {
    const path = await pickFolder(libraryPath ?? undefined);
    if (path) {
      await openLibrary(path);
      toast("Library opened", "success");
    }
  }, [libraryPath, openLibrary, toast]);

  const select = useCallback(async (id: string | null) => {
    setSelectedId(id);
    setEditing(false);
    if (!id) {
      setSelected(null);
      return;
    }
    try {
      setSelected(await readPrompt(id));
    } catch (e) {
      setSelected(null);
    }
  }, []);

  const startEdit = useCallback(() => {
    if (!selected) return;
    setDraft(selected.content);
    setEditing(true);
  }, [selected]);
  const cancelEdit = useCallback(() => setEditing(false), []);

  const persist = useCallback(
    async (id: string, content: string, note?: string) => {
      await savePrompt(id, content, note);
      const fresh = await readPrompt(id);
      setSelected(fresh);
      await refresh();
    },
    [refresh],
  );

  const saveEdit = useCallback(
    async (note?: string) => {
      if (!selected) return;
      await persist(selected.id, draft, note);
      setEditing(false);
      toast("Saved", "success");
    },
    [selected, draft, persist, toast],
  );

  const applyContent = useCallback(
    async (content: string, note?: string) => {
      if (!selected) return;
      await persist(selected.id, content, note);
      setEditing(false);
    },
    [selected, persist],
  );

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await patchSettings(patch);
    setSettings(next);
  }, []);

  const refreshProviderKeys = useCallback(async () => {
    setProviderKeys(await providersWithKeys());
  }, []);
  const refreshGit = useCallback(async () => {
    try {
      setGit(await gitStatus());
    } catch {
      setGit(null);
    }
  }, []);

  // --- CRUD wrappers ---
  const newCategory = useCallback(
    async (name: string) => {
      await apiCreateCategory(name);
      await refresh();
    },
    [refresh],
  );
  const renameCategory = useCallback(
    async (oldName: string, newName: string) => {
      await apiRenameCategory(oldName, newName);
      await refresh();
    },
    [refresh],
  );
  const deleteCategory = useCallback(
    async (name: string) => {
      await apiDeleteCategory(name);
      if (selectedId && selectedId.startsWith(name + "/")) await select(null);
      await refresh();
    },
    [refresh, select, selectedId],
  );
  const newPrompt = useCallback(
    async (category: string | null, name: string) => {
      const id = await apiCreatePrompt(category, name);
      await refresh();
      await select(id);
      startEdit();
    },
    [refresh, select, startEdit],
  );
  const renamePrompt = useCallback(
    async (id: string, newName: string) => {
      const newId = await apiRenamePrompt(id, newName);
      await refresh();
      if (selectedId === id) await select(newId);
    },
    [refresh, select, selectedId],
  );
  const deletePrompt = useCallback(
    async (id: string) => {
      await apiDeletePrompt(id);
      if (selectedId === id) await select(null);
      await refresh();
    },
    [refresh, select, selectedId],
  );
  const movePrompt = useCallback(
    async (id: string, category: string | null) => {
      const newId = await apiMovePrompt(id, category);
      await refresh();
      if (selectedId === id) await select(newId);
    },
    [refresh, select, selectedId],
  );

  const unlistenRef = useRef<(() => void) | undefined>(undefined);

  // Load settings, open the library, subscribe to fs changes. On web this is
  // gated on a Supabase session — without one we stop at the auth gate.
  const boot = useCallback(async () => {
    setReady(false);
    try {
      await ensureHighlighter().catch(() => {});
      const s = await getSettings();
      setSettings(s);
      if (web) {
        const session = await currentSession();
        if (!session) {
          setNeedsAuth(true);
          setReady(true);
          return;
        }
        setNeedsAuth(false);
        setAccount(session.user.email ?? null);
      }
      const existing = await getLibraryPath();
      const path = existing ?? s.lastLibraryPath ?? (await defaultLibraryPath());
      await openLibrary(path);
      await refreshProviderKeys();
      unlistenRef.current?.();
      unlistenRef.current = await onLibraryChanged(() => {
        refresh();
      });
    } catch (e) {
      toast(`Startup error: ${String(e)}`, "error");
    } finally {
      setReady(true);
    }
  }, [web, openLibrary, refreshProviderKeys, refresh, toast]);

  const signedIn = useCallback(async () => {
    await boot();
  }, [boot]);

  const signOutApp = useCallback(async () => {
    await supabaseSignOut();
    unlistenRef.current?.();
    unlistenRef.current = undefined;
    setSnapshot(null);
    setSelected(null);
    setSelectedId(null);
    setAccount(null);
    setNeedsAuth(true);
  }, []);

  useEffect(() => {
    boot();
    return () => unlistenRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AppCtx>(
    () => ({
      ready,
      libraryPath,
      snapshot,
      view,
      setView,
      query,
      setQuery: (q: string) => {
        setQuery(q);
        runSearch(q);
      },
      results,
      selectedId,
      selected,
      select,
      editing,
      draft,
      startEdit,
      cancelEdit,
      setDraft,
      saveEdit,
      applyContent,
      settings,
      resolvedTheme,
      updateSettings,
      providerKeys,
      refreshProviderKeys,
      git,
      refreshGit,
      web,
      account,
      needsAuth,
      signedIn,
      signOutApp,
      openLibrary,
      pickLibrary,
      refresh,
      newCategory,
      renameCategory,
      deleteCategory,
      newPrompt,
      renamePrompt,
      deletePrompt,
      movePrompt,
      toast,
      toasts,
      dismissToast,
    }),
    [
      ready, libraryPath, snapshot, view, query, results, selectedId, selected, editing,
      draft, settings, resolvedTheme, providerKeys, git, toasts, runSearch, select,
      startEdit, cancelEdit, saveEdit, applyContent, updateSettings, refreshProviderKeys,
      refreshGit, web, account, needsAuth, signedIn, signOutApp, openLibrary, pickLibrary,
      refresh, newCategory, renameCategory,
      deleteCategory, newPrompt, renamePrompt, deletePrompt, movePrompt, toast, dismissToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
