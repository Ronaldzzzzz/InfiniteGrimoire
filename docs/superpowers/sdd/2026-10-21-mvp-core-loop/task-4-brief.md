### Task 4：合成規則（純函式，之後由伺服器呼叫）

**Files:**
- Create: `src/engine/synthesis.ts`
- Test: `src/engine/synthesis.test.ts`

**Interfaces:**
- Produces：
```ts
export const SYNTH_SLOTS = 2;
export type SynthResult =
  | { kind: 'learned'; spellId: string }
  | { kind: 'duplicate'; spellId: string; refunded: ItemId[] }
  | { kind: 'noReaction'; consumed: ItemId[] }
  | { kind: 'knownNoReaction' }
  | { kind: 'dormant' }
  | { kind: 'rejected'; reason: 'slots' | 'insufficient' };
export function comboKey(inputs: ItemId[]): string;
export function synthesize(state: GameState, inputs: ItemId[], data: GameData, rng: Rng): { state: GameState; result: SynthResult };
```

規則（依序判斷）：
1. 輸入數量不是 2 → `rejected/slots`，不消耗。
2. 背包數量不足 → `rejected/insufficient`，不消耗。
3. 沒有對應的配方：
   - 紀錄中已標記為 noReaction → `knownNoReaction`，不消耗。
   - 否則消耗排序後的第一個輸入，記錄 `attempts+1`、`results.none+1`、`noReaction = true`，回傳 `noReaction`。
4. 有配方，但沒有任何結果的前置條件已滿足 → `dormant`，不消耗，也不記錄。
5. 否則從前置條件已滿足的結果中依權重抽一個，消耗全部輸入，並記錄 `attempts+1`、`results[spellId]+1`：
   - 已經學會 → `duplicate`，退還排序後的第一個輸入。
   - 還沒學會 → 加入 `learned`，回傳 `learned`。

- [ ] **Step 1：寫失敗的測試**
  - `rejects one slot without consuming`
  - `rejects same element twice when only one owned`：背包是 `{el:fire:1: 1}`，輸入 `[el:fire:1, el:fire:1]`。
  - `first invalid combo consumes one item and logs noReaction`
  - `second invalid combo consumes nothing`
  - `dormant when prerequisite missing`
  - `learns T2 spell from two grade-1 elements`
  - `duplicate refunds one input`
  - `outcome with unmet prereq is never rolled`：已學雷電術、還沒學閃電術時，用 `[el:thunder:2, el:thunder:2]` 從同一個狀態跑 200 次，每次都是 learned `lightning`，不會出現 `thunderstorm`。
  - `comboKey is order-insensitive`
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(engine): spell synthesis rules with prerequisites and attempt log`

---

