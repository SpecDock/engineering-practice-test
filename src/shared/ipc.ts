import type {
  CalibrationInput,
  CalibrationResult,
  CreateTestRequest,
  CreateTestResponse,
  ExportResult,
  LoginRequest,
  LoginResponse,
  PhenomenonCalculatedResult,
  PhenomenonRecordRequest,
  QueryHistoryRequest,
  QueryHistoryResponse,
  RuntimeStatus,
  StateChangeResponse,
} from './types.js';

export const IPC_CHANNELS = {
  status: 'iso:status',
  login: 'iso:login',
  createTest: 'iso:create-test',
  startHeating: 'iso:start-heating',
  stopHeating: 'iso:stop-heating',
  startRecording: 'iso:start-recording',
  stopRecording: 'iso:stop-recording',
  savePhenomenon: 'iso:save-phenomenon',
  queryHistory: 'iso:query-history',
  exportCurrent: 'iso:export-current',
  saveCalibration: 'iso:save-calibration',
  dataBroadcast: 'iso:data-broadcast',
} as const;

export interface IsoDesktopApi {
  getStatus(): Promise<RuntimeStatus>;
  login(request: LoginRequest): Promise<LoginResponse>;
  createTest(request: CreateTestRequest): Promise<CreateTestResponse>;
  startHeating(): Promise<StateChangeResponse>;
  stopHeating(): Promise<StateChangeResponse>;
  startRecording(): Promise<StateChangeResponse>;
  stopRecording(): Promise<StateChangeResponse>;
  savePhenomenon(request: PhenomenonRecordRequest): Promise<PhenomenonCalculatedResult>;
  queryHistory(request: QueryHistoryRequest): Promise<QueryHistoryResponse>;
  exportCurrent(): Promise<ExportResult>;
  saveCalibration(request: CalibrationInput): Promise<CalibrationResult>;
  onDataBroadcast(callback: (status: RuntimeStatus) => void): () => void;
}
