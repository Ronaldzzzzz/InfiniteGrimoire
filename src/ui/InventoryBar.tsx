import { ELEMENT_ORDER, MAX_ELEMENT_GRADE, type ElementId, type Inventory, type ItemId } from '../engine/types';
import { itemName } from './messages';

function sortedItems(inv: Inventory): [ItemId, number][] {
  const rank = (id: ItemId): number => {
    const [kind, el, grade] = id.split(':');
    if (kind === 'el') return ELEMENT_ORDER.indexOf(el as ElementId) * 10 + Number(grade);
    return 1000;
  };
  return Object.entries(inv)
    .filter(([, n]) => n > 0)
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}

export function InventoryBar({
  inventory,
  onPick,
  onUpgrade,
}: {
  inventory: Inventory;
  onPick: (id: ItemId) => void;
  onUpgrade: (element: ElementId, grade: number) => void;
}) {
  const items = sortedItems(inventory);
  return (
    <footer className="inventory">
      {items.length === 0 && <span className="muted">背包是空的，打倒魔物取得元素</span>}
      {items.map(([id, count]) => {
        const [kind, el, grade] = id.split(':');
        const upgradable = kind === 'el' && Number(grade) < MAX_ELEMENT_GRADE && count >= 3;
        return (
          <span key={id} className={`item ${kind === 'el' ? `el-${el}` : 'mat'}`}>
            <button type="button" onClick={() => onPick(id)}>
              {itemName(id)} ×{count}
            </button>
            {upgradable && (
              <button type="button" className="upgrade" onClick={() => onUpgrade(el as ElementId, Number(grade))}>
                升階
              </button>
            )}
          </span>
        );
      })}
    </footer>
  );
}
