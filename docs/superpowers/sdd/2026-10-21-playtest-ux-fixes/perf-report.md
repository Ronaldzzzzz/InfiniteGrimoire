# 卡頓量測報告

## 方法
- 開發模式的 PerfMeter（`src/ui/PerfMeter.tsx`）：滾動 1 秒窗口的 fps、最長幀、React commit/s，以及累計長任務數（PerformanceObserver `longtask`，> 50ms）。
- Claude in Chrome 擴充功能沒有連上，所以改用本機 Microsoft Edge 155（Chromium）的 headless 模式，透過 puppeteer-core 操作（腳本放在 session scratchpad，不進專案）。WebGL：ANGLE D3D11，AMD Radeon RX 9070 XT。
- headless 不受螢幕更新率限制，fps 約 160；所以 fps 本身不代表一般螢幕的實際體驗，主要看「最長幀」與「React commit/s」。
- 另外用 CDP `Emulation.setCPUThrottlingRate`（4 倍）模擬一般筆電的 CPU。
- 每個情境：戰鬥進行 20 秒後，每秒取 1 筆，共 10 筆。視窗 1280×800。
- 沒有做 DevTools Performance 面板錄製（無法自動化），使用者可自行選做。

## 基準（修改前，commit 74443d8 + PerfMeter）

| 情境 | fps 最小/中位 | 最長幀 最大 | React commit/s 中位 | 長任務（累計，最長） |
|---|---|---|---|---|
| 戰鬥（合成分頁） | 159 / 160 | 7 ms | 20 | 1（82 ms，載入時） |
| 戰鬥＋魔導書分頁 | 159 / 160 | 11 ms | 20 | 1（82 ms，載入時） |
| 戰鬥，CPU 4× 節流 | 160 / 160 | 7 ms | 20 | 3（310 ms，載入時） |
| 魔導書分頁，CPU 4× 節流 | 160 / 160 | 7 ms | 20 | 3（310 ms，載入時） |

觀察：
- **React 每秒 commit 20 次**，證實了規格 5.2 的第 1 項：每 50ms 一步都讓整個 App（含魔導書 SVG）重畫。
- 在這台電腦上，即使 CPU 節流 4 倍，戰鬥中的最長幀仍只有 6～11ms；長任務都發生在載入階段。也就是說，**這台機器量不到戰鬥中的掉幀**。使用者感覺到的「些微卡頓」可能來自較弱的電腦、實際螢幕的垂直同步，或是 headless 沒有反映到的合成/繪製成本。
- 依 R6，仍然進行 selector 拆分與 Pixi 重畫優化。

## 修改後
（Task 11 填寫）
