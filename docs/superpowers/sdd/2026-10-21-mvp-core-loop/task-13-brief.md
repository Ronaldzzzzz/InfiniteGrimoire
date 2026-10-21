### Task 13：魔導書面板（五屬扇形 SVG）

**Files:**
- Create: `src/ui/grimoire-layout.ts`, `src/ui/GrimoirePanel.tsx`
- Test: `src/ui/grimoire-layout.test.ts`, `src/ui/GrimoirePanel.test.tsx`

**Interfaces:**
- Produces：`layoutGrimoire(spells: SpellDef[]): { nodes: { spellId: string; x: number; y: number }[]; edges: { from: string; to: string }[] }`。中心是 (0, 0)，正上方是 0°。

**位置規則：**
- 屬性 i 的扇形中心角度為 `i × 72°`。
- `ring` 對應半徑 `[0, 120, 185, 250]`，角度再加上 `offset × 14°`。
- 混合魔法放在兩個相鄰屬性的交界：取順時針方向較前面的屬性 i，角度為 `i × 72 + 36`，半徑 215。
- 每個前置魔法都畫一條邊連到它的後續魔法。

**互動：**
- 已學會的節點：實心。點一下就裝備；裝備中的節點加上琥珀金外框。
- 未學會的節點：只有外框。點一下顯示殘卷提示（`hint`）。
- 支援縮放和平移：滾輪、拖曳、雙指，或縮放按鈕。
- 五芒星區域只畫一層霧，第一版不放節點。

- [ ] **Step 1：寫失敗的測試**
  - `mana_bolt` 在 (0, 0)。
  - `fireball` 約在 (0, −120)。
  - `steam_burst` 的角度約 324°，半徑 215。
  - `fire_whirl` 的角度約 36°。
  - 邊包含 `flame_burst → fire_whirl` 和 `whirlwind → fire_whirl`。
  - `GrimoirePanel`：點已學會的節點會呼叫 `runtime.equip`；點未學會的節點會顯示 `hint`。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行 `npm test`，預期 PASS。
- [ ] **Step 5：Commit**：`feat(ui): radial grimoire panel with hybrid boundary nodes`

---

