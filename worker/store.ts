export interface PlayerRow {
  id: string;
  displayName: string;
  createdAt: number;
  suspicious: boolean;
  /** the GM tool touched this player's save */
  gmUsed: boolean;
}

export interface SaveRow {
  playerId: string;
  state: string;
  revision: number;
  savedAt: number;
  prevState: string | null;
  prevSavedAt: number | null;
  /** anti-cheat baseline: uploads are validated against this state and the time since anchorAt */
  anchorState: string;
  anchorAt: number;
}

export interface AnchorWrite {
  state: string;
  at: number;
}

export interface CredentialsRow {
  playerId: string;
  username: string;
  /** NFKC + lowercase; unique */
  usernameKey: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
}

export type BindResult = 'ok' | 'taken' | 'already_bound';

/** Events in a time window: how many, and the oldest one's time (for Retry-After). */
export interface RateWindow {
  count: number;
  oldest: number | null;
}

export interface DiscoveryRow {
  id: number;
  spellId: string;
  displayName: string;
  at: number;
  first: boolean;
}

export type GmActionKind = 'login' | 'inventory' | 'unlock_zones' | 'reveal_all' | 'boss_ready' | 'reset_password';

export interface GmActionWrite {
  gmPlayerId: string;
  at: number;
  action: GmActionKind;
  target: string | null;
  detail: string | null;
}

export interface Store {
  /** Creates the player, its first session and its initial save. */
  createPlayer(p: PlayerRow, sessionHash: string, initialState: string, now: number): Promise<void>;
  getPlayer(id: string): Promise<PlayerRow | null>;
  findPlayerBySession(hash: string): Promise<{ player: PlayerRow; lastSeenAt: number } | null>;
  createSession(hash: string, playerId: string, now: number): Promise<void>;
  touchSession(hash: string, now: number): Promise<void>;
  deleteSession(hash: string): Promise<void>;
  deleteOtherSessions(playerId: string, keepHash: string): Promise<void>;
  countSessions(playerId: string): Promise<number>;
  /** Deletes every session of the player. */
  deleteSessions(playerId: string): Promise<void>;
  markGmUsed(playerId: string): Promise<void>;
  createGmToken(hash: string, playerId: string, expiresAt: number): Promise<void>;
  /** The player id, or null when unknown or expired (expiresAt <= now). */
  findGmToken(hash: string, now: number): Promise<string | null>;
  deleteGmTokens(playerId: string): Promise<void>;
  clearLoginFailures(key: string): Promise<void>;
  recordGmAction(a: GmActionWrite): Promise<void>;
  findCredentialsByKey(usernameKey: string): Promise<CredentialsRow | null>;
  findCredentialsByPlayer(playerId: string): Promise<CredentialsRow | null>;
  /** 'taken' when another player has the username key; 'already_bound' when this player has credentials. */
  createCredentials(row: CredentialsRow): Promise<BindResult>;
  updatePasswordHash(playerId: string, passwordHash: string, now: number): Promise<void>;
  /** Also deletes failures older than a day. */
  recordLoginFailure(keys: string[], now: number): Promise<void>;
  loginFailures(key: string, since: number): Promise<RateWindow>;
  /** Also deletes records older than a day. */
  recordGuestCreation(ip: string, now: number): Promise<void>;
  guestCreations(ip: string, since: number): Promise<RateWindow>;
  getSave(playerId: string): Promise<SaveRow | null>;
  /**
   * revision 等於 baseRevision 時，把目前存檔移到 prev，寫入新存檔並讓 revision+1；不一致時回傳 false。
   * anchor 不為 null 時，同一次寫入（同一個 CAS）也把錨點改成 anchor.state / anchor.at；
   * 錨點只會隨 revision 一起變，所以呼叫端依讀到的錨點算出的新錨點不會覆蓋別人的寫入。
   */
  commitSave(playerId: string, baseRevision: number, state: string, now: number, anchor: AnchorWrite | null): Promise<boolean>;
  recordRejection(playerId: string, now: number, reasons: string[]): Promise<number>;
  markSuspicious(playerId: string): Promise<void>;
  recordSynthesis(playerId: string, now: number, combo: string, result: string): Promise<void>;
  /** Inserts a discovery, as the first one for this spell when no first exists yet (the partial unique index decides races). */
  recordDiscovery(d: { spellId: string; playerId: string; displayName: string; at: number }): Promise<{ first: boolean }>;
  /** Newest first, at most `limit`; with `after`, only rows whose id is greater. Never exposes the player id. */
  recentDiscoveries(after: number | null, limit: number): Promise<DiscoveryRow[]>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function windowOf(times: number[]): RateWindow {
  return { count: times.length, oldest: times.length > 0 ? Math.min(...times) : null };
}

/** In-memory store for tests. commitSave is a synchronous compare-and-set. */
export class MemoryStore implements Store {
  players = new Map<string, PlayerRow>();
  saves = new Map<string, SaveRow>();
  rejections: { playerId: string; at: number; reasons: string[] }[] = [];
  synthEvents: { playerId: string; at: number; combo: string; result: string }[] = [];

  gmActions: GmActionWrite[] = [];
  gmTokens = new Map<string, { playerId: string; expiresAt: number }>();

  discoveryLog: (DiscoveryRow & { playerId: string })[] = [];

  sessions = new Map<string, { playerId: string; createdAt: number; lastSeenAt: number }>();
  credentials = new Map<string, CredentialsRow>(); // by playerId
  loginFailureLog: { key: string; at: number }[] = [];
  guestCreationLog: { ip: string; at: number }[] = [];

  async createPlayer(p: PlayerRow, sessionHash: string, initialState: string, now: number): Promise<void> {
    this.players.set(p.id, { ...p });
    this.sessions.set(sessionHash, { playerId: p.id, createdAt: now, lastSeenAt: now });
    this.saves.set(p.id, {
      playerId: p.id,
      state: initialState,
      revision: 0,
      savedAt: now,
      prevState: null,
      prevSavedAt: null,
      anchorState: initialState,
      anchorAt: now,
    });
  }

  async getPlayer(id: string): Promise<PlayerRow | null> {
    const p = this.players.get(id);
    return p ? { ...p } : null;
  }

  async findPlayerBySession(hash: string): Promise<{ player: PlayerRow; lastSeenAt: number } | null> {
    const s = this.sessions.get(hash);
    const p = s ? this.players.get(s.playerId) : undefined;
    return s && p ? { player: { ...p }, lastSeenAt: s.lastSeenAt } : null;
  }

  async createSession(hash: string, playerId: string, now: number): Promise<void> {
    this.sessions.set(hash, { playerId, createdAt: now, lastSeenAt: now });
  }

  async touchSession(hash: string, now: number): Promise<void> {
    const s = this.sessions.get(hash);
    if (s) s.lastSeenAt = now;
  }

  async deleteSession(hash: string): Promise<void> {
    this.sessions.delete(hash);
  }

  async deleteOtherSessions(playerId: string, keepHash: string): Promise<void> {
    for (const [h, s] of this.sessions) if (s.playerId === playerId && h !== keepHash) this.sessions.delete(h);
  }

  async countSessions(playerId: string): Promise<number> {
    return [...this.sessions.values()].filter((s) => s.playerId === playerId).length;
  }

  async deleteSessions(playerId: string): Promise<void> {
    for (const [h, s] of this.sessions) if (s.playerId === playerId) this.sessions.delete(h);
  }

  async markGmUsed(playerId: string): Promise<void> {
    const p = this.players.get(playerId);
    if (p) p.gmUsed = true;
  }

  async createGmToken(hash: string, playerId: string, expiresAt: number): Promise<void> {
    this.gmTokens.set(hash, { playerId, expiresAt });
  }

  async findGmToken(hash: string, now: number): Promise<string | null> {
    const t = this.gmTokens.get(hash);
    return t && t.expiresAt > now ? t.playerId : null;
  }

  async deleteGmTokens(playerId: string): Promise<void> {
    for (const [h, t] of this.gmTokens) if (t.playerId === playerId) this.gmTokens.delete(h);
  }

  async clearLoginFailures(key: string): Promise<void> {
    this.loginFailureLog = this.loginFailureLog.filter((f) => f.key !== key);
  }

  async recordGmAction(a: GmActionWrite): Promise<void> {
    this.gmActions.push({ ...a });
  }

  async findCredentialsByKey(usernameKey: string): Promise<CredentialsRow | null> {
    for (const c of this.credentials.values()) if (c.usernameKey === usernameKey) return { ...c };
    return null;
  }

  async findCredentialsByPlayer(playerId: string): Promise<CredentialsRow | null> {
    const c = this.credentials.get(playerId);
    return c ? { ...c } : null;
  }

  async createCredentials(row: CredentialsRow): Promise<BindResult> {
    if (this.credentials.has(row.playerId)) return 'already_bound';
    if (await this.findCredentialsByKey(row.usernameKey)) return 'taken';
    this.credentials.set(row.playerId, { ...row });
    return 'ok';
  }

  async updatePasswordHash(playerId: string, passwordHash: string, now: number): Promise<void> {
    const c = this.credentials.get(playerId);
    if (c) this.credentials.set(playerId, { ...c, passwordHash, updatedAt: now });
  }

  async recordLoginFailure(keys: string[], now: number): Promise<void> {
    this.loginFailureLog = this.loginFailureLog.filter((f) => f.at >= now - DAY_MS);
    for (const key of keys) this.loginFailureLog.push({ key, at: now });
  }

  async loginFailures(key: string, since: number): Promise<RateWindow> {
    return windowOf(this.loginFailureLog.filter((f) => f.key === key && f.at >= since).map((f) => f.at));
  }

  async recordGuestCreation(ip: string, now: number): Promise<void> {
    this.guestCreationLog = this.guestCreationLog.filter((g) => g.at >= now - DAY_MS);
    this.guestCreationLog.push({ ip, at: now });
  }

  async guestCreations(ip: string, since: number): Promise<RateWindow> {
    return windowOf(this.guestCreationLog.filter((g) => g.ip === ip && g.at >= since).map((g) => g.at));
  }

  async getSave(playerId: string): Promise<SaveRow | null> {
    const s = this.saves.get(playerId);
    return s ? { ...s } : null;
  }

  async commitSave(playerId: string, baseRevision: number, state: string, now: number, anchor: AnchorWrite | null): Promise<boolean> {
    const s = this.saves.get(playerId);
    if (!s || s.revision !== baseRevision) return false;
    this.saves.set(playerId, {
      playerId,
      state,
      revision: s.revision + 1,
      savedAt: now,
      prevState: s.state,
      prevSavedAt: s.savedAt,
      anchorState: anchor ? anchor.state : s.anchorState,
      anchorAt: anchor ? anchor.at : s.anchorAt,
    });
    return true;
  }

  async recordRejection(playerId: string, now: number, reasons: string[]): Promise<number> {
    this.rejections.push({ playerId, at: now, reasons });
    return this.rejections.filter((r) => r.playerId === playerId && r.at >= now - DAY_MS).length;
  }

  async markSuspicious(playerId: string): Promise<void> {
    const p = this.players.get(playerId);
    if (p) p.suspicious = true;
  }

  async recordSynthesis(playerId: string, now: number, combo: string, result: string): Promise<void> {
    this.synthEvents.push({ playerId, at: now, combo, result });
  }

  async recordDiscovery(d: { spellId: string; playerId: string; displayName: string; at: number }): Promise<{ first: boolean }> {
    const first = !this.discoveryLog.some((r) => r.spellId === d.spellId && r.first);
    const id = this.discoveryLog.length === 0 ? 1 : this.discoveryLog[this.discoveryLog.length - 1].id + 1;
    this.discoveryLog.push({ id, spellId: d.spellId, playerId: d.playerId, displayName: d.displayName, at: d.at, first });
    return { first };
  }

  async recentDiscoveries(after: number | null, limit: number): Promise<DiscoveryRow[]> {
    return this.discoveryLog
      .filter((r) => after === null || r.id > after)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map((r) => ({ id: r.id, spellId: r.spellId, displayName: r.displayName, at: r.at, first: r.first }));
  }
}
