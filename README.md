# ISO 11820 TypeScript 本地桌面应用

本项目根据 `开发文档TS.md` 与 `DB-数据库设计.md` 实现。应用是 **Electron + React + TypeScript 本地桌面程序**：不开 HTTP 端口，不做前后端分离，不提供 REST API。UI 通过 Electron IPC 调用本地 service 方法，SQLite、CSV、Excel、PDF 都保存在本机文件中。

## 运行环境

- Node.js 24+
- npm 11+
- Windows 本地桌面环境

## 安装与运行

```bash
npm install
npm run build
npm start
```

开发期一键构建并打开：

```bash
npm run dev
```

## 测试命令

```bash
npm run typecheck
npm run smoke
npm run verify-no-network
npm run verify
npm test
```

- `typecheck`：检查渲染进程、主进程和共享类型。
- `smoke`：构建后执行本地业务烟测，覆盖登录、新建试验、升温到 Ready、记录、保存、历史查询、校准、CSV 表头/数据行、Excel/PDF 非空文件和数据库完成标记。
- `verify-no-network`：扫描 `src/` 与 `scripts/`，阻止 `fetch`、WebSocket、EventSource、localhost、HTTP server 等网络/端口代码进入本地桌面边界。
- `verify` / `test`：先类型检查，再执行烟测和无网络扫描。

## 打包命令

默认打包使用本地离线目录输出脚本，不启动端口，也不依赖外部下载：

```bash
npm run package
```

输出目录：`release/win-unpacked/`，入口为 `ISO11820Desktop.exe`。

如果后续具备稳定网络和签名配置，也保留了 electron-builder 目录打包命令：

```bash
npm run package:builder
```

如需 NSIS/MSI 安装器，可在 `package.json > build.win.target` 中追加对应 target 后再打包。

## 默认账号

| 角色 | 密码 |
|---|---|
| `admin` | `123456` |
| `experimenter` | `123456` |

## 本地数据目录

运行数据不会提交到 git：

- `Data/ISO11820.db`：SQLite 数据库。
- `output/{productid}/{testid}/sensor_data.csv`：温度 CSV。
- `output/*.xlsx`、`output/*.pdf`：导出报告。
- `SmokeData/`：自动化烟测临时数据。

源码运行时默认导出到项目目录的 `output/`。打包后的 `ISO11820Desktop.exe` 默认把导出文件保存到 exe 同级的 `output/`，也就是 `release/win-unpacked/output/`。

打包后的 SQLite 数据库仍默认使用系统 `userData` 目录，避免安装目录权限问题。若需要指定数据库目录，可设置环境变量 `ISO11820_BASE_DIR`；若需要指定导出目录，可设置 `ISO11820_OUTPUT_DIR`。

## 架构边界

```txt
Electron Renderer UI
  ↓ window.iso11820 IPC
Electron Main / 本地应用服务
  ↓ 本地方法
状态机 / 温度仿真 / SQLite / 文件导出
```

不会启动 `localhost` 服务，也没有 `fetch('/api/...')`、WebSocket 或 SSE。

## 已实现功能

- 登录校验。
- 新建试验并初始化 `productmaster` / `testmaster`。
- 800ms 温度仿真与 Ready 判定。
- 记录、手动停止、保存现象和判定。
- SQLite 6 张表初始化与种子数据。
- 历史查询。
- 9 点校准记录。
- CSV / Excel / PDF 导出。
- PDF 直接绘制 TF1/TF2/TS/TC 四条温度曲线、坐标轴和图例。
- Excel 输出试验信息、完整温度数据、统计与判定、曲线数据说明表。
- 工业仪表风格 UI、LED 温度显示、SVG 温度曲线、消息日志和 GSAP 微动效。

## 正式交付验收清单

- [ ] `npm install` 完成且无安装失败。
- [ ] `npm run typecheck` 通过，主进程、共享类型和 renderer 类型均无错误。
- [ ] `npm run smoke` 通过，且生成 SQLite、CSV、Excel、PDF 文件。
- [ ] `npm run verify-no-network` 通过，确认未引入 HTTP/REST/localhost 服务。
- [ ] 登录默认账号 `admin / 123456` 与 `experimenter / 123456` 可用。
- [ ] 新建试验必填项、正数项、自定义时长、现象保存、火焰字段校验符合预期。
- [ ] 历史查询能看到保存后 `flag = 10000000` 的记录。
- [ ] 打包前运行 `npm run package`，确认 `release/win-unpacked/` 可启动。

## 已知限制

- 当前密码按源文档明文存储；生产加密策略未定义。
- PDF 使用 PDFKit 基础字体优先保证英文兼容；中文字段含义在 Excel/README 中完整保留，PDF 中采用英文标签避免缺字风险。
- ExcelJS 社区版不原生生成图表；当前生成完整曲线数据表与统计表，PDF 中直接绘制曲线。
- 仿真器不是真实硬件/PID/Modbus，实现范围限定为源文档定义的本地仿真流程。
- `MaxTemperatureDriftPerTenMinutes`、自定义时长默认兜底等源文档未给配置键的内容已在源码注释中说明。

## 待确认项

- 若未来需要安装器而非目录输出，需要确认安装路径、签名证书、自动更新策略。
- 若未来需要真实硬件，需要另行确认 Modbus/串口/PID 协议细节。
