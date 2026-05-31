// Non-secret app settings persisted via tauri-plugin-store (settings.json in
// the app's data dir). API keys are NOT here — those live in the Keychain.

import { load, type Store } from "@tauri-apps/plugin-store";
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

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load("settings.json", { autoSave: true, defaults: {} });
  return storePromise;
}

export async function getSettings(): Promise<AppSettings> {
  const s = await store();
  const saved = (await s.get<Partial<AppSettings>>("settings")) ?? {};
  return { ...DEFAULTS, ...saved };
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const s = await store();
  const next = { ...(await getSettings()), ...patch };
  await s.set("settings", next);
  await s.save();
  return next;
}
