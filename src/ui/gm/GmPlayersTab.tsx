import { useRef, useState, type FormEvent } from 'react';
import { ApiError, GmExpiredError, RateLimitedError, type ApiClient } from '../../game/api';
import { normalizeUsername } from '../../engine/account-rules';
import type { GmContext } from '../GmWindow';
import { generateTempPassword } from './temp-password';

/** Spec §5.4: reset another player's password to a one-time temporary password shown only here. */
export function GmPlayersTab({ ctx, api }: { ctx: GmContext; api: Pick<ApiClient, 'gmResetPassword'> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // the name waiting for 確定: a reset signs the player out everywhere, so it is never one click
  const [confirming, setConfirming] = useState<string | null>(null);
  const out = useRef<HTMLElement>(null);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const username = normalizeUsername(name);
    if (!username) return;
    setError(null);
    setConfirming(username);
  };

  const confirm = async (): Promise<void> => {
    const username = confirming;
    if (!username) return;
    setConfirming(null);
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
      <form className="gm-login" onSubmit={submit}>
        <label>
          玩家帳號名稱
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setConfirming(null);
            }}
            autoComplete="off"
          />
        </label>
        {error && <p role="alert" className="gm-error">{error}</p>}
        <button type="submit" className="primary" disabled={busy || confirming !== null || !name.trim()}>{busy ? '處理中…' : '重設密碼'}</button>
      </form>
      {confirming && (
        <div className="gm-confirm">
          <p>確定要重設 {confirming} 的密碼？對方所有裝置會被登出</p>
          <div className="gm-temp-row">
            <button type="button" className="primary" onClick={() => void confirm()}>確定</button>
            <button type="button" onClick={() => setConfirming(null)}>取消</button>
          </div>
        </div>
      )}
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
