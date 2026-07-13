const { useState, useEffect, useRef, useCallback } = React;

// ════════════════════════════════════════════════════════
// API Helper
// ════════════════════════════════════════════════════════

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ════════════════════════════════════════════════════════
// Hooks
// ════════════════════════════════════════════════════════

function useEscapeKey(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function useSSE(projectId, handlers) {
  const esRef = useRef(null);
  useEffect(() => {
    if (!projectId) return;
    const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const es = new EventSource(`/api/events${params}`);
    esRef.current = es;

    const bind = (event, handler) => {
      if (!handler) return;
      es.addEventListener(event, (e) => {
        try { handler(JSON.parse(e.data)); } catch {}
      });
    };

    es.addEventListener("error", () => {
      if (es.readyState === EventSource.CLOSED && handlers.onError) {
        handlers.onError("实时连接已断开");
      }
    });

    bind("run:queued", handlers.onRunQueued);
    bind("run:started", handlers.onRunStarted);
    bind("run:progress", handlers.onRunProgress);
    bind("run:completed", handlers.onRunCompleted);
    bind("run:failed", handlers.onRunFailed);
    bind("run:cancelled", handlers.onRunCancelled);

    return () => es.close();
  }, [projectId]);
}

// ════════════════════════════════════════════════════════
// Shared Components
// ════════════════════════════════════════════════════════

function StatusPill({ status }) {
  const labels = {
    queued: ["待处理", "pill-pending"],
    running: ["进行中", "pill-running"],
    completed: ["已完成", "pill-done"],
    failed: ["失败", "pill-failed"],
    cancelled: ["已取消", "pill-pending"],
    draft: ["草稿", "pill-pending"],
    candidate: ["候选", "pill-running"],
    selected: ["已选", "pill-done"],
    final: ["最终", "pill-done"],
    archived: ["已归档", "pill-pending"],
  };
  const [label, cls] = labels[status] || [status, "pill-pending"];
  return <span className={`pill ${cls}`}>{label}</span>;
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (toast) { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }
  }, [toast, onClose]);
  if (!toast) return null;
  return <div className={`toast ${toast.level}`}>{toast.message}</div>;
}

function StepNumber({ index, status }) {
  return <span className={`step-number ${status || ""}`}>{String(index).padStart(2, "0")}</span>;
}

function Modal({ title, onClose, children }) {
  useEscapeKey(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ModalField({ label, children }) {
  return (
    <div className="modal-field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ onClose, onSubmit, submitLabel, submitting }) {
  return (
    <div className="modal-actions">
      <button className="btn" onClick={onClose}>取消</button>
      <button className="btn btn-primary" onClick={onSubmit} disabled={submitting}>
        {submitting ? "处理中…" : submitLabel || "确定"}
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// Pages
// ════════════════════════════════════════════════════════

// ── Dashboard ───────────────────────────────────────────

function DashboardPage({ projects, runs, onNavigate, onNewProject }) {
  const activeRuns = runs.filter((r) => r.status === "running" || r.status === "queued");
  const completedVideos = runs.filter((r) => r.type === "render" && r.status === "completed");

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">控制台</h2>
        <button className="btn btn-primary" onClick={onNewProject}>新建项目</button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{projects.length}</div>
          <div className="stat-label">项目</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{activeRuns.length}</div>
          <div className="stat-label">活跃任务</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{completedVideos.length}</div>
          <div className="stat-label">已渲染视频</div>
        </div>
      </div>

      <div className="section-title">最近项目</div>
      {projects.length === 0 ? (
        <div className="empty-state">
          还没有项目。<strong onClick={onNewProject}>创建第一个项目</strong>开始使用。
        </div>
      ) : (
        <div className="card-list">
          {projects.slice(0, 5).map((p) => (
            <div key={p.id} className="card" onClick={() => onNavigate("project", p.id)}>
              <div className="card-title">{p.name}</div>
              <div className="card-detail">{p.srtPath}</div>
              <div className="card-meta">
                <span className="pill pill-pending">v{p.revision}</span>
                <span className="card-time">{new Date(p.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeRuns.length > 0 && (
        <>
          <div className="section-title">活跃任务</div>
          <div className="card-list">
            {activeRuns.map((r) => {
              const project = projects.find((p) => p.id === r.projectId);
              return (
                <div key={r.id} className="card" onClick={() => onNavigate("project", r.projectId)}>
                  <div className="card-title">{project?.name || r.projectId}</div>
                  <div className="card-detail">
                    {r.type} · <StatusPill status={r.status} />
                    {r.status === "running" && r.progress > 0 && ` ${Math.round(r.progress * 100)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Projects List ───────────────────────────────────────

function ProjectsPage({ projects, onNavigate, onNewProject }) {
  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">项目</h2>
        <button className="btn btn-primary" onClick={onNewProject}>新建</button>
      </div>
      {projects.length === 0 ? (
        <div className="empty-state">暂无项目</div>
      ) : (
        <div className="card-list">
          {projects.map((p) => (
            <div key={p.id} className="card" onClick={() => onNavigate("project", p.id)}>
              <div className="card-title">{p.name}</div>
              <div className="card-detail">{p.srtPath}</div>
              <div className="card-meta">
                <span className="pill pill-pending">v{p.revision}</span>
                <span className="card-time">{new Date(p.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Project Detail (Workspace) ──────────────────────────

const RUN_STEPS = [
  { type: "init", title: "初始化", desc: "创建项目结构" },
  { type: "storyboard", title: "分镜生成", desc: "AI 语义分组生成 storyboard（Agent 执行）" },
  { type: "creators", title: "场景组件", desc: "并行生成场景组件（Agent 执行）" },
  { type: "registry", title: "场景注册", desc: "生成 generated-scenes.ts" },
  { type: "validate", title: "校验", desc: "渲染前完整性检查" },
  { type: "tts", title: "语音合成", desc: "可选：为视频添加配音" },
  { type: "render", title: "渲染输出", desc: "输出 MP4" },
];

function ProjectPage({ projectId, onBack, showToast }) {
  const [project, setProject] = useState(null);
  const [runs, setRuns] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [tab, setTab] = useState("pipeline");
  const [busy, setBusy] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const data = await api(`/api/projects/${encodeURIComponent(projectId)}`);
      setProject(data.project);
      setRuns(data.runs || []);
      setArtifacts(data.artifacts || []);
    } catch (err) {
      showToast(`加载失败: ${err.message}`);
    }
  }, [projectId, showToast]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // SSE 实时更新
  useSSE(projectId, {
    onRunQueued: () => loadProject(),
    onRunStarted: () => loadProject(),
    onRunProgress: (data) => {
      setRuns((prev) => prev.map((r) =>
        r.id === data.runId ? { ...r, progress: data.data?.progress || r.progress } : r
      ));
    },
    onRunCompleted: () => loadProject(),
    onRunFailed: () => loadProject(),
    onRunCancelled: () => loadProject(),
    onError: (msg) => showToast(msg),
  });

  const startRun = async (type, input = {}) => {
    setBusy(true);
    try {
      await api(`/api/projects/${encodeURIComponent(projectId)}/runs`, {
        method: "POST",
        body: JSON.stringify({ type, input }),
      });
      showToast(`已提交: ${type}`, "info");
      setTimeout(loadProject, 500);
    } catch (err) {
      showToast(`${type} 提交失败: ${err.message}`);
    }
    setBusy(false);
  };

  if (!project) return <div className="page"><div className="empty-state">加载中…</div></div>;

  const latestByType = {};
  for (const r of runs) {
    if (!latestByType[r.type] || new Date(r.createdAt) > new Date(latestByType[r.type].createdAt)) {
      latestByType[r.type] = r;
    }
  }

  const videoArtifacts = artifacts.filter((a) => a.type === "video");
  const activeRun = runs.find((r) => r.status === "running");

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="back-link" onClick={onBack}>← 项目列表</span>
          <h2 className="page-title">{project.name}</h2>
          <div className="page-subtitle">{project.srtPath}</div>
        </div>
        <div>
          <StatusPill status={activeRun ? "running" : "completed"} />
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === "pipeline" ? "active" : ""}`} onClick={() => setTab("pipeline")}>工作流</button>
        <button className={`tab ${tab === "artifacts" ? "active" : ""}`} onClick={() => setTab("artifacts")}>产物</button>
        <button className={`tab ${tab === "runs" ? "active" : ""}`} onClick={() => setTab("runs")}>任务记录</button>
      </div>

      {tab === "pipeline" && (
        <div className="pipeline-steps">
          {RUN_STEPS.map((step, i) => {
            const run = latestByType[step.type];
            const status = run?.status || "pending";
            return (
              <div key={step.type} className="step">
                <StepNumber index={i + 1} status={status} />
                <div className="step-content">
                  <div className="step-title">{step.title}</div>
                  <div className="step-detail">{step.desc}</div>
                  {run && (
                    <div className="step-detail">
                      <StatusPill status={run.status} />
                      {run.progress > 0 && ` ${Math.round(run.progress * 100)}%`}
                      {run.error && <span style={{ color: "var(--error)", marginLeft: "8px" }}>{run.error.slice(0, 60)}</span>}
                    </div>
                  )}
                  {step.type !== "storyboard" && step.type !== "creators" && step.type !== "init" && (
                    <div className="step-actions">
                      <button className="btn" disabled={busy || status === "running"}
                        onClick={() => startRun(step.type)}>
                        {status === "running" ? "执行中…" : step.title === "渲染输出" ? "渲染" : step.title === "语音合成" ? "生成语音" : step.title}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "artifacts" && (
        <div>
          {artifacts.length === 0 ? (
            <div className="empty-state">暂无产物。执行工作流步骤后将在此处显示。</div>
          ) : (
            <div className="card-list">
              {artifacts.map((a) => (
                <div key={a.id} className="card">
                  <div className="card-title">{a.name}</div>
                  <div className="card-detail">
                    {a.type} · <StatusPill status={a.status} />
                  </div>
                  {a.filePath && <div className="card-detail" style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{a.filePath}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "runs" && (
        <div>
          {runs.length === 0 ? (
            <div className="empty-state">暂无任务记录</div>
          ) : (
            <div className="card-list">
              {runs.map((r) => (
                <div key={r.id} className="card">
                  <div className="card-title">
                    {r.type} · <StatusPill status={r.status} />
                  </div>
                  <div className="card-detail">
                    {r.progress > 0 && `${Math.round(r.progress * 100)}% · `}
                    {new Date(r.createdAt).toLocaleString()}
                    {r.error && ` · ${r.error.slice(0, 60)}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 视频预览 */}
      {videoArtifacts.length > 0 && videoArtifacts.some((a) => a.filePath) && (
        <div className="video-preview">
          <div className="section-title">视频预览</div>
          <video controls src={`/api/artifacts/${videoArtifacts[videoArtifacts.length - 1].id}/download`} />
        </div>
      )}
    </div>
  );
}

// ── Providers ───────────────────────────────────────────

function ProvidersPage() {
  const [capabilities, setCapabilities] = useState([]);
  const [testResults, setTestResults] = useState({});

  useEffect(() => {
    api("/api/providers").then((data) => setCapabilities(data.capabilities || []));
  }, []);

  const testProvider = async (type) => {
    setTestResults((prev) => ({ ...prev, [type]: { testing: true } }));
    try {
      const result = await api(`/api/providers/${type}/test`, { method: "POST" });
      setTestResults((prev) => ({ ...prev, [type]: result }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [type]: { ok: false, message: err.message, latencyMs: 0 } }));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Provider</h2>
      </div>
      <div className="card-list">
        {capabilities.map((cap) => {
          const result = testResults[cap.type];
          return (
            <div key={cap.type} className="card">
              <div className="card-title">{cap.type}</div>
              <div className="card-detail">
                操作: {cap.operations.join(", ")}
              </div>
              {cap.requiredConfig.length > 0 && (
                <div className="card-detail">必需配置: {cap.requiredConfig.join(", ")}</div>
              )}
              <div className="card-actions">
                <button className="btn" onClick={() => testProvider(cap.type)} disabled={result?.testing}>
                  {result?.testing ? "测试中…" : "测试连通性"}
                </button>
                {result && !result.testing && (
                  <span style={{
                    color: result.ok ? "var(--success)" : "var(--error)",
                    fontSize: "13px",
                    marginLeft: "8px",
                  }}>
                    {result.ok ? "✓" : "×"} {result.message} ({result.latencyMs}ms)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Settings ────────────────────────────────────────────

function SettingsPage({ showToast }) {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/api/config")
      .then((data) => { setConfig(data.config || {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const update = (k, v) => setConfig({ ...config, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/config", { method: "PUT", body: JSON.stringify({ config }) });
      showToast("配置已保存", "info");
    } catch (err) {
      showToast(`保存失败: ${err.message}`);
    }
    setSaving(false);
  };

  if (loading) return <div className="page"><div className="empty-state">加载中…</div></div>;

  const provider = config.TTS_PROVIDER || "openai";

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">设置</h2>
      </div>

      <div className="section-title">TTS 语音合成</div>
      <div className="form-group">
        <label>Provider</label>
        <select value={provider} onChange={(e) => update("TTS_PROVIDER", e.target.value)}>
          <option value="openai">OpenAI 兼容</option>
          <option value="mimo">MiMo（小米）</option>
          <option value="edge">Edge TTS（免费）</option>
        </select>
      </div>

      {provider === "openai" && (
        <>
          <div className="form-group">
            <label>API Key</label>
            <input type="password" value={config.TTS_API_KEY || ""} onChange={(e) => update("TTS_API_KEY", e.target.value)} placeholder="sk-…" />
          </div>
          <div className="form-group">
            <label>Base URL</label>
            <input type="text" value={config.TTS_BASE_URL || ""} onChange={(e) => update("TTS_BASE_URL", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Model</label>
            <input type="text" value={config.TTS_MODEL || ""} onChange={(e) => update("TTS_MODEL", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Voice</label>
            <input type="text" value={config.TTS_VOICE || ""} onChange={(e) => update("TTS_VOICE", e.target.value)} />
          </div>
        </>
      )}

      {provider === "mimo" && (
        <>
          <div className="form-group">
            <label>MiMo API Key</label>
            <input type="password" value={config.MIMO_API_KEY || ""} onChange={(e) => update("MIMO_API_KEY", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Model</label>
            <input type="text" value={config.MIMO_MODEL || ""} onChange={(e) => update("MIMO_MODEL", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Voice</label>
            <select value={config.MIMO_VOICE || ""} onChange={(e) => update("MIMO_VOICE", e.target.value)}>
              <option value="冰糖">冰糖</option><option value="茉莉">茉莉</option>
              <option value="苏打">苏打</option><option value="白桦">白桦</option>
              <option value="Mia">Mia</option><option value="Chloe">Chloe</option>
              <option value="Milo">Milo</option><option value="Dean">Dean</option>
            </select>
          </div>
        </>
      )}

      {provider === "edge" && (
        <div className="form-group">
          <label>Voice</label>
          <input type="text" value={config.TTS_VOICE || ""} onChange={(e) => update("TTS_VOICE", e.target.value)} placeholder="zh-CN-XiaoxiaoNeural" />
        </div>
      )}

      <div style={{ marginTop: "24px" }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存配置"}
        </button>
      </div>
    </div>
  );
}

// ── New Project Modal ───────────────────────────────────

function NewProjectModal({ onClose, onCreated }) {
  const [srtPath, setSrtPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const start = async () => {
    if (!srtPath.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ srtPath: srtPath.trim() }),
      });
      onCreated(result.project?.id);
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <Modal title="新建视频项目" onClose={onClose}>
      <ModalField label="SRT 字幕文件路径">
        <input type="text" value={srtPath} onChange={(e) => setSrtPath(e.target.value)}
          placeholder="C:/path/to/subtitle.srt" autoFocus
          onKeyDown={(e) => e.key === "Enter" && !loading && start()} />
      </ModalField>
      {error && <div className="modal-error">{error}</div>}
      <ModalActions onClose={onClose} onSubmit={start} submitLabel="开始" submitting={loading} />
    </Modal>
  );
}

// ════════════════════════════════════════════════════════
// Main App
// ════════════════════════════════════════════════════════

function App() {
  const [page, setPage] = useState("dashboard");
  const [projectId, setProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [allRuns, setAllRuns] = useState([]);
  const [toast, setToast] = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);

  const showToast = useCallback((message, level = "error") => {
    setToast({ message, level, ts: Date.now() });
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const data = await api("/api/projects");
      setProjects(data.projects || []);
    } catch { setProjects([]); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const navigate = (page, id = null) => {
    setPage(page);
    setProjectId(id);
  };

  const navItems = [
    { key: "dashboard", label: "控制台" },
    { key: "projects", label: "项目" },
    { key: "providers", label: "Provider" },
    { key: "settings", label: "设置" },
  ];

  return (
    <div className="app">
      {/* 侧边导航 */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-brand-title">Remotion Video</div>
          <div className="nav-brand-sub">项目服务</div>
        </div>
        {navItems.map((item) => (
          <button key={item.key}
            className={`nav-item ${page === item.key ? "active" : ""}`}
            onClick={() => navigate(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>

      {/* 主内容 */}
      <main className="main">
        {page === "dashboard" && (
          <DashboardPage
            projects={projects}
            runs={allRuns}
            onNavigate={navigate}
            onNewProject={() => setShowNewProject(true)}
          />
        )}
        {page === "projects" && (
          <ProjectsPage
            projects={projects}
            onNavigate={navigate}
            onNewProject={() => setShowNewProject(true)}
          />
        )}
        {page === "project" && projectId && (
          <ProjectPage
            projectId={projectId}
            onBack={() => navigate("projects")}
            showToast={showToast}
          />
        )}
        {page === "providers" && <ProvidersPage />}
        {page === "settings" && <SettingsPage showToast={showToast} />}
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={() => { loadProjects(); }}
        />
      )}
    </div>
  );
}

// ── Mount ───────────────────────────────────────────────
function mountApp() {
  if (typeof ReactDOM === "undefined" || typeof React === "undefined") {
    document.getElementById("root").innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#999;font-family:Georgia,serif;">正在加载…</div>';
    setTimeout(mountApp, 200);
    return;
  }
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
}
mountApp();
