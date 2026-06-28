const { contextBridge, ipcRenderer } = require('electron');

const IPC_CHANNELS = {
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
};

async function invoke(channel, payload) {
  const result = await ipcRenderer.invoke(channel, payload);
  if (result && result.ok) return result.data;
  throw new Error(result && result.message ? result.message : '本地 IPC 调用失败');
}

const api = {
  getStatus: () => invoke(IPC_CHANNELS.status),
  login: (request) => invoke(IPC_CHANNELS.login, request),
  createTest: (request) => invoke(IPC_CHANNELS.createTest, request),
  startHeating: () => invoke(IPC_CHANNELS.startHeating),
  stopHeating: () => invoke(IPC_CHANNELS.stopHeating),
  startRecording: () => invoke(IPC_CHANNELS.startRecording),
  stopRecording: () => invoke(IPC_CHANNELS.stopRecording),
  savePhenomenon: (request) => invoke(IPC_CHANNELS.savePhenomenon, request),
  queryHistory: (request) => invoke(IPC_CHANNELS.queryHistory, request),
  exportCurrent: () => invoke(IPC_CHANNELS.exportCurrent),
  saveCalibration: (request) => invoke(IPC_CHANNELS.saveCalibration, request),
  onDataBroadcast: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.dataBroadcast, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.dataBroadcast, listener);
  },
};

contextBridge.exposeInMainWorld('iso11820', api);
