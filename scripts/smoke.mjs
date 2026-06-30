import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultConfig } from '../dist/main/main/config.js';
import { SqliteStore } from '../dist/main/main/db/SqliteStore.js';
import { TestControllerService } from '../dist/main/main/services/TestControllerService.js';

const root = process.cwd();
const smokeRoot = path.join(root, 'SmokeData');

// Tiny assertion helper keeps the smoke test free from a separate test runner.
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertNonEmptyFile(filePath, label) {
  const stat = await fs.stat(filePath);
  assert(stat.size > 0, `${label} 文件为空：${filePath}`);
}

async function waitForReady(service) {
  // Sensor stabilization is asynchronous even with accelerated smoke settings.
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const status = service.getStatus();
    if (status.snapshot.state === 'Ready') return status;
    await delay(250);
  }
  throw new Error(`等待 Ready 超时，当前状态：${service.getStatus().snapshot.state}`);
}

async function main() {
  // Smoke runs use disposable data so they never touch operator records.
  await fs.rm(smokeRoot, { recursive: true, force: true });
  const config = structuredClone(defaultConfig);
  config.Database.SqlitePath = path.join(smokeRoot, 'Data', 'ISO11820-smoke.db');
  config.FileStorage.BaseDirectory = smokeRoot;
  config.FileStorage.TestDataDirectory = path.join(smokeRoot, 'TestData');
  config.Report.OutputDirectory = path.join(smokeRoot, 'Reports');
  config.Simulation.HeatingRatePerSecond = 400;
  config.Simulation.TempFluctuation = 0;

  const store = new SqliteStore(config.Database.SqlitePath);
  const service = new TestControllerService(config, store);
  await service.init();
  try {
    const login = await service.login({ role: 'admin', pwd: '123456' });
    assert(login.ok, '默认 admin 登录失败');

    const apparatus = service.getStatus().apparatus;
    const testid = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const productid = `SMOKE-${testid}`;
    await service.createTest({
      environmentTemperatureC: 23,
      environmentHumidityPercent: 50,
      productid,
      testid,
      productName: '烟测样品',
      specification: '100×50×25mm',
      heightMm: 25,
      diameterMm: 50,
      operator: 'admin',
      durationMode: 'custom_minutes',
      customDurationMinutes: 1,
      preweight: 100,
      apparatusNumber: apparatus.innernumber,
      apparatusName: apparatus.apparatusname,
      verificationDate: apparatus.checkdatet,
      constPower: apparatus.constpower,
    });
    await service.startHeating();
    await waitForReady(service);
    // Record briefly, then verify result persistence, history and report export.
    await service.startRecording();
    await delay(2200);
    await service.stopRecording();
    const result = await service.savePhenomenon({
      productid,
      testid,
      hasContinuousFlame: false,
      postweight: 96,
      remark: 'smoke test',
    });
    assert(Number.isFinite(result.lostweight_per), '试验结果未计算失重率');

    const history = await service.queryHistory({ productidLike: productid });
    assert(history.rows.length === 1, '历史查询未返回烟测记录');
    assert(history.rows[0]?.flag === '10000000', '试验记录未保存完成标记');

    const calibration = await service.saveCalibration({
      calibrationType: 'Surface',
      operator: 'admin',
      points: [750, 751, 749, 750, 750, 752, 748, 751, 749],
      remarks: 'smoke calibration',
    });
    assert(calibration.passedCriteria, '校准烟测未通过');

    const exported = await service.exportCurrent();
    await assertNonEmptyFile(exported.csvPath, 'CSV');
    await assertNonEmptyFile(exported.excelPath, 'Excel');
    await assertNonEmptyFile(exported.pdfPath, 'PDF');
    const csv = await fs.readFile(exported.csvPath, 'utf8');
    const csvLines = csv.trim().split(/\r?\n/);
    assert(csvLines[0] === 'Time,Temp1,Temp2,TempSurface,TempCenter,TempCalibration', 'CSV 表头不正确');
    assert(csvLines.length >= 2, 'CSV 缺少至少 1 行温度数据');
    const historyAfterExport = await service.queryHistory({ productidLike: productid });
    assert(historyAfterExport.rows[0]?.flag === '10000000', '导出后历史记录完成标记丢失');
    console.log(JSON.stringify({ ok: true, productid, testid, exported }, null, 2));
  } finally {
    await service.shutdown();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
