export const ELEMENT_ORDER = ['fire', 'wind', 'thunder', 'earth', 'water'] as const;
export type ElementId = typeof ELEMENT_ORDER[number];
export type ItemId = string; // 'el:<ElementId>:<grade 1-5>', 'mat:<id>' or 'key:<id>'
export type Inventory = Record<ItemId, number>;
export const elementItem = (e: ElementId, grade: number): ItemId => `el:${e}:${grade}`;
export const MAX_ELEMENT_GRADE = 5;
/** GRADE_UPGRADE_COST[g-1] = how many grade-g elements it takes to make one grade g+1. */
export const GRADE_UPGRADE_COST: readonly number[] = [3, 5, 10, 20];
export const GRADE_NAMES = ['初階', '中階', '高階', '極階', '神階'] as const;
/** Worth of one element of this grade, in grade-1 units (1, 3, 15, 150, 3000). */
export const gradeValue = (grade: number): number => {
  let v = 1;
  for (let g = 1; g < grade; g++) v *= GRADE_UPGRADE_COST[g - 1]!;
  return v;
};
/** Format of every inventory / synthesis item id. */
export const ITEM_ID_RE = new RegExp(`^(el:(${ELEMENT_ORDER.join('|')}):[1-${MAX_ELEMENT_GRADE}]|mat:[a-z_]+|key:[a-z_]+)$`);
