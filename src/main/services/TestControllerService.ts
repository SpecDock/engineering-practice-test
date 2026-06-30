import { EventEmitter } from 'node:events';
import type {
  AppConfig,
  CalibrationInput,
  CalibrationResult,
  CreateTestRequest,
  CreateTestResponse,
  DataBroadcastEventArgs,
  ExportResult,
  LoginRequest,
  LoginResponse,
  MasterMessage,
  PhenomenonCalculatedResult,
  PhenomenonRecordRequest,
  QueryHistoryRequest,
  QueryHistoryResponse,
  RuntimeStatus,
  SensorDictionary,
  StateChangeResponse,
  TemperatureDisplaySnapshot,
  TemperatureSample,
  TestState,
} from '../../shared/types.js';
import { SqliteStore } from '../db/SqliteStore.js';
import { ExportService } from './ExportService.js';
import { SensorSimulator } from './SensorSimulator.js';

interface ServiceEvents {
  dataBroadcast: [DataBroadcastEventArgs];
}

class TypedEmitter extends EventEmitter {
  public override on<K extends keyof ServiceEvents>(eventName: K, listener: (...args: ServiceEvents[K]) => void): this {
    return super.on(eventName, listener);
  }
  public override emit<K extends keyof ServiceEvents>(eventName: K, ...args: ServiceEvents[K]): boolean {
    return super.emit(eventName, ...args);
  }
}

export class TestControllerService extends TypedEmitter {
  private readonly simulator: SensorSimulator;
  private readonly exporter: ExportService;
  private timer: NodeJS.Timeout | null = null;
  private state: TestState = 'Idle';
  private isHeating = false;
  private recordingSeconds = 0;
  private latestSensors: SensorDictionary;
  private messages: MasterMessage[] = [];
  private samples: TemperatureSample[] = [];
  private pidOutputs: number[] = [];
  private furnaceHistory: Array<{ second: number; tf1: number; tf2: number }> = [];
  private currentTest: CreateTestRequest | null = null;
  private savedResult: PhenomenonCalculatedResult | null = null;

  /**
   * 构造函数：注入应用配置和数据库存储，创建模拟器与导出组件。
   */
  public constructor(
    private readonly config: AppConfig,
    private readonly store: SqliteStore,
  ) {
    super();
    this.simulator = new SensorSimulator(config);
    this.exporter = new ExportService(config);
    this.latestSensors = this.simulator.getSnapshot();
  }

  /**
   * 初始化服务，准备数据库并启动后台采集定时器。
   */
  public async init(): Promise<void> {
    await this.store.init();
    this.startDaqWorker();
  }

  /**
   * 关闭服务，停止定时器并保存数据库状态。
   */
  public async shutdown(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    await this.store.save();
  }

  /**
   * 用户登录接口，委托 SqliteStore 进行身份验证。
   */
  public login(request: LoginRequest): Promise<LoginResponse> {
    return Promise.resolve(this.store.login(request));
  }

  /**
   * 创建新试验：校验输入、重置当前状态、保存试验信息和初始化数据库行。
   */
  public async createTest(request: CreateTestRequest): Promise<CreateTestResponse> {
    validateCreateTestRequest(request);
    if (this.state === 'Complete' && this.savedResult === null) throw new Error('上一次试验已完成但未保存，不能新建');
    if (this.currentTest !== null && this.state !== 'Idle' && this.state !== 'Complete') throw new Error('当前有活动试验，不能新建');
    if (this.state === 'Complete') {
      this.state = 'Idle';
      this.isHeating = false;
    }
    this.currentTest = request;
    this.samples = [];
    this.recordingSeconds = 0;
    this.savedResult = null;
    this.store.upsertProduct(request);
    this.store.insertTestInitial(request);
    await this.store.save();
    this.pushMessage(`新建试验 ${request.productid}/${request.testid}`);
    return { ok: true, productid: request.productid, testid: request.testid, nextState: 'Idle' };
  }

  /**
   * 开始升温操作，将系统状态置为 Preparing。
   */
  public startHeating(): Promise<StateChangeResponse> {
    if (this.state !== 'Idle') throw new Error('当前状态不能开始升温，请先新建试验或回到待机状态');
    const previousState = this.state;
    this.state = 'Preparing';
    this.isHeating = true;
    const message = this.pushMessage('开始升温');
    return Promise.resolve({ ok: true, previousState, nextState: this.state, message });
  }

  /**
   * 停止升温操作，将状态恢复为 Idle，并记录消息。
   */
  public stopHeating(): Promise<StateChangeResponse> {
    if (this.state === 'Recording') throw new Error('记录中不能停止升温');
    const previousState = this.state;
    this.isHeating = false;
    this.state = 'Idle';
    const message = this.pushMessage('停止升温，开始降温');
    return Promise.resolve({ ok: true, previousState, nextState: this.state, message });
  }

  /**
   * 开始记录温度样本，处理恒功率设置并切换到 Recording 状态。
   */
  public startRecording(): Promise<StateChangeResponse> {
    if (this.state !== 'Ready') throw new Error('未达到 Ready，不能开始记录');
    if (this.currentTest === null) throw new Error('请先新建试验');
    const previousState = this.state;
    const avgPower = this.pidOutputs.length === 0 ? this.config.Hardware.ConstPower : this.pidOutputs.reduce((a, b) => a + b, 0) / this.pidOutputs.length;
    this.currentTest = { ...this.currentTest, constPower: Math.round(avgPower) };
    this.samples = [];
    this.recordingSeconds = 0;
    this.state = 'Recording';
    const message = this.pushMessage(`开始记录，恒功率 ${Math.round(avgPower)}`);
    return Promise.resolve({ ok: true, previousState, nextState: this.state, message });
  }

  /**
   * 停止记录操作，并根据已有样本数量决定是否进入 Complete 或 Preparing。
   */
  public stopRecording(): Promise<StateChangeResponse> {
    if (this.state !== 'Recording') throw new Error('当前状态不能停止记录');
    const previousState = this.state;
    this.state = this.samples.length > 0 ? 'Complete' : 'Preparing';
    const message = this.pushMessage('手动终止记录');
    return Promise.resolve({ ok: true, previousState, nextState: this.state, message });
  }

  /**
   * 保存现象记录，计算温差、失重与判定结果，并存入数据库。
   */
  public async savePhenomenon(request: PhenomenonRecordRequest): Promise<PhenomenonCalculatedResult> {
    const test = this.requireCurrentTest(request.productid, request.testid);
    validatePhenomenonRequest(request, test.preweight, this.recordingSeconds);
    if (this.state !== 'Complete' || this.samples.length === 0) throw new Error('试验未完成或没有记录样本，不能保存现象');
    const initial = this.samples[0] ?? this.sampleFromSensors(0);
    const final = this.samples[this.samples.length - 1] ?? initial;
    const lostweight = test.preweight - request.postweight;
    const lostweight_per = test.preweight === 0 ? 0 : (lostweight / test.preweight) * 100;
    const result: PhenomenonCalculatedResult = {
      lostweight,
      lostweight_per,
      deltaTf1: final.temp1 - initial.temp1,
      deltaTf2: final.temp2 - initial.temp2,
      deltaTs: final.tempSurface - initial.tempSurface,
      deltaTc: final.tempCenter - initial.tempCenter,
      deltatf: final.tempSurface - initial.tempSurface,
      passed: false,
    };
    const flameDuration = request.hasContinuousFlame ? request.flameDurationSecond ?? 0 : 0;
    result.passed = result.deltatf <= 50 && result.lostweight_per <= 50 && flameDuration < 5;
    this.store.updateTestResult({
      request: test,
      phenomenon: result,
      totalSeconds: this.recordingSeconds,
      flameStartSecond: request.hasContinuousFlame ? request.flameStartSecond ?? 0 : 0,
      flameDurationSecond: flameDuration,
      phenocode: request.hasContinuousFlame ? 'continuous_flame' : '',
      memo: request.remark ?? null,
      samples: this.samples,
    });
    await this.store.save();
    this.savedResult = result;
    this.pushMessage(`保存试验记录：${result.passed ? '通过' : '不通过'}`);
    await this.exportCurrent();
    return result;
  }

  /**
   * 查询历史试验记录并返回匹配结果。
   */
  public queryHistory(request: QueryHistoryRequest): Promise<QueryHistoryResponse> {
    return Promise.resolve(this.store.queryHistory(request));
  }

  /**
   * 导出当前试验数据，包括 CSV、Excel 以及可选 PDF。
   */
  public exportCurrent(): Promise<ExportResult> {
    if (this.currentTest === null) throw new Error('没有当前试验可导出');
    return this.exporter.export({ test: this.currentTest, samples: this.samples, result: this.savedResult });
  }

  /**
   * 保存校准记录到数据库，并返回校准结果。
   */
  public async saveCalibration(input: CalibrationInput): Promise<CalibrationResult> {
    const apparatus = this.store.getApparatus();
    const result = this.store.insertCalibration(input, apparatus.apparatusid);
    await this.store.save();
    this.pushMessage(`保存${input.calibrationType}校准记录`);
    return result;
  }

  /**
   * 获取当前运行状态，供前端界面显示和广播使用。
   */
  public getStatus(): RuntimeStatus {
    return {
      config: this.config,
      apparatus: this.store.getApparatus(),
      snapshot: this.snapshot(),
      messages: [...this.messages],
      samples: [...this.samples],
    };
  }

  /**
   * 启动后台 DAQ 工作线程，定时执行数据采集和状态更新。
   */
  private startDaqWorker(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), 800);
  }

  /**
   * 定时刷新函数：更新传感器值、判断状态转换、记录样本并广播数据。
   */
  private tick(): void {
    const update = this.simulator.update({ state: this.state, isRecording: this.state === 'Recording', isHeating: this.isHeating });
    this.latestSensors = update.sensors;
    this.pidOutputs.push(this.estimatePidOutput(update.sensors));
    if (this.pidOutputs.length > 600) this.pidOutputs.shift();

    const stableRange = update.sensors.TF1 >= 745 && update.sensors.TF1 <= 755 && update.sensors.TF2 >= 745 && update.sensors.TF2 <= 755;
    if (this.state === 'Preparing' && update.isStable && stableRange) {
      this.state = 'Ready';
      this.pushMessage('炉温稳定，进入 Ready');
    } else if (this.state === 'Ready' && !stableRange) {
      this.state = 'Preparing';
      this.pushMessage('炉温跌出稳定范围，回到 Preparing');
    }

    let latestSample: TemperatureSample | undefined;
    if (this.state === 'Recording') {
      this.recordingSeconds += 1;
      latestSample = this.sampleFromSensors(this.recordingSeconds);
      this.samples.push(latestSample);
      this.furnaceHistory.push({ second: this.recordingSeconds, tf1: latestSample.temp1, tf2: latestSample.temp2 });
      if (this.furnaceHistory.length > 600) this.furnaceHistory.shift();
      if (this.shouldAutoComplete()) {
        this.state = 'Complete';
        this.pushMessage('达到终止条件，记录完成');
      }
    }
    this.emit('dataBroadcast', { messages: [...this.messages], snapshot: this.snapshot(), latestSample });
  }

  /**
   * 检查是否满足自动完成条件，例如达到预定时长或标准模式温漂稳定。
   */
  private shouldAutoComplete(): boolean {
    const test = this.currentTest;
    if (test === null) return false;
    const targetSeconds = test.durationMode === 'standard_60_minutes'
      ? 3600
      // 源文档未给 TargetDurationSeconds 默认值；自定义模式仅使用 UI 请求中的 customDurationMinutes。
      : Math.max(1, test.customDurationMinutes ?? 60) * 60;
    if (this.recordingSeconds >= targetSeconds) return true;
    if (test.durationMode !== 'standard_60_minutes') return false;
    const checkpoints = new Set([1800, 2100, 2400, 2700, 3000, 3300]);
    if (!checkpoints.has(this.recordingSeconds)) return false;
    const drift = this.calculateDrift();
    if (drift === null) return false;
    return Math.abs(drift) <= this.config.Simulation.MaxTemperatureDriftPerTenMinutes;
  }

  /**
   * 计算最近 10 分钟炉温平均值的温漂变化。
   */
  private calculateDrift(): number | null {
    if (this.furnaceHistory.length < 600) return null;
    const first = this.furnaceHistory[0];
    const last = this.furnaceHistory[this.furnaceHistory.length - 1];
    if (first === undefined || last === undefined) return null;
    return ((last.tf1 + last.tf2) / 2) - ((first.tf1 + first.tf2) / 2);
  }

  /**
   * 生成当前温度显示快照和状态数据。
   */
  private snapshot(): TemperatureDisplaySnapshot {
    return {
      sensors: this.latestSensors,
      state: this.state,
      recordingSeconds: this.recordingSeconds,
      driftCPer10Min: this.calculateDrift(),
      productid: this.currentTest?.productid ?? null,
    };
  }

  /**
   * 基于当前传感器快照构建温度样本数据对象。
   */
  private sampleFromSensors(timeSeconds: number): TemperatureSample {
    return {
      timeSeconds,
      temp1: this.latestSensors.TF1,
      temp2: this.latestSensors.TF2,
      tempSurface: this.latestSensors.TS,
      tempCenter: this.latestSensors.TC,
      tempCalibration: this.latestSensors.TCal,
    };
  }

  /**
   * 将一条系统消息追加到消息列表，并保留最新 200 条。
   */
  private pushMessage(message: string): MasterMessage {
    const item = { time: new Date().toTimeString().slice(0, 8), message };
    this.messages.push(item);
    if (this.messages.length > 200) this.messages.shift();
    return item;
  }

  /**
   * 验证当前试验是否存在且传入的产品与试验 ID 匹配。
   */
  private requireCurrentTest(productid: string, testid: string): CreateTestRequest {
    if (this.currentTest === null) throw new Error('没有当前试验');
    if (this.currentTest.productid !== productid || this.currentTest.testid !== testid) throw new Error('试验标识不匹配');
    return this.currentTest;
  }

  /**
   * 简单 PID 输出估算，用来模拟加热功率变化。
   */
  private estimatePidOutput(sensors: SensorDictionary): number {
    const error = this.config.Hardware.PidTemperature - ((sensors.TF1 + sensors.TF2) / 2);
    return Math.max(0, Math.min(25600, this.config.Hardware.ConstPower + error * 8));
  }
}

function validateCreateTestRequest(request: CreateTestRequest): void {
  requireText(request.productid, '样品编号');
  requireText(request.testid, '试验ID');
  requireText(request.productName, '样品名称');
  requireText(request.specification, '规格型号');
  requireText(request.operator, '操作员');
  requireText(request.apparatusNumber, '设备编号');
  requireText(request.apparatusName, '设备名称');
  requireText(request.verificationDate, '检定日期');
  requirePositiveFinite(request.environmentTemperatureC, '环境温度');
  requirePositiveFinite(request.environmentHumidityPercent, '环境湿度');
  requirePositiveFinite(request.heightMm, '样品高度');
  requirePositiveFinite(request.diameterMm, '样品直径');
  requirePositiveFinite(request.preweight, '试验前质量');
  requirePositiveFinite(request.constPower, '恒功率');
  if (request.durationMode === 'custom_minutes') {
    requirePositiveFinite(request.customDurationMinutes, '自定义试验时长');
  }
}

function validatePhenomenonRequest(request: PhenomenonRecordRequest, preweight: number, recordingSeconds: number): void {
  requireText(request.productid, '样品编号');
  requireText(request.testid, '试验ID');
  requirePositiveFinite(request.postweight, '试验后质量');
  if (request.postweight > preweight) throw new Error('试验后质量不能大于试验前质量');
  if (request.hasContinuousFlame) {
    requireNonNegativeFinite(request.flameStartSecond, '火焰开始时刻');
    requirePositiveFinite(request.flameDurationSecond, '火焰持续时间');
    const flameStart = request.flameStartSecond ?? 0;
    const flameDuration = request.flameDurationSecond ?? 0;
    if (flameStart > recordingSeconds) throw new Error('火焰开始时刻不能超过记录时长');
    if (flameStart + flameDuration > recordingSeconds) throw new Error('火焰持续区间不能超过记录时长');
  } else if (request.flameStartSecond !== undefined || request.flameDurationSecond !== undefined) {
    throw new Error('未勾选持续火焰时不能填写火焰时刻');
  }
}

function requireText(value: string, label: string): void {
  if (value.trim() === '') throw new Error(`${label}不能为空`);
}

function requirePositiveFinite(value: number | undefined, label: string): void {
  if (value === undefined || !Number.isFinite(value) || value <= 0) throw new Error(`${label}必须大于 0`);
}

function requireNonNegativeFinite(value: number | undefined, label: string): void {
  if (value === undefined || !Number.isFinite(value) || value < 0) throw new Error(`${label}不能小于 0`);
}
