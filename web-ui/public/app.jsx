const { useState, useEffect, useRef, useCallback } = React;

// ── API helper ──────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Hooks ───────────────────────────────────────────────
function useEscapeKey(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

// ── 步骤编号 ─────────────────────────────────────────────
function StepNumber({ index, status }) {
  const num = String(index).padStart(2, "0");
  return <span className={`step-number ${status || ""}`}>{num}</span>;
}

// ── Pipeline 步骤组件 ────────────────────────────────────
function PipelineStep({ index, title, detail, step, onAction, actionLabel, disabled, children }) {
  const status = step?.status || "pending";
  return (
    <div className="step">
      <StepNumber index={index} status={status} />
      <div className="step-content">
        <div className="step-title">{title}</div>
        {detail && <div className="step-detail">{detail}</div>}
        {step?.error && <div className="step-error">{step.error.slice(0, 100)}</div>}
        {onAction && (
          <div className="step-actions">
            <button
              className="btn"
              onClick={onAction}
              disabled={disabled || status === "running"}
            >
              {status === "running" ? "执行中…" : actionLabel}
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Creator 子卡片 ───────────────────────────────────────
function CreatorCard({ creator }) {
  const status = creator.status || "pending";
  const labels = { done: "✓", running: "·", failed: "×", pending: "○" };
  return (
    <div className={`creator-card ${status}`}>
      {labels[status]} {creator.id} · {creator.sceneIds?.length || 0} 场景
    </div>
  );
}

// ── 日志面板 ─────────────────────────────────────────────
function LogPanel({ logs }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [logs]);
  return (
    <div className="log-area" ref={ref}>
      {logs.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontStyle: "italic" }}>
          日志将在此处实时显示…
        </div>
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

// ── 配置模态框 ───────────────────────────────────────────
function ConfigModal({ onClose, onSave }) {
  useEscapeKey(onClose);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api("/api/config")
      .then((data) => { setConfig(data.config || {}); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => setConfig({ ...config, [key]: value });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api("/api/config", { method: "PUT", body: JSON.stringify({ config }) });
      onSave();
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>加载中…</div>
    </div>
  );

  const ttsProvider = config.TTS_PROVIDER || "openai";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>配置</h2>

        <div className="section-title">TTS 语音合成</div>
        <div className="modal-field">
          <label>Provider</label>
          <select value={ttsProvider} onChange={(e) => update("TTS_PROVIDER", e.target.value)}>
            <option value="openai">OpenAI 兼容（官方 / 硅基 / 火山 / OneAPI）</option>
            <option value="mimo">MiMo（小米）</option>
            <option value="edge">Edge TTS（免费本地）</option>
          </select>
        </div>

        {ttsProvider === "openai" && (
          <>
            <div className="modal-field">
              <label>API Key</label>
              <input type="password" value={config.TTS_API_KEY || ""} onChange={(e) => update("TTS_API_KEY", e.target.value)} placeholder="sk-…" />
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

        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 新建项目模态框 ───────────────────────────────────────
function InitModal({ onClose, onInitiated }) {
  useEscapeKey(onClose);
  const [srtPath, setSrtPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const start = async () => {
    if (!srtPath.trim() || loading) return;
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
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>新建视频项目</h2>
        <div className="modal-field">
          <label>SRT 字幕文件路径</label>
          <input
            type="text"
            value={srtPath}
            onChange={(e) => setSrtPath(e.target.value)}
            placeholder="C:/path/to/subtitle.srt"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && !loading && start()}
          />
        </div>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={start} disabled={loading}>
            {loading ? "初始化中…" : "开始"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主应用 ───────────────────────────────────────────────
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
  const [toast, setToast] = useState(null);

  const refreshProjects = useCallback(async () => {
    if (!srtDir) return;
    try {
      const data = await api(`/api/projects?srtDir=${encodeURIComponent(srtDir)}`);
      setProjects(data.projects || []);
    } catch {
      setProjects([]);
    }
  }, [srtDir]);

  useEffect(() => {
    if (!currentProject) return;
    let cancelled = false;
    api(`/api/pipeline/${encodeURIComponent(currentProject)}`)
      .then((s) => { if (!cancelled) setPipelineState(s); })
      .catch(() => { if (!cancelled) setPipelineState(null); });
    setLogs([]);
    setRenderProgress(0);
    return () => { cancelled = true; };
  }, [currentProject]);

  useEffect(() => {
    if (!currentProject) return;
    const encoded = encodeURIComponent(currentProject);
    const es = new EventSource(`/api/events?projectRoot=${encoded}`);

    es.addEventListener("state", (e) => {
      const data = JSON.parse(e.data);
      if (data.projectRoot === currentProject) setPipelineState(data.state);
    });

    es.addEventListener("log", (e) => {
      const data = JSON.parse(e.data);
      if (data.projectRoot === currentProject) {
        setLogs((prev) => [...prev.slice(-200), data.entry]);
      }
    });

    es.addEventListener("render-progress", (e) => {
      const data = JSON.parse(e.data);
      if (data.projectRoot === currentProject) setRenderProgress(data.progress);
    });

    es.addEventListener("error", () => {
      if (es.readyState === EventSource.CLOSED) {
        setLogs((prev) => [...prev, {
          level: "error",
          message: "实时连接已断开，请刷新页面",
          timestamp: new Date().toISOString(),
        }]);
      }
    });

    return () => es.close();
  }, [currentProject]);

  const showToast = (msg, level = "error") => {
    setToast({ message: msg, level, ts: Date.now() });
    setTimeout(() => setToast(null), 5000);
  };

  const runAction = async (endpoint, body = {}, label = "执行") => {
    if (!currentProject || busy) return;
    setBusy(true);
    try {
      await api(endpoint, { method: "POST", body: JSON.stringify({ projectRoot: currentProject, ...body }) });
      showToast(`${label}完成`, "info");
    } catch (err) {
      setLogs((prev) => [...prev, { level: "error", message: `${label}失败: ${err.message}`, timestamp: new Date().toISOString() }]);
      showToast(`${label}失败: ${err.message}`, "error");
    }
    setBusy(false);
  };

  const steps = pipelineState?.steps || {};
  const tts = pipelineState?.tts || {};
  const video = pipelineState?.video || {};
  const hasVideo = video.path !== null;

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <h1>Remotion Video 控制台</h1>
          <div className="subtitle">SRT 字幕驱动的视频生成工作流</div>
        </div>
        <div className="header-right">
          <input
            type="text"
            placeholder="SRT 目录路径"
            value={srtDir}
            onChange={(e) => setSrtDir(e.target.value)}
            style={{ width: "200px" }}
          />
          <button className="btn" onClick={refreshProjects}>刷新</button>
          <select
            value={currentProject || ""}
            onChange={(e) => setCurrentProject(e.target.value)}
            style={{ width: "180px" }}
          >
            <option value="">选择项目…</option>
            {projects.map((p) => (
              <option key={p.projectRoot} value={p.projectRoot}>
                {p.name} {p.hasVideo ? "✓" : ""}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => setShowInit(true)}>新建</button>
          <button className="btn" onClick={() => setShowConfig(true)}>配置</button>
        </div>
      </div>

      <div className="main">
        <div className="sidebar">
          <div className="section-title">工作流</div>

          <PipelineStep index={1} title="初始化"
            detail={steps.init?.result?.projectRoot ? "项目已创建" : "等待 SRT 文件"}
            step={steps.init} />

          <PipelineStep index={2} title="分镜生成"
            detail={steps.storyboard?.result?.sceneCount
              ? `${steps.storyboard.result.sceneCount} 个场景`
              : "需要 Agent 执行（AI 语义分组）"}
            step={steps.storyboard} />

          <PipelineStep index={3} title="场景组件"
            detail={steps.creators?.total
              ? `${steps.creators.total} 个 Creator 并行`
              : "需要 Agent 执行（AI 生成组件）"}
            step={steps.creators}>
            {steps.creators?.creators?.length > 0 && (
              <div className="creator-list">
                {steps.creators.creators.map((c) => (
                  <CreatorCard key={c.id} creator={c} />
                ))}
              </div>
            )}
          </PipelineStep>

          <PipelineStep index={4} title="场景注册"
            detail={steps.registry?.result?.sceneCount
              ? `${steps.registry.result.sceneCount} 个场景已注册`
              : "生成 generated-scenes.ts"}
            step={steps.registry}
            onAction={() => runAction("/api/run/registry", {}, "场景注册")}
            actionLabel="注册" disabled={!currentProject || busy} />

          <PipelineStep index={5} title="校验"
            detail={steps.validate?.status === "done" ? "通过" : "渲染前检查"}
            step={steps.validate}
            onAction={() => runAction("/api/run/validate", {}, "校验")}
            actionLabel="校验" disabled={!currentProject || busy} />

          <PipelineStep index={6} title="语音合成"
            detail={tts.status === "done"
              ? `${tts.provider} · ${tts.segments.done} 段`
              : "可选：为视频添加配音"}
            step={{ status: tts.status === "idle" ? "pending" : tts.status }}
            onAction={() => runAction("/api/run/tts", {}, "语音合成")}
            actionLabel="生成语音" disabled={!currentProject || busy} />

          <PipelineStep index={7} title="渲染输出"
            detail={steps.render?.status === "done"
              ? `${video.sizeMB} MB`
              : steps.render?.status === "running"
              ? `渲染中 ${Math.round(renderProgress * 100)}%`
              : "输出 MP4"}
            step={steps.render}
            onAction={() => runAction("/api/run/render", {}, "渲染")}
            actionLabel="渲染" disabled={!currentProject || busy} />

          {steps.render?.status === "running" && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${renderProgress * 100}%` }} />
            </div>
          )}
        </div>

        <div className="content">
          <div className="preview-area">
            <div className="video-container">
              {hasVideo ? (
                <>
                  <video controls
                    src={`/api/video/${encodeURIComponent(currentProject)}`} />
                  <div style={{ marginTop: "16px" }}>
                    <a className="btn btn-primary"
                      href={`/api/video/${encodeURIComponent(currentProject)}`}
                      download="output.mp4">
                      下载 MP4（{video.sizeMB} MB）
                    </a>
                  </div>
                </>
              ) : (
                <div className="preview-placeholder">
                  {currentProject
                    ? "完成工作流步骤后，视频将在此处呈现"
                    : <><strong>选择或新建</strong>一个项目开始</>}
                </div>
              )}
            </div>
          </div>

          <LogPanel logs={logs} />
        </div>
      </div>

      {toast && (
        <div className={`toast ${toast.level}`}>{toast.message}</div>
      )}

      {showConfig && <ConfigModal onClose={() => setShowConfig(false)} onSave={() => {}} />}
      {showInit && (
        <InitModal
          onClose={() => setShowInit(false)}
          onInitiated={(pr) => { setCurrentProject(pr); setShowInit(false); }}
        />
      )}
    </div>
  );
}

// ── Mount ───────────────────────────────────────────────
function mountApp() {
  if (typeof ReactDOM === "undefined" || typeof React === "undefined") {
    document.getElementById("root").innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#999;font-family:Georgia,serif;">正在加载 React…</div>';
    setTimeout(mountApp, 200);
    return;
  }
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
}
mountApp();
