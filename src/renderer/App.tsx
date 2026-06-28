import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { gsap } from 'gsap';
import type {
  CalibrationInput,
  CreateTestRequest,
  DurationMode,
  LoginResponse,
  MasterMessage,
  PhenomenonCalculatedResult,
  PhenomenonRecordRequest,
  QueryHistoryRequest,
  RuntimeStatus,
  TemperatureDisplaySnapshot,
  TemperatureSample,
  TestMasterRow,
  TestState,
} from '../shared/types';

type Session = Extract<LoginResponse, { ok: true }>;

interface TestFormState {
  productid: string;
  testid: string;
  productName: string;
  specification: string;
  heightMm: string;
  diameterMm: string;
  environmentTemperatureC: string;
  environmentHumidityPercent: string;
  preweight: string;
  durationMode: DurationMode;
  customDurationMinutes: string;
  operator: string;
}

interface PhenomenonState {
  hasContinuousFlame: boolean;
  flameStartSecond: string;
  flameDurationSecond: string;
  postweight: string;
  remark: string;
}

interface HistoryFilterState {
  startDate: string;
  endDate: string;
  productidLike: string;
  operator: string;
}

interface CalibrationState {
  calibrationType: CalibrationInput['calibrationType'];
  operator: string;
  remarks: string;
  points: string[];
}

interface UiNotice {
  tone: 'ok' | 'warn' | 'danger';
  text: string;
}

const channelLabels = [
  { key: 'TF1', label: 'TF1 炉温 1', field: 'temp1', color: '#4de2ff' },
  { key: 'TF2', label: 'TF2 炉温 2', field: 'temp2', color: '#8bff9a' },
  { key: 'TS', label: 'TS 表面', field: 'tempSurface', color: '#ffd36a' },
  { key: 'TC', label: 'TC 中心', field: 'tempCenter', color: '#ff6f91' },
] as const;

const emptySnapshot: TemperatureDisplaySnapshot = {
  sensors: { TF1: 0, TF2: 0, TS: 0, TC: 0, TCal: 0 },
  state: 'Idle',
  recordingSeconds: 0,
  driftCPer10Min: null,
  productid: null,
};

const initialTestForm: TestFormState = {
  productid: 'P-ISO-001',
  testid: `T-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-01`,
  productName: '绝热材料样品',
  specification: 'Φ45 × 50 mm',
  heightMm: '50',
  diameterMm: '45',
  environmentTemperatureC: '23',
  environmentHumidityPercent: '50',
  preweight: '125.0',
  durationMode: 'standard_60_minutes',
  customDurationMinutes: '60',
  operator: '实验员A',
};

const initialPhenomenon: PhenomenonState = {
  hasContinuousFlame: false,
  flameStartSecond: '',
  flameDurationSecond: '',
  postweight: '118.0',
  remark: '',
};

const initialCalibration: CalibrationState = {
  calibrationType: 'Surface',
  operator: '校准员A',
  remarks: '九点温场校准',
  points: ['750', '751', '749', '750', '752', '750', '749', '751', '750'],
};

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function stateText(state: TestState): string {
  const map: Record<TestState, string> = {
    Idle: '待机',
    Preparing: '准备中',
    Ready: '已就绪',
    Recording: '记录中',
    Complete: '完成',
  };
  return map[state];
}

function isTerminalMessage(message: MasterMessage): boolean {
  return /终止|停止|中止|结束|Complete|Stop/i.test(message.message);
}

function compactRequest(filter: HistoryFilterState): QueryHistoryRequest {
  return {
    startDate: filter.startDate || undefined,
    endDate: filter.endDate || undefined,
    productidLike: filter.productidLike || undefined,
    operator: filter.operator || undefined,
  };
}

function buildPath(samples: readonly TemperatureSample[], field: (typeof channelLabels)[number]['field']): string {
  const width = 760;
  const height = 250;
  const padding = 18;
  const recent = samples.slice(-90);
  if (recent.length < 2) return '';

  const values = recent.flatMap((sample) => channelLabels.map((channel) => sample[channel.field]));
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 100);
  const range = Math.max(maxValue - minValue, 1);

  return recent
    .map((sample, index) => {
      const x = padding + (index / (recent.length - 1)) * (width - padding * 2);
      const y = height - padding - ((sample[field] - minValue) / range) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function LoginPanel({ onLogin }: { onLogin: (session: Session) => void }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [role, setRole] = useState<Session['role']>('admin');
  const [pwd, setPwd] = useState('123456');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { opacity: 0, y: 28, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' },
    );
  }, []);

  async function submitLogin() {
    setBusy(true);
    setError('');
    try {
      const result = await window.iso11820.login({ role, pwd });
      if (result.ok) {
        onLogin(result);
        return;
      }
      setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : '本地接口不可用');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" ref={cardRef}>
        <div className="brand-mark">ISO</div>
        <p className="eyebrow">ISO 11820 SIMULATION CONSOLE</p>
        <h1>本地仿真试验台</h1>
        <p className="login-copy">连接本机预加载安全通道，进入升温、记录、校准与历史追溯工作区。</p>

        <div className="role-switch" aria-label="选择登录身份">
          {(['admin', 'experimenter'] as const).map((item) => (
            <button key={item} className={role === item ? 'active' : ''} onClick={() => setRole(item)}>
              {item === 'admin' ? '管理员' : '实验员'}
            </button>
          ))}
        </div>

        <label className="field-block">
          <span>密码</span>
          <input value={pwd} onChange={(event) => setPwd(event.target.value)} type="password" placeholder="默认 123456" />
        </label>

        {error && <div className="login-error">{error}</div>}
        <button className="primary-action" disabled={busy} onClick={submitLogin}>
          {busy ? '正在接入...' : '进入控制台'}
        </button>
      </section>
    </main>
  );
}

function LedCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!cardRef.current) return;
    gsap.fromTo(cardRef.current, { boxShadow: `0 0 0 ${accent}00` }, { boxShadow: `0 0 24px ${accent}33`, duration: 0.35 });
  }, [value, accent]);

  return (
    <div className="led-card" ref={cardRef}>
      <span>{label}</span>
      <strong style={{ color: accent }}>{value.toFixed(1)}</strong>
      <small>℃</small>
    </div>
  );
}

function TemperatureChart({ samples }: { samples: readonly TemperatureSample[] }) {
  const paths = useMemo(
    () => channelLabels.map((channel) => ({ ...channel, path: buildPath(samples, channel.field) })),
    [samples],
  );

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">THERMAL TRACE</p>
          <h2>温度曲线</h2>
        </div>
        <div className="legend-row">
          {channelLabels.map((channel) => (
            <span key={channel.key} style={{ '--legend': channel.color } as CSSProperties}>
              {channel.key}
            </span>
          ))}
        </div>
      </div>
      <svg className="temperature-svg" viewBox="0 0 760 250" role="img" aria-label="TF1 TF2 TS TC 最近样本折线">
        <defs>
          <linearGradient id="chartGlow" x1="0" x2="1">
            <stop offset="0" stopColor="#16344a" />
            <stop offset="1" stopColor="#0b121a" />
          </linearGradient>
        </defs>
        <rect width="760" height="250" rx="18" fill="url(#chartGlow)" />
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1="18" x2="742" y1={32 + line * 52} y2={32 + line * 52} className="grid-line" />
        ))}
        {paths.map((channel) => (
          <path key={channel.key} d={channel.path} fill="none" stroke={channel.color} strokeWidth="3" strokeLinecap="round" />
        ))}
      </svg>
    </section>
  );
}

function App() {
  const appRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [testForm, setTestForm] = useState<TestFormState>(initialTestForm);
  const [phenomenon, setPhenomenon] = useState<PhenomenonState>(initialPhenomenon);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterState>({ startDate: '', endDate: '', productidLike: '', operator: '' });
  const [historyRows, setHistoryRows] = useState<readonly TestMasterRow[]>([]);
  const [calibration, setCalibration] = useState<CalibrationState>(initialCalibration);
  const [notice, setNotice] = useState<UiNotice | null>(null);
  const [busyAction, setBusyAction] = useState<string>('');

  const snapshot = status?.snapshot ?? emptySnapshot;
  const messages = status?.messages ?? [];
  const samples = status?.samples ?? [];

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    window.iso11820
      .getStatus()
      .then((runtimeStatus) => {
        if (!disposed) setStatus(runtimeStatus);
      })
      .catch((err) => showNotice('danger', err instanceof Error ? err.message : '读取本地状态失败'));

    const unsubscribe = window.iso11820.onDataBroadcast((runtimeStatus) => {
      setStatus(runtimeStatus);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [session]);

  useEffect(() => {
    if (!session || !appRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.stagger-in',
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.55, stagger: 0.07, ease: 'power2.out' },
      );
    }, appRef);
    return () => ctx.revert();
  }, [session]);

  useEffect(() => {
    gsap.fromTo('.state-pill', { scale: 0.96 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
  }, [snapshot.state]);

  function showNotice(tone: UiNotice['tone'], text: string) {
    setNotice({ tone, text });
    window.setTimeout(() => setNotice(null), 3800);
  }

  function patchTestForm<K extends keyof TestFormState>(key: K, value: TestFormState[K]) {
    setTestForm((current) => ({ ...current, [key]: value }));
  }

  function patchPhenomenon<K extends keyof PhenomenonState>(key: K, value: PhenomenonState[K]) {
    setPhenomenon((current) => ({ ...current, [key]: value }));
  }

  function patchCalibrationPoint(index: number, value: string) {
    setCalibration((current) => ({
      ...current,
      points: current.points.map((point, pointIndex) => (pointIndex === index ? value : point)),
    }));
  }

  async function runAction(label: string, action: () => Promise<string>) {
    setBusyAction(label);
    try {
      const text = await action();
      showNotice('ok', text);
    } catch (err) {
      showNotice('danger', err instanceof Error ? err.message : `${label}失败`);
    } finally {
      setBusyAction('');
    }
  }

  async function createTest() {
    const request: CreateTestRequest = {
      productid: testForm.productid,
      testid: testForm.testid,
      productName: testForm.productName,
      specification: testForm.specification,
      heightMm: toNumber(testForm.heightMm),
      diameterMm: toNumber(testForm.diameterMm),
      environmentTemperatureC: toNumber(testForm.environmentTemperatureC),
      environmentHumidityPercent: toNumber(testForm.environmentHumidityPercent),
      preweight: toNumber(testForm.preweight),
      durationMode: testForm.durationMode,
      customDurationMinutes: testForm.durationMode === 'custom_minutes' ? toNumber(testForm.customDurationMinutes, 60) : undefined,
      operator: testForm.operator,
      apparatusNumber: status?.apparatus.innernumber ?? 'ISO-APP-01',
      apparatusName: status?.apparatus.apparatusname ?? 'ISO 11820 仿真试验台',
      verificationDate: status?.apparatus.checkdatef ?? new Date().toISOString().slice(0, 10),
      constPower: status?.apparatus.constpower ?? status?.config.Hardware.ConstPower ?? 0,
    };

    const response = await window.iso11820.createTest(request);
    return `试验 ${response.testid} 已创建，状态进入 ${stateText(response.nextState)}`;
  }

  async function savePhenomenon() {
    const request: PhenomenonRecordRequest = {
      productid: snapshot.productid ?? testForm.productid,
      testid: testForm.testid,
      hasContinuousFlame: phenomenon.hasContinuousFlame,
      flameStartSecond: phenomenon.flameStartSecond ? toNumber(phenomenon.flameStartSecond) : undefined,
      flameDurationSecond: phenomenon.flameDurationSecond ? toNumber(phenomenon.flameDurationSecond) : undefined,
      postweight: toNumber(phenomenon.postweight),
      remark: phenomenon.remark || undefined,
    };
    const result: PhenomenonCalculatedResult = await window.iso11820.savePhenomenon(request);
    return `现象已保存，质量损失 ${result.lostweight_per.toFixed(2)}%，判定${result.passed ? '通过' : '未通过'}`;
  }

  async function queryHistory() {
    const response = await window.iso11820.queryHistory(compactRequest(historyFilter));
    setHistoryRows(response.rows);
    showNotice('ok', `查询完成，共 ${response.rows.length} 条记录`);
  }

  async function saveCalibration() {
    const response = await window.iso11820.saveCalibration({
      calibrationType: calibration.calibrationType,
      operator: calibration.operator,
      remarks: calibration.remarks,
      points: calibration.points.map((point) => toNumber(point)),
    });
    showNotice('ok', `校准保存：平均 ${response.averageTemperature.toFixed(1)}℃，最大偏差 ${response.maxDeviation.toFixed(2)}℃`);
  }

  if (!session) {
    return <LoginPanel onLogin={setSession} />;
  }

  return (
    <div className="app-shell" ref={appRef}>
      <header className="topbar stagger-in">
        <div>
          <p className="eyebrow">LOCAL DESKTOP INSTRUMENT</p>
          <h1>ISO 11820 仿真控制台</h1>
        </div>
        <div className="topbar-status">
          <span className={`state-pill state-${snapshot.state.toLowerCase()}`}>{stateText(snapshot.state)}</span>
          <span>{session.role === 'admin' ? '管理员' : '实验员'} · {session.username}</span>
        </div>
      </header>

      {notice && <div className={`notice notice-${notice.tone}`}>{notice.text}</div>}

      <section className="dashboard-grid stagger-in">
        <div className="panel hero-panel">
          <div>
            <p className="eyebrow">CURRENT SAMPLE</p>
            <h2>{snapshot.productid ?? testForm.productid}</h2>
            <p>{testForm.productName} · {testForm.specification}</p>
          </div>
          <div className="metric-stack">
            <div>
              <span>记录计时</span>
              <strong>{formatSeconds(snapshot.recordingSeconds)}</strong>
            </div>
            <div>
              <span>温漂 / 10min</span>
              <strong>{snapshot.driftCPer10Min == null ? '--' : snapshot.driftCPer10Min.toFixed(2)}℃</strong>
            </div>
          </div>
        </div>
        <LedCard label="TF1" value={snapshot.sensors.TF1} accent="#4de2ff" />
        <LedCard label="TF2" value={snapshot.sensors.TF2} accent="#8bff9a" />
        <LedCard label="TS" value={snapshot.sensors.TS} accent="#ffd36a" />
        <LedCard label="TC" value={snapshot.sensors.TC} accent="#ff6f91" />
        <LedCard label="TCal" value={snapshot.sensors.TCal} accent="#c9a7ff" />
      </section>

      <main className="workbench">
        <section className="panel form-panel stagger-in">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">TEST SETUP</p>
              <h2>新建试验</h2>
            </div>
            <button className="soft-button" disabled={busyAction === 'create'} onClick={() => runAction('create', createTest)}>
              创建试验
            </button>
          </div>
          <div className="form-grid">
            <label><span>样品编号</span><input value={testForm.productid} onChange={(event) => patchTestForm('productid', event.target.value)} /></label>
            <label><span>试验编号</span><input value={testForm.testid} onChange={(event) => patchTestForm('testid', event.target.value)} /></label>
            <label><span>样品名称</span><input value={testForm.productName} onChange={(event) => patchTestForm('productName', event.target.value)} /></label>
            <label><span>规格</span><input value={testForm.specification} onChange={(event) => patchTestForm('specification', event.target.value)} /></label>
            <label><span>高度 mm</span><input value={testForm.heightMm} onChange={(event) => patchTestForm('heightMm', event.target.value)} /></label>
            <label><span>直径 mm</span><input value={testForm.diameterMm} onChange={(event) => patchTestForm('diameterMm', event.target.value)} /></label>
            <label><span>环境温度 ℃</span><input value={testForm.environmentTemperatureC} onChange={(event) => patchTestForm('environmentTemperatureC', event.target.value)} /></label>
            <label><span>湿度 %</span><input value={testForm.environmentHumidityPercent} onChange={(event) => patchTestForm('environmentHumidityPercent', event.target.value)} /></label>
            <label><span>预称重 g</span><input value={testForm.preweight} onChange={(event) => patchTestForm('preweight', event.target.value)} /></label>
            <label><span>操作员</span><input value={testForm.operator} onChange={(event) => patchTestForm('operator', event.target.value)} /></label>
            <label><span>时长模式</span><select value={testForm.durationMode} onChange={(event) => patchTestForm('durationMode', event.target.value as DurationMode)}><option value="standard_60_minutes">标准 60 分钟</option><option value="custom_minutes">自定义</option></select></label>
            <label><span>自定义分钟</span><input value={testForm.customDurationMinutes} onChange={(event) => patchTestForm('customDurationMinutes', event.target.value)} /></label>
          </div>
        </section>

        <section className="panel control-panel stagger-in">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CONTROL</p>
              <h2>试验控制</h2>
            </div>
          </div>
          <div className="control-grid">
            <button onClick={() => runAction('startHeating', async () => stateText((await window.iso11820.startHeating()).nextState))}>开始升温</button>
            <button onClick={() => runAction('stopHeating', async () => stateText((await window.iso11820.stopHeating()).nextState))}>停止升温</button>
            <button onClick={() => runAction('startRecording', async () => stateText((await window.iso11820.startRecording()).nextState))}>开始记录</button>
            <button onClick={() => runAction('stopRecording', async () => stateText((await window.iso11820.stopRecording()).nextState))}>停止记录</button>
            <button onClick={() => runAction('exportCurrent', async () => {
              const result = await window.iso11820.exportCurrent();
              return `导出完成：${result.csvPath || result.excelPath || result.pdfPath}`;
            })}>导出当前</button>
          </div>

          <div className="phenomenon-box">
            <h3>现象记录</h3>
            <label className="check-line"><input type="checkbox" checked={phenomenon.hasContinuousFlame} onChange={(event) => patchPhenomenon('hasContinuousFlame', event.target.checked)} /> 连续火焰</label>
            <div className="mini-grid">
              <label><span>起始秒</span><input value={phenomenon.flameStartSecond} onChange={(event) => patchPhenomenon('flameStartSecond', event.target.value)} /></label>
              <label><span>持续秒</span><input value={phenomenon.flameDurationSecond} onChange={(event) => patchPhenomenon('flameDurationSecond', event.target.value)} /></label>
              <label><span>后称重 g</span><input value={phenomenon.postweight} onChange={(event) => patchPhenomenon('postweight', event.target.value)} /></label>
            </div>
            <textarea value={phenomenon.remark} onChange={(event) => patchPhenomenon('remark', event.target.value)} placeholder="记录熔融、开裂、冒烟等现象" />
            <button className="soft-button full" onClick={() => runAction('phenomenon', savePhenomenon)}>保存现象</button>
          </div>
        </section>

        <TemperatureChart samples={samples} />

        <section className="panel log-panel stagger-in">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">MASTER LOG</p>
              <h2>消息日志</h2>
            </div>
          </div>
          <div className="log-list">
            {messages.slice(-12).reverse().map((message, index) => (
              <div key={`${message.time}-${index}`} className={isTerminalMessage(message) ? 'log-row terminal' : 'log-row'}>
                <time>{message.time}</time>
                <span>{message.message}</span>
              </div>
            ))}
            {messages.length === 0 && <div className="empty-state">暂无本地消息</div>}
          </div>
        </section>

        <section className="panel history-panel stagger-in">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ARCHIVE</p>
              <h2>历史查询</h2>
            </div>
            <button className="soft-button" onClick={queryHistory}>查询</button>
          </div>
          <div className="history-filters">
            <label><span>开始日期</span><input type="date" value={historyFilter.startDate} onChange={(event) => setHistoryFilter({ ...historyFilter, startDate: event.target.value })} /></label>
            <label><span>结束日期</span><input type="date" value={historyFilter.endDate} onChange={(event) => setHistoryFilter({ ...historyFilter, endDate: event.target.value })} /></label>
            <label><span>样品</span><input value={historyFilter.productidLike} onChange={(event) => setHistoryFilter({ ...historyFilter, productidLike: event.target.value })} /></label>
            <label><span>操作员</span><input value={historyFilter.operator} onChange={(event) => setHistoryFilter({ ...historyFilter, operator: event.target.value })} /></label>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>日期</th><th>样品</th><th>试验</th><th>操作员</th><th>失重率</th><th>ΔTf</th><th>结果</th></tr></thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={`${row.productid}-${row.testid}`}>
                    <td>{row.testdate}</td><td>{row.productid}</td><td>{row.testid}</td><td>{row.operator}</td><td>{row.lostweight_per.toFixed(2)}%</td><td>{row.deltatf.toFixed(1)}</td><td>{row.passed ? '通过' : '未通过'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {historyRows.length === 0 && <div className="empty-state">输入条件后查询历史试验</div>}
          </div>
        </section>

        <section className="panel calibration-panel stagger-in">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CALIBRATION</p>
              <h2>九点温度校准</h2>
            </div>
            <button className="soft-button" onClick={saveCalibration}>保存校准</button>
          </div>
          <div className="calibration-meta">
            <label><span>类型</span><select value={calibration.calibrationType} onChange={(event) => setCalibration({ ...calibration, calibrationType: event.target.value as CalibrationInput['calibrationType'] })}><option value="Surface">表面</option><option value="Center">中心</option></select></label>
            <label><span>校准员</span><input value={calibration.operator} onChange={(event) => setCalibration({ ...calibration, operator: event.target.value })} /></label>
            <label><span>备注</span><input value={calibration.remarks} onChange={(event) => setCalibration({ ...calibration, remarks: event.target.value })} /></label>
          </div>
          <div className="calibration-grid">
            {calibration.points.map((point, index) => (
              <label key={index}><span>P{index + 1}</span><input value={point} onChange={(event) => patchCalibrationPoint(index, event.target.value)} /></label>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
