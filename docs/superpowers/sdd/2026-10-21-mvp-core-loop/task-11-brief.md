### Task 11：Pixi 戰鬥畫面（佔位圖 + 選用貼圖）

**Files:**
- Create: `src/render/palette.ts`, `src/render/assets.ts`, `src/render/effects.ts`, `src/render/battle-view.ts`, `src/ui/BattleCanvas.tsx`
- Test: `src/render/effects.test.ts`

**Interfaces:**
- Produces：
```ts
export const COLORS: { bg: string; rune: string; amber: string; element: Record<ElementId | 'none', string> };
export function spellColor(spell: SpellDef): string;
export const ASSET_KEYS: string[];   // 'hero_idle', 'monster_<id>', 'fx_<pattern>'…
export function loadOptionalTextures(baseUrl: string): Promise<Map<string, Texture>>; // 個別載入失敗就忽略
export function jaggedPath(from: Pt, to: Pt, segments: number, rng: Rng): Pt[];
export function floatingText(hit: { damage: number; immune: boolean }): { text: string; color: string };
export class BattleView { constructor(host: HTMLElement, data: GameData, textures: Map<string, Texture>);
  sync(snapshot: Snapshot): void; handle(events: BattleEvent[]): void; destroy(): void }
```

- [ ] **Step 1：寫失敗的測試**
  - `jaggedPath`：起點和終點與輸入相同，長度為 `segments + 1`。
  - `floatingText`：`immune` 時文字是 `'無效'`；`{damage:12}` 時文字是 `'12'`。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：實作。**
  - 小人：符文綠的方塊人，放在畫面左側約 20% 的位置。
  - 魔物：依屬性上色的方塊，上方有血條；魔王的大小是一般魔物的 2 倍。
  - 施法特效：
    - `bolt`：粒子彈。
    - `beam`：光束，0.2 秒內淡出。
    - `chain`：用 `jaggedPath` 一段一段串起來。
    - `nova`：擴散的環。
  - 命中：噴出粒子，並顯示 `floatingText`。
  - 狀態外觀：burn 是橘色閃爍，paralyze 是黃色電弧，freeze 是藍白色外框。
  - 貼圖：有貼圖就用 Sprite，沒有就用 Graphics 畫。
- [ ] **Step 4：** 執行 `npm test`，預期 PASS。
- [ ] **Step 5：** 執行 `npm run dev`，截圖確認：魔物會生成、被打倒時有特效、在第 2 區會出現「無效」、閃電術會連鎖。
- [ ] **Step 6：Commit**：`feat(render): pixi battle view with placeholder shapes and effects`

---

