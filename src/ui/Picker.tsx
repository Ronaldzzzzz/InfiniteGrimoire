import { Fragment, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';

export interface PickerItem {
  key: string;
  /** Accessible name of the option. */
  label: string;
  content: ReactNode;
  group?: string;
  disabled?: boolean;
  selected?: boolean;
}

/** Button + popup list. Used instead of a native <select> so each row can show tier / effects. */
export function Picker({
  buttonLabel,
  buttonContent,
  items,
  onSelect,
  header,
  align = 'left',
  className = '',
  disabled = false,
}: {
  buttonLabel: string;
  buttonContent: ReactNode;
  items: PickerItem[];
  onSelect: (key: string) => void;
  header?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number): string => `${baseId}-opt-${i}`;
  const activeIndex = items.findIndex((i) => i.key === activeKey);

  const enabled = items.filter((i) => !i.disabled);

  const close = (focusButton: boolean): void => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  const toggle = (): void => {
    if (open) return close(false);
    const start = items.find((i) => i.selected && !i.disabled) ?? enabled[0];
    setActiveKey(start?.key ?? null);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // keep the keyboard-active option visible in a long list
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeIndex]);

  const choose = (item: PickerItem): void => {
    if (item.disabled) return;
    onSelect(item.key);
    close(true);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      listRef.current?.focus();
      if (enabled.length === 0) return;
      const i = enabled.findIndex((x) => x.key === activeKey);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = i < 0 ? 0 : (i + step + enabled.length) % enabled.length;
      setActiveKey(enabled[next]!.key);
      return;
    }
    // Enter selects only from the list; on a header button it is that button's own action
    if (e.key === 'Enter' && e.target === listRef.current) {
      e.preventDefault();
      const item = enabled.find((x) => x.key === activeKey);
      if (item) choose(item);
    }
  };

  const onBlur = (e: FocusEvent): void => {
    const next = e.relatedTarget as Node | null;
    if (!next || !rootRef.current?.contains(next)) setOpen(false);
  };

  let lastGroup: string | undefined;
  return (
    <div ref={rootRef} className={`picker ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className="picker-button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={buttonLabel}
        onClick={toggle}
      >
        {buttonContent} <span aria-hidden="true">▾</span>
      </button>
      {open && !disabled && (
        <div className={`picker-pop picker-pop-${align}`} onKeyDown={onKeyDown} onBlur={onBlur}>
          {header && <div className="picker-header">{header}</div>}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            className="picker-list"
            aria-label={buttonLabel}
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          >
            {items.map((item, i) => {
              const heading = item.group !== undefined && item.group !== lastGroup;
              lastGroup = item.group;
              return (
                <Fragment key={item.key}>
                  {heading && (
                    <li role="presentation" className="picker-group">
                      {item.group}
                    </li>
                  )}
                  <li
                    id={optionId(i)}
                    role="option"
                    aria-label={item.label}
                    aria-selected={Boolean(item.selected)}
                    aria-disabled={Boolean(item.disabled)}
                    className={`picker-option${item.key === activeKey ? ' active' : ''}${item.selected ? ' selected' : ''}`}
                    onClick={() => choose(item)}
                    onPointerEnter={() => !item.disabled && setActiveKey(item.key)}
                  >
                    {item.content}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
