/**
 * 项目共享类型定义：包含请求、响应、运行状态、配置、传感器与试验相关接口。
 */
export type Nullable<T> = T | null;

export type Role = 'admin' | 'experimenter';
export type OperatorUserType = 'admin' | 'operator';

export type TestState = 'Idle' | 'Preparing' | 'Ready' | 'Recording' | 'Complete';
export type DurationMode = 'standard_60_minutes' | 'custom_minutes';
export type CompletionFlag = '10000000';
export type TemperatureChannel = 'TF1' | 'TF2' | 'TS' | 'TC' | 'TCal';
export type SensorDictionary = Record<TemperatureChannel, number>;

/**
 * 系统消息条目，包含时间戳和文本内容。
 */
export interface MasterMessage {
  time: string;
  message: string;
}

/**
 * 温度采样数据结构，每秒一个样本。
 */
export interface TemperatureSample {
  timeSeconds: number;
  temp1: number;
  temp2: number;
  tempSurface: number;
  tempCenter: number;
  tempCalibration: number;
}

/**
 * 通过 IPC 广播给前端的实时数据结构。
 */
export interface DataBroadcastEventArgs {
  messages: readonly MasterMessage[];
  snapshot: TemperatureDisplaySnapshot;
  latestSample?: TemperatureSample;
}

export interface TemperatureDisplaySnapshot {
  sensors: SensorDictionary;
  state: TestState;
  recordingSeconds: number;
  driftCPer10Min: Nullable<number>;
  productid: Nullable<string>;
}

export interface LoginRequest {
  role: Role;
  pwd: string;
}

export type LoginResponse =
  | { ok: true; username: Role; role: Role }
  | { ok: false; message: '密码错误，请重新输入' };

export interface CreateTestRequest {
  environmentTemperatureC: number;
  environmentHumidityPercent: number;
  productid: string;
  testid: string;
  productName: string;
  specification: string;
  heightMm: number;
  diameterMm: number;
  operator: string;
  durationMode: DurationMode;
  customDurationMinutes?: number;
  preweight: number;
  apparatusNumber: string;
  apparatusName: string;
  verificationDate: string;
  constPower: number;
}

export interface CreateTestResponse {
  ok: true;
  productid: string;
  testid: string;
  nextState: 'Idle' | 'Preparing';
}

export interface PhenomenonRecordRequest {
  productid: string;
  testid: string;
  hasContinuousFlame: boolean;
  flameStartSecond?: number;
  flameDurationSecond?: number;
  postweight: number;
  remark?: string;
}

export interface PhenomenonCalculatedResult {
  lostweight: number;
  lostweight_per: number;
  deltaTf1: number;
  deltaTf2: number;
  deltaTs: number;
  deltaTc: number;
  deltatf: number;
  passed: boolean;
}

export interface StateChangeResponse {
  ok: true;
  previousState: TestState;
  nextState: TestState;
  message?: MasterMessage;
}

export interface QueryHistoryRequest {
  startDate?: string;
  endDate?: string;
  productidLike?: string;
  operator?: string;
}

export interface TestMasterRow {
  productid: string;
  testid: string;
  testdate: string;
  operator: string;
  productname?: string;
  preweight: number;
  postweight: number;
  lostweight_per: number;
  deltatf: number;
  totaltesttime: number;
  flag: CompletionFlag | string | null;
  passed?: boolean;
}

export interface QueryHistoryResponse {
  rows: readonly TestMasterRow[];
}

export interface ApparatusInfo {
  apparatusid: number;
  innernumber: string;
  apparatusname: string;
  checkdatef: string;
  checkdatet: string;
  pidport: string;
  powerport: string;
  constpower: number;
}

/**
 * 应用配置结构，用于定义数据库、硬件、模拟、文件存储和报告输出等参数。
 */
export interface AppConfig {
  Database: { Provider: 'Sqlite'; SqlitePath: string };
  Hardware: { ConstPower: number; PidTemperature: number; SensorProtocol: 'ModbusRtu' };
  Simulation: {
    EnableSimulation: boolean;
    SimulateSensors: boolean;
    SimulatePidController: boolean;
    InitialFurnaceTemp: number;
    TargetFurnaceTemp: number;
    HeatingRatePerSecond: number;
    TempFluctuation: number;
    StableThreshold: number;
    SimulateFlame: boolean;
    MaxTemperatureDriftPerTenMinutes: number;
  };
  FileStorage: { BaseDirectory: string; TestDataDirectory: string };
  Report: { OutputDirectory: string; EnablePdfExport: boolean };
}

export interface CalibrationInput {
  calibrationType: 'Surface' | 'Center';
  operator: string;
  points: number[];
  remarks: string;
}

export interface CalibrationResult {
  id: string;
  averageTemperature: number;
  maxDeviation: number;
  uniformityResult: number;
  passedCriteria: boolean;
}

export interface RuntimeStatus {
  config: AppConfig;
  apparatus: ApparatusInfo;
  snapshot: TemperatureDisplaySnapshot;
  messages: MasterMessage[];
  samples: TemperatureSample[];
}

export interface ExportResult {
  csvPath: string;
  excelPath: string;
  pdfPath: string;
}

export interface ApiResult<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  message: string;
}

export type IpcResult<T> = ApiResult<T> | ApiError;

export const STATE_FLOW: readonly TestState[] = ['Idle', 'Preparing', 'Ready', 'Recording', 'Complete'] as const;

export const TEMPERATURE_CHANNELS: readonly TemperatureChannel[] = ['TF1', 'TF2', 'TS', 'TC', 'TCal'] as const;
