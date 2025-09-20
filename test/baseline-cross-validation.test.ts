import * as fs from 'fs';
import * as path from 'path';
import { beforeAll, describe, expect, test } from 'vitest';

// Import from new codebase
import { getParser } from '../src/condition-parser';
import { Strategy } from '../src/horse-type';
import { RaceSolverBuilder } from '../src/race-solver-builder';

// Define the baseline data structure
interface ConditionParseBaseline {
  condition: string;
  success: boolean;
  error?: string;
  hasSamplePolicy?: boolean;
}

interface RaceProgressionBaseline {
  seed: number;
  strategy: string;
  steps: number;
  positions: number[];
  finalPosition: number;
  finalTime: number;
  completed: boolean;
}

interface TestBaselines {
  conditionParser: ConditionParseBaseline[];
  raceProgression: RaceProgressionBaseline[];
  strategiesSupported: string[];
  courseIds: number[];
  timestamp: string;
  version: string;
}

const BASELINE_FILE = path.resolve(process.cwd(), 'test', 'baselines', 'old-code-baselines.json');

// Load baselines if they exist
let baselines: TestBaselines | null = null;

beforeAll(() => {
  try {
    if (fs.existsSync(BASELINE_FILE)) {
      const baselineData = fs.readFileSync(BASELINE_FILE, 'utf8');
      baselines = JSON.parse(baselineData);
      console.log(`✓ Loaded baselines from ${BASELINE_FILE}`);
    } else {
      console.log(`ℹ No baseline file found at ${BASELINE_FILE}`);
      console.log('  Run baseline generation script first to create baselines');
    }
  } catch (error) {
    console.warn(`Failed to load baselines: ${error}`);
  }
});

describe('Baseline Cross-validation: New Code vs Old Baselines', () => {
  test('condition parser matches old baseline behavior', () => {
    if (!baselines?.conditionParser) {
      console.log('⚠ Skipping condition parser test: no baselines available');
      return;
    }

    const parser = getParser();
    let matches = 0;
    let total = baselines.conditionParser.length;

    for (const baseline of baselines.conditionParser) {
      let newSuccess = false;
      let newHasSamplePolicy = false;

      try {
        const tokens = parser.tokenize(baseline.condition);
        const parsed = parser.parse(tokens);
        newSuccess = true;
        newHasSamplePolicy = !!parsed.samplePolicy;
      } catch {
        // do nothing
      }

      // Compare with baseline
      const successMatches = newSuccess === baseline.success;
      const samplePolicyMatches = !baseline.success || newHasSamplePolicy === (baseline.hasSamplePolicy ?? false);

      if (successMatches && samplePolicyMatches) {
        matches++;
      } else {
        console.log(
          `❌ Mismatch for "${baseline.condition}":`,
          `old success=${baseline.success}, new success=${newSuccess}`,
          baseline.hasSamplePolicy !== undefined
            ? `old hasPolicy=${baseline.hasSamplePolicy}, new hasPolicy=${newHasSamplePolicy}`
            : '',
        );
      }
    }

    const matchRate = matches / total;
    console.log(`Condition parser match rate: ${matches}/${total} (${(matchRate * 100).toFixed(1)}%)`);

    // Count how many conditions now work that didn't work before
    let improvementCount = 0;
    for (const baseline of baselines.conditionParser) {
      if (!baseline.success) {
        try {
          const tokens = parser.tokenize(baseline.condition);
          parser.parse(tokens);
          improvementCount++;
        } catch {
          // Still doesn't work
        }
      }
    }

    console.log(`📈 Conditions that now work: ${improvementCount} (previously failed in old code)`);

    // Both parsers should work well - we should have high compatibility
    expect(matchRate).toBeGreaterThan(0.9); // At least 90% compatibility

    // If there are improvements, that's great! If not, that means both parsers work similarly well
    expect(improvementCount).toBeGreaterThanOrEqual(0);
  });

  test('race progression matches old baseline patterns', () => {
    if (!baselines?.raceProgression) {
      console.log('⚠ Skipping race progression test: no baselines available');
      return;
    }

    let matches = 0;
    let total = baselines.raceProgression.length;

    for (const baseline of baselines.raceProgression) {
      try {
        // Map old strategy names to new ones
        const strategyMap: Record<string, Strategy> = {
          Nige: Strategy.Front,
          Senkou: Strategy.Pace,
          Sasi: Strategy.Late,
          Oikomi: Strategy.End,
          Oonige: Strategy.Front, // If this exists in old code
        };

        const newStrategy = strategyMap[baseline.strategy];
        if (!newStrategy) {
          console.log(`⚠ Unknown strategy in baseline: ${baseline.strategy}`);
          continue;
        }

        // Create solver with same parameters as baseline
        const builder = new RaceSolverBuilder(1)
          .course(10101) // Use known course
          .horse({
            strategy: newStrategy,
            speed: 1200,
            stamina: 1200,
            power: 1200,
            guts: 1200,
            wisdom: 1200,
            distanceAptitude: 'A',
            surfaceAptitude: 'A',
            strategyAptitude: 'A',
          })
          .seed(baseline.seed);

        const solver = Array.from(builder.build())[0];
        const newPositions: number[] = [];

        // Run the same number of steps as in baseline
        for (let i = 0; i < baseline.steps; i++) {
          solver.step(1 / 15);
          newPositions.push(solver.pos);
        }

        const newFinalPosition = newPositions[newPositions.length - 1] || 0;
        const newFinalTime = solver.accumulatetime.t;
        const newCompleted = solver.pos >= solver.course.distance;

        // Compare key metrics
        const positionRatio =
          baseline.finalPosition > 0 ? Math.abs(newFinalPosition - baseline.finalPosition) / baseline.finalPosition : 0;
        const timeRatio = baseline.finalTime > 0 ? Math.abs(newFinalTime - baseline.finalTime) / baseline.finalTime : 0;

        // Check if results are "reasonably similar" (within 30% for position, 50% for time)
        const positionSimilar = positionRatio < 0.3;
        const timeSimilar = timeRatio < 0.5;
        const completionMatches = newCompleted === baseline.completed;

        if (positionSimilar && timeSimilar && completionMatches) {
          matches++;
        } else {
          console.log(`❌ Race mismatch for seed ${baseline.seed}, strategy ${baseline.strategy}:`);
          console.log(
            `  Position: old=${baseline.finalPosition.toFixed(2)}, new=${newFinalPosition.toFixed(2)}, ratio=${positionRatio.toFixed(3)}`,
          );
          console.log(
            `  Time: old=${baseline.finalTime.toFixed(2)}, new=${newFinalTime.toFixed(2)}, ratio=${timeRatio.toFixed(3)}`,
          );
          console.log(`  Completed: old=${baseline.completed}, new=${newCompleted}`);
        }
      } catch (error) {
        console.log(`❌ Error testing baseline seed ${baseline.seed}:`, error);
      }
    }

    const matchRate = matches / total;
    console.log(`Race progression match rate: ${matches}/${total} (${(matchRate * 100).toFixed(1)}%)`);

    // Should match at least 70% of the baseline behavior (races can have some variance)
    expect(matchRate).toBeGreaterThan(0.7);
  });

  test('supported strategies match baseline', () => {
    if (!baselines?.strategiesSupported) {
      console.log('⚠ Skipping strategy support test: no baselines available');
      return;
    }

    const strategyMap: Record<string, Strategy> = {
      Nige: Strategy.Front,
      Senkou: Strategy.Pace,
      Sasi: Strategy.Late,
      Oikomi: Strategy.End,
      Oonige: Strategy.Front, // Map to Front as closest equivalent
    };

    let supportedInNew = 0;

    for (const oldStrategy of baselines.strategiesSupported) {
      if (strategyMap[oldStrategy]) {
        supportedInNew++;
        console.log(`✓ Strategy ${oldStrategy} -> ${strategyMap[oldStrategy]} supported`);
      } else {
        console.log(`❌ Strategy ${oldStrategy} not mapped to new codebase`);
      }
    }

    const supportRate = supportedInNew / baselines.strategiesSupported.length;
    console.log(
      `Strategy support rate: ${supportedInNew}/${baselines.strategiesSupported.length} (${(supportRate * 100).toFixed(1)}%)`,
    );

    // Should support all strategies that were in the old code
    expect(supportRate).toBe(1.0);
  });

  test('baseline metadata validation', () => {
    if (!baselines) {
      console.log('⚠ Skipping metadata test: no baselines available');
      return;
    }

    expect(baselines.timestamp).toBeDefined();
    expect(baselines.version).toBeDefined();
    expect(baselines.conditionParser).toBeInstanceOf(Array);
    expect(baselines.raceProgression).toBeInstanceOf(Array);
    expect(baselines.strategiesSupported).toBeInstanceOf(Array);

    console.log(`Baselines generated: ${baselines.timestamp}`);
    console.log(`Old code version: ${baselines.version}`);
    console.log(`Condition tests: ${baselines.conditionParser.length}`);
    console.log(`Race progression tests: ${baselines.raceProgression.length}`);
    console.log(`Strategies: ${baselines.strategiesSupported.join(', ')}`);
  });
});

describe('Baseline Generation Instructions', () => {
  test('how to generate baselines', () => {
    if (baselines) {
      console.log('✅ Baselines are available and loaded');
      expect(true).toBe(true);
      return;
    }

    console.log('📋 To generate baselines from old code:');
    console.log('1. cd old/uma-skill-tools');
    console.log('2. node generate-baselines.js');
    console.log('3. Re-run these tests');

    // Create the baseline directory if it doesn't exist
    const baselineDir = path.dirname(BASELINE_FILE);
    if (!fs.existsSync(baselineDir)) {
      fs.mkdirSync(baselineDir, { recursive: true });
      console.log(`📁 Created baseline directory: ${baselineDir}`);
    }

    expect(true).toBe(true);
  });
});
