# 無限魔導書 Infinite Grimoire

極簡像素風的放置合成遊戲。魔法師在戰鬥畫面中自動施放法術擊倒魔物，玩家透過收集元素、合成更高階的魔法來推進區域與魔王；進度與結算由伺服器（Cloudflare Workers + D1）驗證並保存，以防止作弊，並支援線上排行與跨裝置續玩。

- 設計規格：[docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md](docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md)
- 實作計畫：[docs/superpowers/plans/2026-10-21-mvp-core-loop.md](docs/superpowers/plans/2026-10-21-mvp-core-loop.md)
- 美術素材清單：[docs/art-assets.md](docs/art-assets.md)

## 本機開發

```bash
npm i
npm run db:migrate:local   # 套用本機 D1 migration
npm run dev                # 啟動開發伺服器
```

## 測試

```bash
npm test                   # vitest
npm run build              # 型別檢查 + 打包
```

## 部署（Cloudflare Workers + D1）

1. `npx wrangler login`
2. `npx wrangler d1 create infinite-grimoire`
3. 把輸出的 `database_id` 填進 `wrangler.jsonc` 中 D1 設定的 `database_id`（目前為佔位值）。
4. `npx wrangler d1 migrations apply DB --remote`
5. `npm run deploy`

## 貼圖替換

遊戲預設使用程式繪製的 placeholder 圖形。要換成正式美術，把 PNG 放到 `public/assets/<key>.png`（例如 `public/assets/hero_idle.png`、`public/assets/monster_mist_slime.png`、`public/assets/fx_bolt.png`），重新整理即可生效；缺少的檔案會繼續使用 placeholder。完整的 key、尺寸、影格數與可直接給 AI 繪圖工具的提示詞見 [docs/art-assets.md](docs/art-assets.md)。
