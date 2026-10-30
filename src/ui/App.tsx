import { useCallback, useEffect, useRef, useState } from 'react';
import type { Content, Spell } from '../engine/model';
import { resolveSpell } from '../engine/spells';
import type { AccountInfo, ActionResult, ApiClient, LoginResult } from '../game/api';
import type { GameRuntime } from '../game/runtime';
import type { OfflineReport, SyncController } from '../game/sync';
import './App.css';
import { AccountDialog } from './AccountDialog';
import { AwayReport, mergeReports } from './AwayReport';
import { BattleCanvas } from './BattleCanvas';
import { DiscoveryBanner } from './DiscoveryBanner';
import { EquipToasts, pushToast, type EquipToast } from './EquipToasts';
import { ElementTable } from './ElementTable';
import { GmWindow } from './GmWindow';
import { FOG_LIFT_MS, GrimoirePanel } from './GrimoirePanel';
import { KeyItemBar } from './KeyItemBar';
import { Notebook } from './Notebook';
import { OfflineOverlay } from './OfflineOverlay';
import { RareReveal } from './RareReveal';
import { StageBar } from './StageBar';
import { emptySlots, fillSlot, SynthesisAltar, type Slots } from './SynthesisAltar';
import { TopBar } from './TopBar';
import { useDiscoveryFeed } from './useDiscoveryFeed';
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
  const [tab, setTab] = useState<'tree' | 'lightdark' | 'notebook'>('tree');
  // `n` restarts the banner when the same spell comes out twice in a row
  const [discovery, setDiscovery] = useState<{ spell: Spell; isNew: boolean; n: number } | null>(null);
  // rare spells play one full-screen reveal at a time; one arriving mid-reveal waits its turn (`n` keys each one)
  const [rareQueue, setRareQueue] = useState<{ spell: Spell; spellId: string; first: boolean; n: number }[]>([]);
  const [awayReport, setAwayReport] = useState<OfflineReport | null>(null);
  useEffect(() => sync.onOfflineReport((r) => setAwayReport((prev) => mergeReports(prev, r))), [sync]);
  const [toasts, setToasts] = useState<EquipToast[]>([]);
  const toastN = useRef(0);
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
  // the bell shows the new rare discovery as soon as the reveal ends
  const { entries: feed, refresh: refreshFeed } = useDiscoveryFeed(api, status === 'online');
  // the state may have been replaced since the question was asked: only equip a spell still learned
  const equipIfLearned = useCallback((id: string): void => {
    if (runtime.getSnapshot().game.learned.includes(id)) runtime.equip(id);
  }, [runtime]);
  const endRareReveal = useCallback((equip: boolean): void => {
    const id = rareQueue[0]?.spellId;
    if (equip && id) equipIfLearned(id);
    setRareQueue((q) => q.slice(1));
    refreshFeed();
  }, [refreshFeed, rareQueue, equipIfLearned]);
  const dropToast = useCallback((n: number): void => setToasts((l) => l.filter((t) => t.n !== n)), []);
  const equipToast = useCallback((n: number): void => {
    const t = toasts.find((x) => x.n === n);
    if (t) equipIfLearned(t.spellId);
    dropToast(n);
  }, [toasts, equipIfLearned, dropToast]);
  // an in-tab account switch starts a new runtime: forget the old account (and with it the GM
  // window's token) and look the new one up
  useEffect(() => {
    let alive = true;
    setAccount(null);
    api.getAccount().then((info) => alive && setAccount(info)).catch(() => {
      // the badge just stays hidden; auth errors are handled by sync
    });
    return () => {
      alive = false;
    };
  }, [api, runtime]);

  // a synthesis in flight owns both sides: placing anything now would be wiped by the reveal
  const pick = useCallback((id: string): void => {
    if (runtime.getSnapshot().synthPending) return;
    setSlots((s) => fillSlot(s, id));
  }, [runtime]);
  const onSynthResult = useCallback((result: ActionResult): void => {
    if (result.kind !== 'learned' && result.kind !== 'duplicate') return;
    const spell = resolveSpell(result.spellId, content);
    if (!spell) return;
    // no auto-equip: a toast (or the rare reveal) asks first, since swapping spells zeroes the DPS
    if (result.kind === 'learned' && result.rare) {
      // the full-screen reveal replaces the 新發現 banner
      const first = result.rare.first;
      setRareQueue((q) => [...q, { spell, spellId: result.spellId, first, n: (q.at(-1)?.n ?? 0) + 1 }]);
      return;
    }
    if (result.kind === 'learned') {
      toastN.current += 1;
      const toast = { n: toastN.current, spellId: result.spellId, name: spell.name };
      setToasts((l) => pushToast(l, toast));
    }
    setDiscovery((d) => ({ spell, isNew: result.kind === 'learned', n: (d?.n ?? 0) + 1 }));
  }, [content]);
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
        feed={feed}
        ownName={account?.displayName ?? ''}
      />
      <main className="main">
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
              <button type="button" role="tab" aria-selected={tab === 'tree'} onClick={() => setTab('tree')}>五元素</button>
              <button type="button" role="tab" aria-selected={tab === 'lightdark'} onClick={() => setTab('lightdark')}>光與暗</button>
              <button type="button" role="tab" aria-selected={tab === 'notebook'} onClick={() => setTab('notebook')}>魔法筆記</button>
            </div>
            {/* <768px the altar is scrolled out of view above the grimoire; the node bubble repeats the hint */}
            {tab !== 'notebook' ? (
              <GrimoirePanel key={tab} tree={tab === 'lightdark' ? 'lightdark' : 'elements'} runtime={runtime} sync={sync} onHint={setHintId} onPick={pick} slotsFull={!slots.includes(null)} lifting={lifting} content={content} />
            ) : (
              <Notebook runtime={runtime} sync={sync} content={content} onPick={pick} />
            )}
          </section>
        </div>
      </main>
      <section className="battle-strip" aria-label="戰鬥">
        <div className="strip-canvas">
          <BattleCanvas runtime={runtime} />
        </div>
        <StageBar runtime={runtime} content={content} />
        <div className="strip-float">
          <EquipToasts toasts={toasts} paused={rareQueue.length > 0} onEquip={equipToast} onExpire={dropToast} />
          <KeyItemBar runtime={runtime} sync={sync} content={content} onRevealed={onRevealed} />
        </div>
        {discovery && (
          <DiscoveryBanner key={discovery.n} spell={discovery.spell} isNew={discovery.isNew} onDone={endDiscovery} />
        )}
      </section>
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
      {rareQueue[0] && (
        <RareReveal key={rareQueue[0].n} spell={rareQueue[0].spell} first={rareQueue[0].first} onChoose={endRareReveal} />
      )}
      {awayReport && <AwayReport report={awayReport} content={content} onClose={() => setAwayReport(null)} />}
      <GmWindow api={api} sync={sync} runtime={runtime} content={content} username={account?.username ?? null} />
      <OfflineOverlay status={status} />
    </div>
  );
}
