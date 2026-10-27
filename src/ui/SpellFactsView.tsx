import type { Spell } from '../engine/model';
import { spellFacts } from './spell-facts';

/** School, attack, cooldown, statuses and (for named high-tier / rare spells) the chant. Never shown in battle. */
export function SpellFactsView({ spell, level, chant }: { spell: Spell; level: number; chant?: string }) {
  const f = spellFacts(spell, level, chant);
  return (
    <div className="spell-facts">
      <p className="spell-facts-line muted">
        學派：{f.school}　攻擊 {f.attack}　冷卻 {f.cooldownSec}
        {f.statuses.length > 0 && <>　狀態：{f.statuses.map((s) => `${s.name} ${s.sec}`).join('、')}</>}
      </p>
      {f.chant && <p className="spell-chant">「{f.chant}」</p>}
    </div>
  );
}
