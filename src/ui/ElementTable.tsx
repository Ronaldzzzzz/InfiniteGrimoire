import { ELEMENT_ORDER, GRADE_NAMES, GRADE_UPGRADE_COST, elementItem, MAX_ELEMENT_GRADE, type ElementId, type Inventory, type ItemId } from '../engine/types';
import { itemName } from './messages';
import { ELEMENT_LABEL } from './picker-data';

const GRADES = Array.from({ length: MAX_ELEMENT_GRADE }, (_, i) => i + 1);

export function lowestUpgradableGrade(inv: Inventory, el: ElementId): number | null {
  for (let g = 1; g < MAX_ELEMENT_GRADE; g++) if ((inv[elementItem(el, g)] ?? 0) >= GRADE_UPGRADE_COST[g - 1]!) return g;
  return null;
}

function materialIds(inv: Inventory): ItemId[] {
  return Object.keys(inv).filter((k) => k.startsWith('mat:') && (inv[k] ?? 0) > 0).sort();
}

/**
 * One row per element, one column per grade. Empty cells stay in place so the table keeps its shape.
 * Each grade header below the top shows its upgrade cost (3, 10, 30, 100 of it make one of the next).
 */
export function ElementTable({
  inventory,
  onPick,
  onUpgrade,
  upgradeLocked = false,
}: {
  inventory: Inventory;
  onPick: (id: ItemId) => void;
  onUpgrade: (element: ElementId, grade: number) => void;
  /** e.g. while a synthesis is in flight, whose reply would undo the upgrade */
  upgradeLocked?: boolean;
}) {
  return (
    <table className="element-table">
      <thead>
        <tr>
          <th scope="col" className="el-name"><span className="sr-only">屬性</span></th>
          {GRADES.map((g) => {
            const cost = GRADE_UPGRADE_COST[g - 1];
            return (
              <th key={g} scope="col">
                {GRADE_NAMES[g - 1]}
                {cost !== undefined && (
                  <span className="grade-cost" title={`${cost} 個${GRADE_NAMES[g - 1]}升成 1 個${GRADE_NAMES[g]}`}>{cost}→1</span>
                )}
              </th>
            );
          })}
          <th scope="col"><span className="sr-only">升階</span></th>
        </tr>
      </thead>
      <tbody>
        {ELEMENT_ORDER.map((el) => {
          const up = lowestUpgradableGrade(inventory, el);
          return (
            <tr key={el}>
              <th scope="row" className={`el-name el-${el}`}>{ELEMENT_LABEL[el]}</th>
              {GRADES.map((g) => {
                const id = elementItem(el, g);
                const n = inventory[id] ?? 0;
                return (
                  <td key={g}>
                    <button type="button" className="cell" disabled={n === 0} aria-label={`${itemName(id)} ×${n}`} onClick={() => onPick(id)}>
                      {n}
                    </button>
                  </td>
                );
              })}
              <td>
                <button
                  type="button"
                  className="upgrade"
                  disabled={up === null || upgradeLocked}
                  aria-label={`升階${ELEMENT_LABEL[el]}`}
                  onClick={() => {
                    if (up !== null) onUpgrade(el, up);
                  }}
                >
                  升階
                </button>
              </td>
            </tr>
          );
        })}
        <tr className="mat-row">
          <th scope="row">素材</th>
          <td colSpan={GRADES.length + 1}>
            {materialIds(inventory).length === 0 && <span className="muted">尚無素材</span>}
            {materialIds(inventory).map((id) => {
              const n = inventory[id] ?? 0;
              return (
                <button key={id} type="button" className="cell mat" disabled={n === 0} aria-label={`${itemName(id)} ×${n}`} onClick={() => onPick(id)}>
                  {itemName(id)} ×{n}
                </button>
              );
            })}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
