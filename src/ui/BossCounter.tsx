import { memo } from 'react';
import type { Content } from '../engine/model';
import type { RuntimeStore } from './useGame';

/** The old kill countdown: bosses now come at the end of a zone's last stage. Removed with the battle strip HUD. */
export const BossCounter = memo(function BossCounter(_props: { runtime: RuntimeStore; content: Content }) {
  return null;
});
