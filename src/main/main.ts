import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from './config.js';
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

const store = new SqliteStore(defaultConfig.Database.SqlitePath);
const service = new TestControllerService(defaultConfig, store);

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  service.on('dataBroadcast', () => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.dataBroadcast, service.getStatus());
    }
  });
  await mainWindow.loadFile(path.join(defaultConfig.FileStorage.BaseDirectory, 'dist', 'renderer', 'index.html'));
}

function registerHandlers(): void {
  handle(IPC_CHANNELS.status, () => service.getStatus());
  handle(IPC_CHANNELS.login, (payload) => service.login(asObject<LoginRequest>(payload)));
  handle(IPC_CHANNELS.createTest, (payload) => service.createTest(asObject<CreateTestRequest>(payload)));
  handle(IPC_CHANNELS.startHeating, () => service.startHeating());
  handle(IPC_CHANNELS.stopHeating, () => service.stopHeating());
  handle(IPC_CHANNELS.startRecording, () => service.startRecording());
  handle(IPC_CHANNELS.stopRecording, () => service.stopRecording());
  handle(IPC_CHANNELS.savePhenomenon, (payload) => service.savePhenomenon(asObject<PhenomenonRecordRequest>(payload)));
  handle(IPC_CHANNELS.queryHistory, (payload) => service.queryHistory(asObject<QueryHistoryRequest>(payload)));
  handle(IPC_CHANNELS.exportCurrent, () => service.exportCurrent());
  handle(IPC_CHANNELS.saveCalibration, (payload) => service.saveCalibration(asObject<CalibrationInput>(payload)));
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
  await service.init();
  registerHandlers();
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void service.shutdown();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

export type MainRuntimeStatus = RuntimeStatus;
