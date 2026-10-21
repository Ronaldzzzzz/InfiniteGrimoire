import { useState } from 'react';
import type { GameData, ItemId } from '../engine/types';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import './App.css';
import { BattleCanvas } from './BattleCanvas';
import { GrimoirePanel } from './GrimoirePanel';
import { Hud } from './Hud';
import { InventoryBar } from './InventoryBar';
import { OfflineOverlay } from './OfflineOverlay';
import { SaveErrorBanner } from './SaveErrorBanner';
import { emptySlots, SynthesisPanel, type Slots } from './SynthesisPanel';
import { bossAlive, useConnStatus, useGameState, useRuntime } from './useGame';
import { ZonePanel } from './ZonePanel';

type Tab = 'synthesis' | 'grimoire' | 'map';
const TABS: [Tab, string][] = [
  ['synthesis', '合成'],
  ['grimoire', '魔導書'],
  ['map', '地圖'],
];

export function App({ runtime, sync, data }: { runtime: GameRuntime; sync: SyncController; data: GameData }) {
  const game = useGameState(runtime);
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  const bossOnField = useRuntime(runtime, (s) => bossAlive(s, data));
  const status = useConnStatus(sync);
  const [tab, setTab] = useState<Tab>('synthesis');
  const [slots, setSlots] = useState<Slots>(emptySlots);

  const pick = (id: ItemId): void => {
    const i = slots.indexOf(null);
    if (i >= 0) setSlots(slots.map((s, j) => (j === i ? id : s)));
  };

  return (
    <div className="app">
      <Hud game={game} bossAlive={bossOnField} data={data} runtime={runtime} />
      <SaveErrorBanner status={status} />
      <main className="main">
        <div className="battle">
          <BattleCanvas runtime={runtime} />
        </div>
        <aside className="side">
          <nav className="tabs">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          <div className="tab-body">
            {tab === 'synthesis' && (
              <SynthesisPanel game={game} synthPending={synthPending} sync={sync} data={data} slots={slots} onSlotsChange={setSlots} />
            )}
            {tab === 'grimoire' && <GrimoirePanel runtime={runtime} />}
            {tab === 'map' && <ZonePanel game={game} data={data} runtime={runtime} />}
          </div>
        </aside>
      </main>
      <InventoryBar inventory={game.inventory} onPick={pick} onUpgrade={(el, g) => runtime.upgrade(el, g)} />
      <OfflineOverlay status={status} />
    </div>
  );
}
