import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import initSqlJs, { type Database, type SqlJsStatic, type QueryExecResult } from 'sql.js';
import type {
  ApparatusInfo,
  CalibrationInput,
  CalibrationResult,
  CreateTestRequest,
  LoginRequest,
  LoginResponse,
  PhenomenonCalculatedResult,
  QueryHistoryRequest,
  QueryHistoryResponse,
  TemperatureSample,
  TestMasterRow,
} from '../../shared/types.js';
import { schemaSql } from './schema.js';

export interface UpdateTestResultInput {
  request: CreateTestRequest;
  phenomenon: PhenomenonCalculatedResult;
  totalSeconds: number;
  flameStartSecond: number;
  flameDurationSecond: number;
  phenocode: string;
  memo: string | null;
  samples: readonly TemperatureSample[];
}

type SqlValue = string | number | null;

export class SqliteStore {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;

  public constructor(private readonly dbPath: string) {}

  public async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    this.SQL = await initSqlJs({ locateFile: (fileName: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', fileName) });
    const existing = await this.readExistingDb();
    this.db = existing === null ? new this.SQL.Database() : new this.SQL.Database(existing);
    this.database.run(schemaSql);
    await this.save();
  }

  public async save(): Promise<void> {
    const bytes = this.database.export();
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    await fs.writeFile(this.dbPath, Buffer.from(bytes));
  }

  public login(request: LoginRequest): LoginResponse {
    const row = this.selectOne<{ username: string; usertype: string }>(
      'SELECT username, usertype FROM operators WHERE username = ? AND pwd = ?',
      [request.role, request.pwd],
    );
    if (row === null) return { ok: false, message: '密码错误，请重新输入' };
    return { ok: true, username: request.role, role: request.role };
  }

  public getApparatus(): ApparatusInfo {
    const row = this.selectOne<ApparatusInfo>(
      'SELECT apparatusid, innernumber, apparatusname, checkdatef, checkdatet, pidport, powerport, COALESCE(constpower, 0) AS constpower FROM apparatus ORDER BY apparatusid LIMIT 1',
      [],
    );
    if (row === null) throw new Error('未找到设备信息');
    return row;
  }

  public upsertProduct(request: CreateTestRequest): void {
    this.database.run(
      `INSERT INTO productmaster (productid, productname, specific, diameter, height, flag)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(productid) DO UPDATE SET
         productname = excluded.productname,
         specific = excluded.specific,
         diameter = excluded.diameter,
         height = excluded.height`,
      [request.productid, request.productName, request.specification, request.diameterMm, request.heightMm],
    );
  }

  public insertTestInitial(request: CreateTestRequest): void {
    this.database.run(
      `INSERT INTO testmaster
       (productid, testid, testdate, ambtemp, ambhumi, according, operator,
        apparatusid, apparatusname, apparatuschkdate, rptno, preweight,
        postweight, lostweight, lostweight_per, totaltesttime, constpower,
        phenocode, flametime, flameduration, maxtf1, maxtf2, maxts, maxtc,
        maxtf1_time, maxtf2_time, maxts_time, maxtc_time, finaltf1, finaltf2,
        finalts, finaltc, finaltf1_time, finaltf2_time, finalts_time,
        finaltc_time, deltatf1, deltatf2, deltatf, deltats, deltatc, memo, flag)
       VALUES (?, ?, date('now'), ?, ?, 'ISO 11820:2022', ?, ?, ?, ?, ?, ?,
        0, 0, 0, 0, ?, '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL)`,
      [
        request.productid,
        request.testid,
        request.environmentTemperatureC,
        request.environmentHumidityPercent,
        request.operator,
        request.apparatusNumber,
        request.apparatusName,
        request.verificationDate,
        request.productid,
        request.preweight,
        Math.round(request.constPower),
      ],
    );
  }

  public updateTestResult(input: UpdateTestResultInput): void {
    const stats = calculateSampleStats(input.samples);
    const lostweight = input.phenomenon.lostweight;
    this.database.run(
      `UPDATE testmaster SET
       postweight = ?, lostweight = ?, lostweight_per = ?, totaltesttime = ?, constpower = ?,
       phenocode = ?, flametime = ?, flameduration = ?, maxtf1 = ?, maxtf2 = ?, maxts = ?, maxtc = ?,
       maxtf1_time = ?, maxtf2_time = ?, maxts_time = ?, maxtc_time = ?, finaltf1 = ?, finaltf2 = ?,
       finalts = ?, finaltc = ?, finaltf1_time = ?, finaltf2_time = ?, finalts_time = ?, finaltc_time = ?,
       deltatf1 = ?, deltatf2 = ?, deltatf = ?, deltats = ?, deltatc = ?, memo = ?, flag = '10000000'
       WHERE productid = ? AND testid = ?`,
      [
        input.request.preweight - lostweight,
        lostweight,
        input.phenomenon.lostweight_per,
        input.totalSeconds,
        Math.round(input.request.constPower),
        input.phenocode,
        input.flameStartSecond,
        input.flameDurationSecond,
        stats.maxtf1,
        stats.maxtf2,
        stats.maxts,
        stats.maxtc,
        stats.maxtf1_time,
        stats.maxtf2_time,
        stats.maxts_time,
        stats.maxtc_time,
        stats.finaltf1,
        stats.finaltf2,
        stats.finalts,
        stats.finaltc,
        stats.finaltf1_time,
        stats.finaltf2_time,
        stats.finalts_time,
        stats.finaltc_time,
        input.phenomenon.deltaTf1,
        input.phenomenon.deltaTf2,
        input.phenomenon.deltatf,
        input.phenomenon.deltaTs,
        input.phenomenon.deltaTc,
        input.memo,
        input.request.productid,
        input.request.testid,
      ],
    );
  }

  public queryHistory(request: QueryHistoryRequest): QueryHistoryResponse {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (request.startDate !== undefined && request.startDate !== '') {
      where.push('t.testdate >= ?');
      params.push(request.startDate);
    }
    if (request.endDate !== undefined && request.endDate !== '') {
      where.push('t.testdate <= ?');
      params.push(request.endDate);
    }
    if (request.productidLike !== undefined && request.productidLike !== '') {
      where.push('t.productid LIKE ?');
      params.push(`%${request.productidLike}%`);
    }
    if (request.operator !== undefined && request.operator !== '') {
      where.push('t.operator = ?');
      params.push(request.operator);
    }
    const sql = `SELECT t.productid, t.testid, t.testdate, t.operator, p.productname,
       t.preweight, t.postweight, t.lostweight_per, t.deltatf, t.totaltesttime, t.flag
       FROM testmaster t LEFT JOIN productmaster p ON p.productid = t.productid
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY t.testdate DESC, t.testid DESC`;
    const rows = this.selectMany<TestMasterRow>(sql, params).map((row) => ({
      ...row,
      passed: row.deltatf <= 50 && row.lostweight_per <= 50,
    }));
    return { rows };
  }

  public insertCalibration(input: CalibrationInput, apparatusId: number): CalibrationResult {
    const averageTemperature = input.points.length === 0 ? 0 : input.points.reduce((a, b) => a + b, 0) / input.points.length;
    const maxDeviation = input.points.length === 0 ? 0 : Math.max(...input.points.map((p) => Math.abs(p - averageTemperature)));
    const uniformityResult = maxDeviation;
    const passedCriteria = maxDeviation <= 10;
    const id = randomUUID();
    const now = new Date().toISOString();
    const padded = [...input.points, ...Array<number>(9).fill(NaN)].slice(0, 9).map((v) => (Number.isNaN(v) ? null : v));
    this.database.run(
      `INSERT INTO CalibrationRecords
       (Id, CalibrationDate, CalibrationType, ApparatusId, Operator, TemperatureData, UniformityResult,
        MaxDeviation, AverageTemperature, PassedCriteria, Remarks, CreatedAt,
        TempA1, TempA2, TempA3, TempB1, TempB2, TempB3, TempC1, TempC2, TempC3, TAvg, Memo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, now, input.calibrationType, apparatusId, input.operator, JSON.stringify(input.points), uniformityResult,
        maxDeviation, averageTemperature, passedCriteria ? 1 : 0, input.remarks, now, ...padded, averageTemperature, input.remarks],
    );
    return { id, averageTemperature, maxDeviation, uniformityResult, passedCriteria };
  }

  private get database(): Database {
    if (this.db === null) throw new Error('数据库未初始化');
    return this.db;
  }

  private async readExistingDb(): Promise<Uint8Array | null> {
    try {
      return await fs.readFile(this.dbPath);
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  private selectOne<T extends object>(sql: string, params: readonly SqlValue[]): T | null {
    const rows = this.selectMany<T>(sql, params);
    return rows.length === 0 ? null : rows[0] ?? null;
  }

  private selectMany<T extends object>(sql: string, params: readonly SqlValue[]): T[] {
    const result = this.database.exec(sql, params as SqlValue[]);
    if (result.length === 0) return [];
    return rowsFromExec<T>(result[0]);
  }
}

function rowsFromExec<T extends object>(result: QueryExecResult | undefined): T[] {
  if (result === undefined) return [];
  return result.values.map((values) => Object.fromEntries(result.columns.map((column, index) => [column, values[index] ?? null])) as T);
}

function calculateSampleStats(samples: readonly TemperatureSample[]) {
  const initial = samples[0] ?? { timeSeconds: 0, temp1: 0, temp2: 0, tempSurface: 0, tempCenter: 0, tempCalibration: 0 };
  const final = samples[samples.length - 1] ?? initial;
  const maxBy = (pick: (sample: TemperatureSample) => number): { value: number; time: number } => {
    return samples.reduce((best, sample) => {
      const value = pick(sample);
      return value > best.value ? { value, time: sample.timeSeconds } : best;
    }, { value: pick(initial), time: initial.timeSeconds });
  };
  const m1 = maxBy((s) => s.temp1);
  const m2 = maxBy((s) => s.temp2);
  const ms = maxBy((s) => s.tempSurface);
  const mc = maxBy((s) => s.tempCenter);
  return {
    maxtf1: m1.value, maxtf2: m2.value, maxts: ms.value, maxtc: mc.value,
    maxtf1_time: m1.time, maxtf2_time: m2.time, maxts_time: ms.time, maxtc_time: mc.time,
    finaltf1: final.temp1, finaltf2: final.temp2, finalts: final.tempSurface, finaltc: final.tempCenter,
    finaltf1_time: final.timeSeconds, finaltf2_time: final.timeSeconds, finalts_time: final.timeSeconds, finaltc_time: final.timeSeconds,
    deltatf1: final.temp1 - initial.temp1, deltatf2: final.temp2 - initial.temp2,
    deltats: final.tempSurface - initial.tempSurface, deltatc: final.tempCenter - initial.tempCenter,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
