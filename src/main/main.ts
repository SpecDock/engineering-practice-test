/**
 * Electron 主进程入口文件，负责创建窗口、注册 IPC 通道并启动核心服务。
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultConfig } from './config.js';
import { SqliteStore } from './db/SqliteStore.js';
import { TestControllerService } from './services/TestControllerService.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import type {
  CalibrationInput,
  CreateTestRequest,
  IpcResult,
  LoginRequest,
  PhenomenonRecordRequest,
  QueryHistoryRequest,
  RuntimeStatus,
} from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let service: TestControllerService | null = null;

/**
 * 创建主窗口并注册实时数据广播到渲染进程。
 */
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  requireService().on('dataBroadcast', () => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.dataBroadcast, requireService().getStatus());
    }
  });
  await mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
}

/**
 * 注册所有 IPC 通道处理函数，将前端请求映射到服务方法。
 */
function registerHandlers(): void {
  handle(IPC_CHANNELS.status, () => requireService().getStatus());
  handle(IPC_CHANNELS.login, (payload) => requireService().login(asObject<LoginRequest>(payload)));
  handle(IPC_CHANNELS.createTest, (payload) => requireService().createTest(asObject<CreateTestRequest>(payload)));
  handle(IPC_CHANNELS.startHeating, () => requireService().startHeating());
  handle(IPC_CHANNELS.stopHeating, () => requireService().stopHeating());
  handle(IPC_CHANNELS.startRecording, () => requireService().startRecording());
  handle(IPC_CHANNELS.stopRecording, () => requireService().stopRecording());
  handle(IPC_CHANNELS.savePhenomenon, (payload) => requireService().savePhenomenon(asObject<PhenomenonRecordRequest>(payload)));
  handle(IPC_CHANNELS.queryHistory, (payload) => requireService().queryHistory(asObject<QueryHistoryRequest>(payload)));
  handle(IPC_CHANNELS.exportCurrent, () => requireService().exportCurrent());
  handle(IPC_CHANNELS.saveCalibration, (payload) => requireService().saveCalibration(asObject<CalibrationInput>(payload)));
}

/**
 * 获取已初始化的 TestControllerService 实例，若尚未初始化则抛出错误。
 */
function requireService(): TestControllerService {
  if (service === null) throw new Error('服务尚未初始化');
  return service;
}

/**
 * 注册 IPC handler，统一处理异常并返回标准 IpcResult 结构。
 */
function handle<T>(channel: string, fn: (payload: unknown) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_event, payload: unknown): Promise<IpcResult<T>> => {
    try {
      const data = await fn(payload);
      return { ok: true, data };
    } catch (error: unknown) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });
}

/**
 * 将 IPC 传入负载转换为对象类型，并做基础类型检查。
 */
function asObject<T>(payload: unknown): T {
  if (typeof payload !== 'object' || payload === null) throw new Error('IPC 参数必须是对象');
  return payload as T;
}

app.whenReady().then(async () => {
  const appRoot = app.getAppPath();
  const dataRoot = process.env.ISO11820_BASE_DIR ?? (app.isPackaged ? app.getPath('userData') : process.cwd());
  const exportRoot = process.env.ISO11820_OUTPUT_DIR ?? (app.isPackaged ? path.join(path.dirname(process.execPath), 'output') : path.join(process.cwd(), 'output'));
  const config = createDefaultConfig(dataRoot, exportRoot);
  const store = new SqliteStore(config.Database.SqlitePath, path.join(appRoot, 'node_modules', 'sql.js', 'dist'));
  service = new TestControllerService(config, store);
  await service.init();
  registerHandlers();
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void service?.shutdown();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

export type MainRuntimeStatus = RuntimeStatus;
