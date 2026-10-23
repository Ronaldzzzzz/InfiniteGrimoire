import { useEffect, useRef, useState } from 'react';
import type { Content } from '../engine/model';
import type { Discovery } from '../game/api';
import { discoveryLine, timeAgo } from './messages';
import { FEED_SEEN_KEY } from './useDiscoveryFeed';

function readSeen(): number | null {
  try {
    const raw = localStorage.getItem(FEED_SEEN_KEY);
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return null; // storage unreadable: no unread badge
  }
}

function writeSeen(id: number): void {
  try {
    localStorage.setItem(FEED_SEEN_KEY, String(id));
  } catch {
    // per-viewer convenience only
  }
}

function hintOf(spellId: string, content: Content): string | null {
  const hint = content.spells[spellId]?.hint;
  if (!hint) return null;
  return hint.startsWith('殘卷：') ? hint : `殘卷：${hint}`;
}

/** A bell with an unread count; the dropdown lists the recent rare discoveries, newest first. */
export function DiscoveryBell({ entries, content, ownName }: { entries: Discovery[]; content: Content; ownName: string }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<number | null>(readSeen);
  const root = useRef<HTMLDivElement>(null);
  const newest = entries[0]?.id ?? 0;

  const unread = seen === null ? 0 : entries.filter((d) => d.id > seen && d.displayName !== ownName).length;

  // while open, anything arriving counts as seen
  useEffect(() => {
    if (open && newest > 0) {
      writeSeen(newest);
      setSeen((s) => (s === null ? s : Math.max(s, newest)));
    }
  }, [open, newest]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const now = Date.now();
  return (
    <div className="bell" ref={root}>
      <button
        type="button"
        className="bell-button"
        aria-label={unread > 0 ? `發現動態（${unread} 則未讀）` : '發現動態'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          {entries.length === 0 ? (
            <p className="muted bell-empty">還沒有人發現稀有魔法</p>
          ) : (
            <ul role="list" className="bell-list">
              {entries.map((d) => {
                const hint = hintOf(d.spellId, content);
                return (
                  <li key={d.id} className={d.first ? 'bell-item first' : 'bell-item'}>
                    <div>{discoveryLine(d, content)}</div>
                    <div className="muted bell-sub">{[hint, timeAgo(now - d.at)].filter(Boolean).join('・')}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
