const { useState, useEffect, useRef, useCallback } = React;

// ── API helper ──────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    "Content-Type": "application/json",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Icon helpers ────────────────────────────────────────
function StepIcon({ status }) {
  if (status === "done") return <span style={{color: "white", fontSize: "10px"}}>✓</span>;
  if (status === "running") return <span style={{color: "white", fontSize: "10px"}}>●</span>;
  if (status === "failed") return <span style={{color: "white", fontSize: "10px"}}>✗</span>;
  return null;
}

// ── Pipeline Step Component ─────────────────────────────
function PipelineStep({ name, title, detail, step, onAction, actionLabel, disabled }) {
  const status = step?.status || "pending";
  return (
    <div className="step">
      <div className={`step-icon ${status}`}>
        <StepIcon status={status} />
      </div>
      <div className="step-content">
        <div className="step-title">{title}</div>
        {detail && <div className="step-detail">{detail}</div>}
        {step?.error && <div className="step-detail" style={{color: "var(--error)"}}>{step.error.slice(0, 80)}</div>}
        {onAction && (
          <div className="step-actions">
            <button className="btn" onClick={onAction} disabled={disabled || status === "running"}>
              {status === "running" ? "执行中..." : actionLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Creator Card ────────────────────────────────────────
function CreatorCard({ creator }) {
  const status = creator.status || "pending";
  const icons = { done: "✓", running: "●", failed: "✗", pending: "○" };
  return (
    <div className={`creator-card ${status}`}>
      {icons[status]} {creator.id} ({creator.sceneIds?.length || 0} 场景)
    </div>
  );
}

// ── Log Panel ───────────────────────────────────────────
function LogPanel({ logs }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);
  return (
    <div className="log-area" ref={ref}>
      {logs.length === 0 ? (
        <div style={{color: "var(--text-dim)"}}>等待日志...</div>
      ) : (
        logs.map((entry, i) => (
          <div key={i} className={`log-line ${entry.level}`}>
            <span className="log-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
            {entry.message}
          </div>
        ))
      )}
    </div>
  );
}

// ── Config Modal ────────────────────────────────────────
function ConfigModal({ onClose, onSave }) {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/config").then((data) => {
      setConfig(data.config || {});
      setLoading(false);
    });
  }, []);

  const update = (key, value) => setConfig({ ...config, [key]: value });

  const save = async () => {
    await api("/api/config", { method: "PUT", body: JSON.stringify({ config }) });
    onSave();
    onClose();
  };

  if (loading) return <div className="modal-overlay"><div className="modal">加载中...</div></div>;

  const ttsProvider = config.TTS_PROVIDER || "openai";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>⚙️ 配置</h2>

        <div className="section-title">TTS 语音合成</div>
        <div className="modal-field">
          <label>Provider</label>
          <select value={ttsProvider} onChange={(e) => update("TTS_PROVIDER", e.target.value)}>
            <option value="openai">OpenAI 兼容（官方/硅基/火山/OneAPI）</option>
            <option value="mimo">MiMo（小米）</option>
            <option value="edge">Edge TTS（免费本地）</option>
          </select>
        </div>

        {ttsProvider === "openai" && (
          <>
            <div className="modal-field">
              <label>API Key</label>
              <input type="password" value={config.TTS_API_KEY || ""} onChange={(e) => update("TTS_API_KEY", e.target.value)} placeholder="sk-..." />
            </div>
            <div className="modal-field">
              <label>Base URL</label>
              <input type="text" value={config.TTS_BASE_URL || ""} onChange={(e) => update("TTS_BASE_URL", e.target.value)} placeholder="https://api.openai.com/v1" />
            </div>
            <div className="modal-field">
              <label>Model</label>
              <input type="text" value={config.TTS_MODEL || ""} onChange={(e) => update("TTS_MODEL", e.target.value)} placeholder="gpt-4o-mini-tts" />
            </div>
            <div className="modal-field">
              <label>Voice</label>
              <input type="text" value={config.TTS_VOICE || ""} onChange={(e) => update("TTS_VOICE", e.target.value)} placeholder="alloy" />
            </div>
          </>
        )}

        {ttsProvider === "mimo" && (
          <>
            <div className="modal-field">
              <label>MiMo API Key</label>
              <input type="password" value={config.MIMO_API_KEY || ""} onChange={(e) => update("MIMO_API_KEY", e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Model</label>
              <input type="text" value={config.MIMO_MODEL || ""} onChange={(e) => update("MIMO_MODEL", e.target.value)} placeholder="mimo-v2.5-tts" />
            </div>
            <div className="modal-field">
              <label>Voice</label>
              <select value={config.MIMO_VOICE || ""} onChange={(e) => update("MIMO_VOICE", e.target.value)}>
                <option value="冰糖">冰糖</option>
                <option value="茉莉">茉莉</option>
                <option value="苏打">苏打</option>
                <option value="白桦">白桦</option>
                <option value="Mia">Mia</option>
                <option value="Chloe">Chloe</option>
                <option value="Milo">Milo</option>
                <option value="Dean">Dean</option>
              </select>
            </div>
          </>
        )}

        {ttsProvider === "edge" && (
          <div className="modal-field">
            <label>Voice</label>
            <input type="text" value={config.TTS_VOICE || ""} onChange={(e) => update("TTS_VOICE", e.target.value)} placeholder="zh-CN-XiaoxiaoNeural" />
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ── Init Modal ──────────────────────────────────────────
function InitModal({ onClose, onInitiated }) {
  const [srtPath, setSrtPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const start = async () => {
    if (!srtPath.trim()) return setError("请输入 SRT 文件路径");
    setLoading(true);
    setError(null);
    try {
      const result = await api("/api/run/init", {
        method: "POST",
        body: JSON.stringify({ srtPath: srtPath.trim() }),
      });
      onInitiated(result.projectRoot);
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>🎬 新建视频项目</h2>
        <div className="modal-field">
          <label>SRT 字幕文件路径</label>
          <input
            type="text"
            value={srtPath}
            onChange={(e) => setSrtPath(e.target.value)}
            placeholder="C:/path/to/subtitle.srt"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && start()}
          />
        </div>
        {error && <div style={{color: "var(--error)", fontSize: "13px", marginBottom: "8px"}}>{error}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={start} disabled={loading}>
            {loading ? "初始化中..." : "开始"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────
function App() {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [pipelineState, setPipelineState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [renderProgress, setRenderProgress] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [showInit, setShowInit] = useState(false);
  const [srtDir, setSrtDir] = useState("");
  const [busy, setBusy] = useState(false);
  const eventSourceRef = useRef(null);

  // 加载项目列表
  const refreshProjects = useCallback(async () => {
    if (!srtDir) return;
    try {
      const data = await api(`/api/projects?srtDir=${encodeURIComponent(srtDir)}`);
      setProjects(data.projects || []);
    } catch {
      setProjects([]);
    }
  }, [srtDir]);

  // 选择项目时加载状态
  useEffect(() => {
    if (!currentProject) return;
    api(`/api/pipeline/${encodeURIComponent(btoa(currentProject))}`)
      .then(setPipelineState)
      .catch(() => setPipelineState(null));
    setLogs([]);
    setRenderProgress(0);
  }, [currentProject]);

  // SSE 事件订阅
  useEffect(() => {
    if (!currentProject) return;
    const encoded = encodeURIComponent(btoa(currentProject));
    const es = new EventSource(`/api/events?projectRoot=${encoded}`);
    eventSourceRef.current = es;

    es.addEventListener("state", (e) => {
      const data = JSON.parse(e.data);
      if (data.projectRoot === currentProject) {
        setPipelineState(data.state);
      }
    });

    es.addEventListener("log", (e) => {
      const data = JSON.parse(e.data);
      if (data.projectRoot === currentProject) {
        setLogs((prev) => [...prev.slice(-200), data.entry]);
      }
    });

    es.addEventListener("render-progress", (e) => {
      const data = JSON.parse(e.data);
      if (data.projectRoot === currentProject) {
        setRenderProgress(data.progress);
      }
    });

    return () => es.close();
  }, [currentProject]);

  // ── Actions ─────────────────────────────────
  const runAction = async (endpoint, body = {}, label = "执行") => {
    if (!currentProject) return;
    setBusy(true);
    try {
      await api(endpoint, { method: "POST", body: JSON.stringify({ projectRoot: currentProject, ...body }) });
    } catch (err) {
      setLogs((prev) => [...prev, { level: "error", message: `${label}失败: ${err.message}`, timestamp: new Date().toISOString() }]);
    }
    setBusy(false);
  };

  const steps = pipelineState?.steps || {};
  const video = pipelineState?.video || {};
  const hasVideo = video.path !== null;

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-left">
          <h1>🎬 Remotion Video 控制台</h1>
        </div>
        <div className="header-right">
          <input
            type="text"
            placeholder="SRT 目录路径"
            value={srtDir}
            onChange={(e) => setSrtDir(e.target.value)}
            style={{width: "200px"}}
          />
          <button className="btn" onClick={refreshProjects}>刷新</button>
          <select
            value={currentProject || ""}
            onChange={(e) => setCurrentProject(e.target.value)}
            style={{width: "180px"}}
          >
            <option value="">选择项目...</option>
            {projects.map((p) => (
              <option key={p.projectRoot} value={p.projectRoot}>
                {p.name} {p.hasVideo ? "✓" : ""}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => setShowInit(true)}>新建</button>
          <button className="btn" onClick={() => setShowConfig(true)}>⚙️</button>
        </div>
      </div>

      {/* Main */}
      <div className="main">
        {/* Sidebar - Pipeline Steps */}
        <div className="sidebar">
          <div className="section-title">Pipeline</div>

          <PipelineStep
            title="1. 初始化"
            detail={steps.init?.result?.projectRoot ? "项目已创建" : "等待 SRT 文件"}
            step={steps.init}
          />

          <PipelineStep
            title="2. 分镜生成"
            detail={steps.storyboard?.result?.sceneCount ? `${steps.storyboard.result.sceneCount} 个场景` : "需要 Agent 执行（AI 语义分组）"}
            step={steps.storyboard}
          />

          <PipelineStep
            title="3. 场景组件"
            detail={steps.creators?.total ? `${steps.creators.total} 个 Creator 并行` : "需要 Agent 执行（AI 生成组件）"}
            step={steps.creators}
          >
          </PipelineStep>

          {/* Creator cards */}
          {steps.creators?.creators?.map((c) => (
            <CreatorCard key={c.id} creator={c} />
          ))}

          <PipelineStep
            title="4. 场景注册"
            detail={steps.registry?.result?.sceneCount ? `${steps.registry.result.sceneCount} 个场景已注册` : "生成 generated-scenes.ts"}
            step={steps.registry}
            onAction={() => runAction("/api/run/registry", {}, "场景注册")}
            actionLabel="注册"
            disabled={!currentProject}
          />

          <PipelineStep
            title="5. 校验"
            detail={steps.validate?.status === "done" ? "通过" : "渲染前检查"}
            step={steps.validate}
            onAction={() => runAction("/api/run/validate", {}, "校验")}
            actionLabel="校验"
            disabled={!currentProject}
          />

          <PipelineStep
            title="6. TTS 语音"
            detail={
              pipelineState?.tts?.status === "done"
                ? `${pipelineState.tts.provider}: ${pipelineState.tts.segments.done} 段`
                : pipelineState?.tts?.status === "idle"
                ? "可选：为视频添加配音"
                : "等待执行"
            }
            step={pipelineState?.tts ? { status: pipelineState.tts.status } : { status: "pending" }}
            onAction={() => runAction("/api/run/tts", {}, "TTS")}
            actionLabel="生成语音"
            disabled={!currentProject}
          />

          <PipelineStep
            title="7. 渲染"
            detail={
              steps.render?.status === "done"
                ? `${video.sizeMB} MB`
                : steps.render?.status === "running"
                ? `渲染中 ${Math.round(renderProgress * 100)}%`
                : "输出 MP4"
            }
            step={steps.render}
            onAction={() => runAction("/api/run/render", {}, "渲染")}
            actionLabel="渲染"
            disabled={!currentProject}
          />

          {/* Render progress bar */}
          {steps.render?.status === "running" && (
            <div className="progress-bar">
              <div className="progress-fill" style={{width: `${renderProgress * 100}%`}} />
            </div>
          )}
        </div>

        {/* Content - Video Preview */}
        <div className="content">
          <div className="preview-area">
            <div className="video-container">
              {hasVideo ? (
                <>
                  <video
                    controls
                    src={`/api/video/${encodeURIComponent(btoa(currentProject))}`}
                  />
                  <div style={{marginTop: "12px"}}>
                    <a
                      className="btn btn-primary"
                      href={`/api/video/${encodeURIComponent(btoa(currentProject))}`}
                      download="output.mp4"
                    >
                      ⬇ 下载 MP4 ({video.sizeMB} MB)
                    </a>
                  </div>
                </>
              ) : (
                <div className="preview-placeholder">
                  {currentProject ? "视频尚未渲染，完成 Pipeline 步骤后点击「渲染」" : "选择或新建一个项目开始"}
                </div>
              )}
            </div>
          </div>

          <LogPanel logs={logs} />
        </div>
      </div>

      {/* Modals */}
      {showConfig && <ConfigModal onClose={() => setShowConfig(false)} onSave={() => {}} />}
      {showInit && (
        <InitModal
          onClose={() => setShowInit(false)}
          onInitiated={(pr) => {
            setCurrentProject(pr);
            setShowInit(false);
          }}
        />
      )}
    </div>
  );
}

// ── Mount ───────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
