import Dexie, { type Table } from "dexie";
import type {
  Material,
  Sentence,
  Card,
  Attempt,
  Recognition,
  Session,
} from "./types";

class ShadowingDB extends Dexie {
  materials!: Table<Material, string>;
  sentences!: Table<Sentence, string>;
  cards!: Table<Card, string>;
  attempts!: Table<Attempt, string>;
  recognitions!: Table<Recognition, string>;
  sessions!: Table<Session, string>;

  constructor() {
    super("english-shadowing");
    this.version(1).stores({
      materials: "id, type, createdAt",
      sentences: "id, materialId, index",
      cards: "id, kind, createdAt",
      attempts: "id, sentenceId, cardId, kind, createdAt",
      recognitions: "id, createdAt",
      sessions: "id, date",
    });
  }
}

export const db = new ShadowingDB();

// —— 轻量设置存 localStorage ——
const SETTINGS_KEY = "booth.settings";

export const DEFAULT_SETTINGS = { level: 3, targetMinutes: 15 };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: { level: number; targetMinutes: number }) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
