import * as fc from 'fast-check';
import * as arb from './arb/race';
import { forAll, prop } from './test-helpers';

import { RaceSolver } from '../src/race-solver';

// Test configuration - can be adjusted as needed
const TEST_RUNS = 50; // Further reduced for CI stability
const TIMESTEP = 1 / 15;

fc.configureGlobal({ numRuns: TEST_RUNS });
prop(
  'race should always progress forward',
  forAll(arb.Race(), (params) => {
    const builder = arb.makeBuilder(params);
    const g = builder.build();

    for (let i = 0; i < params.nsamples; ++i) {
      const s = g.next().value as RaceSolver;
      let lastPos = 0;
      let lastT = 0;
      while (s.pos < builder._course.distance) {
        s.step(TIMESTEP);
        if (s.accumulatetime.t <= lastT || (s.pos <= lastPos && !(s.accumulatetime.t < s.startDelay))) {
          return false;
        }
        lastPos = s.pos;
        lastT = s.accumulatetime.t;
      }
    }

    return true;
  }),
);

prop(
  'position should always be defined',
  forAll(arb.Race(), (params) => {
    const builder = arb.makeBuilder(params);
    const g = builder.build();

    for (let i = 0; i < params.nsamples; ++i) {
      const s = g.next().value as RaceSolver;
      while (s.pos < builder._course.distance) {
        s.step(TIMESTEP);
        if (isNaN(s.pos)) {
          return false;
        }
      }
    }
    return true;
  }),
);

prop(
  'identical race solvers should always stay in sync',
  forAll(arb.Race(), (params) => {
    const b1 = arb.makeBuilder(params);
    const b2 = b1.fork();
    const g1 = b1.build();
    const g2 = b2.build();

    for (let i = 0; i < params.nsamples; ++i) {
      const s1 = g1.next().value as RaceSolver;
      const s2 = g2.next().value as RaceSolver;

      while (s1.pos < b1._course.distance) {
        s1.step(TIMESTEP);
        s2.step(TIMESTEP);
        if (s1.pos != s2.pos) {
          return false;
        }
      }
    }
    return true;
  }),
);
