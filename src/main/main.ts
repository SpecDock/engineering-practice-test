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

function requireService(): TestControllerService {
  if (service === null) throw new Error('服务尚未初始化');
  return service;
}

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

function asObject<T>(payload: unknown): T {
  if (typeof payload !== 'object' || payload === null) throw new Error('IPC 参数必须是对象');
  return payload as T;
}

app.whenReady().then(async () => {
  const appRoot = app.getAppPath();
  const dataRoot = process.env.ISO11820_BASE_DIR ?? (app.isPackaged ? app.getPath('userData') : process.cwd());
  const config = createDefaultConfig(dataRoot);
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
