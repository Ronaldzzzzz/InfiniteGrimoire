import { useCallback, useEffect, useState } from 'react';
import type { Content, Spell } from '../engine/model';
import { resolveSpell } from '../engine/spells';
import type { AccountInfo, ActionResult, ApiClient, LoginResult } from '../game/api';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import './App.css';
import { AccountDialog } from './AccountDialog';
import { BattleCanvas } from './BattleCanvas';
import { DiscoveryBanner } from './DiscoveryBanner';
import { ElementTable } from './ElementTable';
import { FOG_LIFT_MS, GrimoirePanel } from './GrimoirePanel';
import { KeyItemBar } from './KeyItemBar';
import { Notebook } from './Notebook';
import { OfflineOverlay } from './OfflineOverlay';
import { emptySlots, fillSlot, SynthesisAltar, type Slots } from './SynthesisAltar';
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
  const [tab, setTab] = useState<'tree' | 'notebook'>('tree');
  // `n` restarts the banner when the same spell comes out twice in a row
  const [discovery, setDiscovery] = useState<{ spell: Spell; isNew: boolean; n: number } | null>(null);
  const [lifting, setLifting] = useState<string | null>(null);
  useEffect(() => {
    if (!lifting) return;
    const t = setTimeout(() => setLifting(null), FOG_LIFT_MS);
    return () => clearTimeout(t);
  }, [lifting]);
  const onRevealed = useCallback((region: string): void => {
    setLifting(region);
    setTab('tree'); // so the fog lifting is in view
  }, []);
  const endDiscovery = useCallback(() => setDiscovery(null), []);
  useEffect(() => {
    let alive = true;
    api.getAccount().then((info) => alive && setAccount(info)).catch(() => {
      // the badge just stays hidden; auth errors are handled by sync
    });
    return () => {
      alive = false;
    };
  }, [api]);

  // a synthesis in flight owns both sides: placing anything now would be wiped by the reveal
  const pick = useCallback((id: string): void => {
    if (runtime.getSnapshot().synthPending) return;
    setSlots((s) => fillSlot(s, id));
  }, [runtime]);
  const onSynthResult = useCallback((result: ActionResult): void => {
    if (result.kind !== 'learned' && result.kind !== 'duplicate') return;
    const spell = resolveSpell(result.spellId, content);
    if (!spell) return;
    // equip only now: the reply has already replaced the state, so it can't undo the equip
    if (result.kind === 'learned') runtime.equip(result.spellId);
    setDiscovery((d) => ({ spell, isNew: result.kind === 'learned', n: (d?.n ?? 0) + 1 }));
  }, [content, runtime]);
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
          {discovery && (
            <DiscoveryBanner key={discovery.n} spell={discovery.spell} isNew={discovery.isNew} onDone={endDiscovery} />
          )}
          <KeyItemBar runtime={runtime} sync={sync} content={content} onRevealed={onRevealed} />
        </div>
        <div className="side">
          <section className="workbench" aria-label="元素與合成">
            <SynthesisAltar
              runtime={runtime}
              sync={sync}
              content={content}
              slots={slots}
              onSlotsChange={setSlots}
              hint={hint}
              onResult={onSynthResult}
            />
            <ElementTable
              inventory={game.inventory}
              onPick={pick}
              onUpgrade={(el, g, count) => {
                for (let i = 0; i < count && runtime.upgrade(el, g); i++);
              }}
              upgradeLocked={synthPending}
            />
          </section>
          <section className="grimoire-col" aria-label="魔導書">
            <div className="grimoire-tabs" role="tablist" aria-label="魔導書">
              <button type="button" role="tab" aria-selected={tab === 'tree'} onClick={() => setTab('tree')}>技能樹</button>
              <button type="button" role="tab" aria-selected={tab === 'notebook'} onClick={() => setTab('notebook')}>魔法筆記</button>
            </div>
            {/* <768px the altar is scrolled out of view above the grimoire; the node bubble repeats the hint */}
            {tab === 'tree' ? (
              <GrimoirePanel runtime={runtime} sync={sync} onHint={setHintId} onPick={pick} slotsFull={!slots.includes(null)} lifting={lifting} content={content} />
            ) : (
              <Notebook runtime={runtime} sync={sync} content={content} onPick={pick} />
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
