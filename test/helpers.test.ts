import * as fc from 'fast-check';
import { isSortedByStart } from '../src/course-data';
import { forAll, prop } from './test-helpers';

prop(
  'array with strictly increasing elements is sorted',
  forAll(fc.array(fc.nat()), (xs) => {
    let acc = -1;
    const a = xs.map((x) => ({ start: (acc += x + 1) }));
    return isSortedByStart(a);
  }),
);

prop(
  'array with not strictly increasing elements is not sorted',
  forAll(fc.array(fc.nat(), { minLength: 2 }), (xs) => {
    xs.sort((a, b) => +(a > b) - +(b > a));
    const sorted = xs.slice();
    while (xs.every((x, i) => x === sorted[i])) {
      for (let i = xs.length; --i >= 0; ) {
        const j = Math.floor(Math.random() * (i + 1));
        [xs[i], xs[j]] = [xs[j], xs[i]];
      }
    }
    return !isSortedByStart(xs.map((x) => ({ start: x })));
  }),
);
