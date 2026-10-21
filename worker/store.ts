export interface PlayerRow {
  id: string;
  displayName: string;
  tokenHash: string;
  createdAt: number;
  suspicious: boolean;
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

export interface Store {
  createPlayer(p: PlayerRow, initialState: string, now: number): Promise<void>;
  findPlayerByTokenHash(hash: string): Promise<PlayerRow | null>;
  getSave(playerId: string): Promise<SaveRow | null>;
  /**
   * revision 等於 baseRevision 時，把目前存檔移到 prev，寫入新存檔並讓 revision+1；不一致時回傳 false。
   * advanceAnchor 為 true 時，同一次寫入也把錨點移到新存檔（anchorState = state, anchorAt = now）。
   */
  commitSave(playerId: string, baseRevision: number, state: string, now: number, advanceAnchor: boolean): Promise<boolean>;
  recordRejection(playerId: string, now: number, reasons: string[]): Promise<number>;
  markSuspicious(playerId: string): Promise<void>;
  recordSynthesis(playerId: string, now: number, combo: string, result: string): Promise<void>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** In-memory store for tests. commitSave is a synchronous compare-and-set. */
export class MemoryStore implements Store {
  players = new Map<string, PlayerRow>();
  saves = new Map<string, SaveRow>();
  rejections: { playerId: string; at: number; reasons: string[] }[] = [];
  synthEvents: { playerId: string; at: number; combo: string; result: string }[] = [];

  async createPlayer(p: PlayerRow, initialState: string, now: number): Promise<void> {
    this.players.set(p.id, { ...p });
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

  async findPlayerByTokenHash(hash: string): Promise<PlayerRow | null> {
    for (const p of this.players.values()) if (p.tokenHash === hash) return { ...p };
    return null;
  }

  async getSave(playerId: string): Promise<SaveRow | null> {
    const s = this.saves.get(playerId);
    return s ? { ...s } : null;
  }

  async commitSave(playerId: string, baseRevision: number, state: string, now: number, advanceAnchor: boolean): Promise<boolean> {
    const s = this.saves.get(playerId);
    if (!s || s.revision !== baseRevision) return false;
    this.saves.set(playerId, {
      playerId,
      state,
      revision: s.revision + 1,
      savedAt: now,
      prevState: s.state,
      prevSavedAt: s.savedAt,
      anchorState: advanceAnchor ? state : s.anchorState,
      anchorAt: advanceAnchor ? now : s.anchorAt,
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
}
