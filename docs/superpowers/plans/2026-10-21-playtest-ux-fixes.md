# 試玩回饋修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依使用者第一次試玩的回饋，把合成、魔導書、元素表收進同一個面板，改用能顯示完整資訊的自製選擇器，戰場改成正圓，並量測與改善卡頓。

**Architecture:** 只動瀏覽器層（`src/ui/`、`src/render/`、`src/main.tsx`），不碰引擎規則、資料檔、worker、存檔格式。React 改成用 selector 訂閱 `GameRuntime`，戰鬥狀態只給 Pixi。圓形戰場的幾何算在純函式模組 `src/render/arena.ts`，這樣能測試；`BattleView` 只負責畫。

**Tech Stack:** React 19、Pixi.js 8、Vite 8、Vitest 5 + @testing-library/react（jsdom）、TypeScript 7。

**Spec:** `docs/superpowers/specs/2026-10-21-playtest-ux-fixes-design.md`（上層：`docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md`）

## Global Constraints

- 不改遊戲規則、數值、配方、資料檔、伺服器 API、存檔格式、防作弊驗證、錨點窗口。`src/engine/`、`src/data/`、`worker/`、`migrations/` 在本計畫中**不得修改**。
- `tests/sim` 五條路線必須繼續 0 次被拒；`npm test` 與 `npm run build` 每個任務結束都要通過。
- 介面文字一律繁體中文。
- 360px 寬可用、沒有橫向捲軸、全部操作可用點擊完成（1280px、768px、360px 都要檢查）。
- 不使用原生 `<select>`。
- `localStorage` 讀寫都包 try/catch，失敗就用預設值。
- 配色：背景 `#0d0f14`、符文綠 `#8fd16a`、琥珀金 `#e8b84a`；元素色用 `src/render/palette.ts` 與 `App.css` 的 CSS 變數。
- 「無效」浮字固定 16px，不隨戰場縮小（規格要求 ≥ 14px）。
- 引擎的 `MonsterInstance.x` 意義不變（1 = 遠、0.15 = 停止）；圓形戰場只是畫面換算。
- 開發用量測工具只在 `import.meta.env.DEV` 時出現，正式版不得顯示。
- Commit 訊息用 Conventional Commits（英文），結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。不要 push。

## 決策（規格中【待決策】項目的裁定）

AGENTS.md 規定【待決策】由實作者決定並記錄。本計畫的裁定如下，Task 1 會把它們抄進帳本：

- **R1 斷點**：≥ 1100px 三欄（戰鬥｜魔導書｜元素＋合成）；768～1099px 戰鬥在上、下方面板兩欄；< 768px 全部上下排列（戰鬥 → 元素＋合成 → 魔導書）。
- **R2 升階按鈕**：維持使用者決定的「每列尾端一顆」，按下升級**最低的可升階級**。
- **R3 怪物角度**：選項 A，角度只存在畫面層（`BattleView` 以 `uid` 對應），引擎不動。
- **R4 怪物互相錯開**：生成時挑角度，與現存怪物至少錯開 25°（最多試 12 次，都不行就取間隔最大的那個）；不加額外的分離位移。
- **R5 beam 特效**：第一個目標畫主光束（寬 5u＋白芯），第二個目標從圓心畫一條較細的分支（寬 2.5u、無白芯）。不改規則。
- **R6 卡頓**：不論量測結果，都做 selector 拆分（Task 2）以及血條、狀態只在需要時重畫（Task 10）。浮動數字改用 BitmapText 的做法也放在 Task 10，因為成本低。
- **R7 戰場半徑**：規格的【我的決定】寫「長邊的一半」。但正方形或接近正方形的畫面，斜角方向的生成點會落在畫面內，所以改成 `hypot(w/2 + 最大怪物半徑, h/2 + 最大怪物半徑) + 1`（畫面往外擴一個怪物半徑後的半對角線），保證 `x = 1` 的怪物在任何方向都完全在畫面外。停止圈依規格夾在 `[小人半徑＋怪物半徑＋6, 短邊/2 − 怪物半徑]` 之間；畫面太小、兩者衝突時，以「不與小人重疊」優先。
- **R8 無屬性魔法分組**：魔法選擇器依屬性分組時，無屬性（`魔力彈`）放在最前面的「無屬性」組。
- **R9 排序偏好存 localStorage**：規格 2.4 要求把排序存在 `localStorage`（key `ig.spellSort`）。MVP 的 global constraint 寫「localStorage 只存登入權杖」，兩者衝突；以較新的規格為準。這個值不是遊戲資料，不影響防作弊。交付時要告知使用者。
- **R10 目前所在地點**：在地點選擇器中標示為目前的值，並且不能點（和現在的 ZonePanel 一樣）。

## Review Focus

1. **窄螢幕的彈出清單超出畫面**：360px 寬時，地點／魔法清單必須留在畫面內，清單太長時自己垂直捲動。Task 4 用 CSS（`max-width: calc(100vw - 32px)`、`max-height: 60vh`）處理，Task 11 在瀏覽器裡用 `scrollWidth` 驗證。
2. **合成中途換地點、換裝備或升階**：選擇器與元素表在 `synthPending` 時仍可操作，但合成槽與合成按鈕的啟用規則不變。App 測試（Task 7）要驗證按下升階後合成槽內容保留。
3. **重新整理或換地點時，戰場 `uid` 從 1 重新開始**：`BattleView` 的角度表必須跟著 `monsters` 清除，否則新怪物會沿用舊角度。由 Task 9 的「刪除不存在的 uid」邏輯處理，Task 11 在瀏覽器換地點時檢查。
4. **極小的戰鬥畫面（手機橫向、25vh）**：停止圈的下限大於上限時，必須以不重疊小人為優先。Task 8 測試。
5. **戰鬥中選擇器開著**：每秒約 1 次的殺怪會更新 `game`，清單不能因此關閉，也不能跳掉鍵盤選中的項目。Task 4 測試（rerender 後清單維持開啟、active 不變）。

---

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/ui/perf-stats.ts` | 新增 | 滾動 1 秒窗口的 fps、最長幀、React commit/s、長任務統計（純邏輯） |
| `src/ui/PerfMeter.tsx` | 新增 | 開發模式的量測顯示 |
| `src/main.tsx` | 修改 | DEV 時用 `<Profiler>` 包住 App 並顯示 PerfMeter |
| `src/ui/useGame.ts` | 修改 | `useGame` 改成 `useRuntime(selector)`、`useGameState`、`bossAlive` |
| `src/ui/picker-data.ts` | 新增 | 魔法／地點選擇器的列資料與排序（純函式） |
| `src/ui/Picker.tsx` | 新增 | 通用的按鈕＋彈出清單（鍵盤、點外關閉） |
| `src/ui/pickers.tsx` | 新增 | `SpellPicker`、`ZonePicker`，以及排序偏好的讀寫 |
| `src/ui/ElementTable.tsx` | 新增 | 屬性 × 階級的元素表＋升階＋素材列（取代 InventoryBar） |
| `src/ui/TopBar.tsx` | 新增 | 頂列：地點選擇器、裝備、提示、存檔失敗提示條（取代 Hud） |
| `src/ui/App.tsx` | 修改 | 新版面，殘卷線索狀態提升到這裡 |
| `src/ui/SynthesisPanel.tsx` | 修改 | props 改成 `game`/`synthPending`，加入殘卷線索區 |
| `src/ui/GrimoirePanel.tsx` | 修改 | 改用 selector；線索交給 `onHint`；`memo` |
| `src/ui/App.css` | 修改 | 新版面、斷點、元素表、選擇器樣式 |
| `src/ui/Hud.tsx`、`ZonePanel.tsx`、`ZonePanel.test.tsx`、`InventoryBar.tsx` | 刪除 | 被 TopBar / ElementTable 取代 |
| `src/render/arena.ts` | 新增 | 圓形戰場的幾何（純函式） |
| `src/render/battle-view.ts` | 修改 | 圓形戰場、置中錨點、停止圈、beam 分支、浮字夾在畫面內、重畫優化 |
| `docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/progress.md` | 新增 | 帳本 |
| `docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/perf-report.md` | 新增 | 量測前後的數據 |

---

### Task 1: 開發模式的量測工具＋基準數據＋帳本

**Files:**
- Create: `src/ui/perf-stats.ts`
- Create: `src/ui/perf-stats.test.ts`
- Create: `src/ui/PerfMeter.tsx`
- Modify: `src/main.tsx`（`case 'ready'` 分支與 import）
- Modify: `src/ui/App.css`（加 `.perf-meter`）
- Create: `docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/progress.md`
- Create: `docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/perf-report.md`

**Interfaces:**
- Produces: `class FrameStats { frame(now: number, dtMs: number): void; commit(now: number): void; longTask(durationMs: number): void; summary(now: number): PerfSummary }`、`interface PerfSummary { fps: number; worstMs: number; commitsPerSec: number; longTasks: number; longestTaskMs: number }`、`const perfStats: FrameStats`、`function PerfMeter(): JSX.Element`。DOM 中 `[data-testid="perf-meter"]` 的文字格式是 `{fps} fps · 最長 {worstMs} ms · React {commitsPerSec}/s · 長任務 {longTasks}（最長 {longestTaskMs} ms）`。Task 10 與 Task 11 用這段文字讀數據。

- [ ] **Step 1: 寫失敗的測試**

`src/ui/perf-stats.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { FrameStats } from './perf-stats';

describe('FrameStats', () => {
  it('reports fps and the worst frame over the last second', () => {
    const s = new FrameStats();
    let t = 0;
    for (let i = 0; i < 59; i++) {
      t += 1000 / 60;
      s.frame(t, 1000 / 60);
    }
    t += 40;
    s.frame(t, 40);
    const r = s.summary(t);
    expect(r.fps).toBe(60);
    expect(r.worstMs).toBe(40);
  });

  it('drops samples older than the window', () => {
    const s = new FrameStats();
    s.frame(0, 100);
    s.commit(0);
    s.frame(1500, 16);
    const r = s.summary(1500);
    expect(r.fps).toBe(1);
    expect(r.worstMs).toBe(16);
    expect(r.commitsPerSec).toBe(0);
  });

  it('counts commits per second and keeps long tasks cumulative', () => {
    const s = new FrameStats();
    for (let i = 0; i < 20; i++) s.commit(i * 50);
    s.longTask(70);
    s.longTask(120);
    const r = s.summary(999);
    expect(r.commitsPerSec).toBe(20);
    expect(r.longTasks).toBe(2);
    expect(r.longestTaskMs).toBe(120);
  });

  it('returns zeros when empty', () => {
    expect(new FrameStats().summary(0)).toEqual({ fps: 0, worstMs: 0, commitsPerSec: 0, longTasks: 0, longestTaskMs: 0 });
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/ui/perf-stats.test.ts`
Expected: FAIL（找不到 `./perf-stats`）

- [ ] **Step 3: 實作**

`src/ui/perf-stats.ts`：

```ts
export interface PerfSummary {
  fps: number;
  worstMs: number;
  commitsPerSec: number;
  longTasks: number;
  longestTaskMs: number;
}

/** Rolling-window frame / React-commit statistics for the dev-only perf meter. */
export class FrameStats {
  private frames: { t: number; dt: number }[] = [];
  private commits: number[] = [];
  private longCount = 0;
  private longest = 0;

  constructor(private readonly windowMs = 1000) {}

  frame(now: number, dtMs: number): void {
    this.frames.push({ t: now, dt: dtMs });
    this.trim(now);
  }

  commit(now: number): void {
    this.commits.push(now);
    this.trim(now);
  }

  longTask(durationMs: number): void {
    this.longCount++;
    this.longest = Math.max(this.longest, durationMs);
  }

  summary(now: number): PerfSummary {
    this.trim(now);
    const k = 1000 / this.windowMs;
    return {
      fps: Math.round(this.frames.length * k),
      worstMs: Math.round(this.frames.reduce((m, f) => Math.max(m, f.dt), 0)),
      commitsPerSec: Math.round(this.commits.length * k),
      longTasks: this.longCount,
      longestTaskMs: Math.round(this.longest),
    };
  }

  private trim(now: number): void {
    const min = now - this.windowMs;
    while (this.frames.length > 0 && this.frames[0]!.t <= min) this.frames.shift();
    while (this.commits.length > 0 && this.commits[0]! <= min) this.commits.shift();
  }
}

export const perfStats = new FrameStats();
```

`src/ui/PerfMeter.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { perfStats } from './perf-stats';

/** Dev-only overlay. Lives outside the <Profiler>, so its own updates are not counted as app commits. */
export function PerfMeter() {
  const [s, setS] = useState(() => perfStats.summary(performance.now()));
  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const frame = (now: number): void => {
      perfStats.frame(now, now - last);
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const id = setInterval(() => setS(perfStats.summary(performance.now())), 500);
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) perfStats.longTask(e.duration);
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      observer = null; // longtask entries are not supported everywhere
    }
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
      observer?.disconnect();
    };
  }, []);
  return (
    <div className="perf-meter" data-testid="perf-meter">
      {s.fps} fps · 最長 {s.worstMs} ms · React {s.commitsPerSec}/s · 長任務 {s.longTasks}（最長 {s.longestTaskMs} ms）
    </div>
  );
}
```

`src/main.tsx`：import 加上 `Profiler`，以及 `PerfMeter`、`perfStats`：

```tsx
import { Profiler, useCallback, useEffect, useState } from 'react';
// ...
import { PerfMeter } from './ui/PerfMeter';
import { perfStats } from './ui/perf-stats';
```

把 `case 'ready':` 改成：

```tsx
    case 'ready': {
      const app = <App runtime={phase.runtime} sync={phase.sync} data={gameData} />;
      if (!import.meta.env.DEV) return app;
      return (
        <>
          <Profiler id="app" onRender={() => perfStats.commit(performance.now())}>
            {app}
          </Profiler>
          <PerfMeter />
        </>
      );
    }
```

`src/ui/App.css` 檔尾加：

```css
.perf-meter { position: fixed; left: 8px; bottom: 8px; z-index: 200; pointer-events: none; background: rgba(0, 0, 0, 0.7); color: var(--rune); font: 12px/1.4 ui-monospace, monospace; padding: 2px 6px; border-radius: 4px; }
```

- [ ] **Step 4: 執行測試與 build**

Run: `npx vitest run src/ui/perf-stats.test.ts && npm test && npm run build`
Expected: 全部 PASS，build 成功

- [ ] **Step 5: 建立帳本**

`docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/progress.md`：

```markdown
# SDD ledger — plan: docs/superpowers/plans/2026-10-21-playtest-ux-fixes.md

Spec: docs/superpowers/specs/2026-10-21-playtest-ux-fixes-design.md
Branch: feat/mvp-core-loop

## Rulings
（把計畫「決策」一節的 R1～R10 逐條抄成 `Ruling Rn: ...` 一行一條）

## Progress
```

- [ ] **Step 6: 量測基準數據（由主控 session 用瀏覽器做）**

1. `npm run db:migrate:local`，再用背景執行 `npm run dev`。
2. 用 Chrome（claude-in-chrome）開一個新分頁到 `http://localhost:5173`，視窗寬 1280。如果出現取名畫面，就建立遊客。
3. 等戰鬥進行 20 秒，之後每 1 秒讀一次 `document.querySelector('[data-testid="perf-meter"]').textContent`，共 10 次（javascript_tool）。
4. 切到「魔導書」分頁，重複第 3 步。
5. 把 20 筆原始文字、最小／中位數的 fps、最大的最長幀、commit/s 的中位數、長任務數，寫進 `perf-report.md` 的「基準（修改前）」一節，並註明瀏覽器版本與視窗大小。註明 DevTools Performance 錄製沒有自動化，由使用者自行選做。

`perf-report.md` 骨架：

```markdown
# 卡頓量測報告

## 方法
開發模式的 PerfMeter（`src/ui/PerfMeter.tsx`）：滾動 1 秒窗口的 fps、最長幀、React commit/s、累計長任務（PerformanceObserver longtask）。每個情境取 10 筆，間隔 1 秒。

## 基準（修改前，commit <sha>）
| 情境 | fps 最小/中位 | 最長幀 最大 | React commit/s 中位 | 長任務 |
|---|---|---|---|---|

原始數據：
（20 行原始文字）

## 修改後
（Task 11 填寫）
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/perf-stats.ts src/ui/perf-stats.test.ts src/ui/PerfMeter.tsx src/main.tsx src/ui/App.css docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/
git commit -m "feat(dev): add a dev-only perf meter and record the stutter baseline"
```

---

### Task 2: 以 selector 訂閱 runtime（React 不再每 50ms 重畫）

**Files:**
- Modify: `src/ui/useGame.ts`
- Create: `src/ui/useGame.test.tsx`
- Modify: `src/ui/App.tsx`、`src/ui/Hud.tsx`、`src/ui/ZonePanel.tsx`、`src/ui/SynthesisPanel.tsx`、`src/ui/GrimoirePanel.tsx`
- Modify: `src/ui/SynthesisPanel.test.tsx`、`src/ui/ZonePanel.test.tsx`

**Interfaces:**
- Consumes: `GameRuntime.subscribe`、`GameRuntime.getSnapshot`（`src/game/runtime.ts`）
- Produces:
  - `type RuntimeStore = Pick<GameRuntime, 'subscribe' | 'getSnapshot'>`
  - `useRuntime<T>(runtime: RuntimeStore, select: (s: Snapshot) => T): T`：只有 select 的結果（以 `Object.is` 比較）改變時才重畫。
  - `useGameState(runtime: RuntimeStore): GameState`
  - `bossAlive(s: Snapshot, data: GameData): boolean`
  - `SynthesisPanel` props 改成 `{ game: GameState; synthPending: boolean; sync; data; slots; onSlotsChange }`
  - `Hud` props 改成 `{ game: GameState; bossAlive: boolean; data; runtime }`；`ZonePanel` props 改成 `{ game: GameState; data; runtime }`
  - 刪除 `useGame`（整份快照訂閱）

- [ ] **Step 1: 寫失敗的測試**

`src/ui/useGame.test.tsx`：

```tsx
// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import type { Snapshot } from '../game/runtime';
import { bossAlive, useRuntime } from './useGame';

afterEach(cleanup);

function fakeStore(initial: Snapshot) {
  let snap = initial;
  const ls = new Set<() => void>();
  return {
    getSnapshot: () => snap,
    subscribe: (l: () => void) => {
      ls.add(l);
      return () => void ls.delete(l);
    },
    set(next: Snapshot) {
      snap = next;
      for (const l of [...ls]) l();
    },
  };
}

function initial(): Snapshot {
  const game = createInitialState(gameData);
  return { game, battle: createBattle(game.currentZone), revision: 1, paused: false, synthPending: false };
}

describe('useRuntime', () => {
  it('re-renders only when the selected value changes', () => {
    const store = fakeStore(initial());
    let renders = 0;
    function Probe() {
      renders++;
      const eq = useRuntime(store, (s) => s.game.equipped);
      return <span>{eq}</span>;
    }
    render(<Probe />);
    const before = renders;
    act(() => store.set({ ...store.getSnapshot(), battle: { ...store.getSnapshot().battle, castTimerMs: 999 } }));
    expect(renders).toBe(before);
    act(() => store.set({ ...store.getSnapshot(), game: { ...store.getSnapshot().game, equipped: 'fireball' } }));
    expect(renders).toBe(before + 1);
  });
});

describe('bossAlive', () => {
  it('is true only while the zone boss is on the field during a boss fight', () => {
    const s = initial();
    const zone = gameData.zones[0]!;
    const boss = { uid: 9, defId: zone.bossId, hp: 1, maxHp: 1, x: 1, statuses: [] };
    expect(bossAlive(s, gameData)).toBe(false);
    expect(bossAlive({ ...s, battle: { ...s.battle, bossActive: true, monsters: [boss] } }, gameData)).toBe(true);
    expect(bossAlive({ ...s, battle: { ...s.battle, bossActive: true, monsters: [] } }, gameData)).toBe(false);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/ui/useGame.test.tsx`
Expected: FAIL（`useRuntime` / `bossAlive` 沒有 export）

- [ ] **Step 3: 實作 hook**

`src/ui/useGame.ts` 整份換成：

```ts
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { GameState } from '../engine/state';
import type { GameData } from '../engine/types';
import type { GameRuntime, Snapshot } from '../game/runtime';
import type { ConnStatus, SyncController } from '../game/sync';

export type RuntimeStore = Pick<GameRuntime, 'subscribe' | 'getSnapshot'>;

/**
 * Subscribes to one slice of the runtime snapshot. The component re-renders only when `select`
 * returns a different value (Object.is), so select primitives or references the runtime keeps stable.
 */
export function useRuntime<T>(runtime: RuntimeStore, select: (s: Snapshot) => T): T {
  const subscribe = useCallback((cb: () => void) => runtime.subscribe(cb), [runtime]);
  return useSyncExternalStore(subscribe, () => select(runtime.getSnapshot()));
}

/** The game state changes on kills / equip / travel / sync, not on every battle step. */
export function useGameState(runtime: RuntimeStore): GameState {
  return useRuntime(runtime, (s) => s.game);
}

export function bossAlive(s: Snapshot, data: GameData): boolean {
  const zone = data.zones.find((z) => z.id === s.game.currentZone);
  return Boolean(zone) && s.battle.bossActive && s.battle.monsters.some((m) => m.defId === zone!.bossId);
}

export function useConnStatus(sync: SyncController): ConnStatus {
  const [status, setStatus] = useState<ConnStatus>(sync.status);
  useEffect(() => {
    setStatus(sync.status);
    return sync.onStatus(setStatus);
  }, [sync]);
  return status;
}
```

- [ ] **Step 4: 遷移元件**

`src/ui/SynthesisPanel.tsx`：props 型別與解構改成

```tsx
import type { GameState } from '../engine/state';
// 移除 import type { Snapshot } ...

export function SynthesisPanel({
  game,
  synthPending,
  sync,
  data,
  slots,
  onSlotsChange,
}: {
  game: GameState;
  synthPending: boolean;
  sync: { synthesize(inputs: ItemId[]): Promise<SynthResult | null> };
  data: GameData;
  slots: Slots;
  onSlotsChange: (slots: Slots) => void;
}) {
  const [message, setMessage] = useState('');
  // 刪除原本的 `const { game, synthPending } = snapshot;`，其餘不變
```

`src/ui/Hud.tsx`：

```tsx
import type { GameState } from '../engine/state';
import type { GameData } from '../engine/types';
import type { GameRuntime } from '../game/runtime';

export function Hud({ game, bossAlive, data, runtime }: { game: GameState; bossAlive: boolean; data: GameData; runtime: GameRuntime }) {
  const zone = data.zones.find((z) => z.id === game.currentZone);
  // ...regularTier / efficiency 不變
  const boss = zone ? data.monsters[zone.bossId] : undefined;
  const stuck = bossAlive && Boolean(boss) && !game.learned.some((id) => data.spells[id] && canDamage(data.spells[id]!, boss!));
  // JSX 不變
```

`src/ui/ZonePanel.tsx`：props 改成 `{ game, data, runtime }: { game: GameState; data: GameData; runtime: GameRuntime }`，刪除 `const { game } = snapshot;`，import `GameState`，移除 `Snapshot` import。

`src/ui/GrimoirePanel.tsx`：

```tsx
import { useRuntime } from './useGame';
// ...
  const learned = useRuntime(runtime, (s) => s.game.learned);
  const equipped = useRuntime(runtime, (s) => s.game.equipped);
```

把元件內所有 `game.learned` 改成 `learned`，`game.equipped` 改成 `equipped`。props 型別改成 `{ runtime: RuntimeStore & Pick<GameRuntime, 'equip'> }`（從 `./useGame` import `RuntimeStore`）。

`src/ui/App.tsx`：

```tsx
import { bossAlive, useConnStatus, useGameState, useRuntime } from './useGame';
// ...
  const game = useGameState(runtime);
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  const bossOnField = useRuntime(runtime, (s) => bossAlive(s, data));
// ...
      <Hud game={game} bossAlive={bossOnField} data={data} runtime={runtime} />
// ...
              <SynthesisPanel game={game} synthPending={synthPending} sync={sync} data={data} slots={slots} onSlotsChange={setSlots} />
// ...
            {tab === 'map' && <ZonePanel game={game} data={data} runtime={runtime} />}
// ...
      <InventoryBar inventory={game.inventory} onPick={pick} onUpgrade={(el, g) => runtime.upgrade(el, g)} />
```

- [ ] **Step 5: 更新既有測試**

`src/ui/SynthesisPanel.test.tsx`：把 `snap()` 改成回傳 `{ game, synthPending }`，所有 render 改用 `{...snap(...)}` 展開：

```tsx
function snap(inventory: Record<string, number>, synthPending = false) {
  const game = { ...createInitialState(gameData), inventory };
  return { game, synthPending };
}
// 例：
render(<SynthesisPanel {...snap({ 'el:fire:1': 1, 'el:wind:1': 1 })} sync={sync} data={gameData} slots={['el:fire:1', 'el:wind:1']} onSlotsChange={() => {}} />);
// 嘗試紀錄的測試：
const s = snap({});
s.game.synthesisLog = { /* 同原本 */ };
render(<SynthesisPanel {...s} sync={{ synthesize: vi.fn() }} data={gameData} slots={[null, null]} onSlotsChange={() => {}} />);
```

移除不再使用的 `Snapshot`、`createBattle` import。

`src/ui/ZonePanel.test.tsx`：改成 `render(<ZonePanel game={game} data={gameData} runtime={runtime} />);`，刪除 `snapshot` 變數與相關 import。

- [ ] **Step 6: 執行測試與 build**

Run: `npm test && npm run build`
Expected: 全部 PASS；build 成功（`grep -rn "useGame(" src` 應該沒有結果）

- [ ] **Step 7: Commit**

```bash
git add src/ui/
git commit -m "perf(ui): subscribe to runtime slices instead of the whole snapshot"
```

---

### Task 3: 選擇器的列資料（純函式）

**Files:**
- Create: `src/ui/picker-data.ts`
- Create: `src/ui/picker-data.test.ts`

**Interfaces:**
- Consumes: `canDamage`、`overlevelEfficiency`（`src/engine/combat-rules.ts`）；`GameState`；`GameData`、`ELEMENT_ORDER`、`ElementId`、`SpellPattern`、`ZoneDef`、`SpellDef`（`src/engine/types.ts`）
- Produces:
  - `type SpellSort = 'element' | 'tier'`
  - `PATTERN_LABEL: Record<SpellPattern, string>`、`ELEMENT_LABEL: Record<ElementId, string>`
  - `interface SpellRow { id: string; name: string; elements: ElementId[]; tier: number; pattern: SpellPattern; attack: number; equipped: boolean; bossImmune: boolean; dropEfficiency: number }`
  - `interface SpellGroup { label: string; rows: SpellRow[] }`
  - `zoneRegularTier(zone: ZoneDef, data: GameData): number`
  - `spellPickerGroups(game: GameState, data: GameData, sort: SpellSort): SpellGroup[]`
  - `type ZoneStatus = 'current' | 'cleared' | 'available' | 'locked'`、`ZONE_STATUS_LABEL: Record<ZoneStatus, string>`
  - `interface ZoneRow { id: string; name: string; minTier: number; maxTier: number; bossName: string; bossTier: number; status: ZoneStatus; lockText: string | null }`
  - `zonePickerRows(game: GameState, data: GameData): ZoneRow[]`
  - `tierRangeLabel(r: { minTier: number; maxTier: number }): string`

- [ ] **Step 1: 寫失敗的測試**

`src/ui/picker-data.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState, type GameState } from '../engine/state';
import { spellPickerGroups, tierRangeLabel, zonePickerRows } from './picker-data';

const LEARNED = ['mana_bolt', 'explosion', 'fireball', 'fire_whirl', 'wind_blade', 'flame_burst'];

function game(patch: Partial<GameState> = {}): GameState {
  return { ...createInitialState(gameData), learned: LEARNED, equipped: 'fireball', ...patch };
}

describe('spellPickerGroups', () => {
  it('groups by element (none first, hybrids last), tier ascending inside a group', () => {
    const groups = spellPickerGroups(game(), gameData, 'element');
    expect(groups.map((g) => g.label)).toEqual(['無屬性', '火', '風', '混合']);
    expect(groups[1]!.rows.map((r) => r.id)).toEqual(['fireball', 'flame_burst', 'explosion']);
  });

  it('sorts every spell by tier descending in tier mode', () => {
    const groups = spellPickerGroups(game(), gameData, 'tier');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(['fire_whirl', 'explosion', 'flame_burst', 'fireball', 'wind_blade', 'mana_bolt']);
  });

  it('carries tier, pattern, attack and the equipped flag', () => {
    const rows = spellPickerGroups(game(), gameData, 'tier')[0]!.rows;
    const fb = rows.find((r) => r.id === 'fireball')!;
    expect(fb).toMatchObject({ tier: 2, pattern: 'bolt', attack: 22, equipped: true, elements: ['fire'] });
    expect(rows.find((r) => r.id === 'mana_bolt')!.equipped).toBe(false);
  });

  it('marks drop efficiency against the strongest regular monster of the zone', () => {
    const rows = spellPickerGroups(game({ currentZone: 'mist_meadow' }), gameData, 'tier')[0]!.rows;
    expect(rows.find((r) => r.id === 'fireball')!.dropEfficiency).toBe(1);
    expect(rows.find((r) => r.id === 'explosion')!.dropEfficiency).toBeCloseTo(0.5625);
  });

  it('marks spells that cannot damage the zone boss', () => {
    const rows = spellPickerGroups(game({ currentZone: 'ash_volcano' }), gameData, 'tier')[0]!.rows;
    expect(rows.find((r) => r.id === 'mana_bolt')!.bossImmune).toBe(true);
    expect(rows.find((r) => r.id === 'explosion')!.bossImmune).toBe(false);
  });

  it('skips learned ids that have no spell definition', () => {
    const rows = spellPickerGroups(game({ learned: ['mana_bolt', 'ghost'] }), gameData, 'tier')[0]!.rows;
    expect(rows.map((r) => r.id)).toEqual(['mana_bolt']);
  });
});

describe('zonePickerRows', () => {
  it('lists zones in order with tier range, boss, status and unlock text', () => {
    const rows = zonePickerRows(
      game({ currentZone: 'thunder_gorge', unlockedZones: ['mist_meadow', 'thunder_gorge'], defeatedBosses: ['mist_stag'] }),
      gameData,
    );
    expect(rows.map((r) => r.id)).toEqual(['mist_meadow', 'thunder_gorge', 'ash_volcano']);
    expect(rows[0]).toMatchObject({ minTier: 1, maxTier: 1, bossName: '迷霧雄鹿', bossTier: 2, status: 'cleared', lockText: null });
    expect(rows[1]).toMatchObject({ status: 'current', bossName: '暴風巨鵬', bossTier: 4 });
    expect(rows[2]).toMatchObject({ status: 'locked', lockText: '擊敗暴風巨鵬後解鎖' });
  });

  it('marks an unlocked zone whose boss is alive as available', () => {
    const rows = zonePickerRows(game({ currentZone: 'mist_meadow', unlockedZones: ['mist_meadow', 'thunder_gorge'] }), gameData);
    expect(rows[1]!.status).toBe('available');
  });
});

describe('tierRangeLabel', () => {
  it('collapses equal bounds', () => {
    expect(tierRangeLabel({ minTier: 3, maxTier: 3 })).toBe('Lv.3');
    expect(tierRangeLabel({ minTier: 3, maxTier: 5 })).toBe('Lv.3–5');
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/ui/picker-data.test.ts`
Expected: FAIL（找不到 `./picker-data`）

- [ ] **Step 3: 實作**

`src/ui/picker-data.ts`：

```ts
import { canDamage, overlevelEfficiency } from '../engine/combat-rules';
import type { GameState } from '../engine/state';
import { ELEMENT_ORDER, type ElementId, type GameData, type SpellDef, type SpellPattern, type ZoneDef } from '../engine/types';

export type SpellSort = 'element' | 'tier';

export const PATTERN_LABEL: Record<SpellPattern, string> = { bolt: '單體', beam: '光束', chain: '連鎖', nova: '擴散' };
export const ELEMENT_LABEL: Record<ElementId, string> = { fire: '火', wind: '風', thunder: '雷', earth: '土', water: '水' };

export interface SpellRow {
  id: string;
  name: string;
  elements: ElementId[];
  tier: number;
  pattern: SpellPattern;
  attack: number;
  equipped: boolean;
  bossImmune: boolean;
  dropEfficiency: number;
}

export interface SpellGroup {
  label: string;
  rows: SpellRow[];
}

/** Overlevel is measured against the strongest regular monster of the zone (same as the HUD note). */
export function zoneRegularTier(zone: ZoneDef, data: GameData): number {
  return Math.max(...zone.monsters.map((id) => data.monsters[id]?.tier ?? 1));
}

export function spellPickerGroups(game: GameState, data: GameData, sort: SpellSort): SpellGroup[] {
  const zone = data.zones.find((z) => z.id === game.currentZone);
  const boss = zone ? data.monsters[zone.bossId] : undefined;
  const regular = zone ? zoneRegularTier(zone, data) : 1;
  const rows: SpellRow[] = game.learned
    .map((id) => data.spells[id])
    .filter((s): s is SpellDef => Boolean(s))
    .map((s) => ({
      id: s.id,
      name: s.name,
      elements: s.elements,
      tier: s.tier,
      pattern: s.pattern,
      attack: s.attack,
      equipped: s.id === game.equipped,
      bossImmune: boss ? !canDamage(s, boss) : false,
      dropEfficiency: overlevelEfficiency(s.tier, regular),
    }));

  if (sort === 'tier') {
    return [{ label: '依階級', rows: [...rows].sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id)) }];
  }
  const groups: SpellGroup[] = [];
  const push = (label: string, list: SpellRow[]): void => {
    if (list.length > 0) groups.push({ label, rows: list.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id)) });
  };
  push('無屬性', rows.filter((r) => r.elements.length === 0));
  for (const el of ELEMENT_ORDER) push(ELEMENT_LABEL[el], rows.filter((r) => r.elements.length === 1 && r.elements[0] === el));
  push('混合', rows.filter((r) => r.elements.length >= 2));
  return groups;
}

export type ZoneStatus = 'current' | 'cleared' | 'available' | 'locked';

export const ZONE_STATUS_LABEL: Record<ZoneStatus, string> = {
  current: '目前所在',
  cleared: '已擊敗魔王',
  available: '可前往',
  locked: '未解鎖',
};

export interface ZoneRow {
  id: string;
  name: string;
  minTier: number;
  maxTier: number;
  bossName: string;
  bossTier: number;
  status: ZoneStatus;
  lockText: string | null;
}

export function zonePickerRows(game: GameState, data: GameData): ZoneRow[] {
  const zones = [...data.zones].sort((a, b) => a.order - b.order);
  return zones.map((z, i) => {
    const tiers = z.monsters.map((id) => data.monsters[id]?.tier ?? 1);
    const boss = data.monsters[z.bossId];
    const prevBoss = i > 0 ? data.monsters[zones[i - 1]!.bossId] : undefined;
    const status: ZoneStatus =
      game.currentZone === z.id
        ? 'current'
        : !game.unlockedZones.includes(z.id)
          ? 'locked'
          : game.defeatedBosses.includes(z.bossId)
            ? 'cleared'
            : 'available';
    return {
      id: z.id,
      name: z.name,
      minTier: Math.min(...tiers),
      maxTier: Math.max(...tiers),
      bossName: boss?.name ?? z.bossId,
      bossTier: boss?.tier ?? 0,
      status,
      lockText: status === 'locked' ? `擊敗${prevBoss?.name ?? '前一個魔王'}後解鎖` : null,
    };
  });
}

export function tierRangeLabel(r: { minTier: number; maxTier: number }): string {
  return r.minTier === r.maxTier ? `Lv.${r.minTier}` : `Lv.${r.minTier}–${r.maxTier}`;
}
```

- [ ] **Step 4: 執行測試**

Run: `npx vitest run src/ui/picker-data.test.ts && npm run build`
Expected: PASS；build 成功

- [ ] **Step 5: Commit**

```bash
git add src/ui/picker-data.ts src/ui/picker-data.test.ts
git commit -m "feat(ui): derive spell and zone picker rows with tiers, effects and unlock text"
```

---

### Task 4: 通用 Picker 元件（按鈕＋彈出清單）

**Files:**
- Create: `src/ui/Picker.tsx`
- Create: `src/ui/Picker.test.tsx`
- Modify: `src/ui/App.css`（加 `.picker*` 樣式）

**Interfaces:**
- Produces:
  - `interface PickerItem { key: string; label: string; content: ReactNode; group?: string; disabled?: boolean; selected?: boolean }`（`label` 是 option 的無障礙名稱）
  - `Picker(props: { buttonLabel: string; buttonContent: ReactNode; items: PickerItem[]; onSelect: (key: string) => void; header?: ReactNode; align?: 'left' | 'right'; className?: string })`
  - 按鈕：`aria-haspopup="listbox"`、`aria-expanded`、`aria-label={buttonLabel}`；清單 `role="listbox"`；選項 `role="option"`、`aria-selected`、`aria-disabled`；group 標題 `role="presentation"`、class `picker-group`。

- [ ] **Step 1: 寫失敗的測試**

`src/ui/Picker.test.tsx`：

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Picker, type PickerItem } from './Picker';

afterEach(cleanup);

const ITEMS: PickerItem[] = [
  { key: 'a', label: 'Alpha', content: 'Alpha', group: 'G1', selected: true },
  { key: 'b', label: 'Beta', content: 'Beta', group: 'G1', disabled: true },
  { key: 'c', label: 'Gamma', content: 'Gamma', group: 'G2' },
];

function setup(items = ITEMS) {
  const onSelect = vi.fn();
  const utils = render(
    <div>
      <span>outside</span>
      <Picker buttonLabel="選擇" buttonContent="Alpha" items={items} onSelect={onSelect} header={<button type="button">排序</button>} />
    </div>,
  );
  const open = () => fireEvent.click(screen.getByRole('button', { name: '選擇' }));
  return { onSelect, open, ...utils };
}

describe('Picker', () => {
  it('is closed until the button is clicked, then lists options with group headings', () => {
    const { open } = setup();
    expect(screen.queryByRole('listbox')).toBeNull();
    open();
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('G1')).toBeTruthy();
    expect(screen.getByText('G2')).toBeTruthy();
    expect(screen.getByRole('button', { name: '選擇' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('selects an enabled option on click and closes', () => {
    const { open, onSelect } = setup();
    open();
    fireEvent.click(screen.getByRole('option', { name: 'Gamma' }));
    expect(onSelect).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ignores clicks on disabled options', () => {
    const { open, onSelect } = setup();
    open();
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('moves with arrow keys skipping disabled options and selects with Enter', () => {
    const { open, onSelect } = setup();
    open();
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('closes on Escape and on a pointer press outside, but not inside the header', () => {
    const { open } = setup();
    open();
    fireEvent.pointerDown(screen.getByRole('button', { name: '排序' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    open();
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('stays open with the same active option when items are re-rendered', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<Picker buttonLabel="選擇" buttonContent="x" items={ITEMS} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '選擇' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    rerender(<Picker buttonLabel="選擇" buttonContent="x" items={ITEMS.map((i) => ({ ...i }))} onSelect={onSelect} />);
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('c');
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/ui/Picker.test.tsx`
Expected: FAIL（找不到 `./Picker`）

- [ ] **Step 3: 實作**

`src/ui/Picker.tsx`：

```tsx
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface PickerItem {
  key: string;
  /** Accessible name of the option. */
  label: string;
  content: ReactNode;
  group?: string;
  disabled?: boolean;
  selected?: boolean;
}

/** Button + popup list. Used instead of a native <select> so each row can show tier / effects. */
export function Picker({
  buttonLabel,
  buttonContent,
  items,
  onSelect,
  header,
  align = 'left',
  className = '',
}: {
  buttonLabel: string;
  buttonContent: ReactNode;
  items: PickerItem[];
  onSelect: (key: string) => void;
  header?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const enabled = items.filter((i) => !i.disabled);

  const close = (focusButton: boolean): void => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  const toggle = (): void => {
    if (open) return close(false);
    const start = items.find((i) => i.selected && !i.disabled) ?? enabled[0];
    setActiveKey(start?.key ?? null);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choose = (item: PickerItem): void => {
    if (item.disabled) return;
    onSelect(item.key);
    close(true);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (enabled.length === 0) return;
      const i = enabled.findIndex((x) => x.key === activeKey);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = i < 0 ? 0 : (i + step + enabled.length) % enabled.length;
      setActiveKey(enabled[next]!.key);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = enabled.find((x) => x.key === activeKey);
      if (item) choose(item);
    }
  };

  let lastGroup: string | undefined;
  return (
    <div ref={rootRef} className={`picker ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className="picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={buttonLabel}
        onClick={toggle}
      >
        {buttonContent} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`picker-pop picker-pop-${align}`}>
          {header && <div className="picker-header">{header}</div>}
          <ul ref={listRef} role="listbox" tabIndex={-1} className="picker-list" aria-label={buttonLabel} onKeyDown={onKeyDown}>
            {items.map((item) => {
              const heading = item.group !== undefined && item.group !== lastGroup;
              lastGroup = item.group;
              return (
                <Fragment key={item.key}>
                  {heading && (
                    <li role="presentation" className="picker-group">
                      {item.group}
                    </li>
                  )}
                  <li
                    role="option"
                    aria-label={item.label}
                    aria-selected={Boolean(item.selected)}
                    aria-disabled={Boolean(item.disabled)}
                    className={`picker-option${item.key === activeKey ? ' active' : ''}${item.selected ? ' selected' : ''}`}
                    onClick={() => choose(item)}
                    onPointerEnter={() => !item.disabled && setActiveKey(item.key)}
                  >
                    {item.content}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
```

`src/ui/App.css` 檔尾加：

```css
.picker { position: relative; display: inline-block; min-width: 0; }
.picker-button { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.picker-pop { position: absolute; top: calc(100% + 4px); z-index: 50; width: 340px; max-width: calc(100vw - 32px); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); }
.picker-pop-left { left: 0; }
.picker-pop-right { right: 0; }
.picker-header { padding: 6px; border-bottom: 1px solid var(--line); display: flex; justify-content: flex-end; }
.picker-list { list-style: none; margin: 0; padding: 4px; max-height: 60vh; overflow-y: auto; outline: none; }
.picker-group { padding: 6px 8px 2px; color: var(--muted); font-size: 12px; }
.picker-option { padding: 8px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; }
.picker-option.active { background: #1f2531; }
.picker-option.selected { border-color: var(--gold); }
.picker-option[aria-disabled='true'] { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 4: 執行測試**

Run: `npx vitest run src/ui/Picker.test.tsx && npm run build`
Expected: PASS；build 成功

- [ ] **Step 5: Commit**

```bash
git add src/ui/Picker.tsx src/ui/Picker.test.tsx src/ui/App.css
git commit -m "feat(ui): add an accessible popup picker to replace native selects"
```

---

### Task 5: 元素表（屬性 × 階級）

**Files:**
- Create: `src/ui/ElementTable.tsx`
- Create: `src/ui/ElementTable.test.tsx`
- Modify: `src/ui/App.css`（加 `.element-table*`）

**Interfaces:**
- Consumes: `ELEMENT_LABEL`（Task 3 `src/ui/picker-data.ts`）；`itemName`（`src/ui/messages.ts`）；`ELEMENT_ORDER`、`MAX_ELEMENT_GRADE`、`elementItem`、`Inventory`、`ItemId`、`ElementId`（`src/engine/types.ts`）
- Produces:
  - `lowestUpgradableGrade(inv: Inventory, el: ElementId): number | null`
  - `ElementTable(props: { inventory: Inventory; onPick: (id: ItemId) => void; onUpgrade: (element: ElementId, grade: number) => void })`
  - 格子按鈕的無障礙名稱：`` `${itemName(id)} ×${n}` ``（例：`初階火 ×24`）；升階按鈕：`` `升階${ELEMENT_LABEL[el]}` ``（例：`升階火`）

- [ ] **Step 1: 寫失敗的測試**

`src/ui/ElementTable.test.tsx`：

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElementTable, lowestUpgradableGrade } from './ElementTable';

afterEach(cleanup);

const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('lowestUpgradableGrade', () => {
  it('picks the lowest grade with at least 3, never the top grade', () => {
    expect(lowestUpgradableGrade({ 'el:fire:1': 3, 'el:fire:2': 5 }, 'fire')).toBe(1);
    expect(lowestUpgradableGrade({ 'el:fire:1': 2, 'el:fire:2': 3 }, 'fire')).toBe(2);
    expect(lowestUpgradableGrade({ 'el:fire:3': 9 }, 'fire')).toBeNull();
    expect(lowestUpgradableGrade({}, 'fire')).toBeNull();
  });
});

describe('ElementTable', () => {
  it('renders every element × grade cell, dimming (disabling) empty ones', () => {
    render(<ElementTable inventory={{ 'el:fire:1': 24 }} onPick={() => {}} onUpgrade={() => {}} />);
    expect(btn('初階火 ×24').disabled).toBe(false);
    expect(btn('中階火 ×0').disabled).toBe(true);
    expect(btn('高階水 ×0').disabled).toBe(true);
    expect(screen.getAllByRole('row')).toHaveLength(7); // header + 5 elements + materials
  });

  it('picks the item when a cell is clicked', () => {
    const onPick = vi.fn();
    render(<ElementTable inventory={{ 'el:thunder:2': 3 }} onPick={onPick} onUpgrade={() => {}} />);
    fireEvent.click(btn('中階雷 ×3'));
    expect(onPick).toHaveBeenCalledWith('el:thunder:2');
  });

  it('enables 升階 only when some grade below the top has 3, and upgrades the lowest one', () => {
    const onUpgrade = vi.fn();
    render(<ElementTable inventory={{ 'el:fire:1': 3, 'el:fire:2': 3, 'el:wind:1': 2, 'el:water:3': 5 }} onPick={() => {}} onUpgrade={onUpgrade} />);
    expect(btn('升階風').disabled).toBe(true);
    expect(btn('升階水').disabled).toBe(true);
    fireEvent.click(btn('升階火'));
    expect(onUpgrade).toHaveBeenCalledWith('fire', 1);
  });

  it('always shows the mana crystal in the materials row', () => {
    const onPick = vi.fn();
    const { rerender } = render(<ElementTable inventory={{}} onPick={onPick} onUpgrade={() => {}} />);
    expect(btn('魔晶 ×0').disabled).toBe(true);
    rerender(<ElementTable inventory={{ 'mat:mana_crystal': 2 }} onPick={onPick} onUpgrade={() => {}} />);
    fireEvent.click(btn('魔晶 ×2'));
    expect(onPick).toHaveBeenCalledWith('mat:mana_crystal');
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/ui/ElementTable.test.tsx`
Expected: FAIL（找不到 `./ElementTable`）

- [ ] **Step 3: 實作**

`src/ui/ElementTable.tsx`：

```tsx
import { ELEMENT_ORDER, elementItem, MAX_ELEMENT_GRADE, type ElementId, type Inventory, type ItemId } from '../engine/types';
import { itemName } from './messages';
import { ELEMENT_LABEL } from './picker-data';

const GRADES = Array.from({ length: MAX_ELEMENT_GRADE }, (_, i) => i + 1);
const GRADE_LABEL = ['初階', '中階', '高階'];
const ALWAYS_SHOWN_MATERIALS: ItemId[] = ['mat:mana_crystal'];

export function lowestUpgradableGrade(inv: Inventory, el: ElementId): number | null {
  for (let g = 1; g < MAX_ELEMENT_GRADE; g++) if ((inv[elementItem(el, g)] ?? 0) >= 3) return g;
  return null;
}

function materialIds(inv: Inventory): ItemId[] {
  return [...new Set([...ALWAYS_SHOWN_MATERIALS, ...Object.keys(inv).filter((k) => k.startsWith('mat:'))])].sort();
}

/** One row per element, one column per grade. Empty cells stay in place so the table keeps its shape. */
export function ElementTable({
  inventory,
  onPick,
  onUpgrade,
}: {
  inventory: Inventory;
  onPick: (id: ItemId) => void;
  onUpgrade: (element: ElementId, grade: number) => void;
}) {
  return (
    <table className="element-table">
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">屬性</span></th>
          {GRADES.map((g) => (
            <th key={g} scope="col">{GRADE_LABEL[g - 1]}</th>
          ))}
          <th scope="col"><span className="sr-only">升階</span></th>
        </tr>
      </thead>
      <tbody>
        {ELEMENT_ORDER.map((el) => {
          const up = lowestUpgradableGrade(inventory, el);
          return (
            <tr key={el}>
              <th scope="row" className={`el-name el-${el}`}>{ELEMENT_LABEL[el]}</th>
              {GRADES.map((g) => {
                const id = elementItem(el, g);
                const n = inventory[id] ?? 0;
                return (
                  <td key={g}>
                    <button type="button" className="cell" disabled={n === 0} aria-label={`${itemName(id)} ×${n}`} onClick={() => onPick(id)}>
                      {n}
                    </button>
                  </td>
                );
              })}
              <td>
                <button
                  type="button"
                  className="upgrade"
                  disabled={up === null}
                  aria-label={`升階${ELEMENT_LABEL[el]}`}
                  onClick={() => {
                    if (up !== null) onUpgrade(el, up);
                  }}
                >
                  升階
                </button>
              </td>
            </tr>
          );
        })}
        <tr className="mat-row">
          <th scope="row">素材</th>
          <td colSpan={GRADES.length + 1}>
            {materialIds(inventory).map((id) => {
              const n = inventory[id] ?? 0;
              return (
                <button key={id} type="button" className="cell mat" disabled={n === 0} aria-label={`${itemName(id)} ×${n}`} onClick={() => onPick(id)}>
                  {itemName(id)} ×{n}
                </button>
              );
            })}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
```

`src/ui/App.css` 檔尾加：

```css
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.element-table { width: 100%; border-collapse: separate; border-spacing: 4px; table-layout: fixed; }
.element-table th { font-weight: 600; font-size: 13px; color: var(--muted); }
.element-table th.el-name { width: 2.5em; font-size: 16px; }
.element-table .el-fire { color: var(--fire); }
.element-table .el-wind { color: var(--wind); }
.element-table .el-thunder { color: var(--thunder); }
.element-table .el-earth { color: var(--earth); }
.element-table .el-water { color: var(--water); }
.element-table .cell { width: 100%; min-height: 40px; padding: 4px; font-variant-numeric: tabular-nums; }
.element-table .cell.mat { width: auto; margin-right: 4px; }
.element-table .upgrade { width: 100%; padding: 4px; color: var(--gold); border-color: var(--gold); font-size: 13px; }
.element-table .upgrade:disabled { color: var(--muted); border-color: var(--line); }
.element-table .mat-row td { text-align: left; }
```

- [ ] **Step 4: 執行測試**

Run: `npx vitest run src/ui/ElementTable.test.tsx && npm run build`
Expected: PASS；build 成功

- [ ] **Step 5: Commit**

```bash
git add src/ui/ElementTable.tsx src/ui/ElementTable.test.tsx src/ui/App.css
git commit -m "feat(ui): categorized element table with per-row upgrade"
```

---

### Task 6: 魔法／地點選擇器與頂列

**Files:**
- Create: `src/ui/pickers.tsx`
- Create: `src/ui/pickers.test.tsx`
- Create: `src/ui/TopBar.tsx`
- Create: `src/ui/TopBar.test.tsx`
- Modify: `src/ui/App.css`（加 `.topbar*`、`.spell-row*`、`.zone-row*`、`.only-*`）

**Interfaces:**
- Consumes: Task 3 的 `spellPickerGroups`、`zonePickerRows`、`zoneRegularTier`、`tierRangeLabel`、`PATTERN_LABEL`、`ZONE_STATUS_LABEL`、`SpellSort`；Task 4 的 `Picker`、`PickerItem`；Task 2 的 `useGameState`、`useRuntime`、`bossAlive`、`RuntimeStore`；`SaveErrorBanner`、`BOSS_HINT`；`COLORS`（`src/render/palette.ts`）
- Produces:
  - `SPELL_SORT_KEY = 'ig.spellSort'`、`readSpellSort(): SpellSort`、`writeSpellSort(s: SpellSort): void`
  - `SpellPicker(props: { game: GameState; data: GameData; sort: SpellSort; onSortChange: (s: SpellSort) => void; onEquip: (id: string) => void })`，按鈕名稱 `裝備魔法`
  - `ZonePicker(props: { game: GameState; data: GameData; onTravel: (id: string) => void })`，按鈕名稱 `選擇地點`
  - `TopBar(props: { runtime: RuntimeStore & Pick<GameRuntime, 'equip' | 'travel'>; data: GameData; status: ConnStatus })`

- [ ] **Step 1: 寫失敗的測試**

`src/ui/pickers.test.tsx`：

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState, type GameState } from '../engine/state';
import { readSpellSort, SPELL_SORT_KEY, SpellPicker, writeSpellSort, ZonePicker } from './pickers';
import { useState } from 'react';
import type { SpellSort } from './picker-data';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function game(patch: Partial<GameState> = {}): GameState {
  return { ...createInitialState(gameData), learned: ['mana_bolt', 'explosion', 'fireball', 'fire_whirl'], equipped: 'fireball', ...patch };
}

function Harness({ g, onEquip }: { g: GameState; onEquip: (id: string) => void }) {
  const [sort, setSort] = useState<SpellSort>('element');
  return <SpellPicker game={g} data={gameData} sort={sort} onSortChange={setSort} onEquip={onEquip} />;
}

const optionNames = () => screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'));

describe('SpellPicker', () => {
  it('shows name and tier on the button and grouped rows with tier, pattern and attack', () => {
    render(<Harness g={game()} onEquip={() => {}} />);
    const button = screen.getByRole('button', { name: '裝備魔法' });
    expect(button.textContent).toContain('火球術');
    expect(button.textContent).toContain('Lv.2');
    fireEvent.click(button);
    expect(optionNames()).toEqual(['魔力彈', '火球術', '爆炎', '火焰旋風']);
    const row = screen.getByRole('option', { name: '爆炎' });
    expect(row.textContent).toContain('Lv.5');
    expect(row.textContent).toContain('擴散');
    expect(row.textContent).toContain('攻 80');
  });

  it('shows the effect marks for the current zone', () => {
    render(<Harness g={game({ currentZone: 'mist_meadow' })} onEquip={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    expect(screen.getByRole('option', { name: '爆炎' }).textContent).toContain('掉落 56%');
    cleanup();
    render(<Harness g={game({ currentZone: 'ash_volcano' })} onEquip={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    expect(screen.getByRole('option', { name: '魔力彈' }).textContent).toContain('對魔王無效');
  });

  it('switches to tier order with the header toggle', () => {
    render(<Harness g={game()} onEquip={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    fireEvent.click(screen.getByRole('button', { name: /排序/ }));
    expect(optionNames()).toEqual(['火焰旋風', '爆炎', '火球術', '魔力彈']);
  });

  it('equips on click', () => {
    const onEquip = vi.fn();
    render(<Harness g={game()} onEquip={onEquip} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    fireEvent.click(screen.getByRole('option', { name: '爆炎' }));
    expect(onEquip).toHaveBeenCalledWith('explosion');
  });
});

describe('spell sort preference', () => {
  it('round-trips through localStorage and defaults to element', () => {
    expect(readSpellSort()).toBe('element');
    writeSpellSort('tier');
    expect(window.localStorage.getItem(SPELL_SORT_KEY)).toBe('tier');
    expect(readSpellSort()).toBe('tier');
  });

  it('falls back to the default when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readSpellSort()).toBe('element');
    spy.mockRestore();
  });
});

describe('ZonePicker', () => {
  const g = game({ currentZone: 'thunder_gorge', unlockedZones: ['mist_meadow', 'thunder_gorge'], defeatedBosses: ['mist_stag'] });

  it('shows the current zone and tier range on the button', () => {
    render(<ZonePicker game={g} data={gameData} onTravel={() => {}} />);
    const button = screen.getByRole('button', { name: '選擇地點' });
    expect(button.textContent).toContain('雷鳴峽谷');
    expect(button.textContent).toContain('Lv.3');
  });

  it('lists boss, status and unlock text; locked and current zones are not selectable', () => {
    const onTravel = vi.fn();
    render(<ZonePicker game={g} data={gameData} onTravel={onTravel} />);
    fireEvent.click(screen.getByRole('button', { name: '選擇地點' }));
    const locked = screen.getByRole('option', { name: '灰燼火山' });
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.textContent).toContain('擊敗暴風巨鵬後解鎖');
    expect(within(screen.getByRole('option', { name: '迷霧草原' })).getByText(/迷霧雄鹿/)).toBeTruthy();
    expect(screen.getByRole('option', { name: '迷霧草原' }).textContent).toContain('已擊敗魔王');
    fireEvent.click(locked);
    fireEvent.click(screen.getByRole('option', { name: '雷鳴峽谷' }));
    expect(onTravel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: '迷霧草原' }));
    expect(onTravel).toHaveBeenCalledWith('mist_meadow');
  });
});
```

`src/ui/TopBar.test.tsx`：

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { createInitialState, type GameState } from '../engine/state';
import type { GameRuntime, Snapshot } from '../game/runtime';
import { BOSS_HINT, SAVE_ERROR_MESSAGE } from './messages';
import { TopBar } from './TopBar';

afterEach(cleanup);

function runtime(game: GameState, battlePatch: Partial<Snapshot['battle']> = {}) {
  const snapshot: Snapshot = { game, battle: { ...createBattle(game.currentZone), ...battlePatch }, revision: 1, paused: false, synthPending: false };
  return { getSnapshot: () => snapshot, subscribe: () => () => {}, equip: vi.fn(), travel: vi.fn() } as unknown as GameRuntime;
}

describe('TopBar', () => {
  it('shows the zone picker, the equipped spell and the spell picker', () => {
    render(<TopBar runtime={runtime(createInitialState(gameData))} data={gameData} status="online" />);
    expect(screen.getByRole('button', { name: '選擇地點' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '裝備魔法' })).toBeTruthy();
    expect(screen.getAllByText(/魔力彈/).length).toBeGreaterThan(0);
  });

  it('shows the overlevel note and the stuck-boss hint', () => {
    const g = { ...createInitialState(gameData), currentZone: 'ash_volcano', unlockedZones: ['mist_meadow', 'thunder_gorge', 'ash_volcano'] };
    const boss = { uid: 1, defId: 'ash_dragon', hp: 1, maxHp: 1, x: 1, statuses: [] };
    render(<TopBar runtime={runtime(g, { bossActive: true, monsters: [boss] })} data={gameData} status="online" />);
    expect(screen.getByText(BOSS_HINT)).toBeTruthy();
    cleanup();
    const over = { ...createInitialState(gameData), learned: ['mana_bolt', 'explosion'], equipped: 'explosion' };
    render(<TopBar runtime={runtime(over)} data={gameData} status="online" />);
    expect(screen.getByText(/越級：掉落效益 56%/)).toBeTruthy();
  });

  it('shows the save error banner when the status is error', () => {
    render(<TopBar runtime={runtime(createInitialState(gameData))} data={gameData} status="error" />);
    expect(screen.getByRole('alert').textContent).toBe(SAVE_ERROR_MESSAGE);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/ui/pickers.test.tsx src/ui/TopBar.test.tsx`
Expected: FAIL（找不到 `./pickers`、`./TopBar`）

- [ ] **Step 3: 實作選擇器**

`src/ui/pickers.tsx`：

```tsx
import type { GameState } from '../engine/state';
import type { GameData } from '../engine/types';
import { COLORS } from '../render/palette';
import { Picker, type PickerItem } from './Picker';
import {
  PATTERN_LABEL,
  spellPickerGroups,
  tierRangeLabel,
  ZONE_STATUS_LABEL,
  zonePickerRows,
  type SpellRow,
  type SpellSort,
} from './picker-data';

export const SPELL_SORT_KEY = 'ig.spellSort';

export function readSpellSort(): SpellSort {
  try {
    return window.localStorage.getItem(SPELL_SORT_KEY) === 'tier' ? 'tier' : 'element';
  } catch {
    return 'element';
  }
}

export function writeSpellSort(sort: SpellSort): void {
  try {
    window.localStorage.setItem(SPELL_SORT_KEY, sort);
  } catch {
    /* ignore: the preference just won't persist */
  }
}

function Swatches({ row }: { row: SpellRow }) {
  const colors = row.elements.length > 0 ? row.elements.map((e) => COLORS.element[e]) : [COLORS.element.none];
  return (
    <span className="swatches" aria-hidden="true">
      {colors.map((c, i) => (
        <span key={i} className="swatch" style={{ background: c }} />
      ))}
    </span>
  );
}

export function SpellPicker({
  game,
  data,
  sort,
  onSortChange,
  onEquip,
}: {
  game: GameState;
  data: GameData;
  sort: SpellSort;
  onSortChange: (s: SpellSort) => void;
  onEquip: (id: string) => void;
}) {
  const groups = spellPickerGroups(game, data, sort);
  const equipped = data.spells[game.equipped];
  const items: PickerItem[] = groups.flatMap((g) =>
    g.rows.map((r) => ({
      key: r.id,
      label: r.name,
      group: sort === 'element' ? g.label : undefined,
      selected: r.equipped,
      content: (
        <div className="spell-row">
          <Swatches row={r} />
          <span className="spell-row-name">{r.name}</span>
          <span className="spell-row-tier">Lv.{r.tier}</span>
          <span className="muted">{PATTERN_LABEL[r.pattern]}</span>
          <span className="muted">攻 {r.attack}</span>
          {r.bossImmune && <span className="tag warn">對魔王無效</span>}
          {r.dropEfficiency < 1 && <span className="tag">掉落 {Math.round(r.dropEfficiency * 100)}%</span>}
        </div>
      ),
    })),
  );
  return (
    <Picker
      buttonLabel="裝備魔法"
      align="right"
      buttonContent={
        <>
          {equipped?.name ?? game.equipped} <span className="muted">Lv.{equipped?.tier ?? '-'}</span>
        </>
      }
      items={items}
      onSelect={onEquip}
      header={
        <button type="button" className="picker-sort" onClick={() => onSortChange(sort === 'element' ? 'tier' : 'element')}>
          排序：{sort === 'element' ? '依屬性' : '依階級'}
        </button>
      }
    />
  );
}

export function ZonePicker({ game, data, onTravel }: { game: GameState; data: GameData; onTravel: (id: string) => void }) {
  const rows = zonePickerRows(game, data);
  const current = rows.find((r) => r.status === 'current');
  const items: PickerItem[] = rows.map((r) => ({
    key: r.id,
    label: r.name,
    selected: r.status === 'current',
    disabled: r.status === 'current' || r.status === 'locked',
    content: (
      <div className="zone-row">
        <div>
          <span className="zone-row-name">{r.status === 'locked' ? '🔒 ' : ''}{r.name}</span>{' '}
          <span className="spell-row-tier">{tierRangeLabel(r)}</span>
        </div>
        <div className="muted">魔王 {r.bossName} Lv.{r.bossTier}</div>
        <div className={r.status === 'locked' ? 'muted' : 'zone-row-status'}>{r.lockText ?? ZONE_STATUS_LABEL[r.status]}</div>
      </div>
    ),
  }));
  return (
    <Picker
      buttonLabel="選擇地點"
      buttonContent={
        <>
          📍 {current?.name ?? game.currentZone} {current && <span className="muted">{tierRangeLabel(current)}</span>}
        </>
      }
      items={items}
      onSelect={onTravel}
    />
  );
}
```

- [ ] **Step 4: 實作頂列**

`src/ui/TopBar.tsx`：

```tsx
import { useState } from 'react';
import { canDamage, overlevelEfficiency } from '../engine/combat-rules';
import type { GameData } from '../engine/types';
import type { GameRuntime } from '../game/runtime';
import type { ConnStatus } from '../game/sync';
import { BOSS_HINT } from './messages';
import { zoneRegularTier, type SpellSort } from './picker-data';
import { readSpellSort, SpellPicker, writeSpellSort, ZonePicker } from './pickers';
import { SaveErrorBanner } from './SaveErrorBanner';
import { bossAlive, useGameState, useRuntime, type RuntimeStore } from './useGame';

export function TopBar({
  runtime,
  data,
  status,
}: {
  runtime: RuntimeStore & Pick<GameRuntime, 'equip' | 'travel'>;
  data: GameData;
  status: ConnStatus;
}) {
  const game = useGameState(runtime);
  const bossOnField = useRuntime(runtime, (s) => bossAlive(s, data));
  const [sort, setSort] = useState<SpellSort>(readSpellSort);

  const zone = data.zones.find((z) => z.id === game.currentZone);
  const spell = data.spells[game.equipped];
  const efficiency = spell && zone ? overlevelEfficiency(spell.tier, zoneRegularTier(zone, data)) : 1;
  const boss = zone ? data.monsters[zone.bossId] : undefined;
  const stuck = bossOnField && Boolean(boss) && !game.learned.some((id) => data.spells[id] && canDamage(data.spells[id]!, boss!));

  const changeSort = (s: SpellSort): void => {
    setSort(s);
    writeSpellSort(s);
  };

  return (
    <header className="topbar">
      <div className="topbar-row">
        <ZonePicker game={game} data={data} onTravel={(id) => runtime.travel(id)} />
        <span className="topbar-equipped only-wide">
          裝備：<b>{spell?.name ?? game.equipped}</b> <span className="muted">Lv.{spell?.tier ?? '-'}</span>
        </span>
        <div className="only-narrow topbar-spell">
          <SpellPicker game={game} data={data} sort={sort} onSortChange={changeSort} onEquip={(id) => runtime.equip(id)} />
        </div>
        {efficiency < 1 && <span className="hud-note">越級：掉落效益 {Math.round(efficiency * 100)}%</span>}
        {stuck && <span className="hud-note warn">{BOSS_HINT}</span>}
      </div>
      <SaveErrorBanner status={status} />
    </header>
  );
}
```

`src/ui/App.css` 檔尾加：

```css
.topbar { background: var(--panel); border-bottom: 1px solid var(--line); }
.topbar-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; padding: 6px 12px; }
.topbar-equipped { white-space: nowrap; }
.topbar-spell { margin-left: auto; }
.topbar .hud-note { margin: 0; }
.only-narrow { display: none; }
@media (max-width: 767px) {
  .only-narrow { display: block; }
  .only-wide { display: none; }
}
.spell-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.spell-row-name { font-weight: 600; }
.spell-row-tier { color: var(--gold); font-variant-numeric: tabular-nums; }
.swatches { display: inline-flex; gap: 2px; }
.swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.tag.warn { color: var(--fire); border-color: var(--fire); margin-left: 0; }
.spell-row .tag { margin-left: 0; }
.zone-row { display: flex; flex-direction: column; gap: 2px; }
.zone-row-name { font-weight: 600; }
.zone-row-status { color: var(--rune); font-size: 13px; }
.picker-sort { min-height: 32px; padding: 4px 10px; font-size: 13px; }
```

- [ ] **Step 5: 執行測試**

Run: `npx vitest run src/ui/pickers.test.tsx src/ui/TopBar.test.tsx && npm run build`
Expected: PASS；build 成功

- [ ] **Step 6: Commit**

```bash
git add src/ui/pickers.tsx src/ui/pickers.test.tsx src/ui/TopBar.tsx src/ui/TopBar.test.tsx src/ui/App.css
git commit -m "feat(ui): info-rich spell and zone pickers in a new top bar"
```

---

### Task 7: 新版面（拿掉分頁、殘卷線索提升、斷點）

**Files:**
- Modify: `src/ui/App.tsx`（整份重寫）
- Create: `src/ui/App.test.tsx`
- Modify: `src/ui/SynthesisPanel.tsx`（加 `hint` prop）
- Modify: `src/ui/GrimoirePanel.tsx`（`onHint`、移除內部 hint、`memo`）
- Modify: `src/ui/GrimoirePanel.test.tsx`
- Modify: `src/ui/App.css`（版面區塊）
- Delete: `src/ui/Hud.tsx`、`src/ui/ZonePanel.tsx`、`src/ui/ZonePanel.test.tsx`、`src/ui/InventoryBar.tsx`

**Interfaces:**
- Consumes: Task 2 的 `useGameState`、`useRuntime`、`useConnStatus`；Task 5 的 `ElementTable`；Task 6 的 `TopBar`；`SynthesisPanel`、`emptySlots`、`Slots`；`BattleCanvas`；`OfflineOverlay`
- Produces:
  - `SynthesisPanel` 新增 prop `hint?: string | null`，在合成訊息與嘗試紀錄之間顯示「殘卷線索」區（`aria-label="殘卷線索"`）
  - `GrimoirePanel` props：`{ runtime: RuntimeStore & Pick<GameRuntime, 'equip'>; onHint: (spellId: string | null) => void }`；點未學會的魔法 → `onHint(id)`；點已學會的魔法 → `onHint(null)` 並裝備
  - DOM 結構：`.app > .topbar + main.main > (.battle, .side > (section.workbench, section.grimoire-col))`

- [ ] **Step 1: 寫失敗的測試**

`src/ui/App.test.tsx`：

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import type { GameRuntime, Snapshot } from '../game/runtime';
import type { SyncController } from '../game/sync';
import { App } from './App';

vi.mock('./BattleCanvas', () => ({ BattleCanvas: () => null }));
afterEach(cleanup);

function setup(inventory: Record<string, number> = { 'el:fire:1': 3, 'el:wind:1': 1 }) {
  const game = { ...createInitialState(gameData), inventory };
  const snapshot: Snapshot = { game, battle: createBattle(game.currentZone), revision: 1, paused: false, synthPending: false };
  const runtime = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    equip: vi.fn(),
    travel: vi.fn(),
    upgrade: vi.fn(() => true),
  } as unknown as GameRuntime;
  const sync = { status: 'online', onStatus: () => () => {}, synthesize: vi.fn() } as unknown as SyncController;
  render(<App runtime={runtime} sync={sync} data={gameData} />);
  return { runtime };
}

const slotTexts = () =>
  screen.getAllByRole('button').filter((b) => b.classList.contains('slot')).map((b) => b.textContent);

describe('App layout', () => {
  it('has no synthesis / grimoire / map tabs', () => {
    setup();
    expect(screen.queryByRole('button', { name: '魔導書' })).toBeNull();
    expect(screen.queryByRole('button', { name: '地圖' })).toBeNull();
    expect(screen.getByRole('button', { name: '合成' })).toBeTruthy(); // the synth action button, not a tab
  });

  it('puts a clicked element cell into the first empty slot, then the next one', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    expect(slotTexts()).toEqual(['初階火', '空']);
    fireEvent.click(screen.getByRole('button', { name: '初階風 ×1' }));
    expect(slotTexts()).toEqual(['初階火', '初階風']);
  });

  it('keeps the slots when an element is upgraded', () => {
    const { runtime } = setup();
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '升階火' }));
    expect(runtime.upgrade).toHaveBeenCalledWith('fire', 1);
    expect(slotTexts()).toEqual(['初階火', '空']);
  });

  it('shows a locked spell hint next to the slots, and clears it when a learned spell is clicked', () => {
    setup();
    const hint = gameData.spells.fireball.hint;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${gameData.spells.fireball.name}（未學會）`) }));
    expect(screen.getByLabelText('殘卷線索').textContent).toContain(hint);
    fireEvent.click(screen.getByRole('button', { name: gameData.spells.mana_bolt.name }));
    expect(screen.queryByText(hint)).toBeNull();
  });
});
```

`src/ui/GrimoirePanel.test.tsx` 整份改成：

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import type { GameRuntime, Snapshot } from '../game/runtime';
import { GrimoirePanel } from './GrimoirePanel';

afterEach(cleanup);

function fakeRuntime() {
  const game = createInitialState(gameData);
  const snapshot: Snapshot = { game, battle: createBattle(game.currentZone), revision: 1, paused: false, synthPending: false };
  return { getSnapshot: () => snapshot, subscribe: () => () => {}, equip: vi.fn() };
}

describe('GrimoirePanel', () => {
  it('equips a learned spell on click and clears the hint', () => {
    const rt = fakeRuntime();
    const onHint = vi.fn();
    render(<GrimoirePanel runtime={rt as unknown as GameRuntime} onHint={onHint} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(gameData.spells.mana_bolt.name) }));
    expect(rt.equip).toHaveBeenCalledWith('mana_bolt');
    expect(onHint).toHaveBeenCalledWith(null);
  });

  it('reports the locked spell for its hint without equipping', () => {
    const rt = fakeRuntime();
    const onHint = vi.fn();
    render(<GrimoirePanel runtime={rt as unknown as GameRuntime} onHint={onHint} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(gameData.spells.fireball.name) }));
    expect(onHint).toHaveBeenCalledWith('fireball');
    expect(rt.equip).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/ui/App.test.tsx src/ui/GrimoirePanel.test.tsx`
Expected: FAIL（App 還有分頁、沒有元素表；GrimoirePanel 沒有 `onHint`）

- [ ] **Step 3: 修改 GrimoirePanel**

`src/ui/GrimoirePanel.tsx`：
- `import { memo, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';`
- 宣告改成 `export const GrimoirePanel = memo(function GrimoirePanel({ runtime, onHint }: { runtime: RuntimeStore & Pick<GameRuntime, 'equip'>; onHint: (spellId: string | null) => void }) {`，檔尾的 `}` 改成 `});`
- 刪除 `const [hint, setHint] = useState<string | null>(null);`
- `activate` 改成：

```tsx
  const activate = (id: string) => {
    if (learned.includes(id)) {
      onHint(null);
      runtime.equip(id);
    } else onHint(id);
  };
```

- 刪除 `<div className="grimoire-hint" role="status">{hint}</div>`。

- [ ] **Step 4: 修改 SynthesisPanel**

`src/ui/SynthesisPanel.tsx`：props 加 `hint = null` 與型別 `hint?: string | null;`。在 `<p className="synth-message" ...>` 之後、`<h3>嘗試紀錄</h3>` 之前插入：

```tsx
      <div className="synth-hint" aria-label="殘卷線索" aria-live="polite">
        {hint ?? <span className="muted">在魔導書點未學會的魔法，殘卷線索會顯示在這裡</span>}
      </div>
```

- [ ] **Step 5: 重寫 App**

`src/ui/App.tsx` 整份換成：

```tsx
import { useState } from 'react';
import type { GameData, ItemId } from '../engine/types';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import './App.css';
import { BattleCanvas } from './BattleCanvas';
import { ElementTable } from './ElementTable';
import { GrimoirePanel } from './GrimoirePanel';
import { OfflineOverlay } from './OfflineOverlay';
import { emptySlots, SynthesisPanel, type Slots } from './SynthesisPanel';
import { TopBar } from './TopBar';
import { useConnStatus, useGameState, useRuntime } from './useGame';

export function App({ runtime, sync, data }: { runtime: GameRuntime; sync: SyncController; data: GameData }) {
  const status = useConnStatus(sync);
  const game = useGameState(runtime);
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [hintId, setHintId] = useState<string | null>(null);

  const pick = (id: ItemId): void => {
    const i = slots.indexOf(null);
    if (i >= 0) setSlots(slots.map((s, j) => (j === i ? id : s)));
  };
  // The hint stays until another node is clicked or the spell is learned.
  const hint = hintId && !game.learned.includes(hintId) ? (data.spells[hintId]?.hint ?? null) : null;

  return (
    <div className="app">
      <TopBar runtime={runtime} data={data} status={status} />
      <main className="main">
        <div className="battle">
          <BattleCanvas runtime={runtime} />
        </div>
        <div className="side">
          <section className="workbench" aria-label="元素與合成">
            <ElementTable inventory={game.inventory} onPick={pick} onUpgrade={(el, g) => runtime.upgrade(el, g)} />
            <SynthesisPanel
              game={game}
              synthPending={synthPending}
              sync={sync}
              data={data}
              slots={slots}
              onSlotsChange={setSlots}
              hint={hint}
            />
          </section>
          <section className="grimoire-col" aria-label="魔導書">
            <GrimoirePanel runtime={runtime} onHint={setHintId} />
          </section>
        </div>
      </main>
      <OfflineOverlay status={status} />
    </div>
  );
}
```

- [ ] **Step 6: 刪除被取代的元件**

```bash
git rm src/ui/Hud.tsx src/ui/ZonePanel.tsx src/ui/ZonePanel.test.tsx src/ui/InventoryBar.tsx
```

- [ ] **Step 7: 版面 CSS**

`src/ui/App.css`：刪除舊的這些規則：`.app`、`.hud`、`.hud-row`、`.hud-zone`、`.hud-spell`、`.main`、`.battle`、`.side`、`.tabs`、`.tabs button`、`.tabs button.active`、`.tab-body`、`.zones*`、`.inventory`、`.item*`、整個 `@media (max-width: 767px) { .main ... }` 區塊、`.grimoire-hint`。保留 `.hud-note` 與 `.hud-note.warn`，但把 `margin-top: 4px;` 拿掉。接著加：

```css
/* Layout (R1): ≥1100 three columns · 768–1099 battle on top, panel in two columns · <768 stacked */
.app { display: flex; flex-direction: column; height: 100vh; }
.main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
.battle { position: relative; min-width: 0; min-height: 0; border-right: 1px solid var(--line); overflow: hidden; }
.side { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(300px, 1fr); min-width: 0; min-height: 0; }
.grimoire-col { order: 0; min-width: 0; min-height: 0; overflow-y: auto; padding: 12px; border-right: 1px solid var(--line); }
.workbench { order: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.synth-hint { min-height: 2.5em; padding: 8px; border: 1px dashed var(--line); border-radius: 6px; color: var(--gold); font-size: 14px; }

@media (max-width: 1099px) {
  .app { height: auto; min-height: 100vh; }
  .main { display: flex; flex-direction: column; }
  .battle { flex: 0 0 auto; height: 40vh; border-right: 0; border-bottom: 1px solid var(--line); }
  .side { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .grimoire-col, .workbench { overflow: visible; }
}

@media (max-width: 767px) {
  .battle { height: 25vh; min-height: 140px; }
  .side { display: flex; flex-direction: column; }
  .workbench { order: 0; }
  .grimoire-col { order: 1; border-right: 0; border-top: 1px solid var(--line); }
}
```

- [ ] **Step 8: 執行測試與 build**

Run: `npm test && npm run build`
Expected: 全部 PASS（包含 `tests/sim`）；build 成功

- [ ] **Step 9: 瀏覽器快速檢查（主控 session）**

`npm run dev`，在 1280 寬確認：三欄、沒有分頁、元素表在合成槽正上方、點元素放進合成槽、點未學會的魔法後線索出現在合成槽下方。截圖存在 scratchpad（不 commit）。

- [ ] **Step 10: Commit**

```bash
git add -A src/ui/
git commit -m "feat(ui): single-panel layout with grimoire beside the element table and synthesis"
```

---

### Task 8: 圓形戰場幾何（純函式）

**Files:**
- Create: `src/render/arena.ts`
- Create: `src/render/arena.test.ts`

**Interfaces:**
- Consumes: `Pt`（`src/render/effects.ts`）、`Rng`（`src/engine/rng.ts`）
- Produces:
  - `ENGINE_STOP_X = 0.15`、`STOP_GAP = 6`、`MIN_SEPARATION`（25° 的弧度）
  - `interface Arena { center: Pt; radius: number; w: number; h: number }`
  - `makeArena(w: number, h: number, maxMonsterR: number): Arena`：半徑 = `hypot(w / 2 + maxMonsterR, h / 2 + maxMonsterR) + 1`（R7）
  - `stopRadius(a: Arena, heroR: number, monsterR: number): number`
  - `monsterDistance(a: Arena, stop: number, x: number): number`
  - `polarPoint(a: Arena, angle: number, dist: number): Pt`
  - `angleGap(a: number, b: number): number`
  - `pickSpawnAngle(existing: number[], rng: Rng, tries?: number): number`
  - `clampToView(p: Pt, w: number, h: number, margin: number): Pt`

- [ ] **Step 1: 寫失敗的測試**

`src/render/arena.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../engine/rng';
import {
  angleGap,
  clampToView,
  ENGINE_STOP_X,
  makeArena,
  MIN_SEPARATION,
  monsterDistance,
  pickSpawnAngle,
  polarPoint,
  stopRadius,
  STOP_GAP,
} from './arena';

describe('makeArena', () => {
  it('centres the arena and sizes it past the view corners', () => {
    const a = makeArena(400, 300, 14);
    expect(a.center).toEqual({ x: 200, y: 150 });
    expect(a.radius).toBeCloseTo(Math.hypot(214, 164) + 1);
  });
});

describe('monster placement', () => {
  const views: [number, number][] = [[420, 700], [360, 170], [400, 400], [1280, 300]];

  it('spawns (x = 1) fully outside the view in every direction', () => {
    for (const [w, h] of views) {
      const r = 14;
      const a = makeArena(w, h, r);
      const stop = stopRadius(a, 19, r);
      for (let i = 0; i < 32; i++) {
        const p = polarPoint(a, (i / 32) * Math.PI * 2, monsterDistance(a, stop, 1));
        const outside = p.x - r >= w || p.x + r <= 0 || p.y - r >= h || p.y + r <= 0;
        expect(outside, `${w}x${h} angle ${i}`).toBe(true);
      }
    }
  });

  it('stops (x = 0.15) clear of the hero and fully inside the view when there is room', () => {
    for (const [w, h] of views) {
      for (const r of [14, 28]) {
        const a = makeArena(w, h, 28);
        const stop = stopRadius(a, 19, r);
        expect(monsterDistance(a, stop, ENGINE_STOP_X)).toBe(stop);
        expect(stop).toBeGreaterThanOrEqual(19 + r + STOP_GAP);
        if (19 + r + STOP_GAP <= Math.min(w, h) / 2 - r) expect(stop).toBeLessThanOrEqual(Math.min(w, h) / 2 - r);
      }
    }
  });

  it('prefers not overlapping the hero when the view is too small for both rules', () => {
    const a = makeArena(120, 60, 28);
    expect(stopRadius(a, 19, 28)).toBe(19 + 28 + STOP_GAP);
  });

  it('moves monotonically inward as x falls and clamps x outside [0.15, 1]', () => {
    const a = makeArena(400, 300, 14);
    const stop = stopRadius(a, 19, 14);
    expect(monsterDistance(a, stop, 0.5)).toBeLessThan(monsterDistance(a, stop, 0.8));
    expect(monsterDistance(a, stop, 0)).toBe(stop);
    expect(monsterDistance(a, stop, 2)).toBe(a.radius);
  });
});

describe('angles', () => {
  it('measures the shortest gap between two angles', () => {
    expect(angleGap(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2);
    expect(angleGap(0, Math.PI)).toBeCloseTo(Math.PI);
  });

  it('keeps new spawns at least 25° from existing monsters when there is room', () => {
    const existing = [0, 2, 4];
    for (let seed = 1; seed <= 50; seed++) {
      const angle = pickSpawnAngle(existing, createRng(seed));
      for (const e of existing) expect(angleGap(angle, e)).toBeGreaterThanOrEqual(MIN_SEPARATION);
    }
  });

  it('returns an angle in [0, 2π) even when the circle is crowded', () => {
    const crowded = Array.from({ length: 20 }, (_, i) => (i / 20) * Math.PI * 2);
    const angle = pickSpawnAngle(crowded, createRng(3));
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(Math.PI * 2);
  });
});

describe('clampToView', () => {
  it('pulls off-screen points inside the margin', () => {
    expect(clampToView({ x: -50, y: 900 }, 400, 300, 24)).toEqual({ x: 24, y: 276 });
    expect(clampToView({ x: 100, y: 100 }, 400, 300, 24)).toEqual({ x: 100, y: 100 });
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/render/arena.test.ts`
Expected: FAIL（找不到 `./arena`）

- [ ] **Step 3: 實作**

`src/render/arena.ts`：

```ts
import type { Rng } from '../engine/rng';
import type { Pt } from './effects';

/** The engine's stop distance (MonsterInstance.x); the view maps x ∈ [0.15, 1] onto [stop ring, arena edge]. */
export const ENGINE_STOP_X = 0.15;
export const STOP_GAP = 6;
export const MIN_SEPARATION = (25 * Math.PI) / 180;
const TAU = Math.PI * 2;

export interface Arena {
  center: Pt;
  radius: number;
  w: number;
  h: number;
}

/**
 * A true circle centred on the view. Its radius is the half-diagonal of the view grown by one monster radius
 * (+1px for rounding), so a monster at x = 1 is fully off-screen in every direction.
 */
export function makeArena(w: number, h: number, maxMonsterR: number): Arena {
  return { center: { x: w / 2, y: h / 2 }, radius: Math.hypot(w / 2 + maxMonsterR, h / 2 + maxMonsterR) + 1, w, h };
}

/**
 * Where a monster of visual radius `monsterR` stops. Never overlaps the hero; stays fully visible when the
 * view leaves room for that (otherwise not overlapping the hero wins).
 */
export function stopRadius(a: Arena, heroR: number, monsterR: number): number {
  const lo = heroR + monsterR + STOP_GAP;
  const hi = Math.min(a.w, a.h) / 2 - monsterR;
  return Math.max(lo, Math.min(hi, ENGINE_STOP_X * a.radius));
}

export function monsterDistance(a: Arena, stop: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - ENGINE_STOP_X) / (1 - ENGINE_STOP_X)));
  return stop + t * (a.radius - stop);
}

export function polarPoint(a: Arena, angle: number, dist: number): Pt {
  return { x: a.center.x + Math.cos(angle) * dist, y: a.center.y + Math.sin(angle) * dist };
}

export function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return Math.min(d, TAU - d);
}

const minGap = (c: number, existing: number[]): number =>
  existing.reduce((m, e) => Math.min(m, angleGap(c, e)), Number.POSITIVE_INFINITY);

/** Random angle at least MIN_SEPARATION away from `existing`; after `tries` misses, the widest gap found. */
export function pickSpawnAngle(existing: number[], rng: Rng, tries = 12): number {
  let best = rng.next() * TAU;
  let bestGap = minGap(best, existing);
  for (let i = 1; i < tries && bestGap < MIN_SEPARATION; i++) {
    const c = rng.next() * TAU;
    const g = minGap(c, existing);
    if (g > bestGap) {
      best = c;
      bestGap = g;
    }
  }
  return best;
}

export function clampToView(p: Pt, w: number, h: number, margin: number): Pt {
  return {
    x: Math.max(margin, Math.min(w - margin, p.x)),
    y: Math.max(margin, Math.min(h - margin, p.y)),
  };
}
```

- [ ] **Step 4: 執行測試**

Run: `npx vitest run src/render/arena.test.ts && npm run build`
Expected: PASS；build 成功

- [ ] **Step 5: Commit**

```bash
git add src/render/arena.ts src/render/arena.test.ts
git commit -m "feat(render): circular arena geometry with off-screen spawns and a safe stop ring"
```

---

### Task 9: BattleView 改成圓形戰場

**Files:**
- Modify: `src/render/battle-view.ts`

**Interfaces:**
- Consumes: Task 8 的 `makeArena`、`stopRadius`、`monsterDistance`、`polarPoint`、`pickSpawnAngle`、`clampToView`、`Arena`
- Produces: 對外 API 不變（`constructor`、`onFrame`、`sync`、`handle`、`destroy`）。

Pixi 在 jsdom 中無法執行，所以這個任務的正確性用 Task 8 的幾何測試、build，以及瀏覽器截圖驗證。

- [ ] **Step 1: 常數與欄位**

在 `src/render/battle-view.ts`：
- import 加 `import { clampToView, makeArena, monsterDistance, pickSpawnAngle, polarPoint, stopRadius, type Arena } from './arena';`
- 刪除 `HERO_X`、`RIGHT_MARGIN`、`GROUND_Y`，加上：

```ts
const IMMUNE_FONT_PX = 16; // fixed, readable at any arena size (spec 4.3)
const TEXT_MARGIN = 24;
```

- `MonsterView` 加 `angle: number;` 與 `r: number;`（目前畫面上的半徑）。
- class 欄位加 `private arena: Arena = makeArena(1, 1, 0);` 與 `private ring = new Graphics();`、`private ringKey = '';`
- 刪除 `groundY`、`heroX` getter；`heroCenter` 改成：

```ts
  private get heroCenter(): Pt {
    return this.arena.center;
  }
```

- `init()` 中 `this.app.stage.addChild(this.world, this.fxLayer);` 之後加 `this.world.addChild(this.ring);`（在 hero 之前加入，畫在最底層）。

- [ ] **Step 2: 置中錨點的小人與怪物**

`makeHero()`：Sprite 改成 `s.anchor.set(0.5);`；Graphics 改成

```ts
    const g = new Graphics();
    g.rect(-HERO_W / 2, -HERO_H / 2, HERO_W, HERO_H).fill(COLORS.rune);
    g.rect(-HERO_W / 2 + 4, -HERO_H / 2 + 8, 4, 4).fill(COLORS.bg);
    g.rect(HERO_W / 2 - 8, -HERO_H / 2 + 8, 4, 4).fill(COLORS.bg);
    return g;
```

`makeMonster(m)`：Sprite 改成 `anchor.set(0.5)`；Graphics 改成

```ts
      g.rect(-size / 2, -size / 2, size, size).fill(color);
      g.rect(-size / 2 + size * 0.2, -size * 0.2, size * 0.15, size * 0.15).fill(COLORS.bg);
      g.rect(size / 2 - size * 0.35, -size * 0.2, size * 0.15, size * 0.15).fill(COLORS.bg);
```

回傳值改成（角度與現存怪物錯開，R4）：

```ts
    const angle = pickSpawnAngle([...this.monsters.values()].map((v) => v.angle), this.rng);
    return { root, body, hpBar, fx, size, born: this.time, pos: { x: 0, y: 0 }, angle, r: size / 2 };
```

`drawHp`：兩個 `rect` 的 y 從 `-v.size - 9` 改成 `-v.size / 2 - 9`。

`drawStatus`：`burn` 的 `g.rect(-s / 2, -s, s, s)` 改成 `g.rect(-s / 2, -s / 2, s, s)`；`paralyze` 的路徑改成 `jaggedPath({ x: -s / 2, y: -s / 2 }, { x: s / 2, y: s / 2 }, ...)`；`freeze` 改成 `g.rect(-s / 2 - 2, -s / 2 - 2, s + 4, s + 4)` 與 `g.rect(-s / 2, -s / 2, s, s)`。

- [ ] **Step 3: `sync()` 改用圓形幾何**

整個 `sync` 換成：

```ts
  sync(snapshot: Snapshot): void {
    if (!this.ready_ || this.destroyed) return;
    this.unit = Math.max(0.6, Math.min(1.6, Math.min(this.w, this.h) / 360));
    const u = this.unit;
    const heroR = (HERO_H / 2) * u;
    this.arena = makeArena(this.w, this.h, MONSTER_SIZE * u); // boss radius = MONSTER_SIZE (2× size / 2)
    const c = this.arena.center;
    this.hero!.position.set(c.x, c.y);
    this.hero!.scale.set(u);
    this.drawRing(heroR);

    const alive = new Set<number>();
    for (const m of snapshot.battle.monsters) {
      alive.add(m.uid);
      let v = this.monsters.get(m.uid);
      if (!v) {
        v = this.makeMonster(m);
        this.monsters.set(m.uid, v);
      }
      v.r = (v.size / 2) * u;
      const dist = monsterDistance(this.arena, stopRadius(this.arena, heroR, v.r), m.x);
      v.pos = polarPoint(this.arena, v.angle, dist);
      const pop = Math.min(1, (this.time - v.born) / 200);
      v.root.position.set(v.pos.x, v.pos.y);
      v.root.scale.set(u * (0.4 + 0.6 * pop));
      v.root.alpha = pop;
      this.drawHp(v, m);
      this.drawStatus(v, m);
    }
    // uids restart at 1 after travel / reload, so drop views (and their angles) that left the field
    for (const [uid, v] of this.monsters) {
      if (!alive.has(uid)) {
        v.root.destroy({ children: true });
        this.monsters.delete(uid);
      }
    }
  }

  /** Faint ring where regular monsters stop; redrawn only when the view size changes. */
  private drawRing(heroR: number): void {
    const key = `${this.w}x${this.h}x${this.unit}`;
    if (key === this.ringKey) return;
    this.ringKey = key;
    const r = stopRadius(this.arena, heroR, (MONSTER_SIZE / 2) * this.unit);
    this.ring.clear();
    this.ring.circle(this.arena.center.x, this.arena.center.y, r).stroke({ width: 1, color: COLORS.rune, alpha: 0.18 });
  }
```

- [ ] **Step 4: 命中浮字與 beam 分支**

`handle()` 的 `'hit'` 分支改成：

```ts
        case 'hit': {
          const v = this.monsters.get(e.uid);
          if (!v) break;
          const ft = floatingText(e);
          this.floatText(ft.text, ft.color, v.pos.x, v.pos.y - v.r * 1.2, e.immune);
          if (!e.immune) this.burst(v.pos, COLORS.amber, 5);
          break;
        }
```

`floatText` 換成（「無效」固定大小、位置夾在畫面內，讓畫面外的目標也看得到結果）：

```ts
  private floatText(text: string, color: string, x: number, y: number, fixedSize = false): void {
    const fontSize = fixedSize ? IMMUNE_FONT_PX : 16 * this.unit;
    const t = new Text({ text, style: { fill: color, fontSize, fontWeight: 'bold', stroke: { color: '#000000', width: 3 } } });
    const at = clampToView({ x, y }, this.w, this.h, TEXT_MARGIN);
    t.anchor.set(0.5, 1);
    t.position.set(at.x, at.y);
    this.addEffect(t, TEXT_MS, (p) => {
      t.y = at.y - 28 * this.unit * p;
      t.alpha = 1 - p;
    });
  }
```

`castEffect` 的 `'beam'` 分支：把 `for (const to of pts) {` 改成 `pts.forEach((to, i) => {`，結尾的 `}` 改成 `});`。Graphics 版改成（R5）：

```ts
            const g = new Graphics();
            const main = i === 0;
            g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: (main ? 5 : 2.5) * u, color });
            if (main) g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: 2 * u, color: '#ffffff' });
            node = g;
```

Sprite 版在 `spr.rotation = ang;` 後加 `if (i > 0) spr.height *= 0.5;`。

- [ ] **Step 5: 執行測試與 build**

Run: `npm test && npm run build`
Expected: 全部 PASS；build 成功

- [ ] **Step 6: 瀏覽器檢查（主控 session）**

`npm run dev`，在 1280 與 360 寬各截一張圖，確認：
- 小人在戰鬥畫面中心
- 怪物從四面八方（包含畫面外）走進來
- 停在淡淡的停止圈上，不壓到小人
- 魔王（2 倍大）也不壓到小人

接著換到另一個地點（用頂列的地點選擇器），確認新怪物的角度是重新隨機的。截圖存在 scratchpad。

- [ ] **Step 7: Commit**

```bash
git add src/render/battle-view.ts
git commit -m "feat(render): circular battlefield with the hero at the centre"
```

---

### Task 10: 戰鬥畫面的重畫優化

**Files:**
- Modify: `src/render/battle-view.ts`

**Interfaces:**
- Consumes: Task 9 的 `BattleView`
- Produces: 對外 API 不變。`MonsterView` 新增 `lastFrac: number`、`hadStatus: boolean`。

- [ ] **Step 1: 血條只在血量改變時重畫**

`MonsterView` 加 `lastFrac: number;` 與 `hadStatus: boolean;`；`makeMonster` 的回傳值加 `lastFrac: -1, hadStatus: false`。`drawHp` 換成：

```ts
  private drawHp(v: MonsterView, m: MonsterInstance): void {
    const frac = Math.max(0, Math.min(1, m.hp / m.maxHp));
    if (frac === v.lastFrac) return;
    v.lastFrac = frac;
    const w = Math.max(24, v.size);
    v.hpBar.clear();
    v.hpBar.rect(-w / 2, -v.size / 2 - 9, w, 4).fill('#3a2a2a');
    v.hpBar.rect(-w / 2, -v.size / 2 - 9, w * frac, 4).fill(frac > 0.35 ? COLORS.rune : '#e2643b');
  }
```

- [ ] **Step 2: 沒有狀態時不清除、不重設**

`drawStatus` 開頭改成：

```ts
  private drawStatus(v: MonsterView, m: MonsterInstance): void {
    if (m.statuses.length === 0 && !v.hadStatus) return;
    v.hadStatus = m.statuses.length > 0;
    const g = v.fx;
    g.clear();
    // ...其餘不變
```

- [ ] **Step 3: 傷害數字改用 BitmapText**

import 加 `BitmapFont, BitmapText`。檔案頂端加：

```ts
const DMG_FONT = 'ig-dmg';
let dmgFontInstalled = false;
function ensureDamageFont(): void {
  if (dmgFontInstalled) return;
  BitmapFont.install({
    name: DMG_FONT,
    style: { fontFamily: 'system-ui, sans-serif', fontSize: 32, fontWeight: 'bold', fill: '#ffffff', stroke: { color: '#000000', width: 4 } },
    chars: [['0', '9']],
    resolution: 2,
  });
  dmgFontInstalled = true;
}
```

在 `init()` 的 `this.ready_ = true;` 之前呼叫 `ensureDamageFont();`。

`floatText` 換成（數字用 BitmapText，「無效」仍用 Text，因為 Pixi 會以內容當 key 快取它的貼圖）：

```ts
  private floatText(text: string, color: string, x: number, y: number, fixedSize = false): void {
    const fontSize = fixedSize ? IMMUNE_FONT_PX : 16 * this.unit;
    const t = /^\d+$/.test(text)
      ? new BitmapText({ text, style: { fontFamily: DMG_FONT, fontSize } })
      : new Text({ text, style: { fill: color, fontSize, fontWeight: 'bold', stroke: { color: '#000000', width: 3 } } });
    const at = clampToView({ x, y }, this.w, this.h, TEXT_MARGIN);
    t.anchor.set(0.5, 1);
    t.position.set(at.x, at.y);
    this.addEffect(t, TEXT_MS, (p) => {
      t.y = at.y - 28 * this.unit * p;
      t.alpha = 1 - p;
    });
  }
```

- [ ] **Step 4: 執行測試與 build**

Run: `npm test && npm run build`
Expected: 全部 PASS；build 成功

- [ ] **Step 5: 瀏覽器檢查（主控 session）**

`npm run dev`，確認以下都正常顯示：
- 傷害數字（白色粗體、黑邊）
- 「無效」
- 血條會減少
- 燃燒、麻痺、冰凍的特效會出現與消失

- [ ] **Step 6: Commit**

```bash
git add src/render/battle-view.ts
git commit -m "perf(render): redraw hp/status only on change and use bitmap text for damage numbers"
```

---

### Task 11: 畫面驗收、量測修改後數據、文件更新

**Files:**
- Modify: `docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/perf-report.md`
- Modify: `docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/progress.md`
- Modify: `AGENTS.md`（第 3 節「目前狀態」、第 5 節架構地圖、第 10 節交接紀錄）

**Interfaces:**
- Consumes: Task 1 的 PerfMeter 文字格式

- [ ] **Step 1: 全部測試與 build**

Run: `npm test && npm run build`
Expected: 全部 PASS（記下檔案數與測試數）

- [ ] **Step 2: 修改後的量測**

用和 Task 1 Step 6 相同的方法：1280 寬，戰鬥 20 秒後取 10 筆。版面已經沒有分頁，所以第二個情境改成「連續合成」：在元素表點兩格、按合成，重複 5 次，期間取 10 筆。填進 `perf-report.md` 的「修改後」一節，並寫上和基準的比較，以及是否達到規格 5.4 的驗收標準（接近 60fps、沒有超過 50ms 的長任務、React commit/s 遠低於 20）。沒達標的項目要照實寫出來。

- [ ] **Step 3: 三種寬度的畫面驗收（主控 session）**

分別在 1280、768、360 寬：
1. 執行 `document.documentElement.scrollWidth <= window.innerWidth`，必須是 `true`。
2. 打開地點選擇器與魔法選擇器（360 寬時魔法選擇器在頂列），確認清單完整留在畫面內。
3. 從魔導書點一個未學會的魔法 → 線索出現在合成槽下方 → 點兩格元素 → 按合成。整個流程不需要切分頁。
4. 截圖。

最後在 DevTools 切 Offline（用 javascript_tool 無法切換時，請使用者手動做），確認斷線遮罩出現、恢復後繼續。把結果記在帳本。

- [ ] **Step 4: 更新文件**

- `progress.md`：每個任務一行 `Task N: complete (commits a..b)`，以及驗收結果與截圖說明。
- `AGENTS.md` 第 3 節：待辦第 0 項改成已完成並指向本計畫與帳本，測試數字更新；第 5 節 `src/ui/` 那一行改成「React 介面：TopBar（地點／魔法選擇器）、ElementTable、SynthesisPanel、GrimoirePanel、OfflineOverlay、開發用 PerfMeter」，`src/render/` 那一行加上「arena.ts 圓形戰場幾何」；第 10 節最上方新增一筆交接紀錄（日期、做了什麼、停在哪裡、下一步：使用者試玩新版面 → 部署 → 合併）。並註明 R9（排序偏好存在 localStorage）。

- [ ] **Step 5: Commit**

```bash
git add docs/ AGENTS.md
git commit -m "docs: record playtest-fix acceptance, perf results and handoff"
```
