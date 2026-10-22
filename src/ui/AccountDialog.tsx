import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { passwordProblem, usernameProblem } from '../engine/account-rules';
import type { AccountInfo, ApiClient, LoginResult } from '../game/api';
import { accountErrorMessage, passwordProblemMessage, usernameProblemMessage } from './messages';

type View = 'main' | 'confirm-switch' | 'login';

export function AccountDialog({
  api,
  displayName,
  learnedCount,
  onClose,
  onAccountChange,
  onSwitched,
  onLoggedOut,
  beforeLogout,
}: {
  api: Pick<ApiClient, 'getAccount' | 'bind' | 'changePassword' | 'logoutOthers' | 'logout' | 'login'>;
  displayName: string;
  learnedCount: number;
  onClose: () => void;
  onAccountChange: (info: AccountInfo) => void;
  onSwitched: (r: LoginResult) => void;
  onLoggedOut: () => void;
  beforeLogout: () => Promise<void>;
}) {
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [view, setView] = useState<View>('main');
  const [fields, setFields] = useState({ username: '', password: '', confirm: '', current: '', next: '', confirmNext: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bound = info?.username != null;

  const refresh = async (): Promise<void> => {
    try {
      const next = await api.getAccount();
      setInfo(next);
      onAccountChange(next);
    } catch (e) {
      setError(accountErrorMessage(e));
    }
  };

  // load once when the dialog opens
  useEffect(() => {
    dialogRef.current?.focus();
    void refresh();
  }, []);

  const set = (k: keyof typeof fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const checkNewPassword = (pw: string, confirm: string): string | null => {
    if (passwordProblem(pw)) return passwordProblemMessage();
    if (pw !== confirm) return '兩次輸入的密碼不一致';
    return null;
  };

  const bind = (e: FormEvent): void => {
    e.preventDefault();
    const up = usernameProblem(fields.username);
    const problem = up ? usernameProblemMessage(up) : checkNewPassword(fields.password, fields.confirm);
    if (problem) return setError(problem);
    void run(async () => {
      await api.bind(fields.username, fields.password);
      await refresh();
      setNotice('綁定完成');
    });
  };

  const login = (e: FormEvent): void => {
    e.preventDefault();
    const up = usernameProblem(fields.username);
    if (up) return setError(usernameProblemMessage(up));
    if (passwordProblem(fields.password)) return setError(passwordProblemMessage());
    void run(async () => {
      const next = await api.login(fields.username, fields.password);
      if (bound) {
        // a bound account can be recovered later: save its latest progress and end this session,
        // still under the old token (onSwitched stores the new one)
        await beforeLogout();
        await api.logout().catch(() => {
          // best effort: the old session just stays listed until it is logged out elsewhere
        });
      }
      onSwitched(next);
    });
  };

  const changePassword = (e: FormEvent): void => {
    e.preventDefault();
    const problem = checkNewPassword(fields.next, fields.confirmNext);
    if (problem) return setError(problem);
    void run(async () => {
      await api.changePassword(fields.current, fields.next);
      setFields((f) => ({ ...f, current: '', next: '', confirmNext: '' }));
      await refresh();
      setNotice('密碼已更新，其他裝置已登出');
    });
  };

  const logout = (): void => {
    void run(async () => {
      await beforeLogout();
      await api.logout();
      onLoggedOut();
    });
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="account-title" tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="dialog-head">
          <h2 id="account-title">帳號</h2>
          <button type="button" aria-label="關閉" onClick={onClose}>×</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="dialog-notice" role="status">{notice}</p>}
        {!info && !error && <p className="muted">載入中…</p>}

        {info && view === 'main' && !bound && (
          <>
            <p>綁定帳號後，可以在其他裝置登入，清掉瀏覽器資料也不會失去進度。</p>
            <p className="warn-text">沒有 email，忘記密碼無法找回，請記好帳號名稱和密碼。</p>
            <form className="dialog-form" onSubmit={bind}>
              <label htmlFor="acc-username">帳號名稱</label>
              <input id="acc-username" value={fields.username} onChange={set('username')} autoComplete="username" />
              <label htmlFor="acc-password">密碼</label>
              <input id="acc-password" type="password" value={fields.password} onChange={set('password')} autoComplete="new-password" />
              <label htmlFor="acc-confirm">確認密碼</label>
              <input id="acc-confirm" type="password" value={fields.confirm} onChange={set('confirm')} autoComplete="new-password" />
              <button type="submit" className="primary" disabled={busy}>綁定帳號</button>
            </form>
            <button type="button" className="link-button" onClick={() => setView('confirm-switch')}>登入其他帳號</button>
          </>
        )}

        {info && view === 'main' && bound && (
          <>
            <p>帳號名稱：<b>{info.username}</b></p>
            <p className="muted">目前有 {info.sessions} 台裝置登入中</p>
            <form className="dialog-form" onSubmit={changePassword}>
              <label htmlFor="acc-current">目前密碼</label>
              <input id="acc-current" type="password" value={fields.current} onChange={set('current')} autoComplete="current-password" />
              <label htmlFor="acc-next">新密碼</label>
              <input id="acc-next" type="password" value={fields.next} onChange={set('next')} autoComplete="new-password" />
              <label htmlFor="acc-confirm-next">確認新密碼</label>
              <input id="acc-confirm-next" type="password" value={fields.confirmNext} onChange={set('confirmNext')} autoComplete="new-password" />
              <button type="submit" disabled={busy}>更改密碼</button>
            </form>
            <div className="dialog-actions">
              <button type="button" disabled={busy} onClick={() => void run(async () => { await api.logoutOthers(); await refresh(); })}>登出其他裝置</button>
              <button type="button" disabled={busy} onClick={logout}>登出這台裝置</button>
              <button type="button" className="link-button" onClick={() => setView('login')}>切換帳號</button>
            </div>
          </>
        )}

        {view === 'confirm-switch' && (
          <>
            <p>這台裝置上未綁定的進度（名稱 {displayName}、已學 {learnedCount} 個魔法）登入其他帳號後將無法取回。</p>
            <div className="dialog-actions">
              <button type="button" className="primary" onClick={() => setView('login')}>我了解，繼續登入</button>
              <button type="button" onClick={() => setView('main')}>取消</button>
            </div>
          </>
        )}

        {view === 'login' && (
          <form className="dialog-form" onSubmit={login}>
            <label htmlFor="acc-login-username">帳號名稱</label>
            <input id="acc-login-username" value={fields.username} onChange={set('username')} autoComplete="username" />
            <label htmlFor="acc-login-password">密碼</label>
            <input id="acc-login-password" type="password" value={fields.password} onChange={set('password')} autoComplete="current-password" />
            <button type="submit" className="primary" disabled={busy}>登入</button>
            <button type="button" className="link-button" onClick={() => setView('main')}>返回</button>
          </form>
        )}
      </div>
    </div>
  );
}
