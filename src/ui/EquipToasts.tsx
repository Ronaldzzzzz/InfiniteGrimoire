import { useEffect, useRef, useState, type CSSProperties } from 'react';

export const EQUIP_TOAST_MS = 3000;
export const MAX_EQUIP_TOASTS = 3;

export interface EquipToast {
  n: number;
  spellId: string;
  name: string;
}

/** Newest first; past MAX_EQUIP_TOASTS the oldest is dropped. */
export function pushToast(list: EquipToast[], t: EquipToast): EquipToast[] {
  return [t, ...list].slice(0, MAX_EQUIP_TOASTS);
}

function Toast({ toast, paused, onEquip, onExpire }: { toast: EquipToast; paused: boolean; onEquip: (n: number) => void; onExpire: (n: number) => void }) {
  const expire = useRef(onExpire);
  const left = useRef(EQUIP_TOAST_MS);
  // the bar restarts (new key) from the time left whenever the countdown stops, so it always mirrors the timer
  const [bar, setBar] = useState({ ms: EQUIP_TOAST_MS, key: 0 });
  useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);
  // The 3 s only run while nothing covers the toast (a rare reveal pauses it and keeps the time left).
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const t = setTimeout(() => expire.current(toast.n), left.current);
    return () => {
      clearTimeout(t);
      left.current = Math.max(0, left.current - (Date.now() - started));
      setBar((b) => ({ ms: left.current, key: b.key + 1 }));
    };
  }, [toast.n, paused]);
  return (
    <div className="equip-toast">
      <span>{`裝備「${toast.name}」？`}</span>
      <span
        key={bar.key}
        className="equip-toast-bar"
        aria-hidden="true"
        style={{
          animationDuration: `${bar.ms}ms`,
          animationPlayState: paused ? 'paused' : 'running',
          '--bar-start': String(bar.ms / EQUIP_TOAST_MS),
        } as CSSProperties}
      />
      <button type="button" onClick={() => onEquip(toast.n)}>裝備</button>
    </div>
  );
}

/** Time-limited "equip the new spell?" toasts; letting one lapse means 不裝備, so there is only one button. */
export function EquipToasts({ toasts, paused = false, onEquip, onExpire }: {
  toasts: EquipToast[]; paused?: boolean; onEquip: (n: number) => void; onExpire: (n: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="equip-toasts" aria-label="裝備提示">
      {toasts.map((t) => (
        <Toast key={t.n} toast={t} paused={paused} onEquip={onEquip} onExpire={onExpire} />
      ))}
    </div>
  );
}
