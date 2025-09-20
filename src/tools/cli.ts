import { Buffer } from 'buffer';
import { Command, InvalidArgumentError, Option } from 'commander';
import * as fs from 'fs';

import { ActivationSamplePolicy, ImmediatePolicy } from '../activation-sample-policy';
import { getParser } from '../condition-parser';
import { CourseData, courseSpeedModifier, getCourse } from '../course-data';
import { Aptitude, HorseParameters, Strategy } from '../horse-type';
import { NoopHpPolicy } from '../hp-policy';
import { DynamicCondition, RaceSolver, SkillEffect, SkillRarity, SkillType } from '../race-solver';
import { PRNG } from '../random';
import { Region, RegionList } from '../region';

import skills from '../../data/skill-data.json';

const { parse, tokenize } = getParser();

export function parseStrategy(s: string) {
  switch (s.toUpperCase()) {
    case 'NIGE':
      return Strategy.Front;
    case 'SENKOU':
      return Strategy.Pace;
    case 'SASI':
    case 'SASHI':
      return Strategy.Late;
    case 'OIKOMI':
      return Strategy.End;
    case 'OONIGE':
      return Strategy.Escape;
    default:
      throw new InvalidArgumentError('Invalid running strategy.');
  }
}

export function parseAptitude(a: string, type: string) {
  switch (a.toUpperCase()) {
    case 'S':
      return Aptitude.S;
    case 'A':
      return Aptitude.A;
    case 'B':
      return Aptitude.B;
    case 'C':
      return Aptitude.C;
    case 'D':
      return Aptitude.D;
    case 'E':
      return Aptitude.E;
    case 'F':
      return Aptitude.F;
    case 'G':
      return Aptitude.G;
    default:
      throw new InvalidArgumentError('Invalid ' + type + ' aptitude.');
  }
}

const StrategyProficiencyModifier = Object.freeze([1.1, 1.0, 0.85, 0.75, 0.6, 0.4, 0.2, 0.1]);

type GroundCondition = 'good' | 'yielding' | 'soft' | 'heavy';

const GroundSpeedModifier = Object.freeze(
  [
    null, // ground types started at 1
    { good: 0, yielding: 0, soft: 0, heavy: -50 },
    { good: 0, yielding: 0, soft: 0, heavy: -50 },
  ].map((o) => Object.freeze(o)),
);

const GroundPowerModifier = Object.freeze(
  [null, { good: 0, yielding: -50, soft: -50, heavy: -50 }, { good: -100, yielding: -50, soft: -100, heavy: -100 }].map(
    (o) => Object.freeze(o),
  ),
);

export interface SkillData {
  skillId: string;
  rarity: SkillRarity;
  samplePolicy: ActivationSamplePolicy;
  regions: RegionList;
  extraCondition: DynamicCondition;
  effects: SkillEffect[];
  trigger: Region;
}

function buildSkillEffects(skill) {
  // im on a really old version of node and cant use flatMap
  return skill.effects.reduce((acc, ef) => {
    if (ef.type == 21) {
      // debuffs
      acc.push({
        type: SkillType.CurrentSpeed,
        baseDuration: skill.baseDuration / 10000,
        modifier: ef.modifier / 10000,
      });
      acc.push({
        type: SkillType.TargetSpeed,
        baseDuration: skill.baseDuration / 10000,
        modifier: ef.modifier / 10000,
      });
    } else if (ef.type > 0) {
      // All valid SkillType values are positive numbers
      acc.push({
        type: ef.type,
        baseDuration: skill.baseDuration / 10000,
        modifier: ef.modifier / 10000,
      });
    }
    return acc;
  }, []);
}

export function buildSkillData(horse: HorseParameters, course: CourseData, wholeCourse: RegionList, skillId: string) {
  if (!(skillId in skills)) {
    throw new InvalidArgumentError('bad skill ID ' + skillId);
  }
  const alternatives = skills[skillId].alternatives;
  for (let i = 0; i < alternatives.length; ++i) {
    const skill = alternatives[i];
    let full = new RegionList();
    wholeCourse.forEach((r) => full.push(r));
    if (skill.precondition) {
      const pre = parse(tokenize(skill.precondition));
      const preRegions = pre.apply(wholeCourse, course, horse, {
        mood: 2,
        groundCondition: 1,
        weather: 1,
        season: 1,
        time: 0,
        grade: 100,
        popularity: 1,
        skillId: skillId,
      })[0];
      if (preRegions.length == 0) {
        continue;
      } else {
        const bounds = new Region(preRegions[0].start, wholeCourse[wholeCourse.length - 1].end);
        full = full.rmap((r) => r.intersect(bounds));
      }
    }
    const op = parse(tokenize(skill.condition));
    const [regions, extraCondition] = op.apply(full, course, horse, {
      mood: 2,
      groundCondition: 1,
      weather: 1,
      season: 1,
      time: 0,
      grade: 100,
      popularity: 1,
      skillId: skillId,
    });
    if (regions.length == 0) {
      continue;
    }
    const effects = buildSkillEffects(skill);
    if (effects.length > 0) {
      const rarity = skills[skillId].rarity;
      return {
        skillId: skillId,
        // for some reason 1*/2* uniques, 1*/2* upgraded to 3*, and naturally 3* uniques all have different rarity (3, 4, 5 respectively)
        rarity: rarity >= 3 && rarity <= 5 ? 3 : rarity,
        samplePolicy: op.samplePolicy,
        regions: regions,
        extraCondition: extraCondition,
        effects: effects,
      };
    } else {
      return null;
    }
  }
  // if we get here, it means that no alternatives have their conditions satisfied for this course/horse.
  // however, for purposes of summer goldship unique (Adventure of 564), we still have to add something, since
  // that could still cause them to activate. so just add the first alternative at a location after the course
  // is over with a constantly false dynamic condition so that it never activates normally.
  const effects = buildSkillEffects(alternatives[0]);
  if (effects.length == 0) {
    return null;
  } else {
    const afterEnd = new RegionList();
    afterEnd.push(new Region(9999, 9999));
    return {
      skillId: skillId,
      rarity: Math.min(skills[skillId].rarity, 3),
      samplePolicy: ImmediatePolicy,
      regions: afterEnd,
      extraCondition: (_) => false,
      effects: effects,
    };
  }
}

type Mood = -2 | -1 | 0 | 1 | 2;

function adjustOvercap(stat: number) {
  return stat > 1200 ? 1200 + Math.floor((stat - 1200) / 2) : stat;
}

export function buildHorseParameters(horseDesc, course: CourseData, mood: Mood, ground: GroundCondition) {
  const motivCoef = 1 + 0.02 * mood;

  const baseStats = {
    speed: adjustOvercap(horseDesc.speed) * motivCoef,
    stamina: adjustOvercap(horseDesc.stamina) * motivCoef,
    power: adjustOvercap(horseDesc.power) * motivCoef,
    guts: adjustOvercap(horseDesc.guts) * motivCoef,
    wisdom: adjustOvercap(horseDesc.wisdom) * motivCoef,
  };

  const raceCourseModifier = courseSpeedModifier(course, baseStats);

  return Object.freeze({
    speed: baseStats.speed * raceCourseModifier + (GroundSpeedModifier[course.surface] || { [ground]: 0 })[ground],
    stamina: baseStats.stamina,
    power: baseStats.power + (GroundPowerModifier[course.surface] || { [ground]: 0 })[ground],
    guts: baseStats.guts,
    wisdom: baseStats.wisdom * StrategyProficiencyModifier[parseAptitude(horseDesc.strategyAptitude, 'strategy')],
    strategy: parseStrategy(horseDesc.strategy),
    distanceAptitude: parseAptitude(horseDesc.distanceAptitude, 'distance'),
    surfaceAptitude: parseAptitude(horseDesc.surfaceAptitude, 'surface'),
    strategyAptitude: parseAptitude(horseDesc.strategyAptitude, 'strategy'),
    rawStamina: horseDesc.stamina * motivCoef,
  });
}

export type PacerProvider = (rng: PRNG) => RaceSolver;

export interface CliOptions {
  course: string;
  mood: Mood;
  ground: GroundCondition;
  skill?: number[];
  skills?: number[];
  positionKeep?: string | boolean;
  timestep?: number;
  seed?: number;
  configuration?: Buffer;
  nsamples?: number;
  enableWisdomChecks?: boolean;
  distanceAptitude?: number;
  surfaceAptitude?: number;
  thresholds: number[];
  dump?: boolean;
  csv?: boolean | string;
}

export type CliAction = (
  horse: HorseParameters,
  course: CourseData,
  defSkills: SkillData[],
  cliSkills: SkillData[],
  getPacer: PacerProvider,
  cliOptions: CliOptions,
) => void;

export class ToolCLI {
  program: Command;
  action: CliAction;

  constructor() {
    this.program = new Command();
    this.program
      .argument('<horsefile>', "path to a JSON file describing the horse's parameters")
      .requiredOption('-c, --course <id>', 'course ID')
      .addOption(
        new Option('-m, --mood <mood>', "the uma's mood")
          .choices(['-2', '-1', '0', '+1', '+2'])
          .default(2, '+2')
          .argParser((x) => parseInt(x, 10)), // can't just use .argParser(parseInt) because it also gets passed the default value
      )
      .addOption(
        new Option('-g, --ground <condition>', 'track condition')
          .choices(['good', 'yielding', 'soft', 'heavy'])
          .default('good', 'good'),
      )
      .option(
        '-s, --skill <id>',
        'skill to test',
        (value: string, list: number[]) => list.concat([parseInt(value, 10)]),
        [],
      )
      .option(
        '--skills <ids>',
        'comma-separated list of skill IDs',
        (value, _) => value.split(',').map((id) => parseInt(id, 10)),
        [],
      )
      .option(
        '--position-keep <pacer>',
        'load a horse from the <pacer> JSON file to simulate position keep (by default, uses a front version of the horse in <horsefile> with no skills) (position keep is not simulated for front/escape)',
      )
      .option('--no-position-keep', 'disable position keep simulation')
      .addOption(
        new Option('--timestep <dt>', 'integration timestep in seconds (can be an integer, decimal, or fraction)')
          .default(1 / 60, '1/60')
          .argParser((ts) => ts.split('/').reduceRight((a, b) => +b / +a, 1.0)),
      ) // reduceRight with initial acc = 1.0 to make the types work
      .action((horsefile, options) => {
        this.handleRun(horsefile, options);
      });
  }

  options(fn: (Command) => void) {
    fn(this.program);
  }

  run(fn: CliAction) {
    this.action = fn;
    this.program.parse();
  }

  handleRun(horsefile: string, opts: CliOptions) {
    const course = getCourse(parseInt(opts.course, 10));
    const horseDesc = JSON.parse(fs.readFileSync(horsefile, 'utf8'));

    const horse = buildHorseParameters(horseDesc, course, opts.mood, opts.ground);

    let pacerHorseParams;
    if (typeof opts.positionKeep == 'string') {
      const pacerDesc = JSON.parse(fs.readFileSync(opts.positionKeep, 'utf8'));
      pacerHorseParams = buildHorseParameters(pacerDesc, course, opts.mood, opts.ground);
    } else {
      pacerHorseParams = Object.assign({}, horse, { strategy: Strategy.Front });
    }
    function getPacer(rng: PRNG) {
      let pacer: RaceSolver = new Object() as RaceSolver;
      if (horse.strategy != Strategy.Front && horse.strategy != Strategy.Escape && opts.positionKeep !== false) {
        pacer = new RaceSolver({
          horse: pacerHorseParams,
          course,
          rng,
          hp: NoopHpPolicy,
          skills: [],
        });
        // top is jiga and bottom is white sente
        // arguably it's more realistic to include these, but also a lot of the time they prevent the exact pace down effects
        // that we're trying to investigate
        /*const skills = [{
					skillId: '201601',
					rarity: SkillRarity.White,
					trigger: new Region(0, 100),
					extraCondition: (_) => true,
					effects: [{type: SkillType.Accel, baseDuration: 3.0, modifier: 0.2}]
				}, {
					skillId: '200532',
					rarity: SkillRarity.White,
					trigger: new Region(0, 100),
					extraCondition: (_) => true,
					effects: [{type: SkillType.Accel, baseDuration: 1.2, modifier: 0.2}]
				}];*/
      }
      return pacer;
    }

    const wholeCourse = new RegionList();
    wholeCourse.push(new Region(0, course.distance));
    Object.freeze(wholeCourse);

    const makeSkill = buildSkillData.bind(null, horse, course, wholeCourse);
    const defSkills = horseDesc.skills.map(makeSkill).filter((s): s is SkillData => s != null);
    const cliSkills = (opts.skills || [])
      .concat(opts.skill || [])
      .map(makeSkill)
      .filter((s): s is SkillData => s != null);

    this.action(horse, course, defSkills, cliSkills, getPacer, opts);
  }
}
