import type { AnchorWrite, BindResult, CredentialsRow, PlayerRow, RateWindow, SaveRow, Store } from './store';

const DAY_MS = 24 * 60 * 60 * 1000;

interface PlayerDb {
  id: string;
  display_name: string;
  token_hash: string;
  created_at: number;
  suspicious: number;
}
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

  async createPlayer(_p: PlayerRow, _sessionHash: string, _initialState: string, _now: number): Promise<void> {
    throw new Error('not implemented: Task 4');
  }

  async getPlayer(_id: string): Promise<PlayerRow | null> {
    throw new Error('not implemented: Task 4');
  }

  async findPlayerBySession(_hash: string): Promise<{ player: PlayerRow; lastSeenAt: number } | null> {
    throw new Error('not implemented: Task 4');
  }

  async createSession(_hash: string, _playerId: string, _now: number): Promise<void> {
    throw new Error('not implemented: Task 4');
  }

  async touchSession(_hash: string, _now: number): Promise<void> {
    throw new Error('not implemented: Task 4');
  }

  async deleteSession(_hash: string): Promise<void> {
    throw new Error('not implemented: Task 4');
  }

  async deleteOtherSessions(_playerId: string, _keepHash: string): Promise<void> {
    throw new Error('not implemented: Task 4');
  }

  async countSessions(_playerId: string): Promise<number> {
    throw new Error('not implemented: Task 4');
  }

  async findCredentialsByKey(_usernameKey: string): Promise<CredentialsRow | null> {
    throw new Error('not implemented: Task 4');
  }

  async findCredentialsByPlayer(_playerId: string): Promise<CredentialsRow | null> {
    throw new Error('not implemented: Task 4');
  }

  async createCredentials(_row: CredentialsRow): Promise<BindResult> {
    throw new Error('not implemented: Task 4');
  }

  async updatePasswordHash(_playerId: string, _passwordHash: string, _now: number): Promise<void> {
    throw new Error('not implemented: Task 4');
  }

  async recordLoginFailure(_keys: string[], _now: number): Promise<void> {
    throw new Error('not implemented: Task 4');
  }

  async loginFailures(_key: string, _since: number): Promise<RateWindow> {
    throw new Error('not implemented: Task 4');
  }

  async recordGuestCreation(_ip: string, _now: number): Promise<void> {
    throw new Error('not implemented: Task 4');
  }

  async guestCreations(_ip: string, _since: number): Promise<RateWindow> {
    throw new Error('not implemented: Task 4');
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
}
