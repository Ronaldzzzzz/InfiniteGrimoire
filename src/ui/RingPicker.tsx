import { useEffect, useRef, type CSSProperties } from 'react';
import { VIEW, WHEEL_R, wheelCenter, wheelPoints, type Pt } from './circle-draw';

export interface WheelItem {
  key: string;
  label: string;
  ariaLabel: string;
  enabled: boolean;
  on?: boolean;
  title?: string;
  color?: string;
}

const pos = (p: Pt): CSSProperties => ({ left: `${(p.x / VIEW) * 100}%`, top: `${(p.y / VIEW) * 100}%` });

/**
 * A wheel of choices grown around the tapped slot (spec 2026-10-31 section 4): items on a circle, 移除／關閉 in the middle,
 * a transparent backdrop over the whole sheet that closes on tap. Arrow keys walk the enabled items; Escape closes.
 */
export function RingPicker({ at, title, items, onPick, onRemove, onClose, returnFocus }: {
  at: Pt;
  title: string;
  items: WheelItem[];
  onPick: (key: string) => void;
  onRemove?: () => void;
  onClose: () => void;
  returnFocus?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const shape = `${title}|${items.map((i) => i.key).join(',')}`;
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('.ring-item:not(:disabled)')?.focus();
  }, [shape]);

  const centre = wheelCenter(at, WHEEL_R);
  const points = wheelPoints(items.length, centre, WHEEL_R);
  const close = (): void => {
    onClose();
    returnFocus?.();
  };
  const step = (dir: 1 | -1): void => {
    const buttons = [...(box.current?.querySelectorAll<HTMLButtonElement>('.ring-item:not(:disabled)') ?? [])];
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + dir + buttons.length) % buttons.length]!.focus();
  };

  return (
    <div className="ring-picker" role="dialog" aria-label={title} ref={box} tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          step(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          step(-1);
        }
      }}>
      <div className="ring-picker-backdrop" onClick={close} />
      {items.map((it, i) => (
        <button key={it.key} type="button" className={`ring-item${it.on ? ' on' : ''}`} style={{ ...pos(points[i]!), '--c': it.color ?? 'var(--line)' } as CSSProperties}
          aria-label={it.ariaLabel} title={it.title} disabled={!it.enabled} onClick={() => onPick(it.key)}>
          {it.label}
        </button>
      ))}
      <div className="ring-centre" style={pos(centre)}>
        {onRemove && <button type="button" onClick={onRemove}>移除</button>}
        <button type="button" onClick={close}>關閉</button>
      </div>
    </div>
  );
}
