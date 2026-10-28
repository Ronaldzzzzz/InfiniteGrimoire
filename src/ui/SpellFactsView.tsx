import type { Spell } from '../engine/model';
import { formatPerHit, perHitDiff, spellFacts } from './spell-facts';

/** School, attack, per-hit damage (with the difference from `versus`, the equipped spell), cooldown, statuses and (for named high-tier / rare spells) the chant. Never shown in battle. */
export function SpellFactsView({
  spell,
  level,
  chant,
  versus,
}: {
  spell: Spell;
  level: number;
  chant?: string;
  /** The equipped spell and its level; omit (or pass null) when the viewed spell is the equipped one. */
  versus?: { spell: Spell; level: number } | null;
}) {
  const f = spellFacts(spell, level, chant);
  const diff = perHitDiff(spell, level, versus);
  return (
    <div className="spell-facts">
      <p className="spell-facts-line muted">
        學派：{f.school}　攻擊 {f.attack}　每下傷害 {formatPerHit(f.perHit)}
        {diff && <span style={{ color: diff.tone === 'up' ? '#8fd16a' : '#e5484d' }}>{diff.text}</span>}　冷卻 {f.cooldownSec}
        {f.statuses.length > 0 && <>　狀態：{f.statuses.map((s) => `${s.name} ${s.sec}`).join('、')}</>}
      </p>
      {f.chant && <p className="spell-chant">「{f.chant}」</p>}
    </div>
  );
}
