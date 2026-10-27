import { useEffect, useRef } from 'react';

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

function Toast({ toast, onEquip, onExpire }: { toast: EquipToast; onEquip: (n: number) => void; onExpire: (n: number) => void }) {
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    const t = setTimeout(() => expire.current(toast.n), EQUIP_TOAST_MS);
    return () => clearTimeout(t);
  }, [toast.n]);
  return (
    <div className="equip-toast">
      <span>{`裝備「${toast.name}」？`}</span>
      <button type="button" onClick={() => onEquip(toast.n)}>裝備</button>
    </div>
  );
}

/** Time-limited "equip the new spell?" toasts; letting one lapse means 不裝備, so there is only one button. */
export function EquipToasts({ toasts, onEquip, onExpire }: { toasts: EquipToast[]; onEquip: (n: number) => void; onExpire: (n: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="equip-toasts" aria-label="裝備提示">
      {toasts.map((t) => (
        <Toast key={t.n} toast={t} onEquip={onEquip} onExpire={onExpire} />
      ))}
    </div>
  );
}
