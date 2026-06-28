import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { AppConfig, CreateTestRequest, ExportResult, PhenomenonCalculatedResult, TemperatureSample } from '../../shared/types.js';

export interface ExportInput {
  test: CreateTestRequest;
  samples: readonly TemperatureSample[];
  result: PhenomenonCalculatedResult | null;
}

interface ChannelStats {
  max: number;
  final: number;
  delta: number;
}

interface ExportStats {
  totalSamples: number;
  durationSeconds: number;
  tf1: ChannelStats;
  tf2: ChannelStats;
  ts: ChannelStats;
  tc: ChannelStats;
}

export class ExportService {
  public constructor(private readonly config: AppConfig) {}

  public async export(input: ExportInput): Promise<ExportResult> {
    const testDir = path.join(this.config.FileStorage.TestDataDirectory, input.test.productid, input.test.testid);
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(this.config.Report.OutputDirectory, { recursive: true });
    const csvPath = path.join(testDir, 'sensor_data.csv');
    const excelPath = path.join(this.config.Report.OutputDirectory, `${input.test.productid}_${input.test.testid}.xlsx`);
    const pdfPath = path.join(this.config.Report.OutputDirectory, `${input.test.productid}_${input.test.testid}.pdf`);
    await this.writeCsv(csvPath, input.samples);
    await this.writeExcel(excelPath, input);
    if (this.config.Report.EnablePdfExport) await this.writePdf(pdfPath, input);
    return { csvPath, excelPath, pdfPath };
  }

  public async writeCsv(csvPath: string, samples: readonly TemperatureSample[]): Promise<void> {
    await fs.mkdir(path.dirname(csvPath), { recursive: true });
    const lines = ['Time,Temp1,Temp2,TempSurface,TempCenter,TempCalibration'];
    for (const sample of samples) {
      lines.push([sample.timeSeconds, sample.temp1, sample.temp2, sample.tempSurface, sample.tempCenter, sample.tempCalibration].join(','));
    }
    await fs.writeFile(csvPath, `${lines.join('\n')}\n`, 'utf8');
  }

  private async writeExcel(excelPath: string, input: ExportInput): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const stats = calculateStats(input.samples);
    const info = workbook.addWorksheet('试验信息');
    info.addRows([
      ['样品编号', input.test.productid],
      ['试验ID', input.test.testid],
      ['样品名称', input.test.productName],
      ['规格型号', input.test.specification],
      ['高度(mm)', input.test.heightMm],
      ['直径(mm)', input.test.diameterMm],
      ['操作员', input.test.operator],
      ['设备编号', input.test.apparatusNumber],
      ['设备名称', input.test.apparatusName],
      ['试验前质量(g)', input.test.preweight],
      ['采样点数', stats.totalSamples],
      ['记录时长(s)', stats.durationSeconds],
      ['判定结果', input.result === null ? '未保存' : input.result.passed ? '通过' : '不通过'],
    ]);

    const summary = workbook.addWorksheet('统计与判定');
    summary.addRow(['项目', '数值', '单位/说明']);
    summary.addRows([
      ['TF1 最大值', stats.tf1.max, '°C'],
      ['TF2 最大值', stats.tf2.max, '°C'],
      ['TS 最大值', stats.ts.max, '°C'],
      ['TC 最大值', stats.tc.max, '°C'],
      ['TF1 终值', stats.tf1.final, '°C'],
      ['TF2 终值', stats.tf2.final, '°C'],
      ['TS 终值', stats.ts.final, '°C'],
      ['TC 终值', stats.tc.final, '°C'],
      ['TF1 温升', stats.tf1.delta, '°C'],
      ['TF2 温升', stats.tf2.delta, '°C'],
      ['TS 温升', stats.ts.delta, '°C'],
      ['TC 温升', stats.tc.delta, '°C'],
      ['判定温升 deltatf', input.result?.deltatf ?? '', '°C；当前口径取 TS 温升'],
      ['失重量', input.result?.lostweight ?? '', 'g'],
      ['失重率', input.result?.lostweight_per ?? '', '%'],
      ['判定', input.result === null ? '未保存' : input.result.passed ? '通过' : '不通过', 'deltatf<=50, lostweight_per<=50, flameDuration<5'],
    ]);

    const data = workbook.addWorksheet('温度数据');
    data.addRow(['Time', 'Temp1', 'Temp2', 'TempSurface', 'TempCenter', 'TempCalibration']);
    input.samples.forEach((s) => data.addRow([s.timeSeconds, s.temp1, s.temp2, s.tempSurface, s.tempCenter, s.tempCalibration]));
    const chart = workbook.addWorksheet('温度曲线');
    chart.addRow(['说明', 'ExcelJS 社区版不原生生成图表；下方生成曲线数据表，PDF 报告中直接绘制 4 条温度曲线。']);
    chart.addRow(['Time', 'TF1', 'TF2', 'TS', 'TC']);
    input.samples.forEach((s) => chart.addRow([s.timeSeconds, s.temp1, s.temp2, s.tempSurface, s.tempCenter]));
    for (const worksheet of [info, summary, data, chart]) {
      worksheet.columns.forEach((column) => {
        column.width = 20;
      });
    }
    await workbook.xlsx.writeFile(excelPath);
  }

  private async writePdf(pdfPath: string, input: ExportInput): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const document = new PDFDocument({ margin: 48 });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('error', (error: Error) => reject(error));
      document.on('end', () => {
        fs.writeFile(pdfPath, Buffer.concat(chunks)).then(resolve, reject);
      });
      const stats = calculateStats(input.samples);
      document.fontSize(18).text('ISO 11820 Test Report / Temperature Curve');
      document.moveDown();
      document.fontSize(11).text(`Product ID: ${input.test.productid}`);
      document.text(`Test ID: ${input.test.testid}`);
      document.text(`Product Name: ${input.test.productName}`);
      document.text(`Operator: ${input.test.operator}`);
      document.text(`Apparatus: ${input.test.apparatusNumber} / ${input.test.apparatusName}`);
      document.text(`Samples: ${stats.totalSamples}; Duration: ${stats.durationSeconds}s`);
      if (input.result !== null) {
        document.text(`DeltaTf: ${input.result.deltatf.toFixed(1)} C`);
        document.text(`Lost weight: ${input.result.lostweight_per.toFixed(1)} %`);
        document.text(`Conclusion: ${input.result.passed ? 'Passed' : 'Failed'}`);
      }
      document.moveDown();
      document.text(`Max TF1/TF2/TS/TC: ${stats.tf1.max.toFixed(1)} / ${stats.tf2.max.toFixed(1)} / ${stats.ts.max.toFixed(1)} / ${stats.tc.max.toFixed(1)} C`);
      document.text(`Delta TF1/TF2/TS/TC: ${stats.tf1.delta.toFixed(1)} / ${stats.tf2.delta.toFixed(1)} / ${stats.ts.delta.toFixed(1)} / ${stats.tc.delta.toFixed(1)} C`);
      drawTemperatureChart(document, input.samples);
      document.end();
    });
  }
}

function calculateStats(samples: readonly TemperatureSample[]): ExportStats {
  const first = samples[0] ?? { timeSeconds: 0, temp1: 0, temp2: 0, tempSurface: 0, tempCenter: 0, tempCalibration: 0 };
  const last = samples[samples.length - 1] ?? first;
  const maxOf = (pick: (sample: TemperatureSample) => number): number => samples.reduce((max, sample) => Math.max(max, pick(sample)), pick(first));
  return {
    totalSamples: samples.length,
    durationSeconds: last.timeSeconds,
    tf1: { max: maxOf((s) => s.temp1), final: last.temp1, delta: last.temp1 - first.temp1 },
    tf2: { max: maxOf((s) => s.temp2), final: last.temp2, delta: last.temp2 - first.temp2 },
    ts: { max: maxOf((s) => s.tempSurface), final: last.tempSurface, delta: last.tempSurface - first.tempSurface },
    tc: { max: maxOf((s) => s.tempCenter), final: last.tempCenter, delta: last.tempCenter - first.tempCenter },
  };
}

function drawTemperatureChart(document: PDFKit.PDFDocument, samples: readonly TemperatureSample[]): void {
  const left = 56;
  const top = document.y + 28;
  const width = 480;
  const height = 260;
  const bottom = top + height;
  const right = left + width;
  const maxTime = Math.max(1, samples[samples.length - 1]?.timeSeconds ?? 1);
  const yFor = (temperature: number): number => bottom - Math.max(0, Math.min(800, temperature)) / 800 * height;
  const xFor = (seconds: number): number => left + seconds / maxTime * width;

  document.fontSize(13).text('Temperature Curve (0-800 C)', left, top - 20);
  document.lineWidth(0.8).strokeColor('#333333');
  document.moveTo(left, top).lineTo(left, bottom).lineTo(right, bottom).stroke();
  document.fontSize(8).fillColor('#333333');
  for (let t = 0; t <= 800; t += 200) {
    const y = yFor(t);
    document.strokeColor('#dddddd').moveTo(left, y).lineTo(right, y).stroke();
    document.fillColor('#333333').text(String(t), left - 28, y - 4, { width: 24, align: 'right' });
  }
  for (let tick = 0; tick <= 4; tick += 1) {
    const seconds = Math.round(maxTime / 4 * tick);
    const x = xFor(seconds);
    document.strokeColor('#dddddd').moveTo(x, top).lineTo(x, bottom).stroke();
    document.fillColor('#333333').text(String(seconds), x - 12, bottom + 6, { width: 32, align: 'center' });
  }
  document.text('seconds', right - 36, bottom + 20);
  document.text('C', left - 34, top - 4);

  drawSeries(document, samples, '#d62728', (s) => s.temp1, xFor, yFor);
  drawSeries(document, samples, '#1f77b4', (s) => s.temp2, xFor, yFor);
  drawSeries(document, samples, '#2ca02c', (s) => s.tempSurface, xFor, yFor);
  drawSeries(document, samples, '#ff7f0e', (s) => s.tempCenter, xFor, yFor);

  const legendTop = bottom + 34;
  drawLegend(document, left, legendTop, '#d62728', 'TF1 Furnace 1');
  drawLegend(document, left + 120, legendTop, '#1f77b4', 'TF2 Furnace 2');
  drawLegend(document, left + 240, legendTop, '#2ca02c', 'TS Surface');
  drawLegend(document, left + 360, legendTop, '#ff7f0e', 'TC Center');
}

function drawSeries(
  document: PDFKit.PDFDocument,
  samples: readonly TemperatureSample[],
  color: string,
  pick: (sample: TemperatureSample) => number,
  xFor: (seconds: number) => number,
  yFor: (temperature: number) => number,
): void {
  if (samples.length === 0) return;
  document.lineWidth(1.4).strokeColor(color);
  samples.forEach((sample, index) => {
    const x = xFor(sample.timeSeconds);
    const y = yFor(pick(sample));
    if (index === 0) document.moveTo(x, y);
    else document.lineTo(x, y);
  });
  document.stroke();
}

function drawLegend(document: PDFKit.PDFDocument, x: number, y: number, color: string, label: string): void {
  document.strokeColor(color).lineWidth(2).moveTo(x, y + 6).lineTo(x + 18, y + 6).stroke();
  document.fillColor('#333333').fontSize(8).text(label, x + 22, y, { width: 92 });
}
