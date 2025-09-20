const build = require('./dist/src/race-solver-builder');
const TIMESTEP = 1 / 15;

// Test different strategy types and pace effects combinations
const testCases = [
  { strategy: 'Front', paceEffects: false, name: 'Front without pace' },
  { strategy: 'Front', paceEffects: true, name: 'Front with pace' },
  { strategy: 'End', paceEffects: false, name: 'End without pace' },
  { strategy: 'End', paceEffects: true, name: 'End with pace' },
  { strategy: 'Pace', paceEffects: false, name: 'Pace without pace effects' },
  { strategy: 'Pace', paceEffects: true, name: 'Pace with pace effects' },
];

testCases.forEach((testCase, index) => {
  console.log(`\n=== Testing ${testCase.name} ===`);

  try {
    let builder = new build.RaceSolverBuilder(1).course(10101).horse({
      speed: 1000,
      stamina: 1000,
      power: 1000,
      guts: 1000,
      wisdom: 1000,
      strategy: testCase.strategy,
      distanceAptitude: 'A',
      surfaceAptitude: 'A',
      strategyAptitude: 'A',
    });

    if (testCase.paceEffects) {
      builder = builder.useDefaultPacer();
    }

    const g = builder.build();
    const s = g.next().value;

    console.log(`Course distance: ${builder._course.distance}`);
    console.log(`Initial speed: ${s.currentSpeed}`);
    console.log(`Has pacer: ${s.pacer !== null}`);

    // Simulate for a few steps to check for immediate issues
    let steps = 0;
    let lastPos = 0;

    for (let i = 0; i < 100 && s.pos < builder._course.distance; i++) {
      const oldPos = s.pos;
      s.step(TIMESTEP);
      steps++;

      if (s.pos <= lastPos && s.accumulatetime.t >= s.startDelay) {
        console.log(`ERROR: Position not advancing at step ${steps}`);
        console.log(`  pos: ${s.pos}, lastPos: ${lastPos}`);
        console.log(`  speed: ${s.currentSpeed}, accel: ${s.accel}`);
        break;
      }

      lastPos = s.pos;

      if (i % 20 === 0) {
        console.log(`  Step ${i}: pos=${s.pos.toFixed(2)}, speed=${s.currentSpeed.toFixed(2)}`);
      }
    }

    if (steps === 100) {
      console.log(`Test completed 100 steps successfully. Final pos: ${s.pos.toFixed(2)}`);
    }
  } catch (e) {
    console.error(`ERROR in ${testCase.name}:`, e.message);
  }
});
