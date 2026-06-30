import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IsoDesktopApi } from '../shared/ipc.js';
import type {
  CalibrationInput,
  CalibrationResult,
  CreateTestRequest,
  CreateTestResponse,
  ExportResult,
  IpcResult,
  LoginRequest,
  LoginResponse,
  PhenomenonCalculatedResult,
  PhenomenonRecordRequest,
  QueryHistoryRequest,
  QueryHistoryResponse,
  RuntimeStatus,
  StateChangeResponse,
} from '../shared/types.js';

/**
 * 封装 IPC 调用逻辑，统一处理返回结果并抛出错误。
 */
async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result = await ipcRenderer.invoke(channel, payload) as IpcResult<T>;
  if (result.ok) return result.data;
  throw new Error(result.message);
}

const api: IsoDesktopApi = {
  getStatus: () => invoke<RuntimeStatus>(IPC_CHANNELS.status),
  login: (request: LoginRequest) => invoke<LoginResponse>(IPC_CHANNELS.login, request),
  createTest: (request: CreateTestRequest) => invoke<CreateTestResponse>(IPC_CHANNELS.createTest, request),
  startHeating: () => invoke<StateChangeResponse>(IPC_CHANNELS.startHeating),
  stopHeating: () => invoke<StateChangeResponse>(IPC_CHANNELS.stopHeating),
  startRecording: () => invoke<StateChangeResponse>(IPC_CHANNELS.startRecording),
  stopRecording: () => invoke<StateChangeResponse>(IPC_CHANNELS.stopRecording),
  savePhenomenon: (request: PhenomenonRecordRequest) => invoke<PhenomenonCalculatedResult>(IPC_CHANNELS.savePhenomenon, request),
  queryHistory: (request: QueryHistoryRequest) => invoke<QueryHistoryResponse>(IPC_CHANNELS.queryHistory, request),
  exportCurrent: () => invoke<ExportResult>(IPC_CHANNELS.exportCurrent),
  saveCalibration: (request: CalibrationInput) => invoke<CalibrationResult>(IPC_CHANNELS.saveCalibration, request),
  onDataBroadcast: (callback: (status: RuntimeStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: RuntimeStatus): void => callback(status);
    ipcRenderer.on(IPC_CHANNELS.dataBroadcast, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.dataBroadcast, listener);
  },
};

/**
 * 将本地桌面 API 暴露到渲染进程的 window 对象上，确保安全隔离。
 */
contextBridge.exposeInMainWorld('iso11820', api);
