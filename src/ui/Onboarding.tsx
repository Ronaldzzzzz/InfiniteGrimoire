import { useState } from 'react';
import type { ApiClient } from '../game/api';

export const MAX_NAME_LENGTH = 16;
type Created = Awaited<ReturnType<ApiClient['createGuest']>>;

export function Onboarding({
  api,
  onDone,
}: {
  api: Pick<ApiClient, 'createGuest'>;
  onDone: (result: Created) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e?: { preventDefault(): void }): Promise<void> => {
    e?.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return setError('請輸入名稱');
    if ([...trimmed].length > MAX_NAME_LENGTH) return setError(`名稱最多 ${MAX_NAME_LENGTH} 個字`);
    setError('');
    setBusy(true);
    try {
      onDone(await api.createGuest(trimmed));
    } catch {
      setError('無法建立角色，請確認連線後再試');
      setBusy(false);
    }
  };

  return (
    <form className="screen-center onboarding" onSubmit={(e) => void submit(e)}>
      <h1>無限魔導書</h1>
      <p className="muted">Infinite Grimoire</p>
      <label htmlFor="display-name">顯示名稱</label>
      <input id="display-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：艾莉亞" autoComplete="off" />
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>開始冒險</button>
    </form>
  );
}
