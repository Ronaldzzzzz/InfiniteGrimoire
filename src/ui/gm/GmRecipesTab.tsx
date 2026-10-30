import { useMemo, useState } from 'react';
import type { Content } from '../../engine/model';
import { ELEMENT_NAMES } from '../messages';
import { circleTable } from './recipe-table';

/** Every textbook circle with the spell it teaches (rare spells with their chance), searchable by spell or element name. */
export function GmRecipesTab({ content }: { content: Content }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => circleTable(content).map((r) => ({ ...r, haystack: [r.name, r.layout, ...r.elements.map((e) => ELEMENT_NAMES[e])].join(' ') })),
    [content],
  );
  const q = query.trim();
  const shown = q ? rows.filter((r) => r.haystack.includes(q)) : rows;

  return (
    <div className="gm-recipes">
      <input type="search" placeholder="魔法或元素名稱" aria-label="搜尋配方" value={query} onChange={(e) => setQuery(e.target.value)} />
      <table className="gm-recipe-table">
        <thead>
          <tr>
            <th scope="col">魔法</th>
            <th scope="col">魔法陣</th>
            <th scope="col">機率（含 10% 大失敗；稀有為成功時再擲的機率）</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td>{r.name} Lv.{r.tier}{r.rare && <span className="gm-rare">稀有</span>}</td>
              <td>{r.layout}</td>
              <td>{r.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
