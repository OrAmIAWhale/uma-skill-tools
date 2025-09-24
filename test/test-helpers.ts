import * as fc from 'fast-check';
import { expect, test } from 'vitest';

export function prop(msg: string, f: () => void) {
  test(msg, () => {
    expect(f).not.toThrow();
  });
}

export function forAll<Ts extends [unknown, ...unknown[]]>(
  ...args: [...arbs: { [K in keyof Ts]: fc.Arbitrary<Ts[K]> }, pred: (...args: Ts) => boolean | void]
) {
  return () => fc.assert(fc.property(...args));
}
