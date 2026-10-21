import { useState } from 'react';
import type { GameData, ItemId } from '../engine/types';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import './App.css';
import { BattleCanvas } from './BattleCanvas';
import { ElementTable } from './ElementTable';
import { GrimoirePanel } from './GrimoirePanel';
import { OfflineOverlay } from './OfflineOverlay';
import { emptySlots, SynthesisPanel, type Slots } from './SynthesisPanel';
import { TopBar } from './TopBar';
import { useConnStatus, useGameState, useRuntime } from './useGame';

export function App({ runtime, sync, data }: { runtime: GameRuntime; sync: SyncController; data: GameData }) {
  const status = useConnStatus(sync);
  const game = useGameState(runtime);
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [hintId, setHintId] = useState<string | null>(null);

  const pick = (id: ItemId): void => {
    const i = slots.indexOf(null);
    if (i >= 0) setSlots(slots.map((s, j) => (j === i ? id : s)));
  };
  // The hint stays until another node is clicked or the spell is learned.
  const hint = hintId && !game.learned.includes(hintId) ? (data.spells[hintId]?.hint ?? null) : null;

  return (
    <div className="app">
      <TopBar runtime={runtime} data={data} status={status} />
      <main className="main">
        <div className="battle">
          <BattleCanvas runtime={runtime} />
        </div>
        <div className="side">
          <section className="workbench" aria-label="元素與合成">
            <ElementTable inventory={game.inventory} onPick={pick} onUpgrade={(el, g) => runtime.upgrade(el, g)} />
            <SynthesisPanel
              game={game}
              synthPending={synthPending}
              sync={sync}
              data={data}
              slots={slots}
              onSlotsChange={setSlots}
              hint={hint}
            />
          </section>
          <section className="grimoire-col" aria-label="魔導書">
            <GrimoirePanel runtime={runtime} onHint={setHintId} />
            {/* <768px the slots are scrolled out of view above the grimoire, so repeat the hint here */}
            {hint && (
              <div className="grimoire-hint only-narrow" aria-live="polite">
                {hint}
              </div>
            )}
          </section>
        </div>
      </main>
      <OfflineOverlay status={status} />
    </div>
  );
}
