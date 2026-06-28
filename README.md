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
npm test
```

- `typecheck`：检查渲染进程、主进程和共享类型。
- `smoke`：构建后执行本地业务烟测，覆盖登录、新建试验、升温到 Ready、记录、保存、历史查询、校准和导出文件检查。
- `test`：先类型检查，再执行烟测。

## 默认账号

| 角色 | 密码 |
|---|---|
| `admin` | `123456` |
| `experimenter` | `123456` |

## 本地数据目录

运行数据不会提交到 git：

- `Data/ISO11820.db`：SQLite 数据库。
- `TestData/{productid}/{testid}/sensor_data.csv`：温度 CSV。
- `Reports/*.xlsx`、`Reports/*.pdf`：导出报告。
- `SmokeData/`：自动化烟测临时数据。

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
- 工业仪表风格 UI、LED 温度显示、SVG 温度曲线、消息日志和 GSAP 微动效。

## 待确认项

- 当前密码按源文档明文存储；生产加密策略未定义。
- PDF 为基础概要报告，尚未嵌入真实曲线图片。
- ExcelJS 社区版不原生生成图表，曲线数据写入“温度数据”Sheet，图表说明写入“温度曲线”Sheet。
