import { MAX_ELEMENT_GRADE, elementItem, type ElementId, type Inventory, type ItemId } from './types';

/** Own-property count only: inherited Object members (e.g. "constructor") are never stock. */
const countOf = (inv: Inventory, id: ItemId): number => (Object.hasOwn(inv, id) ? (inv[id] ?? 0) : 0);

export function addItems(inv: Inventory, items: ItemId[]): Inventory {
  const out: Inventory = { ...inv };
  for (const id of items) out[id] = countOf(out, id) + 1;
  return out;
}

/** Returns null when the inventory lacks any item. Zero-count keys are deleted. */
export function removeItems(inv: Inventory, items: ItemId[]): Inventory | null {
  const out: Inventory = { ...inv };
  for (const id of items) {
    const have = countOf(out, id);
    if (have < 1) return null;
    if (have === 1) delete out[id];
    else out[id] = have - 1;
  }
  return out;
}

/** 3 x grade -> 1 x (grade+1). */
export function upgradeElement(inv: Inventory, element: ElementId, grade: number): Inventory | null {
  if (grade < 1 || grade >= MAX_ELEMENT_GRADE) return null;
  const from = elementItem(element, grade);
  const removed = removeItems(inv, [from, from, from]);
  if (!removed) return null;
  return addItems(removed, [elementItem(element, grade + 1)]);
}

export function elementEquivalent(inv: Inventory, element: ElementId): number {
  let sum = 0;
  for (let g = 1; g <= MAX_ELEMENT_GRADE; g++) {
    sum += (inv[elementItem(element, g)] ?? 0) * 3 ** (g - 1);
  }
  return sum;
}
