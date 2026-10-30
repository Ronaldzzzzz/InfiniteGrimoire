# 無限魔導書 Infinite Grimoire

極簡像素風的聯網放置合成遊戲。魔法師在畫面下方的橫向長帶上一路往右走、遇到魔物就停下自動施放法術迎擊成群魔物，玩家透過收集五屬元素、在合成台推演與融合更高階的魔法，逐步揭開魔導書迷霧並推進區域與魔王。

## 目前已實裝系統

- **線上即時推進與伺服器防作弊（Cloudflare Workers + D1）**
  - 斷線時遊戲暫停，恢復連線後繼續。
  - 離線收益：遊戲不是使用中的視窗滿 10 秒（點了別的視窗、切分頁、縮小）就凍結戰鬥並顯示「離線中」，或整個關掉；回來時由伺服器以每 30 秒一個 tick 結算（刷最遠已通過的小怪關、5 折、上限 8 小時），並以卡片顯示收穫。
  - 伺服器為唯一真實來源（合成伺服器擲骰、錨點時間窗收益稽核），防止客戶端竄改存檔與免費重擲。
- **橫向戰鬥帶、關卡與成群魔物戰鬥**
  - 每個地點 10 關（前 9 關小怪關、第 10 關魔王關，魔王關限時 180 秒、遇到魔王才開始倒數，失敗退回前一關）；打完一關由伺服器結算約兩倍的戰利品，可勾選「自動前進」，魔王關要按「進入魔王關」。
  - 魔物從右緣成波走向左邊的小人，支援多種魔法施法形態（單體、穿透光束、連鎖、範圍轟炸、新星爆發、召喚／天災等）與狀態效果（燃燒 DoT、緩速、麻痺、凍結、擊退、破甲、過載等）。
  - 實裝傷害門檻、越級掉落遞減、屬性相剋（最多 ±10%），以及戰鬥畫面左上角的近 10 秒實際傷害 DPS 統計。
- **五屬元素與五階升階**
  - 火、風、雷、土、水五大屬性，共分五階（初階／中階／高階／極階／神階），可於元素表直接點擊箭頭升階（成本 3／5／10／20）。
- **方形合成台（Synthesis Altar）與雙軌魔法體系**
  - **名魔法**：依循配方合成（含同元素強化、跨屬性魔法融合、特殊素材合成），各元素與魔法具備專屬合成台粒子特效。
  - **自創魔法（Crafted Spells）**：任意兩個未命中固定配方的元素或魔法皆可合成自創魔法，依輸入組合計算相性、混合特性與深度上限，收錄於魔法筆記。
- **魔導書（Grimoire）技能樹、迷霧與魔法強化**
  - 支援無段縮放與拖曳的 SVG 技能樹、節點互動泡泡與浮動詳情卡。
  - 擊敗各區首次魔王必定掉落「關鍵道具」，使用後可驅散魔導書迷霧、解鎖更高階區域與被動節點。
  - 消耗元素與素材可對已學會的魔法進行「強化 +N」提升威力。
- **稀有魔法與全服發現紀錄（v2B）**
  - 低機率合成的傳奇／稀有禁咒（含專屬全螢幕揭曉動畫與「✦ 全服首次發現 ✦」榮譽）。
  - 頂端鈴鐺即時推播全服發現動態（僅公開魔法名稱、殘卷線索與發現者顯示名稱，不劇透配方）。
- **帳號綁定與跨裝置同步（v2A）**
  - 遊客一鍵開局，支援綁定帳號密碼（瀏覽器端 PBKDF2 雜湊＋伺服器端 HMAC-Pepper）、多裝置登入、修改密碼與顯示名稱。
- **隱藏式 GM 管理工具**
  - 透過快捷鍵（`Ctrl + Shift + ` ` `）或 `?gm` 喚出浮動視窗，供管理員二次驗證後調整測試存檔、檢視配方表或為玩家重設密碼（使用過 GM 改存檔功能的帳號自動排除於全服發現與排行榜之外）。

---

## 未來預計實裝系統

> [!IMPORTANT]
> **💡 魔法深度拓展計劃（目前最高優先設計中）**
> 關於魔法體系的十大維度拓展（包含 Lv.1～10 階級重構、施法形態與術式分類、天賦型「獨特技能」vs 努力型「十里坡劍神」雙軌系統、隨機異變詞綴、元素共鳴反應、禁忌殘頁儀式、本命魔導具、Overdrive 超位魔法解放、元素道途體質與動態尊號），請參閱：
> 👉 **[`docs/superpowers/specs/2026-10-25-spell-depth-expansion-design.md`](docs/superpowers/specs/2026-10-25-spell-depth-expansion-design.md)**
> （配合推進的階級強度曲線討論紀錄請見：[`docs/superpowers/specs/2026-10-24-spell-tier-balance-notes.md`](docs/superpowers/specs/2026-10-24-spell-tier-balance-notes.md)）

1. **魔法深度拓展與 Lv.1～10 階級強度曲線重塑（近期焦點）**
   - 一般魔法重新分佈至 Lv.1～9、稀有禁咒定為 Lv.10，拉開跨階級決定性差距（高一階約 1.5～2 倍 DPS，強化滿 ≈ 高一階剛合成），並同步重排魔物強度。
   - 實裝上述「魔法深度拓展計劃」之各項子系統與確率配方落空保底／補償機制。
2. **近期介面與體驗優化（QoL）**
   - 學會新魔法時跳出限時（3 秒）裝備詢問通知；合出稀有魔法揭曉後等待玩家選擇是否裝備。
   - 戰鬥畫面顯示「距離魔王出現還差幾隻」、合成台記住上一次的選擇。
3. **「奇幻中古世紀大魔法師」沉浸感與玩法擴充**
   - **雙重詠唱／魔導迴路（共鳴槽）**：嵌入舊魔法或自創魔法作為副迴路，讓主魔法繼承部分屬性效果或詞綴。
   - **自創魔法「真名刻印」**：為高相性或高強化的自創魔法刻印古語真名。
   - **大魔法師氛圍演出**：隨階級演進的腳下幾何魔法陣與古語詠唱殘響、高塔研究手札（第一人稱敘事獨白）、對低階魔物的「魔力威壓」、魔導書中心紋章視覺進化，以及王國／教廷／公會的火漆信件委託。
4. **第二版 C+D：全服排行榜與每日至尊稱號**
   - 全服進度與發現排行榜，以及每日 UTC+8 午夜結算的至尊魔導稱號。
5. **第三版與長線擴充**
   - 全面擴充地圖區域、魔物種類、魔法數量與技能樹廣度。
   - 煉金與熟練度、商店、金幣與玩家市集。
   - 轉生系統（退還 85% 資源）、光暗魔導書、五芒星不相鄰混合、Google 帳號登入等。

---

## 重要文件索引

- **接手開發指南（人或 AI agent 必讀）**：[AGENTS.md](AGENTS.md)
- **核心重做設計規格（目前玩法依據）**：[docs/superpowers/specs/2026-10-22-core-rework-design.md](docs/superpowers/specs/2026-10-22-core-rework-design.md)
- **合成台介面設計規格（目前介面依據）**：[docs/superpowers/specs/2026-10-23-synthesis-altar-ui-design.md](docs/superpowers/specs/2026-10-23-synthesis-altar-ui-design.md)
- **稀有魔法與發現紀錄規格（v2B）**：[docs/superpowers/specs/2026-10-23-v2b-rare-discoveries-design.md](docs/superpowers/specs/2026-10-23-v2b-rare-discoveries-design.md)
- **帳號綁定規格（v2A）**：[docs/superpowers/specs/2026-10-21-v2a-accounts-design.md](docs/superpowers/specs/2026-10-21-v2a-accounts-design.md)
- **GM 工具規格**：[docs/superpowers/specs/2026-10-23-gm-tool-design.md](docs/superpowers/specs/2026-10-23-gm-tool-design.md)
- **魔法深度拓展設計文件（建置中）**：[docs/superpowers/specs/2026-10-25-spell-depth-expansion-design.md](docs/superpowers/specs/2026-10-25-spell-depth-expansion-design.md)
- **上線前檢查清單**：[docs/prelaunch-checklist.md](docs/prelaunch-checklist.md)
- **美術素材清單與繪圖提示詞**：[docs/art-assets.md](docs/art-assets.md)
- **初版概念與長線規格**：[docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md](docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md)

## 本機開發

```bash
npm i
npm run db:migrate:local   # 套用本機 D1 migration
npm run dev                # 啟動開發伺服器
```

帳號功能需要 `.dev.vars`（git 忽略，不要 commit）：`PASSWORD_PEPPER=dev-only-pepper-not-for-production`。要用 GM 工具，先在遊戲裡把自己的帳號綁定好，再加一行 `GM_USERNAMES=<已綁定的帳號名稱，逗號分隔>`（**只列已經綁定在你自己名下的帳號名稱**：GM 身分是「誰先綁定這個名稱」，列了但還沒人綁定的名稱，任何人都能搶先綁定而成為 GM；名單裡格式不合法的名稱會被忽略。），重新啟動 `npm run dev`，登入遊戲後按 Ctrl＋Shift＋`（或網址加 `?gm`）叫出 GM 視窗；沒設定 `GM_USERNAMES` 時 GM 功能不存在（`/api/gm/*` 回 404）。

## 測試

```bash
npm test                   # vitest
npm run build              # 型別檢查 + 打包
```

## 部署（Cloudflare Workers + D1）

1. `npx wrangler login`
2. `npx wrangler d1 create infinite-grimoire`
3. 把輸出的 `database_id` 填進 `wrangler.jsonc` 中 D1 設定的 `database_id`（目前為佔位值）。
4. `npx wrangler d1 migrations apply DB --remote`（依序套用 0001～0006；0004 會重置所有存檔）
5. `npx wrangler secret put PASSWORD_PEPPER`
6. `npm run deploy`（**先不要設定 `GM_USERNAMES`**，這時 GM 功能不存在）
7. 打開上線的遊戲，用強密碼綁定 GM 要用的帳號。
8. 綁定完成後才 `npx wrangler secret put GM_USERNAMES`（設定 secret 會自動重新部署）。**只列已經綁定在你自己名下的帳號名稱**：GM 身分是「誰先綁定這個名稱」，列了但還沒人綁定的名稱，任何人都能搶先綁定而成為 GM；名單裡格式不合法的名稱會被忽略。

## 貼圖替換

遊戲預設使用程式繪製的 placeholder 圖形。要換成正式美術，把 PNG 放到 `public/assets/<key>.png`（例如 `public/assets/hero_idle.png`、`public/assets/monster_mist_slime.png`、`public/assets/fx_bolt.png`），重新整理即可生效；缺少的檔案會繼續使用 placeholder。完整的 key、尺寸、影格數與可直接給 AI 繪圖工具的提示詞見 [docs/art-assets.md](docs/art-assets.md)。
