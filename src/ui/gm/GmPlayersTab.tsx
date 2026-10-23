import { useRef, useState, type FormEvent } from 'react';
import { ApiError, GmExpiredError, RateLimitedError, type ApiClient } from '../../game/api';
import type { GmContext } from '../GmWindow';
import { generateTempPassword } from './temp-password';

/** Spec §5.4: reset another player's password to a one-time temporary password shown only here. */
export function GmPlayersTab({ ctx, api }: { ctx: GmContext; api: Pick<ApiClient, 'gmResetPassword'> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const out = useRef<HTMLElement>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const username = name.trim();
    if (!username) return;
    setBusy(true);
    setError(null);
    setIssued(null);
    setCopied(false);
    const password = generateTempPassword();
    try {
      // the api hashes it with the target's username; the plain password never leaves this window
      await api.gmResetPassword(ctx.token, username, password);
      setIssued({ username, password });
    } catch (err) {
      if (err instanceof GmExpiredError) ctx.onExpired();
      else if (err instanceof ApiError && err.status === 404) setError('找不到這個帳號');
      else if (err instanceof ApiError && err.status === 403 && err.code === 'not_allowed') setError('不能重設自己或 GM 帳號');
      else if (err instanceof RateLimitedError) setError('嘗試太多次，請稍後再試');
      else setError('連線失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
    } catch {
      // no clipboard permission: select the text so the GM can copy it by hand
      if (out.current) window.getSelection()?.selectAllChildren(out.current);
    }
  };

  return (
    <div className="gm-players">
      <form className="gm-login" onSubmit={(e) => void submit(e)}>
        <label>
          玩家帳號名稱
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        {error && <p role="alert" className="gm-error">{error}</p>}
        <button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? '處理中…' : '重設密碼'}</button>
      </form>
      {issued && (
        <div className="gm-temp">
          <p>{issued.username} 的臨時密碼（只顯示這一次，請轉交玩家）：</p>
          <div className="gm-temp-row">
            <code ref={out} data-testid="gm-temp-password">{issued.password}</code>
            <button type="button" onClick={() => void copy()}>複製</button>
            {copied && <span className="gm-status">已複製</span>}
          </div>
        </div>
      )}
    </div>
  );
}
