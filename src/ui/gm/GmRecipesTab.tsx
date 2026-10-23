import { useMemo, useState } from 'react';
import type { Content } from '../../engine/model';
import { ELEMENT_NAMES, itemCounts, slotLabel } from '../messages';
import { useRuntime, type RuntimeStore } from '../useGame';
import { recipeTable } from './recipe-table';

/** Spec §5.3: every recipe with its odds and fusion elements, searchable by spell or element name. */
export function GmRecipesTab({ runtime, content }: { runtime: RuntimeStore; content: Content }) {
  // fusionNeeds reads only `learned`, so subscribe to that instead of the whole game
  const learned = useRuntime(runtime, (s) => s.game.learned);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const game = { ...runtime.getSnapshot().game, learned };
    return recipeTable(content, game).map((r) => {
      const inputs = r.inputs.map((id) => slotLabel(id, content));
      const elements = new Set<string>();
      for (const id of r.inputs) {
        const el = id.split(':');
        if (el[0] === 'el' && el[1]) elements.add(ELEMENT_NAMES[el[1]] ?? '');
        else if (el[0] === 'mat') for (const e of content.materials[id]?.elements ?? []) elements.add(ELEMENT_NAMES[e] ?? '');
        else for (const e of content.spells[id]?.elements ?? []) elements.add(ELEMENT_NAMES[e] ?? '');
      }
      for (const o of content.recipes.find((x) => x.id === r.id)!.outcomes) {
        if (o.spellId) for (const e of content.spells[o.spellId]?.elements ?? []) elements.add(ELEMENT_NAMES[e] ?? '');
      }
      const haystack = [...inputs, ...r.outcomes.map((o) => o.label), ...elements].join(' ');
      return { ...r, inputNames: inputs, fusionText: r.fusion.length ? itemCounts(r.fusion, content) : '—', haystack };
    });
  }, [runtime, learned, content]);

  const q = query.trim();
  const shown = q ? rows.filter((r) => r.haystack.includes(q)) : rows;

  return (
    <div className="gm-recipes">
      <input type="search" placeholder="魔法或元素名稱" aria-label="搜尋配方" value={query} onChange={(e) => setQuery(e.target.value)} />
      <table className="gm-recipe-table">
        <thead>
          <tr>
            <th scope="col">輸入</th>
            <th scope="col">結果</th>
            <th scope="col">融合需要</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td>{r.inputNames.join(' ＋ ')}</td>
              <td>
                {r.outcomes.map((o, i) => (
                  <div key={i}>
                    {o.label} {o.pct}%{o.rare && <span className="gm-rare">稀有</span>}
                  </div>
                ))}
              </td>
              <td>{r.fusionText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
