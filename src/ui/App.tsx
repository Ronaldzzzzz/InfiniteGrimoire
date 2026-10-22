import { useEffect, useState } from 'react';
import type { Content } from '../engine/model';
import type { AccountInfo, ApiClient, LoginResult } from '../game/api';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import './App.css';
import { AccountDialog } from './AccountDialog';
import { BattleCanvas } from './BattleCanvas';
import { ElementTable } from './ElementTable';
import { GrimoirePanel } from './GrimoirePanel';
import { OfflineOverlay } from './OfflineOverlay';
import { emptySlots, fillSlot, SynthesisPanel, type Slots } from './SynthesisPanel';
import { TopBar } from './TopBar';
import { useConnStatus, useGameState, useRuntime } from './useGame';

export function App({
  runtime,
  sync,
  content,
  api,
  onSwitched,
  onLoggedOut,
}: {
  runtime: GameRuntime;
  sync: SyncController;
  content: Content;
  api: ApiClient;
  onSwitched: (r: LoginResult) => void;
  onLoggedOut: () => void;
}) {
  const status = useConnStatus(sync);
  const game = useGameState(runtime);
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [hintId, setHintId] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    api.getAccount().then((info) => alive && setAccount(info)).catch(() => {
      // the badge just stays hidden; auth errors are handled by sync
    });
    return () => {
      alive = false;
    };
  }, [api]);

  const pick = (id: string): void => setSlots(fillSlot(slots, id));
  // The hint stays until another node is clicked or the spell is learned.
  const hint = hintId && !game.learned.includes(hintId) ? (content.spells[hintId]?.hint ?? null) : null;

  return (
    <div className="app">
      <TopBar
        runtime={runtime}
        content={content}
        status={status}
        bound={account ? account.username !== null : null}
        onOpenAccount={() => setAccountOpen(true)}
      />
      <main className="main">
        <div className="battle">
          <BattleCanvas runtime={runtime} />
        </div>
        <div className="side">
          <section className="workbench" aria-label="元素與合成">
            <ElementTable
              inventory={game.inventory}
              onPick={pick}
              onUpgrade={(el, g) => runtime.upgrade(el, g)}
              upgradeLocked={synthPending}
            />
            <SynthesisPanel
              game={game}
              synthPending={synthPending}
              sync={sync}
              content={content}
              slots={slots}
              onSlotsChange={setSlots}
              hint={hint}
            />
          </section>
          <section className="grimoire-col" aria-label="魔導書">
            <GrimoirePanel runtime={runtime} onHint={setHintId} content={content} />
            {/* <768px the slots are scrolled out of view above the grimoire, so repeat the hint here */}
            {hint && (
              <div className="grimoire-hint only-narrow" aria-live="polite">
                {hint}
              </div>
            )}
          </section>
        </div>
      </main>
      {accountOpen && (
        <AccountDialog
          api={api}
          displayName={account?.displayName ?? ''}
          learnedCount={game.learned.length}
          onClose={() => setAccountOpen(false)}
          onAccountChange={setAccount}
          onSwitched={onSwitched}
          onLoggedOut={onLoggedOut}
          beforeLogout={() => sync.uploadNow()}
        />
      )}
      <OfflineOverlay status={status} />
    </div>
  );
}
