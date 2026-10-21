import type { Rng } from '../src/engine/rng';

export function createCryptoRng(): Rng {
  const next = (): number => crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
  };
}
