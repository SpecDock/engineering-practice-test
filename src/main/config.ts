/**
 * 应用默认配置：包含数据库路径、硬件参数、模拟器参数、文件存储和报告输出设置。
 */
import path from 'node:path';
import type { AppConfig } from '../shared/types.js';

export const BASE_DIRECTORY = process.env.ISO11820_BASE_DIR ?? process.cwd();

export function createDefaultConfig(baseDirectory: string, exportDirectory = path.join(baseDirectory, 'output')): AppConfig {
  return {
  Database: {
    Provider: 'Sqlite',
    SqlitePath: path.join(baseDirectory, 'Data', 'ISO11820.db'),
  },
  Hardware: {
    ConstPower: 2048,
    PidTemperature: 750,
    SensorProtocol: 'ModbusRtu',
  },
  Simulation: {
    EnableSimulation: true,
    SimulateSensors: true,
    SimulatePidController: true,
    InitialFurnaceTemp: 25,
    TargetFurnaceTemp: 750,
    HeatingRatePerSecond: 3,
    TempFluctuation: 0.5,
    StableThreshold: 3,
    SimulateFlame: false,
    // 源文档只描述“约 2°C/10min”，未给 appsettings 键；本地 TS 默认显式采用该文档口径。
    MaxTemperatureDriftPerTenMinutes: 2,
  },
  FileStorage: {
    BaseDirectory: exportDirectory,
    TestDataDirectory: exportDirectory,
  },
  Report: {
    OutputDirectory: exportDirectory,
    EnablePdfExport: true,
  },
  };
}

export const defaultConfig: AppConfig = createDefaultConfig(BASE_DIRECTORY);
