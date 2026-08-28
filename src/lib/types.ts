// 领域类型定义（贯穿数据层与 UI）

export type MaterialType = "local" | "youtube";

export interface Material {
  id: string;
  type: MaterialType;
  title: string;
  sourceUrl?: string; // YouTube 链接
  audioBlob?: Blob; // 本地音频/视频原始 Blob（持久化于 IndexedDB）
  durationSec?: number;
  createdAt: number;
}

export interface Sentence {
  id: string;
  materialId: string;
  index: number;
  text: string;
  startSec: number;
  endSec: number;
  level?: number; // i+1 难度标签 1-5
  keywords: string[]; // 复述关键词提示
}

export type CardKind = "sentence" | "pronunciation";

// FSRS 状态（时间戳用 epoch ms 存储，便于 IndexedDB 序列化）
export interface SrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number; // 0 new / 1 learning / 2 review / 3 relearning
  last_review: number;
}

export interface Card {
  id: string;
  kind: CardKind;
  text: string;
  sentenceId?: string;
  chinese?: string; // 中文释义（拍照识物卡）
  hint?: string; // 复述提示
  srs: SrsState;
  createdAt: number;
}

export type AttemptKind = "shadow" | "retell";

export interface Attempt {
  id: string;
  sentenceId?: string;
  cardId?: string;
  kind: AttemptKind;
  target: string; // 目标文本
  transcript: string; // 识别出的文本
  score: number; // 0-100
  createdAt: number;
}

export interface RecognitionObject {
  english: string;
  chinese: string;
}

export interface Recognition {
  id: string;
  objects: RecognitionObject[];
  createdAt: number;
}

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  durationSec: number;
  sentenceCount: number;
  avgScore: number;
  createdAt: number;
}

export interface Settings {
  level: number; // 用户水平 1-5（用于 i+1 分级）
  targetMinutes: number; // 每日目标时长
}
