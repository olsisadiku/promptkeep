// Full-text + fuzzy search over the prompt library using MiniSearch. Titles
// are boosted over body content, prefix matching is on (as-you-type), and a
// small fuzzy factor tolerates typos.

import MiniSearch from "minisearch";
import type { FlatPrompt } from "./types";

export interface SearchHit {
  prompt: FlatPrompt;
  score: number;
  terms: string[];
}

export class PromptSearch {
  private mini: MiniSearch<FlatPrompt>;
  private byId = new Map<string, FlatPrompt>();

  constructor(prompts: FlatPrompt[] = []) {
    this.mini = new MiniSearch<FlatPrompt>({
      idField: "id",
      fields: ["title", "content", "category"],
      storeFields: ["id"],
      searchOptions: {
        boost: { title: 3, category: 2 },
        prefix: true,
        fuzzy: 0.2,
        combineWith: "AND",
      },
    });
    this.replaceAll(prompts);
  }

  replaceAll(prompts: FlatPrompt[]) {
    this.byId.clear();
    this.mini.removeAll();
    for (const p of prompts) this.byId.set(p.id, p);
    this.mini.addAll(prompts);
  }

  search(query: string, limit = 50): SearchHit[] {
    const q = query.trim();
    if (!q) {
      // Empty query → recent-first, capped.
      return [...this.byId.values()]
        .sort((a, b) => b.modified_ms - a.modified_ms)
        .slice(0, limit)
        .map((prompt) => ({ prompt, score: 0, terms: [] }));
    }
    return this.mini
      .search(q)
      .slice(0, limit)
      .map((r) => ({
        prompt: this.byId.get(r.id as string)!,
        score: r.score,
        terms: r.terms,
      }))
      .filter((h) => h.prompt);
  }
}

/** Flatten a LibrarySnapshot-ish set of categories into a single list. */
export function flatten(
  uncategorized: FlatPrompt[],
  categories: { prompts: FlatPrompt[] }[],
): FlatPrompt[] {
  return [...uncategorized, ...categories.flatMap((c) => c.prompts)];
}
