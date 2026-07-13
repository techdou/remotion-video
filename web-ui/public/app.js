"use strict";
(() => {
  // web-ui/public/app.jsx
  var { useState, useEffect, useRef, useCallback } = React;
  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers || {} }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  function useEscapeKey(onClose) {
    useEffect(() => {
      const onKey = (e) => {
        if (e.key === "Escape") onClose();
      };
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
          try {
            handler(JSON.parse(e.data));
          } catch {
          }
        });
      };
      es.addEventListener("error", () => {
        if (es.readyState === EventSource.CLOSED && handlers.onError) {
          handlers.onError("\u5B9E\u65F6\u8FDE\u63A5\u5DF2\u65AD\u5F00");
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
  function StatusPill({ status }) {
    const labels = {
      queued: ["\u5F85\u5904\u7406", "pill-pending"],
      running: ["\u8FDB\u884C\u4E2D", "pill-running"],
      completed: ["\u5DF2\u5B8C\u6210", "pill-done"],
      failed: ["\u5931\u8D25", "pill-failed"],
      cancelled: ["\u5DF2\u53D6\u6D88", "pill-pending"],
      draft: ["\u8349\u7A3F", "pill-pending"],
      candidate: ["\u5019\u9009", "pill-running"],
      selected: ["\u5DF2\u9009", "pill-done"],
      final: ["\u6700\u7EC8", "pill-done"],
      archived: ["\u5DF2\u5F52\u6863", "pill-pending"]
    };
    const [label, cls] = labels[status] || [status, "pill-pending"];
    return /* @__PURE__ */ React.createElement("span", { className: `pill ${cls}` }, label);
  }
  function Toast({ toast, onClose }) {
    useEffect(() => {
      if (toast) {
        const t = setTimeout(onClose, 5e3);
        return () => clearTimeout(t);
      }
    }, [toast, onClose]);
    if (!toast) return null;
    return /* @__PURE__ */ React.createElement("div", { className: `toast ${toast.level}` }, toast.message);
  }
  function StepNumber({ index, status }) {
    return /* @__PURE__ */ React.createElement("span", { className: `step-number ${status || ""}` }, String(index).padStart(2, "0"));
  }
  function Modal({ title, onClose, children }) {
    useEscapeKey(onClose);
    return /* @__PURE__ */ React.createElement("div", { className: "modal-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation(), role: "dialog", "aria-modal": "true" }, /* @__PURE__ */ React.createElement("h2", null, title), children));
  }
  function ModalField({ label, children }) {
    return /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, label), children);
  }
  function ModalActions({ onClose, onSubmit, submitLabel, submitting }) {
    return /* @__PURE__ */ React.createElement("div", { className: "modal-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: onClose }, "\u53D6\u6D88"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: onSubmit, disabled: submitting }, submitting ? "\u5904\u7406\u4E2D\u2026" : submitLabel || "\u786E\u5B9A"));
  }
  function DashboardPage({ projects, runs, onNavigate, onNewProject }) {
    const activeRuns = runs.filter((r) => r.status === "running" || r.status === "queued");
    const completedVideos = runs.filter((r) => r.type === "render" && r.status === "completed");
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-header" }, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "\u63A7\u5236\u53F0"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: onNewProject }, "\u65B0\u5EFA\u9879\u76EE")), /* @__PURE__ */ React.createElement("div", { className: "stats-row" }, /* @__PURE__ */ React.createElement("div", { className: "stat-card" }, /* @__PURE__ */ React.createElement("div", { className: "stat-value" }, projects.length), /* @__PURE__ */ React.createElement("div", { className: "stat-label" }, "\u9879\u76EE")), /* @__PURE__ */ React.createElement("div", { className: "stat-card" }, /* @__PURE__ */ React.createElement("div", { className: "stat-value" }, activeRuns.length), /* @__PURE__ */ React.createElement("div", { className: "stat-label" }, "\u6D3B\u8DC3\u4EFB\u52A1")), /* @__PURE__ */ React.createElement("div", { className: "stat-card" }, /* @__PURE__ */ React.createElement("div", { className: "stat-value" }, completedVideos.length), /* @__PURE__ */ React.createElement("div", { className: "stat-label" }, "\u5DF2\u6E32\u67D3\u89C6\u9891"))), /* @__PURE__ */ React.createElement("div", { className: "section-title" }, "\u6700\u8FD1\u9879\u76EE"), projects.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, "\u8FD8\u6CA1\u6709\u9879\u76EE\u3002", /* @__PURE__ */ React.createElement("strong", { onClick: onNewProject }, "\u521B\u5EFA\u7B2C\u4E00\u4E2A\u9879\u76EE"), "\u5F00\u59CB\u4F7F\u7528\u3002") : /* @__PURE__ */ React.createElement("div", { className: "card-list" }, projects.slice(0, 5).map((p) => /* @__PURE__ */ React.createElement("div", { key: p.id, className: "card", onClick: () => onNavigate("project", p.id) }, /* @__PURE__ */ React.createElement("div", { className: "card-title" }, p.name), /* @__PURE__ */ React.createElement("div", { className: "card-detail" }, p.srtPath), /* @__PURE__ */ React.createElement("div", { className: "card-meta" }, /* @__PURE__ */ React.createElement("span", { className: "pill pill-pending" }, "v", p.revision), /* @__PURE__ */ React.createElement("span", { className: "card-time" }, new Date(p.createdAt).toLocaleString()))))), activeRuns.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "section-title" }, "\u6D3B\u8DC3\u4EFB\u52A1"), /* @__PURE__ */ React.createElement("div", { className: "card-list" }, activeRuns.map((r) => {
      const project = projects.find((p) => p.id === r.projectId);
      return /* @__PURE__ */ React.createElement("div", { key: r.id, className: "card", onClick: () => onNavigate("project", r.projectId) }, /* @__PURE__ */ React.createElement("div", { className: "card-title" }, project?.name || r.projectId), /* @__PURE__ */ React.createElement("div", { className: "card-detail" }, r.type, " \xB7 ", /* @__PURE__ */ React.createElement(StatusPill, { status: r.status }), r.status === "running" && r.progress > 0 && ` ${Math.round(r.progress * 100)}%`));
    }))));
  }
  function ProjectsPage({ projects, onNavigate, onNewProject }) {
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-header" }, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "\u9879\u76EE"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: onNewProject }, "\u65B0\u5EFA")), projects.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, "\u6682\u65E0\u9879\u76EE") : /* @__PURE__ */ React.createElement("div", { className: "card-list" }, projects.map((p) => /* @__PURE__ */ React.createElement("div", { key: p.id, className: "card", onClick: () => onNavigate("project", p.id) }, /* @__PURE__ */ React.createElement("div", { className: "card-title" }, p.name), /* @__PURE__ */ React.createElement("div", { className: "card-detail" }, p.srtPath), /* @__PURE__ */ React.createElement("div", { className: "card-meta" }, /* @__PURE__ */ React.createElement("span", { className: "pill pill-pending" }, "v", p.revision), /* @__PURE__ */ React.createElement("span", { className: "card-time" }, new Date(p.createdAt).toLocaleString()))))));
  }
  var RUN_STEPS = [
    { type: "init", title: "\u521D\u59CB\u5316", desc: "\u521B\u5EFA\u9879\u76EE\u7ED3\u6784" },
    { type: "storyboard", title: "\u5206\u955C\u751F\u6210", desc: "AI \u8BED\u4E49\u5206\u7EC4\u751F\u6210 storyboard\uFF08Agent \u6267\u884C\uFF09" },
    { type: "creators", title: "\u573A\u666F\u7EC4\u4EF6", desc: "\u5E76\u884C\u751F\u6210\u573A\u666F\u7EC4\u4EF6\uFF08Agent \u6267\u884C\uFF09" },
    { type: "registry", title: "\u573A\u666F\u6CE8\u518C", desc: "\u751F\u6210 generated-scenes.ts" },
    { type: "validate", title: "\u6821\u9A8C", desc: "\u6E32\u67D3\u524D\u5B8C\u6574\u6027\u68C0\u67E5" },
    { type: "tts", title: "\u8BED\u97F3\u5408\u6210", desc: "\u53EF\u9009\uFF1A\u4E3A\u89C6\u9891\u6DFB\u52A0\u914D\u97F3" },
    { type: "render", title: "\u6E32\u67D3\u8F93\u51FA", desc: "\u8F93\u51FA MP4" }
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
        showToast(`\u52A0\u8F7D\u5931\u8D25: ${err.message}`);
      }
    }, [projectId, showToast]);
    useEffect(() => {
      loadProject();
    }, [loadProject]);
    useSSE(projectId, {
      onRunQueued: () => loadProject(),
      onRunStarted: () => loadProject(),
      onRunProgress: (data) => {
        setRuns((prev) => prev.map(
          (r) => r.id === data.runId ? { ...r, progress: data.data?.progress || r.progress } : r
        ));
      },
      onRunCompleted: () => loadProject(),
      onRunFailed: () => loadProject(),
      onRunCancelled: () => loadProject(),
      onError: (msg) => showToast(msg)
    });
    const startRun = async (type, input = {}) => {
      setBusy(true);
      try {
        await api(`/api/projects/${encodeURIComponent(projectId)}/runs`, {
          method: "POST",
          body: JSON.stringify({ type, input })
        });
        showToast(`\u5DF2\u63D0\u4EA4: ${type}`, "info");
        setTimeout(loadProject, 500);
      } catch (err) {
        showToast(`${type} \u63D0\u4EA4\u5931\u8D25: ${err.message}`);
      }
      setBusy(false);
    };
    if (!project) return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, "\u52A0\u8F7D\u4E2D\u2026"));
    const latestByType = {};
    for (const r of runs) {
      if (!latestByType[r.type] || new Date(r.createdAt) > new Date(latestByType[r.type].createdAt)) {
        latestByType[r.type] = r;
      }
    }
    const videoArtifacts = artifacts.filter((a) => a.type === "video");
    const activeRun = runs.find((r) => r.status === "running");
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "back-link", onClick: onBack }, "\u2190 \u9879\u76EE\u5217\u8868"), /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, project.name), /* @__PURE__ */ React.createElement("div", { className: "page-subtitle" }, project.srtPath)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(StatusPill, { status: activeRun ? "running" : "completed" }))), /* @__PURE__ */ React.createElement("div", { className: "tabs" }, /* @__PURE__ */ React.createElement("button", { className: `tab ${tab === "pipeline" ? "active" : ""}`, onClick: () => setTab("pipeline") }, "\u5DE5\u4F5C\u6D41"), /* @__PURE__ */ React.createElement("button", { className: `tab ${tab === "artifacts" ? "active" : ""}`, onClick: () => setTab("artifacts") }, "\u4EA7\u7269"), /* @__PURE__ */ React.createElement("button", { className: `tab ${tab === "runs" ? "active" : ""}`, onClick: () => setTab("runs") }, "\u4EFB\u52A1\u8BB0\u5F55")), tab === "pipeline" && /* @__PURE__ */ React.createElement("div", { className: "pipeline-steps" }, RUN_STEPS.map((step, i) => {
      const run = latestByType[step.type];
      const status = run?.status || "pending";
      return /* @__PURE__ */ React.createElement("div", { key: step.type, className: "step" }, /* @__PURE__ */ React.createElement(StepNumber, { index: i + 1, status }), /* @__PURE__ */ React.createElement("div", { className: "step-content" }, /* @__PURE__ */ React.createElement("div", { className: "step-title" }, step.title), /* @__PURE__ */ React.createElement("div", { className: "step-detail" }, step.desc), run && /* @__PURE__ */ React.createElement("div", { className: "step-detail" }, /* @__PURE__ */ React.createElement(StatusPill, { status: run.status }), run.progress > 0 && ` ${Math.round(run.progress * 100)}%`, run.error && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--error)", marginLeft: "8px" } }, run.error.slice(0, 60))), step.type !== "storyboard" && step.type !== "creators" && step.type !== "init" && /* @__PURE__ */ React.createElement("div", { className: "step-actions" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn",
          disabled: busy || status === "running",
          onClick: () => startRun(step.type)
        },
        status === "running" ? "\u6267\u884C\u4E2D\u2026" : step.title === "\u6E32\u67D3\u8F93\u51FA" ? "\u6E32\u67D3" : step.title === "\u8BED\u97F3\u5408\u6210" ? "\u751F\u6210\u8BED\u97F3" : step.title
      ))));
    })), tab === "artifacts" && /* @__PURE__ */ React.createElement("div", null, artifacts.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, "\u6682\u65E0\u4EA7\u7269\u3002\u6267\u884C\u5DE5\u4F5C\u6D41\u6B65\u9AA4\u540E\u5C06\u5728\u6B64\u5904\u663E\u793A\u3002") : /* @__PURE__ */ React.createElement("div", { className: "card-list" }, artifacts.map((a) => /* @__PURE__ */ React.createElement("div", { key: a.id, className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-title" }, a.name), /* @__PURE__ */ React.createElement("div", { className: "card-detail" }, a.type, " \xB7 ", /* @__PURE__ */ React.createElement(StatusPill, { status: a.status })), a.filePath && /* @__PURE__ */ React.createElement("div", { className: "card-detail", style: { fontFamily: "var(--font-mono)", fontSize: "11px" } }, a.filePath))))), tab === "runs" && /* @__PURE__ */ React.createElement("div", null, runs.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, "\u6682\u65E0\u4EFB\u52A1\u8BB0\u5F55") : /* @__PURE__ */ React.createElement("div", { className: "card-list" }, runs.map((r) => /* @__PURE__ */ React.createElement("div", { key: r.id, className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-title" }, r.type, " \xB7 ", /* @__PURE__ */ React.createElement(StatusPill, { status: r.status })), /* @__PURE__ */ React.createElement("div", { className: "card-detail" }, r.progress > 0 && `${Math.round(r.progress * 100)}% \xB7 `, new Date(r.createdAt).toLocaleString(), r.error && ` \xB7 ${r.error.slice(0, 60)}`))))), videoArtifacts.length > 0 && videoArtifacts.some((a) => a.filePath) && /* @__PURE__ */ React.createElement("div", { className: "video-preview" }, /* @__PURE__ */ React.createElement("div", { className: "section-title" }, "\u89C6\u9891\u9884\u89C8"), /* @__PURE__ */ React.createElement("video", { controls: true, src: `/api/artifacts/${videoArtifacts[videoArtifacts.length - 1].id}/download` })));
  }
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
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-header" }, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Provider")), /* @__PURE__ */ React.createElement("div", { className: "card-list" }, capabilities.map((cap) => {
      const result = testResults[cap.type];
      return /* @__PURE__ */ React.createElement("div", { key: cap.type, className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-title" }, cap.type), /* @__PURE__ */ React.createElement("div", { className: "card-detail" }, "\u64CD\u4F5C: ", cap.operations.join(", ")), cap.requiredConfig.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "card-detail" }, "\u5FC5\u9700\u914D\u7F6E: ", cap.requiredConfig.join(", ")), /* @__PURE__ */ React.createElement("div", { className: "card-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => testProvider(cap.type), disabled: result?.testing }, result?.testing ? "\u6D4B\u8BD5\u4E2D\u2026" : "\u6D4B\u8BD5\u8FDE\u901A\u6027"), result && !result.testing && /* @__PURE__ */ React.createElement("span", { style: {
        color: result.ok ? "var(--success)" : "var(--error)",
        fontSize: "13px",
        marginLeft: "8px"
      } }, result.ok ? "\u2713" : "\xD7", " ", result.message, " (", result.latencyMs, "ms)")));
    })));
  }
  function SettingsPage({ showToast }) {
    const [config, setConfig] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
      api("/api/config").then((data) => {
        setConfig(data.config || {});
        setLoading(false);
      }).catch(() => setLoading(false));
    }, []);
    const update = (k, v) => setConfig({ ...config, [k]: v });
    const save = async () => {
      setSaving(true);
      try {
        await api("/api/config", { method: "PUT", body: JSON.stringify({ config }) });
        showToast("\u914D\u7F6E\u5DF2\u4FDD\u5B58", "info");
      } catch (err) {
        showToast(`\u4FDD\u5B58\u5931\u8D25: ${err.message}`);
      }
      setSaving(false);
    };
    if (loading) return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, "\u52A0\u8F7D\u4E2D\u2026"));
    const provider = config.TTS_PROVIDER || "openai";
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-header" }, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "\u8BBE\u7F6E")), /* @__PURE__ */ React.createElement("div", { className: "section-title" }, "TTS \u8BED\u97F3\u5408\u6210"), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", null, "Provider"), /* @__PURE__ */ React.createElement("select", { value: provider, onChange: (e) => update("TTS_PROVIDER", e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "openai" }, "OpenAI \u517C\u5BB9"), /* @__PURE__ */ React.createElement("option", { value: "mimo" }, "MiMo\uFF08\u5C0F\u7C73\uFF09"), /* @__PURE__ */ React.createElement("option", { value: "edge" }, "Edge TTS\uFF08\u514D\u8D39\uFF09"))), provider === "openai" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", null, "API Key"), /* @__PURE__ */ React.createElement("input", { type: "password", value: config.TTS_API_KEY || "", onChange: (e) => update("TTS_API_KEY", e.target.value), placeholder: "sk-\u2026" })), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", null, "Base URL"), /* @__PURE__ */ React.createElement("input", { type: "text", value: config.TTS_BASE_URL || "", onChange: (e) => update("TTS_BASE_URL", e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", null, "Model"), /* @__PURE__ */ React.createElement("input", { type: "text", value: config.TTS_MODEL || "", onChange: (e) => update("TTS_MODEL", e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", null, "Voice"), /* @__PURE__ */ React.createElement("input", { type: "text", value: config.TTS_VOICE || "", onChange: (e) => update("TTS_VOICE", e.target.value) }))), provider === "mimo" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", null, "MiMo API Key"), /* @__PURE__ */ React.createElement("input", { type: "password", value: config.MIMO_API_KEY || "", onChange: (e) => update("MIMO_API_KEY", e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", null, "Model"), /* @__PURE__ */ React.createElement("input", { type: "text", value: config.MIMO_MODEL || "", onChange: (e) => update("MIMO_MODEL", e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", null, "Voice"), /* @__PURE__ */ React.createElement("select", { value: config.MIMO_VOICE || "", onChange: (e) => update("MIMO_VOICE", e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "\u51B0\u7CD6" }, "\u51B0\u7CD6"), /* @__PURE__ */ React.createElement("option", { value: "\u8309\u8389" }, "\u8309\u8389"), /* @__PURE__ */ React.createElement("option", { value: "\u82CF\u6253" }, "\u82CF\u6253"), /* @__PURE__ */ React.createElement("option", { value: "\u767D\u6866" }, "\u767D\u6866"), /* @__PURE__ */ React.createElement("option", { value: "Mia" }, "Mia"), /* @__PURE__ */ React.createElement("option", { value: "Chloe" }, "Chloe"), /* @__PURE__ */ React.createElement("option", { value: "Milo" }, "Milo"), /* @__PURE__ */ React.createElement("option", { value: "Dean" }, "Dean")))), provider === "edge" && /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", null, "Voice"), /* @__PURE__ */ React.createElement("input", { type: "text", value: config.TTS_VOICE || "", onChange: (e) => update("TTS_VOICE", e.target.value), placeholder: "zh-CN-XiaoxiaoNeural" })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "24px" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: save, disabled: saving }, saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u914D\u7F6E")));
  }
  function NewProjectModal({ onClose, onCreated }) {
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
          body: JSON.stringify({ srtPath: srtPath.trim() })
        });
        onCreated(result.projectRoot || result.projectId);
        onClose();
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };
    return /* @__PURE__ */ React.createElement(Modal, { title: "\u65B0\u5EFA\u89C6\u9891\u9879\u76EE", onClose }, /* @__PURE__ */ React.createElement(ModalField, { label: "SRT \u5B57\u5E55\u6587\u4EF6\u8DEF\u5F84" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: srtPath,
        onChange: (e) => setSrtPath(e.target.value),
        placeholder: "C:/path/to/subtitle.srt",
        autoFocus: true,
        onKeyDown: (e) => e.key === "Enter" && !loading && start()
      }
    )), error && /* @__PURE__ */ React.createElement("div", { className: "modal-error" }, error), /* @__PURE__ */ React.createElement(ModalActions, { onClose, onSubmit: start, submitLabel: "\u5F00\u59CB", submitting: loading }));
  }
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
      } catch {
        setProjects([]);
      }
    }, []);
    useEffect(() => {
      loadProjects();
    }, [loadProjects]);
    const navigate = (page2, id = null) => {
      setPage(page2);
      setProjectId(id);
    };
    const navItems = [
      { key: "dashboard", label: "\u63A7\u5236\u53F0" },
      { key: "projects", label: "\u9879\u76EE" },
      { key: "providers", label: "Provider" },
      { key: "settings", label: "\u8BBE\u7F6E" }
    ];
    return /* @__PURE__ */ React.createElement("div", { className: "app" }, /* @__PURE__ */ React.createElement("nav", { className: "nav" }, /* @__PURE__ */ React.createElement("div", { className: "nav-brand" }, /* @__PURE__ */ React.createElement("div", { className: "nav-brand-title" }, "Remotion Video"), /* @__PURE__ */ React.createElement("div", { className: "nav-brand-sub" }, "\u9879\u76EE\u670D\u52A1")), navItems.map((item) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: item.key,
        className: `nav-item ${page === item.key ? "active" : ""}`,
        onClick: () => navigate(item.key)
      },
      item.label
    ))), /* @__PURE__ */ React.createElement("main", { className: "main" }, page === "dashboard" && /* @__PURE__ */ React.createElement(
      DashboardPage,
      {
        projects,
        runs: allRuns,
        onNavigate: navigate,
        onNewProject: () => setShowNewProject(true)
      }
    ), page === "projects" && /* @__PURE__ */ React.createElement(
      ProjectsPage,
      {
        projects,
        onNavigate: navigate,
        onNewProject: () => setShowNewProject(true)
      }
    ), page === "project" && projectId && /* @__PURE__ */ React.createElement(
      ProjectPage,
      {
        projectId,
        onBack: () => navigate("projects"),
        showToast
      }
    ), page === "providers" && /* @__PURE__ */ React.createElement(ProvidersPage, null), page === "settings" && /* @__PURE__ */ React.createElement(SettingsPage, { showToast })), /* @__PURE__ */ React.createElement(Toast, { toast, onClose: () => setToast(null) }), showNewProject && /* @__PURE__ */ React.createElement(
      NewProjectModal,
      {
        onClose: () => setShowNewProject(false),
        onCreated: () => {
          loadProjects();
        }
      }
    ));
  }
  function mountApp() {
    if (typeof ReactDOM === "undefined" || typeof React === "undefined") {
      document.getElementById("root").innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#999;font-family:Georgia,serif;">\u6B63\u5728\u52A0\u8F7D\u2026</div>';
      setTimeout(mountApp, 200);
      return;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
  }
  mountApp();
})();
