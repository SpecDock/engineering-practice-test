import path from 'node:path';
import type { AppConfig } from '../shared/types.js';

export const BASE_DIRECTORY = 'D:/Final_Test/test';

export const defaultConfig: AppConfig = {
  Database: {
    Provider: 'Sqlite',
    SqlitePath: path.join(BASE_DIRECTORY, 'Data', 'ISO11820.db'),
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
    BaseDirectory: BASE_DIRECTORY,
    TestDataDirectory: path.join(BASE_DIRECTORY, 'TestData'),
  },
  Report: {
    OutputDirectory: path.join(BASE_DIRECTORY, 'Reports'),
    EnablePdfExport: true,
  },
};
