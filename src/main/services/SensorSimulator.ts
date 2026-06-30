import type { AppConfig, SensorDictionary, TestState } from '../../shared/types.js';

/**
 * 传感器更新请求参数，表示当前试验状态和运行模式。
 */
export interface SensorUpdateInput {
  state: TestState;
  isRecording: boolean;
  isHeating: boolean;
}

/**
 * 传感器更新结果，包含当前传感器读数和是否已稳定。
 */
export interface SensorUpdateResult {
  sensors: SensorDictionary;
  isStable: boolean;
}

/**
 * 模拟器类，用于在本地运行环境中模拟炉温、表面温度、中心温度和校准温度。
 */
export class SensorSimulator {
  private sensors: SensorDictionary;
  private stableTicks = 0;

  /**
   * 初始化模拟器并设置默认传感器温度值。
   */
  public constructor(private readonly config: AppConfig) {
    const t = config.Simulation.InitialFurnaceTemp;
    this.sensors = { TF1: t, TF2: t - 0.1, TS: t - 0.5, TC: t - 0.7, TCal: t };
  }

  /**
   * 根据当前状态和模式更新传感器读数，并返回模拟结果。
   */
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

  /**
   * 获取当前传感器快照，返回已四舍五入到一位小数的值。
   */
  public getSnapshot(): SensorDictionary {
    return this.rounded();
  }

  /**
   * 将内部浮点温度值四舍五入到一位小数，便于显示和导出。
   */
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
