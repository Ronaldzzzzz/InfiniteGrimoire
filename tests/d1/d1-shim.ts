import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);
export const MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

type Value = string | number | null;

class Stmt {
  constructor(
    private readonly raw: DatabaseSync,
    private readonly sql: string,
    private readonly params: Value[] = [],
  ) {}
  bind(...params: Value[]): Stmt {
    return new Stmt(this.raw, this.sql, params);
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.raw.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    const rows = this.raw.prepare(this.sql).all(...this.params) as Record<string, unknown>[];
    return { results: rows.map((r) => ({ ...r }) as T), success: true, meta: {} };
  }
  runSync(): { success: true; meta: { changes: number; last_row_id: number } } {
    const r = this.raw.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    return this.runSync();
  }
}

/** The subset of D1Database that D1Store uses, on top of a real in-memory SQLite. */
export function createD1(): { d1: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON'); // D1 enforces foreign keys
  const d1 = {
    prepare: (sql: string) => new Stmt(raw, sql),
    batch: async (stmts: Stmt[]) => {
      raw.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.runSync());
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    exec: async (sql: string) => {
      raw.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return { d1: d1 as unknown as D1Database, raw };
}

/** Applies migration files in order, each in its own transaction (like `wrangler d1 migrations apply`). */
export function applyMigrations(raw: DatabaseSync, files: string[] = MIGRATIONS): void {
  for (const f of files) {
    raw.exec('BEGIN');
    try {
      raw.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'));
      raw.exec('COMMIT');
    } catch (e) {
      raw.exec('ROLLBACK');
      throw new Error(`migration ${f} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
