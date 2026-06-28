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

interface UiEvent {
  id: number;
  time: string;
  tone: UiNotice['tone'];
  text: string;
}

type ActionKey =
  | 'create'
  | 'startHeating'
  | 'stopHeating'
  | 'startRecording'
  | 'stopRecording'
  | 'exportCurrent'
  | 'phenomenon'
  | 'queryHistory'
  | 'saveCalibration';

const channelLabels = [
  { key: 'TF1', label: 'TF1 炉温 1', field: 'temp1', color: '#4de2ff' },
  { key: 'TF2', label: 'TF2 炉温 2', field: 'temp2', color: '#8bff9a' },
  { key: 'TS', label: 'TS 表面', field: 'tempSurface', color: '#ffd36a' },
  { key: 'TC', label: 'TC 中心', field: 'tempCenter', color: '#ff6f91' },
] as const;

const actionLabels: Record<ActionKey, string> = {
  create: '创建试验',
  startHeating: '开始升温',
  stopHeating: '停止升温',
  startRecording: '开始记录',
  stopRecording: '停止记录',
  exportCurrent: '导出当前',
  phenomenon: '保存现象',
  queryHistory: '历史查询',
  saveCalibration: '保存校准',
};

const chart = {
  width: 820,
  height: 280,
  left: 54,
  right: 18,
  top: 18,
  bottom: 34,
  min: 0,
  max: 800,
} as const;

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

function formatClock(date = new Date()): string {
  return date.toLocaleTimeString('zh-CN', { hour12: false });
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

function canRunAction(action: ActionKey, state: TestState, hasActiveTest: boolean): boolean {
  if (action === 'create') return state === 'Idle' || state === 'Complete';
  if (action === 'startHeating') return hasActiveTest && (state === 'Idle' || state === 'Preparing' || state === 'Ready');
  if (action === 'stopHeating') return hasActiveTest && (state === 'Preparing' || state === 'Ready');
  if (action === 'startRecording') return hasActiveTest && state === 'Ready';
  if (action === 'stopRecording') return hasActiveTest && state === 'Recording';
  if (action === 'exportCurrent') return hasActiveTest && (state === 'Recording' || state === 'Complete');
  if (action === 'phenomenon') return hasActiveTest && (state === 'Recording' || state === 'Complete');
  return true;
}

function disabledHint(action: ActionKey, state: TestState, hasActiveTest: boolean): string {
  if (!hasActiveTest && action !== 'create' && action !== 'queryHistory' && action !== 'saveCalibration') return '请先创建试验';
  return `${stateText(state)}状态下不能${actionLabels[action]}`;
}

function buildPath(samples: readonly TemperatureSample[], field: (typeof channelLabels)[number]['field']): string {
  const recent = samples.slice(-90);
  if (recent.length < 2) return '';

  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const range = chart.max - chart.min;

  return recent
    .map((sample, index) => {
      const x = chart.left + (index / (recent.length - 1)) * plotWidth;
      const safeValue = Math.min(chart.max, Math.max(chart.min, sample[field]));
      const y = chart.height - chart.bottom - ((safeValue - chart.min) / range) * plotHeight;
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

  useEffect(() => {
    if (!error) return;
    gsap.fromTo('.login-error', { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.22, ease: 'power2.out' });
  }, [error]);

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
        <div className="login-hint">未登录：请选择身份并输入密码，所有试验控制会在登录后启用。</div>

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
  const yTicks = [800, 600, 400, 200, 0];

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
      <svg className="temperature-svg" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="TF1 TF2 TS TC 最近样本折线">
        <defs>
          <linearGradient id="chartGlow" x1="0" x2="1">
            <stop offset="0" stopColor="#16344a" />
            <stop offset="1" stopColor="#0b121a" />
          </linearGradient>
        </defs>
        <rect width={chart.width} height={chart.height} rx="18" fill="url(#chartGlow)" />
        {yTicks.map((tick) => {
          const y = chart.height - chart.bottom - ((tick - chart.min) / (chart.max - chart.min)) * (chart.height - chart.top - chart.bottom);
          return (
            <g key={tick}>
              <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className="grid-line" />
              <text x="18" y={y + 4} className="axis-label">{tick}</text>
            </g>
          );
        })}
        {[0, 1, 2, 3, 4].map((line) => (
          <line key={line} x1={chart.left + line * ((chart.width - chart.left - chart.right) / 4)} x2={chart.left + line * ((chart.width - chart.left - chart.right) / 4)} y1={chart.top} y2={chart.height - chart.bottom} className="grid-line vertical" />
        ))}
        <text x={chart.width - 84} y={chart.height - 10} className="axis-label">最近样本</text>
        <text x="18" y="18" className="axis-label">℃</text>
        {paths.map((channel) => (
          <path key={channel.key} d={channel.path} fill="none" stroke={channel.color} strokeWidth="3" strokeLinecap="round" />
        ))}
        {samples.length === 0 && (
          <g className="chart-empty">
            <rect x="250" y="104" width="320" height="72" rx="18" />
            <text x="410" y="134" textAnchor="middle">尚未记录温度样本</text>
            <text x="410" y="158" textAnchor="middle">开始记录后这里会显示最近 TF1 / TF2 / TS / TC 曲线</text>
          </g>
        )}
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
  const [historyQueried, setHistoryQueried] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationState>(initialCalibration);
  const [notice, setNotice] = useState<UiNotice | null>(null);
  const [uiEvents, setUiEvents] = useState<readonly UiEvent[]>([]);
  const [hasCreatedTest, setHasCreatedTest] = useState(false);
  const [busyAction, setBusyAction] = useState<string>('');

  const snapshot = status?.snapshot ?? emptySnapshot;
  const messages = status?.messages ?? [];
  const samples = status?.samples ?? [];
  const activeProductId = snapshot.productid ?? (hasCreatedTest ? testForm.productid : null);
  const hasActiveTest = Boolean(activeProductId);
  const activeTestLine = hasActiveTest ? `${testForm.productName} · ${testForm.specification}` : '创建试验后会显示样品、计时、温漂与报告状态';

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
    if (snapshot.productid) setHasCreatedTest(true);
  }, [snapshot.productid]);

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

  useEffect(() => {
    if (!notice) return;
    gsap.fromTo('.notice', { opacity: 0, y: -8, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power2.out' });
  }, [notice]);

  function showNotice(tone: UiNotice['tone'], text: string) {
    setNotice({ tone, text });
    setUiEvents((current) => [{ id: Date.now(), time: formatClock(), tone, text }, ...current].slice(0, 8));
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

  async function runAction(label: ActionKey, action: () => Promise<string>) {
    if (!canRunAction(label, snapshot.state, hasActiveTest)) {
      showNotice('warn', disabledHint(label, snapshot.state, hasActiveTest));
      return;
    }
    setBusyAction(label);
    try {
      const text = await action();
      showNotice('ok', text);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : '本地接口返回异常，请检查当前状态或核心服务。';
      showNotice('danger', `${actionLabels[label]}失败：${message}`);
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
    setHasCreatedTest(true);
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
    setHistoryQueried(true);
    return `查询完成，共 ${response.rows.length} 条记录`;
  }

  async function saveCalibration() {
    const response = await window.iso11820.saveCalibration({
      calibrationType: calibration.calibrationType,
      operator: calibration.operator,
      remarks: calibration.remarks,
      points: calibration.points.map((point) => toNumber(point)),
    });
    return `校准保存：平均 ${response.averageTemperature.toFixed(1)}℃，最大偏差 ${response.maxDeviation.toFixed(2)}℃`;
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
          <span className="sync-pill">{status ? '本地通道已连接' : '等待本地状态'}</span>
          <span>{status?.apparatus.apparatusname ?? 'ISO 11820 仪器'}</span>
          <span>{session.role === 'admin' ? '管理员' : '实验员'} · {session.username}</span>
        </div>
      </header>

      {notice && <div className={`notice notice-${notice.tone}`}>{notice.text}</div>}

      <section className="dashboard-grid stagger-in">
        <div className="panel hero-panel">
          <div>
            <p className="eyebrow">CURRENT SAMPLE</p>
            <h2>{activeProductId ?? '尚未新建试验'}</h2>
            <p>{activeTestLine}</p>
            {!hasActiveTest && <div className="inline-empty">请先在左侧填写试验信息并点击“创建试验”。</div>}
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
            <button
              className="soft-button"
              disabled={busyAction === 'create' || !canRunAction('create', snapshot.state, hasActiveTest)}
              title={!canRunAction('create', snapshot.state, hasActiveTest) ? disabledHint('create', snapshot.state, hasActiveTest) : undefined}
              onClick={() => runAction('create', createTest)}
            >
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
            <button disabled={busyAction === 'startHeating' || !canRunAction('startHeating', snapshot.state, hasActiveTest)} title={!canRunAction('startHeating', snapshot.state, hasActiveTest) ? disabledHint('startHeating', snapshot.state, hasActiveTest) : undefined} onClick={() => runAction('startHeating', async () => `升温指令已发送，当前状态：${stateText((await window.iso11820.startHeating()).nextState)}`)}>开始升温</button>
            <button disabled={busyAction === 'stopHeating' || !canRunAction('stopHeating', snapshot.state, hasActiveTest)} title={!canRunAction('stopHeating', snapshot.state, hasActiveTest) ? disabledHint('stopHeating', snapshot.state, hasActiveTest) : undefined} onClick={() => runAction('stopHeating', async () => `升温已停止，当前状态：${stateText((await window.iso11820.stopHeating()).nextState)}`)}>停止升温</button>
            <button disabled={busyAction === 'startRecording' || !canRunAction('startRecording', snapshot.state, hasActiveTest)} title={!canRunAction('startRecording', snapshot.state, hasActiveTest) ? disabledHint('startRecording', snapshot.state, hasActiveTest) : undefined} onClick={() => runAction('startRecording', async () => `记录已开始，当前状态：${stateText((await window.iso11820.startRecording()).nextState)}`)}>开始记录</button>
            <button disabled={busyAction === 'stopRecording' || !canRunAction('stopRecording', snapshot.state, hasActiveTest)} title={!canRunAction('stopRecording', snapshot.state, hasActiveTest) ? disabledHint('stopRecording', snapshot.state, hasActiveTest) : undefined} onClick={() => runAction('stopRecording', async () => `记录已停止，当前状态：${stateText((await window.iso11820.stopRecording()).nextState)}`)}>停止记录</button>
            <button disabled={busyAction === 'exportCurrent' || !canRunAction('exportCurrent', snapshot.state, hasActiveTest)} title={!canRunAction('exportCurrent', snapshot.state, hasActiveTest) ? disabledHint('exportCurrent', snapshot.state, hasActiveTest) : undefined} onClick={() => runAction('exportCurrent', async () => {
              const result = await window.iso11820.exportCurrent();
              return `导出完成：${result.csvPath || result.excelPath || result.pdfPath || '报告文件已生成'}`;
            })}>导出当前</button>
          </div>

          <div className="report-box">
            <div>
              <p className="eyebrow">REPORT OUTPUT</p>
              <h3>报告与数据包</h3>
              <span>{hasActiveTest ? `当前试验：${testForm.testid}` : '未新建试验，导出功能暂不可用'}</span>
            </div>
            <strong>{canRunAction('exportCurrent', snapshot.state, hasActiveTest) ? '可导出' : '等待记录完成'}</strong>
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
            <button className="soft-button full" disabled={busyAction === 'phenomenon' || !canRunAction('phenomenon', snapshot.state, hasActiveTest)} title={!canRunAction('phenomenon', snapshot.state, hasActiveTest) ? disabledHint('phenomenon', snapshot.state, hasActiveTest) : undefined} onClick={() => runAction('phenomenon', savePhenomenon)}>保存现象</button>
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
            {uiEvents.map((event) => (
              <div key={event.id} className={`log-row ui-event ${event.tone}`}>
                <time>{event.time}</time>
                <span>{event.text}</span>
              </div>
            ))}
            {messages.slice(-12).reverse().map((message, index) => (
              <div key={`${message.time}-${index}`} className={isTerminalMessage(message) ? 'log-row terminal' : 'log-row'}>
                <time>{message.time}</time>
                <span>{message.message}</span>
              </div>
            ))}
            {messages.length === 0 && uiEvents.length === 0 && <div className="empty-state">暂无本地消息。操作提示、错误与核心服务广播会显示在这里。</div>}
          </div>
        </section>

        <section className="panel history-panel stagger-in">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ARCHIVE</p>
              <h2>历史查询</h2>
            </div>
            <button className="soft-button" disabled={busyAction === 'queryHistory'} onClick={() => runAction('queryHistory', queryHistory)}>查询</button>
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
            {historyRows.length === 0 && <div className="empty-state">{historyQueried ? '没有符合条件的历史试验，请调整日期、样品或操作员条件。' : '输入条件后查询历史试验；留空可查看全部本地记录。'}</div>}
          </div>
        </section>

        <section className="panel calibration-panel stagger-in">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CALIBRATION</p>
              <h2>九点温度校准</h2>
            </div>
            <button className="soft-button" disabled={busyAction === 'saveCalibration'} onClick={() => runAction('saveCalibration', saveCalibration)}>保存校准</button>
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
