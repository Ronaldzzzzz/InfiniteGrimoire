### Task 12：React 介面（入門、斷線、HUD、背包、地點、合成）

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/App.css`, `src/ui/useGame.ts`, `src/ui/messages.ts`, `src/ui/Onboarding.tsx`, `src/ui/OfflineOverlay.tsx`, `src/ui/Hud.tsx`, `src/ui/InventoryBar.tsx`, `src/ui/ZonePanel.tsx`, `src/ui/SynthesisPanel.tsx`
- Modify: `src/main.tsx`
- Test: `src/ui/SynthesisPanel.test.tsx`, `src/ui/messages.test.ts`, `src/ui/Onboarding.test.tsx`

**Interfaces:**
- Consumes：`GameRuntime`、`SyncController`、`ApiClient`、`readToken`、`writeToken`。
- Produces：
  - `useGame(runtime): Snapshot`
  - `synthMessage(result: SynthResult, data: GameData): string`，文字固定如下：
    - learned：`習得新魔法：${name}`
    - duplicate：`已習得 ${name}，退還部分元素`
    - noReaction：`沒有反應……材料損耗了一部分`
    - knownNoReaction：`這個組合沒有反應`
    - dormant：`似乎還缺少什麼……`
    - rejected/insufficient：`材料不足`
    - rejected/slots：`請放入兩個素材`

**`main.tsx` 的開機流程：**
1. 用 `readToken` 讀取權杖。
2. 沒有權杖時，顯示 `<Onboarding>` 讓玩家輸入顯示名稱，接著 `createGuest` → `writeToken`。
3. 有權杖時，呼叫 `loadSave`。
4. 建立 `GameRuntime` 和 `SyncController`，呼叫 `startLoop`，然後 render `<App>`。

**例外情況：**
- 開機時 `NetworkError`：顯示「需要連線才能遊玩」和「重試」按鈕。
- 收到 401：清掉權杖，回到 `Onboarding`。

**畫面元件：**
- **`OfflineOverlay`：** `status === 'offline'` 時蓋在整個畫面上，顯示「連線中斷，正在重新連線…」。
- **版面：**
  - 桌面（≥ 768px）：上方 HUD；中間左邊是戰鬥畫面，右邊是分頁（合成 / 魔導書 / 地圖）；下方是背包列。
  - 手機（< 768px）：直式排列，戰鬥畫面高 45vh。
- **HUD：** 地點、階級、裝備中的魔法；越級時顯示 `越級：掉落效益 75%`，數字由 `overlevelEfficiency` 算出。
- **背包列：** 點物品就放進第一個空的合成槽；數量 ≥ 3 而且還沒到最高階的元素，旁邊顯示「升階」按鈕。
- **合成面板：**
  - 兩個合成槽，點槽位可以移除裡面的物品。
  - 「合成」按鈕只有在兩格都填滿、背包數量足夠、而且沒有合成進行中時才能按。
  - 合成透過 `sync.synthesize` 進行，等待中顯示「嬗變中…」。
  - 嘗試紀錄：列出每個組合的嘗試次數，以及每種結果的出現頻率百分比；無反應的組合標示「無反應」。
- **地點面板：** 已解鎖的地點可以點擊前往；未解鎖的地點顯示鎖頭並停用。

- [ ] **Step 1：寫失敗的測試**
  - `synthMessage`：每種結果一個案例，文字完全相同。
  - `SynthesisPanel`：
    - 填滿兩格後按鈕可以按；
    - 只填一格時按鈕停用；
    - 背包只有 1 個 `el:fire:1` 卻點了兩次時，按鈕停用；
    - `synthPending` 時按鈕停用；
    - 按下按鈕後，以排序過的 inputs 呼叫 `sync.synthesize`，並顯示回傳的訊息。
  - `Onboarding`：名稱空白或超過 16 字時不送出；合法名稱會呼叫 `createGuest`。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行 `npm test`，預期 PASS。
- [ ] **Step 5：** 執行 `npm run dev`，在 1280px 和 360px 兩種寬度下確認沒有橫向捲軸，並完成「取名 → 打怪 → 合成雷電術 → 裝備」。接著在 DevTools 把網路切成 Offline，確認斷線遮罩出現；切回 Online 後遊戲恢復。
- [ ] **Step 6：Commit**：`feat(ui): onboarding, offline overlay, hud, inventory, zones and synthesis`

---

