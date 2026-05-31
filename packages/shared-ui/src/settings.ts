// Non-secret app settings. On desktop these persist via tauri-plugin-store
// (settings.json in the app data dir); on web they persist to localStorage.
// API keys are NOT here — desktop keeps those in the Keychain, web in
// sessionStorage (see web.ts).

import { load, type Store } from "@tauri-apps/plugin-store";
import { isTauri } from "./runtime";
import type { AiProvider } from "./types";

export interface AppSettings {
  theme: "light" | "dark" | "system";
  lastLibraryPath: string | null;
  aiProvider: AiProvider;
  aiModels: Partial<Record<AiProvider, string>>;
  defaultOpenTarget: string;
}

const DEFAULTS: AppSettings = {
  theme: "system",
  lastLibraryPath: null,
  aiProvider: "openai",
  aiModels: {},
  defaultOpenTarget: "chatgpt",
};

// --- web (localStorage) ----------------------------------------------------

const WEB_KEY = "spl.settings";

function webGet(): AppSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(WEB_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

// --- desktop (tauri-plugin-store) ------------------------------------------

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load("settings.json", { autoSave: true, defaults: {} });
  return storePromise;
}

export async function getSettings(): Promise<AppSettings> {
  if (!isTauri()) return webGet();
  const s = await store();
  const saved = (await s.get<Partial<AppSettings>>("settings")) ?? {};
  return { ...DEFAULTS, ...saved };
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...patch };
  if (!isTauri()) {
    localStorage.setItem(WEB_KEY, JSON.stringify(next));
    return next;
  }
  const s = await store();
  await s.set("settings", next);
  await s.save();
  return next;
}
