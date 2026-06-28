# ISO 11820 建筑材料不燃性试验仿真系统 — TypeScript 本地桌面应用适配开发文档

> 源文档：`D:/Final_Test/开发文档C#.md`  
> 目标栈：TypeScript Strict Mode；本地桌面应用；本地方法调用；SQLite 本地文件。  
> 适配原则：只迁移源文档已经定义的业务、字段、状态、算法和契约；源文档未定义的 HTTP 路由、本地端口服务、完整表字段、真实硬件协议等，不在本文中凭空补齐。

---

## 0. 证据与边界

### 0.1 源文档依据

- 软件定位：原系统是 C# / .NET 8 / WinForms / SQLite 本地桌面应用，运行在 Windows 10/11，无需联网、无需硬件。（源文档 21-26）
- 必须跑通的主流程：登录 → 新建试验 → 升温 → Ready → 记录 → 完成 → 保存 → 查询 → 导出。（源文档 30-62）
- 核心功能：登录、新建试验、仿真温度、状态机、实时显示、消息日志、按钮状态、试验现象记录、导出、历史查询、设备校准。（源文档 66-316）
- 数据组织：SQLite 6 张表、温度 CSV、`appsettings.json` 配置。（源文档 413-490）
- 关键算法：800ms 数据采集、恒功率均值、10 分钟温漂、终止条件、简化判定结论。（源文档 494-545）

### 0.2 外部技术依据

- TypeScript `strictNullChecks`：开启后 `null` 和 `undefined` 有独立类型，必须显式处理。来源：TypeScript TSConfig Reference，`https://www.typescriptlang.org/tsconfig/#strictNullChecks`。
- TypeScript 数组与基础类型：`T[]` 与 `Array<T>` 都可表达数组；数字使用 `number`，字符串使用 `string`，布尔使用 `boolean`。来源：TypeScript Handbook Basic Types，`https://www.typescriptlang.org/docs/handbook/basic-types.html`。
- TypeScript `Record<Keys, Type>`：适合表达“键集合 → 同一值类型”的映射对象。来源：TypeScript Utility Types，`https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type`。
- JavaScript / TypeScript `async function`：调用 async 函数会返回 Promise；普通返回值会被包装为 Promise resolve 值。来源：MDN async function，`https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function`。
- Node.js `EventEmitter`：`on` 注册监听器，`emit` 同步触发监听器；`error` 事件无人监听会导致进程抛错退出。来源：Node.js Events，`https://nodejs.org/api/events.html`。
- Node.js SQLite：`node:sqlite` 存在 `DatabaseSync`，但页面显示其版本能力与 Node 版本强相关，部分 API 较新。来源：Node.js SQLite，`https://nodejs.org/api/sqlite.html`。

### 0.3 明确不生成的内容

源 C# 文档没有定义 ASP.NET Core Controller、REST API 路由、localhost 端口服务、前后端分离部署、OpenAPI、JWT、云同步、真实 Modbus 串口、真实 PID 控制、摄像头识别、多炉控制。本文不会编造这些能力。

---

## 1. C# → TypeScript 架构适配

### 1.1 分层映射

| C# 原分层 | 源文档定位 | TypeScript 本地桌面适配 |
|---|---|---|
| WinForms UI | 登录窗体、主窗体、新建试验窗体等 | 本地桌面 UI 页面 / 组件 |
| Core | 试验控制器、状态机 | 本地领域服务 `TestControllerService` |
| Services | 数据采集、仿真、导出 | 本地应用服务 `DaqWorker`、`SensorSimulator`、`ExportService` |
| DB | `DbHelper` + SQLite 文件 | 本地 SQLite 数据访问层；仍保持本地 SQLite，不引入 ORM 作为默认要求 |
| Global | `AppContext` 单例持有核心对象 | 本地应用上下文或依赖注入容器 |

### 1.2 关键技术映射

| C# / .NET 概念 | TypeScript / Node.js 适配 | 说明 |
|---|---|---|
| `Task<T>` / async 后台任务 | `Promise<T>` / `async function` | async 函数返回 Promise；用于异步数据库、文件导出、本地后台任务。 |
| `List<T>` | `T[]` 或 `Array<T>` | 文档统一使用 `readonly T[]` 表达只读输入，用 `T[]` 表达可变集合。 |
| `Dictionary<K,V>` | `Record<K,V>` 或 `Map<K,V>` | 传感器字典键集合固定，优先 `Record<TemperatureChannel, number>`。 |
| C# `event` / `EventHandler<T>` | Node.js `EventEmitter` 或本地观察者模式 | 源系统是进程内事件；TS 桌面版继续保持进程内事件，不引入端口传输层。 |
| WinForms `Invoke` 切 UI 线程 | 桌面 UI 事件回调 / 状态管理更新 | 不使用 HTTP 触发 UI 更新；后台事件进入 UI 层时仍要保证状态一致性。 |
| `appsettings.json` | `appsettings.json` 或 Node 配置对象 | 配置键保持源文档语义。 |
| SQLite 本地文件 | SQLite 本地文件 | 源文档要求本地文件，无需安装服务。 |

---

## 2. TypeScript 严格类型拓扑

> 约定：
> - `null` 只在业务确实允许“空值”时出现。
> - 可选字段 `?` 表示“对象中可以不存在该属性”；`T | null` 表示“属性存在，但值为空”。
> - 源文档未给出完整列名的表，仅声明“已知字段契约”。

```ts
export type Nullable<T> = T | null;

export type Role = 'admin' | 'experimenter';

export type TestState =
  | 'Idle'
  | 'Preparing'
  | 'Ready'
  | 'Recording'
  | 'Complete';

export type DurationMode = 'standard_60_minutes' | 'custom_minutes';

export type CompletionFlag = '10000000';

export type TemperatureChannel = 'TF1' | 'TF2' | 'TS' | 'TC' | 'TCal';

export type SensorDictionary = Record<TemperatureChannel, number>;

export interface MasterMessage {
  /** C# 原字段 Time，格式 HH:mm:ss，例如 "18:28:14" */
  time: string;
  /** C# 原字段 Message */
  message: string;
}

export interface DataBroadcastEventArgs {
  /** 源文档明确说明 DataBroadcast 携带 Messages 列表 */
  messages: readonly MasterMessage[];
}
```

### 2.1 登录与操作员

源依据：登录页面没有用户名输入框；用户选择角色后，系统按 `operators.username + operators.pwd` 校验，不按 `operators.userid` 校验。

```ts
export interface OperatorRowKnownFields {
  /** operators.username；初始账号：admin / experimenter */
  username: Role;
  /** operators.pwd；初始密码 123456。生产环境是否加密，源文档未定义。 */
  pwd: string;
  /** operators.role；源文档只定义简单角色区分 */
  role: Role;
  /** operators.userid；源文档明确“不按 userid 校验登录”，但未给出类型 */
  userid?: string | number;
}

export interface LoginRequest {
  role: Role;
  pwd: string;
}

export type LoginResponse =
  | {
      ok: true;
      username: Role;
      role: Role;
    }
  | {
      ok: false;
      message: '密码错误，请重新输入';
    };
```

### 2.2 新建试验 DTO

源依据：环境温湿度、样品编号、试验标识、样品名称、规格、高度、直径、操作员、时长模式、初始质量、设备信息自动带入。

```ts
export interface CreateTestRequest {
  environmentTemperatureC: number;
  environmentHumidityPercent: number;

  productid: string;
  testid: string;
  productName: string;
  specification: string;
  heightMm: number;
  diameterMm: number;

  operator: string;
  durationMode: DurationMode;
  /** 自定义分钟：仅 durationMode === 'custom_minutes' 时需要 */
  customDurationMinutes?: number;

  preweight: number;

  /** 以下设备信息来自全局配置或设备表；源文档未给出完整 apparatus 表结构 */
  apparatusNumber: string;
  apparatusName: string;
  verificationDate: string;
  constPower: number;
}

export interface CreateTestResponse {
  ok: true;
  productid: string;
  testid: string;
  nextState: 'Idle' | 'Preparing';
}
```

### 2.3 数据库表已知字段

```ts
export interface ProductMasterKnownFields {
  productid: string;
  productName: string;
  specification: string;
  heightMm: number;
  diameterMm: number;
}

export interface ApparatusKnownFields {
  /** 设备编号；源文档未给出数据库列名 */
  apparatusNumber: string;
  /** 串口配置；源文档未拆分 baudRate、portName 等字段 */
  serialPortConfig: string;
}

export interface SensorKnownFields {
  /** 量程；单位和上下限字段名源文档未定义 */
  range: string;
  /** 通道 ID；可对应 TF1/TF2/TS/TC/TCal */
  channelId: string;
}

export interface TestMasterRowKnownFields {
  /** 与 testid 组成联合主键 */
  productid: string;
  /** 与 productid 组成联合主键 */
  testid: string;
  testdate: string;
  operator: string;
  preweight: number;
  postweight: number;
  /** 失重率（%），判定项 */
  lostweight_per: number;
  /** 温升（°C），判定项；当前代码口径取表面温升 deltats */
  deltatf: number;
  /** 总试验时长（秒） */
  totaltesttime: number;
  /** 源文档状态保护规则使用 flag / Flag；保存成功后为 "10000000" */
  flag: CompletionFlag | string;
}

export interface CalibrationRecordKnownFields {
  date: string;
  operator: string;
  /** 多个标准温度点记录；源文档未给出单条记录字段结构，因此只能保持 unknown */
  records: readonly unknown[];
}
```

### 2.4 温度采样与 CSV

源 CSV 表头：`Time,Temp1,Temp2,TempSurface,TempCenter,TempCalibration`。

```ts
export interface TemperatureSample {
  /** CSV Time，单位：秒 */
  timeSeconds: number;
  temp1: number;
  temp2: number;
  tempSurface: number;
  tempCenter: number;
  tempCalibration: number;
}

export interface TemperatureDisplaySnapshot {
  sensors: SensorDictionary;
  state: TestState;
  recordingSeconds: number;
  driftCPer10Min: Nullable<number>;
  productid: Nullable<string>;
}
```

### 2.5 试验现象记录

```ts
export interface PhenomenonRecordRequest {
  productid: string;
  testid: string;
  hasContinuousFlame: boolean;
  /** 勾选持续火焰后才允许填写 */
  flameStartSecond?: number;
  /** 勾选持续火焰后才允许填写 */
  flameDurationSecond?: number;
  /** 试验后质量，必填 */
  postweight: number;
  remark?: string;
}

export interface PhenomenonCalculatedResult {
  lostweight: number;
  lostweight_per: number;
  deltaTf1: number;
  deltaTf2: number;
  deltaTs: number;
  deltaTc: number;
  /** 当前代码口径：deltatf = deltaTs */
  deltatf: number;
  passed: boolean;
}
```

### 2.6 配置类型

```ts
export interface AppConfig {
  Database: {
    Provider: 'Sqlite';
    SqlitePath: string;
  };
  Hardware: {
    ConstPower: number;
    PidTemperature: number;
    SensorProtocol: 'ModbusRtu';
  };
  Simulation: {
    EnableSimulation: boolean;
    SimulateSensors: boolean;
    SimulatePidController: boolean;
    InitialFurnaceTemp: number;
    TargetFurnaceTemp: number;
    HeatingRatePerSecond: number;
    TempFluctuation: number;
    StableThreshold: number;
    SimulateFlame: boolean;
  };
  FileStorage: {
    BaseDirectory: string;
    TestDataDirectory: string;
  };
  Report: {
    OutputDirectory: string;
    EnablePdfExport: boolean;
  };
}
```

> 注意：`MaxTemperatureDriftPerTenMinutes` 与 `TargetDurationSeconds` 在终止条件中出现，但源 `appsettings.json` 示例未给出具体键和值；实现时必须显式补充配置来源或在业务层传参，不能默认猜值。

---

## 3. 本地方法调用契约

### 3.1 调用方式结论

源 C# 文档本质是本地桌面应用：WinForms 界面直接调用 C# 业务对象、SQLite 和文件导出逻辑。因此 TypeScript 版本也应优先保持“本地应用内方法调用”，不默认拆成前后端分离架构，也不默认启动 localhost 端口。

| 类型 | 结论 |
|---|---|
| REST Endpoint | 不生成；源文档未定义，且本地桌面应用不需要默认走端口。 |
| localhost 端口服务 | 不生成；会增加通信层、路由层、CORS/生命周期等无关复杂度。 |
| UI 调用业务 | 推荐 UI 直接调用本地应用服务方法，例如 `testService.startHeating()`。 |
| 实时温度刷新 | 推荐本地事件总线 / `EventEmitter` / 状态订阅，不使用 SSE 或 WebSocket 作为默认方案。 |
| 桌面框架桥接 | 如果使用 Electron / Tauri 这类多进程框架，可用其 IPC/command 桥接 UI 与本地服务；这仍属于本地调用边界，不是 HTTP API。 |

### 3.2 可从源功能推出的本地应用服务契约

以下是“本地应用服务函数契约”，由 UI 直接调用；它们不是 REST 路由。

```ts
export interface AuthServiceContract {
  login(request: LoginRequest): Promise<LoginResponse>;
}

export interface TestCommandServiceContract {
  createTest(request: CreateTestRequest): Promise<CreateTestResponse>;
  startHeating(productid: string, testid: string): Promise<StateChangeResponse>;
  stopHeating(): Promise<StateChangeResponse>;
  startRecording(productid: string, testid: string): Promise<StateChangeResponse>;
  stopRecording(): Promise<StateChangeResponse>;
  savePhenomenon(request: PhenomenonRecordRequest): Promise<PhenomenonCalculatedResult>;
}

export interface StateChangeResponse {
  ok: true;
  previousState: TestState;
  nextState: TestState;
  message?: MasterMessage;
}

export interface QueryHistoryRequest {
  startDate?: string;
  endDate?: string;
  productidLike?: string;
  operator?: string;
}

export interface QueryHistoryResponse {
  rows: readonly TestMasterRowKnownFields[];
}
```

### 3.3 本地实时事件契约

源事件链：后台线程每秒 `TestMaster.DoWork()` → `messages.Add(...)` → 触发 `DataBroadcast` → UI 遍历 `e.Messages`。

TypeScript 本地应用内部可用 `EventEmitter` 或观察者模式表达：

```ts
export type DomainEventMap = {
  dataBroadcast: DataBroadcastEventArgs;
  error: Error;
};
```

本地 UI 订阅建议：

- `DaqWorker` 或 `TestControllerService` 触发 `dataBroadcast`。
- UI 层订阅 `dataBroadcast`，收到后刷新温度、曲线、消息日志和按钮状态。
- 事件只在本地应用进程/桌面框架边界内流转，不定义 HTTP 路由、不开放端口。

---

## 4. 状态机与业务规则

### 4.1 状态流转

```ts
export const STATE_FLOW: readonly TestState[] = [
  'Idle',
  'Preparing',
  'Ready',
  'Recording',
  'Complete',
] as const;
```

流转规则：

1. `Idle`：用户点击“开始升温”后进入 `Preparing`。
2. `Preparing`：温度达到 745~755°C 且稳定计数器大于 3 次 tick 后自动进入 `Ready`。
3. `Ready`：用户点击“开始记录”后进入 `Recording`。
4. `Recording`：固定时长到达、标准 3600 秒到达、标准检查点满足终止条件，或用户停止记录后进入 `Complete`。
5. `Complete`：保存试验记录成功后 `flag = "10000000"`，清空当前试验缓存；控制器可回到 `Preparing` 保持炉温。

特殊规则：

- `Ready` 状态下温度跌出 745~755°C，自动回退 `Preparing`。
- `totaltesttime > 0 && flag !== "10000000"` 表示“已完成但未保存”，禁止新建试验和重新开始记录。
- 用户点击“停止加热”时，`Preparing` 或 `Ready` 可回到 `Idle` 并开始降温。

### 4.2 按钮可用性

| 按钮 | Idle | Preparing | Ready | Recording | Complete |
|---|---:|---:|---:|---:|---:|
| 新建试验 | 可用 | 有活动试验禁用；无活动试验或上次已保存可用 | 禁用 | 禁用 | 未保存禁用；保存后可用 |
| 开始升温 | 可用 | 禁用 | 禁用 | 禁用 | 禁用 |
| 停止升温 | 禁用 | 可用 | 可用 | 禁用 | 可用 |
| 开始记录 | 禁用 | 禁用 | 可用 | 禁用 | 禁用 |
| 停止记录 | 禁用 | 禁用 | 禁用 | 可用 | 禁用 |
| 参数设置 | 可用 | 可用 | 可用 | 禁用 | 可用 |

---

## 5. 仿真算法契约

### 5.1 温度通道

| 通道 | 含义 | 曲线显示 |
|---|---|---|
| `TF1` | 炉温1，主炉温 | 显示曲线 |
| `TF2` | 炉温2，副炉温 | 显示曲线 |
| `TS` | 样品表面温度 | 显示曲线 |
| `TC` | 样品中心温度 | 显示曲线 |
| `TCal` | 标定用温度 | 只显示数值，不画曲线 |

### 5.2 800ms 更新规则

- `DaqWorker` 每 800ms 执行一次。
- 仿真模式下调用 `SensorSimulator.Update()`，返回仿真温度数据并更新传感器字典。
- 硬件模式在源文档中只作为分支说明；真实 Modbus 实现被列为不需要实现。

### 5.3 升温、稳定、记录、降温

- 升温阶段：当 `TF1 < TargetTemp - StableThreshold`，即当前配置下 `< 747°C`，`TF1` 与 `TF2` 按 `HeatingRatePerSecond × 0.8 + 随机噪声` 增长。
- 稳定阶段：`TF1`、`TF2` 钳位到 `750 + 随机噪声`；稳定计数器大于 3 后 `IsStable = true`。
- 记录阶段：
  - `TS` 向 `min(TF1 × 0.95, 800)` 指数接近，步长 0.02。
  - `TC` 向 `min(TF1 × 0.85, 750)` 指数接近，步长 0.01。
- 降温阶段：`TF1`、`TF2` 按 `0.5 + 随机噪声 × 0.1` 缓慢下降。
- 随机噪声：`Random(-1, 1) × TempFluctuation`，示例默认 `0.5°C`。

### 5.4 恒功率与温漂

- 进入 `Ready` 后，持续记录 PID 输出值到队列，最多 600 个。
- 点击“开始记录”时，恒功率等于队列中所有 PID 输出值的平均值。
- 温漂：对最近 10 分钟、600 个数据点做线性回归，斜率为 `°C/10min`。
- 稳定判断：斜率绝对值小于阈值，源文档描述约 `2°C/10min`。

---

## 6. 终止条件与判定结论

### 6.1 试验终止

标准 60 分钟模式：

- 第 30、35、40、45、50、55 分钟每 5 分钟检查一次终止条件。
- 到达第 60 分钟无条件终止。
- 可提前终止条件：10 分钟温漂有效，且炉温1/炉温2的 10 分钟温漂均不超过 `MaxTemperatureDriftPerTenMinutes`。

固定时长模式：

- 忽略提前终止检查，到达 `TargetDurationSeconds` 后完成试验。
- `TargetDurationSeconds` 的来源和默认值源文档未给出。

手动终止：

- 用户点击“停止记录”。
- 若已有有效记录样本，进入 `Complete`；否则回到 `Preparing`。

### 6.2 简化判定

```ts
export function isPassedBySourceRule(input: {
  deltatf: number;
  lostweight_per: number;
  flameDurationSecond: number;
}): boolean {
  return input.deltatf <= 50 && input.lostweight_per <= 50 && input.flameDurationSecond < 5;
}
```

判定依据：源文档明确当前按 `deltatf <= 50`、`lostweight_per <= 50`、`flameduration < 5` 判断“通过/不通过”。

---

## 7. 文件、导出与查询

### 7.1 CSV

- 每次试验独立一个 CSV 文件。
- 路径：`D:\ISO11820\TestData\{样品ID}\{试验ID}\sensor_data.csv`。
- 每秒一行。
- 表头：`Time,Temp1,Temp2,TempSurface,TempCenter,TempCalibration`。

### 7.2 Excel / PDF

| 格式 | 内容 | 触发方式 |
|---|---|---|
| CSV | 每秒温度数据，5 通道 | 试验完成自动生成 |
| Excel | Sheet1 试验信息；Sheet2 温度数据；Sheet3 温度曲线图 | 手动点击导出或自动生成 |
| PDF | 试验概要、温度曲线图片、判定结论 | 保存试验记录后自动生成，或手动触发 |

### 7.3 历史查询

查询条件：

- 日期范围。
- 样品编号模糊匹配。
- 操作员下拉选择。
- 双击列表行查看完整详情。
- 查询结果可导出 Excel。

---

## 8. 前端显示契约

主界面每秒刷新：

- 5 通道温度数值，大字体 LED 风格，单位 °C，保留 1 位小数。
- 计时器：显示已记录秒数，仅 `Recording` 计时。
- 温度漂移：最近 10 分钟炉温变化趋势，单位 `°C/10min`。
- 当前状态中文描述。
- 当前样品编号。
- 系统消息：时间戳 + 消息内容，不同事件不同颜色。

曲线图：

- 4 条折线：炉温1、炉温2、表面温、中心温。
- `TCal` 不画曲线。
- X 轴：时间秒数，滚动显示最近 10 分钟。
- Y 轴：温度，范围 0~800°C。

消息颜色：

- 包含“终止”的消息为黄色。
- 其他源文档列出的系统消息为白色。

---

## 9. 非功能与排除项

以下内容源文档明确“不需要实现”，TS 版本也不得默认加入：

- 真实串口 / Modbus 通信。
- 真实 PID 控制算法。
- 摄像头火焰检测。
- 多炉同时控制。
- ISO 标准完整合规判定。
- 网络 / 云端同步。
- 复杂权限管理。

---

## 10. 待确认项

这些点源文档没有给出，不能在实现中静默猜测：

1. `operators.userid` 的真实类型与用途。
2. `productmaster`、`apparatus`、`sensors`、`CalibrationRecords` 的完整数据库列。
3. `role` 在数据库中是中文角色名还是英文编码。
4. `MaxTemperatureDriftPerTenMinutes` 的配置键、默认值和单位。
5. `TargetDurationSeconds` 的来源与默认值。
6. PID 输出队列的具体数据结构。
7. 若未来改成 Web 化系统，才需要另行确认 HTTP 路由、鉴权方式、实时传输方式；当前本地桌面版不需要。
8. Node.js SQLite 具体驱动选择；若使用 `node:sqlite`，需确认 Node 版本满足项目要求。

---

## 11. 重构适配说明

1. **WinForms UI 到 TS 桌面 UI**：源 WinForms 控件行为被改写为本地桌面 UI 组件状态与事件响应；业务状态机保持不变。
2. **进程内事件保持进程内事件**：C# `DataBroadcast` 可映射为 Node.js `EventEmitter` 或本地观察者模式；不引入 SSE、WebSocket 或 HTTP 端口作为默认传输层。
3. **线程 / 事件模型变化**：C# 文档要求 WinForms `Invoke` 切回 UI 线程；TS 桌面版应通过 UI 框架的事件回调、状态更新机制或 IPC/command 桥保证 UI 状态一致性，但业务层仍暴露本地方法。
4. **类型空值显式化**：TS Strict Mode 下，未知或可能不存在的值必须用 `?` 或 `T | null` 表达，不能像非严格 JS 一样隐式使用。
5. **集合映射**：C# `List<T>` 映射为 `T[]` / `readonly T[]`；传感器字典映射为 `Record<TemperatureChannel, number>`。
6. **异步映射**：后台任务、数据库、文件导出等在 TS 中用 `Promise<T>` / `async function` 表达。
7. **端口克制**：源文档没有 Web API 路由，本地桌面应用也不需要默认开放 localhost 端口；本文只提供本地应用服务契约，不把它们伪装成 REST Endpoint。
8. **数据库克制**：源文档明确 SQLite 本地文件和直接 SQL，不默认引入 ORM。
