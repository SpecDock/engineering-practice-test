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
    const info = workbook.addWorksheet('试验信息');
    info.addRows([
      ['样品编号', input.test.productid],
      ['试验ID', input.test.testid],
      ['样品名称', input.test.productName],
      ['操作员', input.test.operator],
      ['判定', input.result === null ? '未保存' : input.result.passed ? '通过' : '不通过'],
    ]);
    const data = workbook.addWorksheet('温度数据');
    data.addRow(['Time', 'Temp1', 'Temp2', 'TempSurface', 'TempCenter', 'TempCalibration']);
    input.samples.forEach((s) => data.addRow([s.timeSeconds, s.temp1, s.temp2, s.tempSurface, s.tempCenter, s.tempCalibration]));
    const chart = workbook.addWorksheet('温度曲线');
    chart.addRow(['说明', 'ExcelJS 社区版不原生生成图表；曲线数据见“温度数据”Sheet。']);
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
      document.fontSize(18).text('ISO 11820 Test Report');
      document.moveDown();
      document.fontSize(11).text(`Product: ${input.test.productid}`);
      document.text(`Test: ${input.test.testid}`);
      document.text(`Operator: ${input.test.operator}`);
      document.text(`Samples: ${input.samples.length}`);
      if (input.result !== null) {
        document.text(`DeltaTf: ${input.result.deltatf.toFixed(1)} C`);
        document.text(`Lost weight: ${input.result.lostweight_per.toFixed(1)} %`);
        document.text(`Conclusion: ${input.result.passed ? 'Passed' : 'Failed'}`);
      }
      document.end();
    });
  }
}
