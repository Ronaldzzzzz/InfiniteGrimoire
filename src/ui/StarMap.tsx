import type { Content, Passive, Spell } from '../engine/model';
import { ELEMENT_ORDER } from '../engine/types';
import { COLORS, spellColor } from '../render/palette';
import { polar, sectorAngle, SECTOR_DEG, tierRadius, type Pt, type Star } from './star-layout';

const ELEMENT_CHAR = { fire: '火', wind: '風', thunder: '雷', earth: '土', water: '水' } as const;

export interface StarMapLayout {
  stars: { id: string; spell: Spell; star: Star }[];
  edges: [string, string][];
  passives: { passive: Passive; at: Pt }[];
  /** Highest tier drawn as a ring (the map grows with what is learned). */
  maxTier: number;
  /** Radius of the sector labels. */
  outer: number;
}

/** Star size grows a little with the tier. */
export const starRadius = (tier: number) => 6 + 0.8 * tier;

/**
 * The star map's SVG content: sector lines and labels, tier rings, the lines between spells sharing nodes, the learned
 * spells' stars (crafted ones with an amber halo) and the passives near the centre. Clicks go to `onActivate`.
 */
export function StarMap({
  layout,
  equipped,
  unlocked,
  selected,
  flash,
  onActivate,
  onDouble,
}: {
  layout: StarMapLayout;
  equipped: string;
  unlocked: readonly string[];
  selected: string | null;
  flash: string | null;
  onActivate: (kind: 'spell' | 'passive', id: string) => void;
  onDouble: (id: string) => void;
}) {
  const at = new Map(layout.stars.map((s) => [s.id, s.star]));
  const keys = (kind: 'spell' | 'passive', id: string) => ({
    onClick: () => onActivate(kind, id),
    onKeyDown: (e: { key: string; preventDefault(): void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate(kind, id);
      }
    },
  });
  return (
    <>
      <g className="star-grid" aria-hidden="true">
        <circle cx={0} cy={0} r={85} fill={COLORS.rune} opacity={0.06} />
        {Array.from({ length: layout.maxTier }, (_, i) => i + 1).map((t) => (
          <circle key={t} cx={0} cy={0} r={tierRadius(t)} fill="none" stroke="#2a2f3a" strokeDasharray={t % 2 === 0 ? undefined : '2 6'} />
        ))}
        {Array.from({ length: layout.maxTier }, (_, i) => i + 1).filter((t) => t % 2 === 0).map((t) => (
          <text key={t} x={3} y={-tierRadius(t) - 3} fontSize={9} fill="#5a6274">Lv.{t}</text>
        ))}
        {ELEMENT_ORDER.map((e, i) => {
          const end = polar(SECTOR_DEG * i, layout.outer);
          const label = polar(sectorAngle(e), layout.outer);
          return (
            <g key={e}>
              <line x1={0} y1={0} x2={end.x} y2={end.y} stroke="#2a2f3a" />
              <text x={label.x} y={label.y + 5} textAnchor="middle" fontSize={15} fontWeight="bold" fill={COLORS.element[e]}>{ELEMENT_CHAR[e]}</text>
            </g>
          );
        })}
      </g>
      <g className="star-lines" aria-hidden="true">
        {layout.edges.map(([a, b]) => {
          const p = at.get(a), q = at.get(b);
          return p && q ? <line key={`${a}~${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={COLORS.rune} strokeOpacity={0.3} strokeWidth={1.2} /> : null;
        })}
      </g>
      {layout.passives.map(({ passive: p, at: { x, y } }) => {
        const on = unlocked.includes(p.id);
        const isSelected = selected === p.id;
        return (
          <g key={p.id} role="button" tabIndex={0} aria-label={`${p.name}（被動${on ? '' : '，未解鎖'}）`} aria-pressed={isSelected}
            className="grimoire-node star-passive" {...keys('passive', p.id)}>
            <rect x={x - 8} y={y - 8} width={16} height={16} transform={`rotate(45 ${x} ${y})`} fill={on ? COLORS.amber : COLORS.bg}
              stroke={isSelected ? COLORS.rune : COLORS.amber} strokeWidth={isSelected ? 3 : 1.5} />
            <text x={x} y={y + 20} textAnchor="middle" fontSize={9} fill="#b8bcc6">{p.name}</text>
          </g>
        );
      })}
      {layout.stars.map(({ id, spell, star: { x, y } }) => {
        const r = starRadius(spell.tier);
        const crafted = !spell.named;
        const mark = equipped === id || selected === id;
        return (
          <g key={id} role="button" tabIndex={0} aria-label={`${spell.name}${crafted ? '（自創）' : ''}`} aria-pressed={selected === id}
            className={`grimoire-node star${crafted ? ' crafted' : ''}${flash === id ? ' node-flash' : ''}`}
            {...keys('spell', id)} onDoubleClick={() => onDouble(id)}>
            {crafted && <circle className="star-halo" cx={x} cy={y} r={r + 4} fill="none" stroke={COLORS.amber} strokeWidth={2} />}
            <circle cx={x} cy={y} r={crafted ? r - 2 : r} fill={spellColor(spell)}
              stroke={mark ? COLORS.rune : 'none'} strokeWidth={mark ? 3 : 0} />
            <text x={x} y={y + r + 12} textAnchor="middle" fontSize={10} fill="#e6e9ef">{spell.name}</text>
          </g>
        );
      })}
    </>
  );
}
