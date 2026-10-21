import { useState } from 'react';
import type { GameData, ItemId } from '../engine/types';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import './App.css';
import { BattleCanvas } from './BattleCanvas';
import { Hud } from './Hud';
import { InventoryBar } from './InventoryBar';
import { OfflineOverlay } from './OfflineOverlay';
import { emptySlots, SynthesisPanel, type Slots } from './SynthesisPanel';
import { useConnStatus, useGame } from './useGame';
import { ZonePanel } from './ZonePanel';

type Tab = 'synthesis' | 'grimoire' | 'map';
const TABS: [Tab, string][] = [
  ['synthesis', '合成'],
  ['grimoire', '魔導書'],
  ['map', '地圖'],
];

export function App({ runtime, sync, data }: { runtime: GameRuntime; sync: SyncController; data: GameData }) {
  const snapshot = useGame(runtime);
  const status = useConnStatus(sync);
  const [tab, setTab] = useState<Tab>('synthesis');
  const [slots, setSlots] = useState<Slots>(emptySlots);

  const pick = (id: ItemId): void => {
    const i = slots.indexOf(null);
    if (i >= 0) setSlots(slots.map((s, j) => (j === i ? id : s)));
  };

  return (
    <div className="app">
      <Hud snapshot={snapshot} data={data} runtime={runtime} />
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
              <SynthesisPanel snapshot={snapshot} sync={sync} data={data} slots={slots} onSlotsChange={setSlots} />
            )}
            {tab === 'grimoire' && <div className="grimoire-placeholder" />}
            {tab === 'map' && <ZonePanel snapshot={snapshot} data={data} runtime={runtime} />}
          </div>
        </aside>
      </main>
      <InventoryBar inventory={snapshot.game.inventory} onPick={pick} onUpgrade={(el, g) => runtime.upgrade(el, g)} />
      <OfflineOverlay status={status} />
    </div>
  );
}
