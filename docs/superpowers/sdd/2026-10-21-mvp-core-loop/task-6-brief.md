### Task 6：存檔序列化

**Files:**
- Create: `src/engine/save.ts`
- Test: `src/engine/save.test.ts`

**Interfaces:**
- Produces：
  - `serialize(state: GameState): string`
  - `parseState(input: unknown, data: GameData): GameState | null`：用 zod 檢查結構，`version` 不是 1 時回傳 null；不認識的魔法或地點 id 視為無效，回傳 null。伺服器會用它解析上傳的存檔，所以這裡**不做濾除修補**，有問題就整份拒絕。

- [ ] **Step 1：寫失敗的測試**
  - `roundtrip`：`parseState(JSON.parse(serialize(s)))` 和 `s` 深度相等。
  - `rejects wrong version`
  - `rejects non-object / missing fields`
  - `rejects unknown spell id in learned`
  - `rejects negative or non-integer inventory counts`
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(engine): versioned save parsing`

---

