// Node 24 内置 node:sqlite 的最小类型声明（@types/node@20 尚未包含该模块）。
// 仅声明本项目用到的 API，保持与运行时一致。

declare module "node:sqlite" {
  interface SQLiteRunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  interface StatementSync {
    run(...params: unknown[]): SQLiteRunResult;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
  }

  class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export {
    DatabaseSync,
    type StatementSync,
    type SQLiteRunResult,
    type DatabaseSyncOptions,
  };
}
