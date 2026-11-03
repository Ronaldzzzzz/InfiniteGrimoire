import type { RuneId } from '../engine/circle';
import { runeArtSrc, useArt } from './useArt';

export const RUNE_BAND_COUNT = 12;

/** Placeholder glyphs on a 24x24 box centred on (0,0), drawn with the parent's stroke colour. */
const SHAPES: Record<RuneId, string> = {
  bolt: 'M -10 0 H 8 M 2 -6 L 9 0 L 2 6 M -10 0 L -7 -4 M -10 0 L -7 4',
  blades: 'M -9 -9 L 9 9 M 9 -9 L -9 9 M -9 -9 L -5 -9 M -9 -9 L -9 -5 M 9 -9 L 5 -9 M 9 -9 L 9 -5',
  ring: 'M -3 0 A 3 3 0 1 0 3 0 A 3 3 0 1 0 -3 0 M -7 0 A 7 7 0 1 0 7 0 A 7 7 0 1 0 -7 0 M -11 0 A 11 11 0 1 0 11 0 A 11 11 0 1 0 -11 0',
  chain: 'M -9 0 A 4 4 0 1 0 -1 0 A 4 4 0 1 0 -9 0 M -3 0 A 4 4 0 1 0 5 0 A 4 4 0 1 0 -3 0 M 3 0 A 4 4 0 1 0 11 0 A 4 4 0 1 0 3 0',
  zone: 'M -10 0 A 10 10 0 1 0 10 0 A 10 10 0 1 0 -10 0 M -10 0 H 10 M 0 -10 V 10 M -5 -9 V 9 M 5 -9 V 9',
  meteor: 'M 0 8 L 3 0 L 0 -2 L -3 0 Z M 6 -10 L 1 -2 M 10 -6 L 3 0 M 2 -11 L -1 -3',
  storm: 'M 0 0 C 2 -2 5 0 4 3 C 3 7 -3 8 -6 4 C -9 0 -7 -7 0 -9 C 7 -10 11 -4 10 2',
  field: 'M -10 -8 H 10 L 0 9 Z M 0 -2 m -1.5 0 a 1.5 1.5 0 1 0 3 0 a 1.5 1.5 0 1 0 -3 0',
};

/** One rune as an SVG group; `null` is the locked 「？」. Uses the optional art image when it has loaded. */
export function RuneIcon({ id, size }: { id: RuneId | null; size: number }) {
  const art = useArt(runeArtSrc(id ?? 'locked'));
  const k = size / 24;
  if (id === null) {
    return (
      <g className="rune-icon" data-rune="locked">
        <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={size} fill="currentColor" aria-hidden="true">？</text>
      </g>
    );
  }
  if (art) {
    return (
      <g className="rune-icon" data-rune={id}>
        <image href={runeArtSrc(id)} x={-size / 2} y={-size / 2} width={size} height={size} />
      </g>
    );
  }
  return (
    <g className="rune-icon" data-rune={id} transform={`scale(${k})`}>
      <path d={SHAPES[id]} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
