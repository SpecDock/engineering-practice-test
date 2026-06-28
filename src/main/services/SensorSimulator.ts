import type { AppConfig, SensorDictionary, TestState } from '../../shared/types.js';

export interface SensorUpdateInput {
  state: TestState;
  isRecording: boolean;
  isHeating: boolean;
}

export interface SensorUpdateResult {
  sensors: SensorDictionary;
  isStable: boolean;
}

export class SensorSimulator {
  private sensors: SensorDictionary;
  private stableTicks = 0;

  public constructor(private readonly config: AppConfig) {
    const t = config.Simulation.InitialFurnaceTemp;
    this.sensors = { TF1: t, TF2: t - 0.1, TS: t - 0.5, TC: t - 0.7, TCal: t };
  }

  public update(input: SensorUpdateInput): SensorUpdateResult {
    const simulation = this.config.Simulation;
    const noise = (): number => (Math.random() * 2 - 1) * simulation.TempFluctuation;
    const target = simulation.TargetFurnaceTemp;
    const lowerStableBound = target - simulation.StableThreshold;

    if (input.isHeating || input.state === 'Preparing' || input.state === 'Ready' || input.state === 'Recording') {
      if (this.sensors.TF1 < lowerStableBound) {
        const increment = simulation.HeatingRatePerSecond * 0.8 + noise();
        this.sensors.TF1 += Math.max(0.1, increment);
        this.sensors.TF2 += Math.max(0.1, increment + noise() * 0.2);
        this.stableTicks = 0;
      } else {
        this.sensors.TF1 = target + noise();
        this.sensors.TF2 = target + noise();
        this.stableTicks += 1;
      }
    } else {
      this.sensors.TF1 = Math.max(simulation.InitialFurnaceTemp, this.sensors.TF1 - (0.5 + noise() * 0.1));
      this.sensors.TF2 = Math.max(simulation.InitialFurnaceTemp, this.sensors.TF2 - (0.5 + noise() * 0.1));
      this.stableTicks = 0;
    }

    if (input.isRecording) {
      this.sensors.TS += (Math.min(this.sensors.TF1 * 0.95, 800) - this.sensors.TS) * 0.02;
      this.sensors.TC += (Math.min(this.sensors.TF1 * 0.85, 750) - this.sensors.TC) * 0.01;
    } else {
      this.sensors.TS += (this.sensors.TF1 * 0.35 - this.sensors.TS) * 0.005;
      this.sensors.TC += (this.sensors.TF1 * 0.3 - this.sensors.TC) * 0.004;
    }
    this.sensors.TCal = this.sensors.TF1 + noise() * 0.5;
    return { sensors: this.rounded(), isStable: this.stableTicks > 3 };
  }

  public getSnapshot(): SensorDictionary {
    return this.rounded();
  }

  private rounded(): SensorDictionary {
    return {
      TF1: round1(this.sensors.TF1),
      TF2: round1(this.sensors.TF2),
      TS: round1(this.sensors.TS),
      TC: round1(this.sensors.TC),
      TCal: round1(this.sensors.TCal),
    };
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
