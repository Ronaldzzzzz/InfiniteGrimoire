import { memo, useEffect, useState } from 'react';
import { stageProgress } from '../engine/combat';
import type { Content } from '../engine/model';
import { BOSS_LIMIT_MS, highestPlayable, stageCount } from '../engine/stages';
import type { GameRuntime, LastResult } from '../game/runtime';
import { itemCounts } from './messages';
import { useRuntime, type RuntimeStore } from './useGame';

/** How long the stage-end notice stays up. */
export const RESULT_MS = 3000;

/** The strip's information bar. It reads a few primitives from the runtime, so it re-renders on stage changes, not on every step. */
export const StageBar = memo(function StageBar({
  runtime,
  content,
}: {
  runtime: RuntimeStore & Pick<GameRuntime, 'enterBoss' | 'goToBoss' | 'setAutoAdvance'>;
  content: Content;
}) {
  const zoneId = useRuntime(runtime, (s) => s.game.currentZone);
  const stage = useRuntime(runtime, (s) => s.game.currentStage);
  const held = useRuntime(runtime, (s) => s.battle.phase === 'held');
  // farming an ordinary stage while this zone's boss stage is open: the player may go and fight it
  const bossOpen = useRuntime(runtime, (s) => {
    const z = content.zones.find((x) => x.id === s.game.currentZone);
    return !!z && s.game.currentStage < stageCount(z) && highestPlayable(s.game, z) === stageCount(z);
  });
  const percent = useRuntime(runtime, (s) => Math.round(stageProgress(s.battle) * 100));
  const bossSec = useRuntime(runtime, (s) => (s.battle.bossMs === null ? null : Math.max(0, Math.ceil((BOSS_LIMIT_MS - s.battle.bossMs) / 1000))));
  const autoAdvance = useRuntime(runtime, (s) => s.autoAdvance);
  const away = useRuntime(runtime, (s) => s.away);
  const lastResult = useRuntime(runtime, (s) => s.lastResult);

  // the notice for each result lasts RESULT_MS; a result that is updated (claim answered) starts a new one
  const [dismissed, setDismissed] = useState<LastResult | null>(null);
  useEffect(() => {
    if (!lastResult) return;
    const t = setTimeout(() => setDismissed(lastResult), RESULT_MS);
    return () => clearTimeout(t);
  }, [lastResult]);

  const zone = content.zones.find((x) => x.id === zoneId);
  const here = `${zone?.name ?? zoneId} ${stageNo(content, zoneId, stage)}`;

  return (
    <div className="stage-bar">
      <div className="stage-bar-left">
        <div className="stage-title">{here}</div>
        <div
          className="stage-progress"
          role="progressbar"
          aria-label="關卡進度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="stage-progress-fill" style={{ width: `${percent}%` }} />
        </div>
        {bossSec !== null && <div className="stage-boss-clock">魔王剩餘 {bossSec} 秒</div>}
      </div>
      <div className="stage-bar-right">
        <label className="stage-auto">
          <input type="checkbox" checked={autoAdvance} onChange={(e) => runtime.setAutoAdvance(e.target.checked)} /> 自動前進
        </label>
        {(held || bossOpen) && (
          <button type="button" className="stage-enter-boss" onClick={() => (held ? runtime.enterBoss() : runtime.goToBoss())}>
            進入魔王關
          </button>
        )}
      </div>
      {away && (
        <div className="stage-away" role="status" aria-label="離線中">
          離線中：戰鬥已暫停，收益每 30 秒以 5 折計算。回到遊戲視窗即可繼續。
        </div>
      )}
      {lastResult && lastResult !== dismissed && <ResultNotice result={lastResult} content={content} />}
    </div>
  );
});

/** 「1-3」: the zone's number and the stage. */
function stageNo(content: Content, zoneId: string, stage: number): string {
  return `${content.zones.find((z) => z.id === zoneId)?.order ?? '?'}-${stage}`;
}

function ResultNotice({ result, content }: { result: LastResult; content: Content }) {
  if (result.kind === 'failed') {
    return <div className="stage-result warn" role="status">時間到，退回 {stageNo(content, result.zoneId, result.backTo)}</div>;
  }
  const where = stageNo(content, result.zoneId, result.stage);
  if (result.pending) return <div className="stage-result" role="status">通過 {where}　結算中…</div>;
  if (!result.claimed) return <div className="stage-result warn" role="status">通過 {where}　未能結算</div>;
  return (
    <div className="stage-result" role="status">
      通過 {where}　{result.loot.length > 0 ? `戰利品：${itemCounts(result.loot, content)}` : '戰利品：無'}
    </div>
  );
}
