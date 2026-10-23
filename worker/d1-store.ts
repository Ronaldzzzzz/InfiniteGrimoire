import type { AnchorWrite, BindResult, CredentialsRow, DiscoveryRow, PlayerRow, RateWindow, SaveRow, Store } from './store';

const DAY_MS = 24 * 60 * 60 * 1000;

interface PlayerDb {
  id: string;
  display_name: string;
  created_at: number;
  suspicious: number;
}
interface CredentialsDb {
  player_id: string;
  username: string;
  username_key: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

const toPlayer = (r: PlayerDb): PlayerRow => ({
  id: r.id,
  displayName: r.display_name,
  createdAt: r.created_at,
  suspicious: r.suspicious === 1,
});

const toCredentials = (r: CredentialsDb): CredentialsRow => ({
  playerId: r.player_id,
  username: r.username,
  usernameKey: r.username_key,
  passwordHash: r.password_hash,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

interface SaveDb {
  player_id: string;
  state: string;
  revision: number;
  saved_at: number;
  prev_state: string | null;
  prev_saved_at: number | null;
  anchor_state: string | null;
  anchor_at: number | null;
}

export class D1Store implements Store {
  constructor(private readonly db: D1Database) {}

  async createPlayer(p: PlayerRow, sessionHash: string, initialState: string, now: number): Promise<void> {
    await this.db.batch([
      this.db
        .prepare('INSERT INTO players (id, display_name, created_at, suspicious) VALUES (?, ?, ?, ?)')
        .bind(p.id, p.displayName, p.createdAt, p.suspicious ? 1 : 0),
      this.db
        .prepare('INSERT INTO sessions (token_hash, player_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
        .bind(sessionHash, p.id, now, now),
      this.db
        .prepare('INSERT INTO saves (player_id, state, revision, saved_at, anchor_state, anchor_at) VALUES (?, ?, 0, ?, ?, ?)')
        .bind(p.id, initialState, now, initialState, now),
    ]);
  }

  async getPlayer(id: string): Promise<PlayerRow | null> {
    const r = await this.db.prepare('SELECT * FROM players WHERE id = ?').bind(id).first<PlayerDb>();
    return r ? toPlayer(r) : null;
  }

  async findPlayerBySession(hash: string): Promise<{ player: PlayerRow; lastSeenAt: number } | null> {
    const r = await this.db
      .prepare(
        'SELECT p.id, p.display_name, p.created_at, p.suspicious, s.last_seen_at FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ?',
      )
      .bind(hash)
      .first<PlayerDb & { last_seen_at: number }>();
    return r ? { player: toPlayer(r), lastSeenAt: r.last_seen_at } : null;
  }

  async createSession(hash: string, playerId: string, now: number): Promise<void> {
    await this.db
      .prepare('INSERT INTO sessions (token_hash, player_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
      .bind(hash, playerId, now, now)
      .run();
  }

  async touchSession(hash: string, now: number): Promise<void> {
    await this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').bind(now, hash).run();
  }

  async deleteSession(hash: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
  }

  async deleteOtherSessions(playerId: string, keepHash: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE player_id = ? AND token_hash <> ?').bind(playerId, keepHash).run();
  }

  async countSessions(playerId: string): Promise<number> {
    const r = await this.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE player_id = ?').bind(playerId).first<{ n: number }>();
    return r?.n ?? 0;
  }

  async findCredentialsByKey(usernameKey: string): Promise<CredentialsRow | null> {
    const r = await this.db.prepare('SELECT * FROM credentials WHERE username_key = ?').bind(usernameKey).first<CredentialsDb>();
    return r ? toCredentials(r) : null;
  }

  async findCredentialsByPlayer(playerId: string): Promise<CredentialsRow | null> {
    const r = await this.db.prepare('SELECT * FROM credentials WHERE player_id = ?').bind(playerId).first<CredentialsDb>();
    return r ? toCredentials(r) : null;
  }

  async createCredentials(row: CredentialsRow): Promise<BindResult> {
    if (await this.findCredentialsByPlayer(row.playerId)) return 'already_bound';
    try {
      await this.db
        .prepare(
          'INSERT INTO credentials (player_id, username, username_key, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(row.playerId, row.username, row.usernameKey, row.passwordHash, row.createdAt, row.updatedAt)
        .run();
      return 'ok';
    } catch (e) {
      // a concurrent bind can still lose the race on either unique column
      const msg = e instanceof Error ? e.message : String(e);
      if (/UNIQUE constraint failed: credentials\.player_id/.test(msg)) return 'already_bound';
      if (/UNIQUE constraint failed/.test(msg)) return 'taken';
      throw e;
    }
  }

  async updatePasswordHash(playerId: string, passwordHash: string, now: number): Promise<void> {
    await this.db
      .prepare('UPDATE credentials SET password_hash = ?, updated_at = ? WHERE player_id = ?')
      .bind(passwordHash, now, playerId)
      .run();
  }

  async recordLoginFailure(keys: string[], now: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM login_failures WHERE at < ?').bind(now - DAY_MS),
      ...keys.map((k) => this.db.prepare('INSERT INTO login_failures (key, at) VALUES (?, ?)').bind(k, now)),
    ]);
  }

  async loginFailures(key: string, since: number): Promise<RateWindow> {
    const r = await this.db
      .prepare('SELECT COUNT(*) AS n, MIN(at) AS oldest FROM login_failures WHERE key = ? AND at >= ?')
      .bind(key, since)
      .first<{ n: number; oldest: number | null }>();
    return { count: r?.n ?? 0, oldest: r?.oldest ?? null };
  }

  async recordGuestCreation(ip: string, now: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM guest_creations WHERE at < ?').bind(now - DAY_MS),
      this.db.prepare('INSERT INTO guest_creations (ip, at) VALUES (?, ?)').bind(ip, now),
    ]);
  }

  async guestCreations(ip: string, since: number): Promise<RateWindow> {
    const r = await this.db
      .prepare('SELECT COUNT(*) AS n, MIN(at) AS oldest FROM guest_creations WHERE ip = ? AND at >= ?')
      .bind(ip, since)
      .first<{ n: number; oldest: number | null }>();
    return { count: r?.n ?? 0, oldest: r?.oldest ?? null };
  }

  async getSave(playerId: string): Promise<SaveRow | null> {
    const r = await this.db.prepare('SELECT * FROM saves WHERE player_id = ?').bind(playerId).first<SaveDb>();
    return r
      ? {
          playerId: r.player_id,
          state: r.state,
          revision: r.revision,
          savedAt: r.saved_at,
          prevState: r.prev_state,
          prevSavedAt: r.prev_saved_at,
          // migration 0002 backfills these; fall back to the save itself for safety
          anchorState: r.anchor_state ?? r.state,
          anchorAt: r.anchor_at ?? r.saved_at,
        }
      : null;
  }

  async commitSave(playerId: string, baseRevision: number, state: string, now: number, anchor: AnchorWrite | null): Promise<boolean> {
    // one statement, one CAS on revision: the anchor moves together with the save or not at all
    const stmt = anchor
      ? this.db
          .prepare(
            'UPDATE saves SET prev_state = state, prev_saved_at = saved_at, state = ?, revision = revision + 1, saved_at = ?, anchor_state = ?, anchor_at = ? WHERE player_id = ? AND revision = ?',
          )
          .bind(state, now, anchor.state, anchor.at, playerId, baseRevision)
      : this.db
          .prepare(
            'UPDATE saves SET prev_state = state, prev_saved_at = saved_at, state = ?, revision = revision + 1, saved_at = ? WHERE player_id = ? AND revision = ?',
          )
          .bind(state, now, playerId, baseRevision);
    const r = await stmt.run();
    return r.meta.changes === 1;
  }

  async recordRejection(playerId: string, now: number, reasons: string[]): Promise<number> {
    await this.db
      .prepare('INSERT INTO rejections (player_id, at, reasons) VALUES (?, ?, ?)')
      .bind(playerId, now, JSON.stringify(reasons))
      .run();
    const r = await this.db
      .prepare('SELECT COUNT(*) AS n FROM rejections WHERE player_id = ? AND at >= ?')
      .bind(playerId, now - DAY_MS)
      .first<{ n: number }>();
    return r?.n ?? 0;
  }

  async markSuspicious(playerId: string): Promise<void> {
    await this.db.prepare('UPDATE players SET suspicious = 1 WHERE id = ?').bind(playerId).run();
  }

  async recordSynthesis(playerId: string, now: number, combo: string, result: string): Promise<void> {
    await this.db
      .prepare('INSERT INTO synth_events (player_id, at, combo, result) VALUES (?, ?, ?, ?)')
      .bind(playerId, now, combo, result)
      .run();
  }

  async recordDiscovery(d: { spellId: string; playerId: string; displayName: string; at: number }): Promise<{ first: boolean }> {
    const sql = 'INSERT INTO discoveries (spell_id, player_id, display_name, at, first) VALUES (?, ?, ?, ?, ?)';
    try {
      await this.db.prepare(sql).bind(d.spellId, d.playerId, d.displayName, d.at, 1).run();
      return { first: true };
    } catch (e) {
      // the partial unique index says someone is already first: only a constraint error is handled here
      if (!/constraint|unique/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
    await this.db.prepare(sql).bind(d.spellId, d.playerId, d.displayName, d.at, 0).run();
    return { first: false };
  }

  async recentDiscoveries(after: number | null, limit: number): Promise<DiscoveryRow[]> {
    const base = 'SELECT id, spell_id, display_name, at, first FROM discoveries';
    const stmt =
      after === null
        ? this.db.prepare(`${base} ORDER BY id DESC LIMIT ?`).bind(limit)
        : this.db.prepare(`${base} WHERE id > ? ORDER BY id DESC LIMIT ?`).bind(after, limit);
    const { results } = await stmt.all<{ id: number; spell_id: string; display_name: string; at: number; first: number }>();
    return results.map((r) => ({ id: r.id, spellId: r.spell_id, displayName: r.display_name, at: r.at, first: r.first === 1 }));
  }
}
