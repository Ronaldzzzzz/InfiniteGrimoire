# 無限魔導書 Infinite Grimoire

極簡像素風的放置合成遊戲。魔法師在戰鬥畫面中自動施放法術擊倒魔物，玩家透過收集元素、合成更高階的魔法來推進區域與魔王。這是 MVP（核心循環）版本：

- 只能線上遊玩：斷線時遊戲會暫停，恢復連線後繼續；沒有離線收益。
- 以遊客身分開始，進度保存在伺服器（Cloudflare Workers + D1）；伺服器會驗證每次上傳的進度是否合理，合成的結果也由伺服器決定，以防止作弊。
- 目前內容：五屬元素的魔法與合成、三個地點與各自的魔王，以及簡化版魔導書。
- 尚未提供：排行榜、帳號綁定與跨裝置續玩（規劃於後續版本）。

> 注意：遊客帳號的登入憑證只存在這個瀏覽器裡。清除瀏覽器資料會遺失遊客帳號（帳號綁定在第二版）。

- 設計規格：[docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md](docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md)
- 實作計畫：[docs/superpowers/plans/2026-10-21-mvp-core-loop.md](docs/superpowers/plans/2026-10-21-mvp-core-loop.md)
- 美術素材清單：[docs/art-assets.md](docs/art-assets.md)
- 接手開發（人或 AI agent）：先讀 [AGENTS.md](AGENTS.md)

## 本機開發

```bash
npm i
npm run db:migrate:local   # 套用本機 D1 migration
npm run dev                # 啟動開發伺服器
```

帳號功能需要 `.dev.vars`（git 忽略，不要 commit）：`PASSWORD_PEPPER=dev-only-pepper-not-for-production`。要用 GM 工具，再加一行 `GM_USERNAMES=<已綁定的帳號名稱，逗號分隔>`，登入遊戲後按 Ctrl＋Shift＋`（或網址加 `?gm`）叫出 GM 視窗；沒設定 `GM_USERNAMES` 時 GM 功能不存在（`/api/gm/*` 回 404）。

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
5. `npx wrangler secret put PASSWORD_PEPPER`、`npx wrangler secret put GM_USERNAMES`
6. `npm run deploy`

## 貼圖替換

遊戲預設使用程式繪製的 placeholder 圖形。要換成正式美術，把 PNG 放到 `public/assets/<key>.png`（例如 `public/assets/hero_idle.png`、`public/assets/monster_mist_slime.png`、`public/assets/fx_bolt.png`），重新整理即可生效；缺少的檔案會繼續使用 placeholder。完整的 key、尺寸、影格數與可直接給 AI 繪圖工具的提示詞見 [docs/art-assets.md](docs/art-assets.md)。
