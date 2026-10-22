import { useState } from 'react';
import { comboKey } from '../engine/crafting';
import type { Content, SynthLogEntry } from '../engine/model';
import { ELEMENT_ORDER, GRADE_NAMES, elementItem, MAX_ELEMENT_GRADE, type ItemId } from '../engine/types';
import { slotLabel, spellLabel } from './messages';
import { ELEMENT_LABEL } from './picker-data';

const GRADES = Array.from({ length: MAX_ELEMENT_GRADE }, (_, i) => i + 1);

type Log = Record<string, SynthLogEntry>;

export interface MatrixCell {
  a: string;
  b: string;
  attempts: number;
  /** most frequent result, 無反應, or ？ when never tried */
  label: string;
  /** how many other results were seen */
  more: number;
  /** e.g. 火球 75%、魔力過載 25%（試過 4 次）; 未嘗試 when never tried */
  detail: string;
}

function resultName(id: string, content: Content): string {
  if (id === 'none') return '無反應';
  if (id === 'overload') return '魔力過載';
  return spellLabel(id, content);
}

/** What the player has learned about a + b, from their own attempts only (no recipe is revealed). */
export function matrixCell(log: Log, a: string, b: string, content: Content): MatrixCell {
  const key = comboKey([a, b]);
  const entry = Object.hasOwn(log, key) ? log[key] : undefined;
  if (!entry || entry.attempts === 0) return { a, b, attempts: 0, label: '？', more: 0, detail: '未嘗試' };
  const results = Object.entries(entry.results).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  const detail = results
    .map(([id, n]) => `${resultName(id, content)} ${Math.round((n / entry.attempts) * 100)}%`)
    .join('、');
  return {
    a,
    b,
    attempts: entry.attempts,
    label: results[0] ? resultName(results[0][0], content) : '無反應',
    more: Math.max(0, results.length - 1),
    detail: `${detail}（試過 ${entry.attempts} 次）`,
  };
}

/** A combo fits a grade table when it is two elements of one grade. */
function fitsTable(key: string): boolean {
  const [x, y] = key.split('+');
  if (!x || !y) return false;
  const [kx, , gx] = x.split(':');
  const [ky, , gy] = y.split(':');
  return kx === 'el' && ky === 'el' && gx === gy;
}

/** Tried combos that no grade table shows (初階火 + 中階風, materials, spells), sorted by key. No id contains '+'. */
export function crossGradeEntries(log: Log): { key: string; a: string; b: string }[] {
  return Object.keys(log)
    .filter((k) => !fitsTable(k))
    .sort()
    .map((key) => {
      const [a = '', b = ''] = key.split('+');
      return { key, a, b };
    });
}

const pairName = (a: string, b: string, content: Content): string => `${slotLabel(a, content)} + ${slotLabel(b, content)}`;

export function SynthesisMatrix({
  log,
  content,
  onPickPair,
}: {
  log: Log;
  content: Content;
  onPickPair: (a: string, b: string) => void;
}) {
  const [grade, setGrade] = useState(1);
  const [picked, setPicked] = useState<MatrixCell | null>(null);
  const cols: ItemId[] = ELEMENT_ORDER.map((el) => elementItem(el, grade));

  const pick = (cell: MatrixCell): void => {
    setPicked(cell);
    onPickPair(cell.a, cell.b);
  };
  const cross = crossGradeEntries(log);

  return (
    <div className="synth-matrix">
      <div className="matrix-grades" role="group" aria-label="階級">
        {GRADES.map((g) => (
          <button key={g} type="button" aria-pressed={grade === g} className={grade === g ? 'active' : ''} onClick={() => setGrade(g)}>
            {GRADE_NAMES[g - 1]}
          </button>
        ))}
      </div>
      <table className="matrix">
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">元素</span></th>
            {cols.map((id) => (
              <th key={id} scope="col" className={`el-${id.split(':')[1]}`}>
                {ELEMENT_LABEL[ELEMENT_ORDER.find((e) => id === elementItem(e, grade))!]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ELEMENT_ORDER.map((el) => {
            const row = elementItem(el, grade);
            return (
              <tr key={el}>
                <th scope="row" className={`el-${el}`}>{ELEMENT_LABEL[el]}</th>
                {cols.map((col) => {
                  const cell = matrixCell(log, row, col, content);
                  const state = cell.attempts === 0 ? 'unknown' : cell.label === '無反應' ? 'none' : 'found';
                  return (
                    <td key={col}>
                      <button
                        type="button"
                        className={`matrix-cell ${state}`}
                        aria-label={`${pairName(row, col, content)}：${cell.detail}`}
                        title={`${pairName(row, col, content)}：${cell.detail}`}
                        onClick={() => pick(cell)}
                      >
                        <span className="matrix-label">{cell.label}</span>
                        {cell.more > 0 && <span className="matrix-more">+{cell.more}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="matrix-detail" aria-live="polite">
        {picked ? `${pairName(picked.a, picked.b, content)}：${picked.detail}` : '點格子把這兩個素材放進合成槽'}
      </p>
      {cross.length > 0 && (
        <>
          <h4>其他組合</h4>
          <ul className="matrix-cross">
            {cross.map(({ key, a, b }) => {
              const cell = matrixCell(log, a, b, content);
              return (
                <li key={key}>
                  <button type="button" aria-label={`${pairName(a, b, content)}：${cell.detail}`} onClick={() => pick(cell)}>
                    {pairName(a, b, content)} → {cell.detail}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
