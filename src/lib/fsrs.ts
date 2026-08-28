import {
  fsrs,
  createEmptyCard,
  Rating,
  type Card as FsrsCard,
  type Grade,
} from "ts-fsrs";
import type { SrsState } from "./types";

const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true });

export { Rating };
export type { Grade };

export const GRADE_LABELS: Record<Grade, string> = {
  [Rating.Again]: "重来",
  [Rating.Hard]: "勉强",
  [Rating.Good]: "记住",
  [Rating.Easy]: "轻松",
};

/** 新建一张空卡（全新状态） */
export function newSrsState(): SrsState {
  return toState(createEmptyCard());
}

/** 把 ts-fsrs 的 Card 转成可序列化存储的 SrsState */
export function toState(card: FsrsCard): SrsState {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : 0,
  };
}

/** 把存储的 SrsState 还原成 ts-fsrs 的 Card */
export function fromState(s: SrsState): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  };
}

/** 应用一次评分，返回新的存储状态 */
export function review(state: SrsState, grade: Grade): SrsState {
  return toState(scheduler.next(fromState(state), new Date(), grade).card);
}

/** 是否到期（到复习时间） */
export function isDue(state: SrsState): boolean {
  return state.due <= Date.now();
}
