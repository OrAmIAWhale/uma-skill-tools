import { expect, test } from 'vitest';
import { RaceSolver } from '../src/race-solver';
import * as build from '../src/race-solver-builder';

const TIMESTEP = 1 / 15;

test('simple race test', () => {
  const builder = new build.RaceSolverBuilder(1).course(10101).horse({
    speed: 1000,
    stamina: 1000,
    power: 1000,
    guts: 1000,
    wisdom: 1000,
    strategy: 'Front',
    distanceAptitude: 'A',
    surfaceAptitude: 'A',
    strategyAptitude: 'A',
  });

  const g = builder.build();
  const s = g.next().value as RaceSolver;

  let lastPos = 0;
  let steps = 0;

  while (s.pos < builder._course.distance && steps < 2000) {
    s.step(TIMESTEP);
    steps++;

    // Check that position progresses
    if (s.accumulatetime.t > s.startDelay && s.pos <= lastPos) {
      throw new Error(`Position not advancing: ${s.pos} <= ${lastPos} at step ${steps}`);
    }

    lastPos = s.pos;
  }

  expect(steps).toBeLessThan(2000);
  expect(s.pos).toBeGreaterThanOrEqual(builder._course.distance);
});
