import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import type { Content } from '../engine/model';
import { ApiError, GmExpiredError, RateLimitedError, type ApiClient } from '../game/api';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';

/** What the GM tabs receive: the short-lived token and what to call when the server says it is gone. */
export type GmContext = { token: string; onExpired: () => void };

type Props = {
  api: Pick<ApiClient, 'gmLogin'>;
  sync: SyncController;
  runtime: GameRuntime;
  content: Content;
  username: string | null;
};

const STORAGE_KEY = 'ig.gmWindow';
const TABS = [
  { id: 'items', label: '元素' },
  { id: 'zones', label: '地圖' },
  { id: 'recipes', label: '配方表' },
  { id: 'players', label: '玩家' },
] as const;
type TabId = (typeof TABS)[number]['id'];
type Layout = { x: number; y: number; min: boolean };
const DEFAULT_LAYOUT: Layout = { x: 24, y: 72, min: false };
const EXPIRED = 'GM 驗證已過期，請重新驗證';

function loadLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (raw && typeof raw.x === 'number' && typeof raw.y === 'number') {
      return { x: raw.x, y: raw.y, min: raw.min === true };
    }
  } catch {
    // storage unavailable: fall back to the default spot
  }
  return DEFAULT_LAYOUT;
}
function saveLayout(l: Layout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(l));
  } catch {
    // per-viewer convenience only
  }
}

export function GmWindow({ api, username }: Props) {
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).has('gm'));
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [auth, setAuth] = useState<{ token: string; expiresAt: number } | null>(null);
  const [tab, setTab] = useState<TabId>('items');
  const [name, setName] = useState(username ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Backquote' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!username) return;
    setName((n) => n || username);
  }, [username]);

  const onExpired = useCallback((): void => {
    setAuth(null);
    setPassword('');
    setError(EXPIRED);
  }, []);

  useEffect(() => {
    if (!auth) return;
    const t = setTimeout(onExpired, Math.max(0, auth.expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [auth, onExpired]);

  if (!open) return null;

  const update = (next: Layout): void => {
    setLayout(next);
    saveLayout(next);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - layoutRef.current.x, dy: e.clientY - layoutRef.current.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    setLayout({ ...layoutRef.current, x: Math.max(0, e.clientX - d.dx), y: Math.max(0, e.clientY - d.dy) });
  };
  const onUp = (): void => {
    if (!drag.current) return;
    drag.current = null;
    saveLayout(layoutRef.current);
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.gmLogin(name, password);
      setAuth({ token: r.gmToken, expiresAt: r.expiresAt });
      setPassword('');
    } catch (err) {
      if (err instanceof GmExpiredError) setError(EXPIRED);
      else if (err instanceof RateLimitedError) setError('嘗試太多次，請稍後再試');
      else if (err instanceof ApiError && err.status === 403) setError('帳號或密碼錯誤');
      else setError('連線失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  const ctx: GmContext | null = auth ? { token: auth.token, onExpired } : null;

  return (
    <div
      className={`gm-window${layout.min ? ' gm-min' : ''}`}
      role="dialog"
      aria-label="GM 工具"
      style={{ left: layout.x, top: layout.y }}
    >
      <div
        className="gm-titlebar"
        data-testid="gm-titlebar"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <span className="gm-title">GM 工具</span>
        <button type="button" aria-label="縮小" onClick={() => update({ ...layout, min: !layout.min })}>—</button>
        <button type="button" aria-label="關閉" onClick={() => setOpen(false)}>✕</button>
      </div>
      {!layout.min && (
        <div className="gm-body">
          {!ctx ? (
            <form className="gm-login" onSubmit={(e) => void submit(e)}>
              <label>
                帳號名稱
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" />
              </label>
              <label>
                密碼
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </label>
              {error && <p role="alert" className="gm-error">{error}</p>}
              <button type="submit" className="primary" disabled={busy || !name || !password}>{busy ? '處理中…' : '驗證'}</button>
            </form>
          ) : (
            <>
              <div className="gm-tabs" role="tablist">
                {TABS.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
              </div>
              <div className="gm-pane" role="tabpanel">{TABS.find((t) => t.id === tab)?.label}（Task 7 填入）</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
