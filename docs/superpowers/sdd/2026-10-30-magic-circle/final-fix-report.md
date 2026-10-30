# 最終審查修正報告
修正項目：P1（.guide fill:none，CSS 測試）、P5（key-items 文案改為「魔法陣開放到 Lv.N」）、P2（.picker-actions sticky top，CSS 測試）、synthesisLog 精簡成 `Record<string, number>`（SYNTH_LOG_CAP 1000，滿了丟最少次的；persist zod 限制；測試：上限、滿 1000 再合成維持 1000）、GM 配方表一般陣 90%（FAIL_BASE 算出）、稀有為成功時再擲 RARE_CHANCE（欄位標題說明）、AGENTS.md 遷移清單與兩條取代項、audit.ts／content.ts 迷霧註解。
驗證：`npm test` 79 檔 874 個全過（tests/sim 0 次被拒）；`npm run build` 通過。
