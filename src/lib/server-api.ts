"use client";

// 学习数据（卡片/记录/识别/会话）的服务端访问层。
// 数据现在存服务端 SQLite（按账号隔离），前端通过这些函数读写。

export type LearnTable = "cards" | "attempts" | "recognitions" | "sessions";

interface SyncCounts {
  cards: number;
  attempts: number;
  recognitions: number;
  sessions: number;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string })?.error ?? `请求失败（${res.status}）`,
    ) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function listLearn<T>(table: LearnTable): Promise<T[]> {
  const d = await api<{ rows: T[] }>(`/api/learn/${table}`);
  return d.rows ?? [];
}

export async function getLearn<T>(
  table: LearnTable,
  id: string,
): Promise<T | null> {
  const d = await api<{ row: T | null }>(
    `/api/learn/${table}?id=${encodeURIComponent(id)}`,
  );
  return d.row ?? null;
}

export async function putLearn<T extends { id: string }>(
  table: LearnTable,
  row: T,
): Promise<void> {
  await api(`/api/learn/${table}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(row),
  });
}

export async function deleteLearn(
  table: LearnTable,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  await api(`/api/learn/${table}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

/** 批量导入（迁移工具用）：整行 upsert，幂等，返回各表导入条数。 */
export async function syncLearn(payload: {
  cards: unknown[];
  attempts: unknown[];
  recognitions: unknown[];
  sessions: unknown[];
}): Promise<{ imported: SyncCounts }> {
  return api<{ imported: SyncCounts }>("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
