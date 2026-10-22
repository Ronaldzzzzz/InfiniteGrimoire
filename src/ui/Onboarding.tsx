import { useState } from 'react';
import { passwordProblem, usernameProblem } from '../engine/account-rules';
import { RateLimitedError, type ApiClient, type LoginResult } from '../game/api';
import { accountErrorMessage, passwordProblemMessage, usernameProblemMessage } from './messages';

export const MAX_NAME_LENGTH = 16;

export function Onboarding({
  api,
  onDone,
}: {
  api: Pick<ApiClient, 'createGuest' | 'login'>;
  onDone: (result: LoginResult) => void;
}) {
  const [mode, setMode] = useState<'new' | 'login'>('new');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (next: 'new' | 'login'): void => {
    setMode(next);
    setError('');
  };

  const createGuest = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return setError('請輸入名稱');
    if ([...trimmed].length > MAX_NAME_LENGTH) return setError(`名稱最多 ${MAX_NAME_LENGTH} 個字`);
    setError('');
    setBusy(true);
    try {
      onDone(await api.createGuest(trimmed));
    } catch (e) {
      setError(e instanceof RateLimitedError ? accountErrorMessage(e) : '無法建立角色，請確認連線後再試');
      setBusy(false);
    }
  };

  const login = async (): Promise<void> => {
    const up = usernameProblem(username);
    if (up) return setError(usernameProblemMessage(up));
    if (passwordProblem(password)) return setError(passwordProblemMessage());
    setError('');
    setBusy(true);
    try {
      onDone(await api.login(username, password));
    } catch (e) {
      setError(accountErrorMessage(e));
      setBusy(false);
    }
  };

  const submit = (e: { preventDefault(): void }): void => {
    e.preventDefault();
    if (busy) return;
    void (mode === 'new' ? createGuest() : login());
  };

  return (
    <form className="screen-center onboarding" onSubmit={submit}>
      <h1>無限魔導書</h1>
      <p className="muted">Infinite Grimoire</p>
      {mode === 'new' ? (
        <>
          <label htmlFor="display-name">顯示名稱</label>
          <input id="display-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：艾莉亞" autoComplete="off" />
        </>
      ) : (
        <>
          <label htmlFor="login-username">帳號名稱</label>
          <input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          <label htmlFor="login-password">密碼</label>
          <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? '處理中…' : mode === 'new' ? '開始冒險' : '登入'}</button>
      <button type="button" className="link-button" onClick={() => switchMode(mode === 'new' ? 'login' : 'new')}>
        {mode === 'new' ? '已有帳號？登入' : '建立新角色'}
      </button>
    </form>
  );
}
