### Task 14：README、美術素材清單、部署

**Files:**
- Modify: `README.md`, `wrangler.jsonc`（填入 `database_id`）
- Create: `docs/art-assets.md`
- Test: `src/render/assets.test.ts`

- [ ] **Step 1：改寫 `README.md`。** 內容包含：
  - 遊戲概念；
  - 本機開發：`npm i`、`npm run db:migrate:local`、`npm run dev`、`npm test`；
  - 部署：`npx wrangler login` → `npx wrangler d1 create infinite-grimoire` → 把 id 填進 `wrangler.jsonc` → `npx wrangler d1 migrations apply DB --remote` → `npm run deploy`；
  - 連結到 spec 和這份 plan；
  - 「貼圖替換」一節：把檔案放到 `public/assets/<key>.png`。
- [ ] **Step 2：撰寫 `docs/art-assets.md`。** 涵蓋 `ASSET_KEYS` 的每一項，每項包含：
  - key 和檔名；
  - 用途；
  - 尺寸：角色和魔物 32×32、魔王 64×64、特效 32×32 sprite sheet；
  - 影格數；
  - 可以直接給 AI 繪圖工具用的英文提示詞。

  再加上測試 `art-assets doc covers all ASSET_KEYS`。
- [ ] **Step 3：** 執行 `npm test && npm run build`，預期全部 PASS。
- [ ] **Step 4：** 執行 `npm run dev` 從頭玩一次：
  - 取名；
  - 打倒魔王 1；
  - 在第 2 區看到「無效」；
  - 合成 T4 魔法後打倒魔王 2；
  - 重新整理頁面後，進度從伺服器載回來。
- [ ] **Step 5：** **請使用者執行**：在終端機輸入 `! npx wrangler login`，登入 Cloudflare。登入後依 README 的步驟建立 D1、套用 migration，並執行 `npm run deploy`。部署是對外發布的動作，執行前要先取得使用者同意。
- [ ] **Step 6：Commit**：`docs: rewrite README, add art asset list and deployment steps`

---

## 完成後

- 網域之後在 Cloudflare Registrar 購買，並綁定到這個 Worker。
- 合併到 `main` 和 push 之前，要先詢問使用者。
