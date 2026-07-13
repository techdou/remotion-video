(() => {
  // public/app.jsx
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
  function StepNumber({ index, status }) {
    const num = String(index).padStart(2, "0");
    return /* @__PURE__ */ React.createElement("span", { className: `step-number ${status || ""}` }, num);
  }
  function PipelineStep({ index, title, detail, step, onAction, actionLabel, disabled, children }) {
    const status = step?.status || "pending";
    return /* @__PURE__ */ React.createElement("div", { className: "step" }, /* @__PURE__ */ React.createElement(StepNumber, { index, status }), /* @__PURE__ */ React.createElement("div", { className: "step-content" }, /* @__PURE__ */ React.createElement("div", { className: "step-title" }, title), detail && /* @__PURE__ */ React.createElement("div", { className: "step-detail" }, detail), step?.error && /* @__PURE__ */ React.createElement("div", { className: "step-error" }, step.error.slice(0, 100)), onAction && /* @__PURE__ */ React.createElement("div", { className: "step-actions" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn",
        onClick: onAction,
        disabled: disabled || status === "running"
      },
      status === "running" ? "\u6267\u884C\u4E2D\u2026" : actionLabel
    )), children));
  }
  function CreatorCard({ creator }) {
    const status = creator.status || "pending";
    const labels = { done: "\u2713", running: "\xB7", failed: "\xD7", pending: "\u25CB" };
    return /* @__PURE__ */ React.createElement("div", { className: `creator-card ${status}` }, labels[status], " ", creator.id, " \xB7 ", creator.sceneIds?.length || 0, " \u573A\u666F");
  }
  function LogPanel({ logs }) {
    const ref = useRef(null);
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      if (nearBottom) el.scrollTop = el.scrollHeight;
    }, [logs]);
    return /* @__PURE__ */ React.createElement("div", { className: "log-area", ref }, logs.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-dim)", fontStyle: "italic" } }, "\u65E5\u5FD7\u5C06\u5728\u6B64\u5904\u5B9E\u65F6\u663E\u793A\u2026") : logs.map((entry, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: `log-line ${entry.level}` }, /* @__PURE__ */ React.createElement("span", { className: "log-time" }, new Date(entry.timestamp).toLocaleTimeString()), entry.message)));
  }
  function ConfigModal({ onClose, onSave }) {
    useEscapeKey(onClose);
    const [config, setConfig] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const load = useCallback(() => {
      setLoading(true);
      setError(null);
      api("/api/config").then((data) => {
        setConfig(data.config || {});
        setLoading(false);
      }).catch((err) => {
        setError(err.message);
        setLoading(false);
      });
    }, []);
    useEffect(() => {
      load();
    }, [load]);
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
    if (loading) return /* @__PURE__ */ React.createElement("div", { className: "modal-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() }, "\u52A0\u8F7D\u4E2D\u2026"));
    const ttsProvider = config.TTS_PROVIDER || "openai";
    return /* @__PURE__ */ React.createElement("div", { className: "modal-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation(), role: "dialog", "aria-modal": "true" }, /* @__PURE__ */ React.createElement("h2", null, "\u914D\u7F6E"), /* @__PURE__ */ React.createElement("div", { className: "section-title" }, "TTS \u8BED\u97F3\u5408\u6210"), /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, "Provider"), /* @__PURE__ */ React.createElement("select", { value: ttsProvider, onChange: (e) => update("TTS_PROVIDER", e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "openai" }, "OpenAI \u517C\u5BB9\uFF08\u5B98\u65B9 / \u7845\u57FA / \u706B\u5C71 / OneAPI\uFF09"), /* @__PURE__ */ React.createElement("option", { value: "mimo" }, "MiMo\uFF08\u5C0F\u7C73\uFF09"), /* @__PURE__ */ React.createElement("option", { value: "edge" }, "Edge TTS\uFF08\u514D\u8D39\u672C\u5730\uFF09"))), ttsProvider === "openai" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, "API Key"), /* @__PURE__ */ React.createElement("input", { type: "password", value: config.TTS_API_KEY || "", onChange: (e) => update("TTS_API_KEY", e.target.value), placeholder: "sk-\u2026" })), /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, "Base URL"), /* @__PURE__ */ React.createElement("input", { type: "text", value: config.TTS_BASE_URL || "", onChange: (e) => update("TTS_BASE_URL", e.target.value), placeholder: "https://api.openai.com/v1" })), /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, "Model"), /* @__PURE__ */ React.createElement("input", { type: "text", value: config.TTS_MODEL || "", onChange: (e) => update("TTS_MODEL", e.target.value), placeholder: "gpt-4o-mini-tts" })), /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, "Voice"), /* @__PURE__ */ React.createElement("input", { type: "text", value: config.TTS_VOICE || "", onChange: (e) => update("TTS_VOICE", e.target.value), placeholder: "alloy" }))), ttsProvider === "mimo" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, "MiMo API Key"), /* @__PURE__ */ React.createElement("input", { type: "password", value: config.MIMO_API_KEY || "", onChange: (e) => update("MIMO_API_KEY", e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, "Model"), /* @__PURE__ */ React.createElement("input", { type: "text", value: config.MIMO_MODEL || "", onChange: (e) => update("MIMO_MODEL", e.target.value), placeholder: "mimo-v2.5-tts" })), /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, "Voice"), /* @__PURE__ */ React.createElement("select", { value: config.MIMO_VOICE || "", onChange: (e) => update("MIMO_VOICE", e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "\u51B0\u7CD6" }, "\u51B0\u7CD6"), /* @__PURE__ */ React.createElement("option", { value: "\u8309\u8389" }, "\u8309\u8389"), /* @__PURE__ */ React.createElement("option", { value: "\u82CF\u6253" }, "\u82CF\u6253"), /* @__PURE__ */ React.createElement("option", { value: "\u767D\u6866" }, "\u767D\u6866"), /* @__PURE__ */ React.createElement("option", { value: "Mia" }, "Mia"), /* @__PURE__ */ React.createElement("option", { value: "Chloe" }, "Chloe"), /* @__PURE__ */ React.createElement("option", { value: "Milo" }, "Milo"), /* @__PURE__ */ React.createElement("option", { value: "Dean" }, "Dean")))), ttsProvider === "edge" && /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, "Voice"), /* @__PURE__ */ React.createElement("input", { type: "text", value: config.TTS_VOICE || "", onChange: (e) => update("TTS_VOICE", e.target.value), placeholder: "zh-CN-XiaoxiaoNeural" })), error && /* @__PURE__ */ React.createElement("div", { className: "modal-error" }, error), /* @__PURE__ */ React.createElement("div", { className: "modal-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: onClose }, "\u53D6\u6D88"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: save, disabled: saving }, saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"))));
  }
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
          body: JSON.stringify({ srtPath: srtPath.trim() })
        });
        onInitiated(result.projectRoot);
        onClose();
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "modal-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation(), role: "dialog", "aria-modal": "true" }, /* @__PURE__ */ React.createElement("h2", null, "\u65B0\u5EFA\u89C6\u9891\u9879\u76EE"), /* @__PURE__ */ React.createElement("div", { className: "modal-field" }, /* @__PURE__ */ React.createElement("label", null, "SRT \u5B57\u5E55\u6587\u4EF6\u8DEF\u5F84"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: srtPath,
        onChange: (e) => setSrtPath(e.target.value),
        placeholder: "C:/path/to/subtitle.srt",
        autoFocus: true,
        onKeyDown: (e) => e.key === "Enter" && !loading && start()
      }
    )), error && /* @__PURE__ */ React.createElement("div", { className: "modal-error" }, error), /* @__PURE__ */ React.createElement("div", { className: "modal-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: onClose }, "\u53D6\u6D88"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: start, disabled: loading }, loading ? "\u521D\u59CB\u5316\u4E2D\u2026" : "\u5F00\u59CB"))));
  }
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
      api(`/api/pipeline/${encodeURIComponent(currentProject)}`).then((s) => {
        if (!cancelled) setPipelineState(s);
      }).catch(() => {
        if (!cancelled) setPipelineState(null);
      });
      setLogs([]);
      setRenderProgress(0);
      return () => {
        cancelled = true;
      };
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
            message: "\u5B9E\u65F6\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u8BF7\u5237\u65B0\u9875\u9762",
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }]);
        }
      });
      return () => es.close();
    }, [currentProject]);
    const showToast = (msg, level = "error") => {
      setToast({ message: msg, level, ts: Date.now() });
      setTimeout(() => setToast(null), 5e3);
    };
    const runAction = async (endpoint, body = {}, label = "\u6267\u884C") => {
      if (!currentProject || busy) return;
      setBusy(true);
      try {
        await api(endpoint, { method: "POST", body: JSON.stringify({ projectRoot: currentProject, ...body }) });
        showToast(`${label}\u5B8C\u6210`, "info");
      } catch (err) {
        setLogs((prev) => [...prev, { level: "error", message: `${label}\u5931\u8D25: ${err.message}`, timestamp: (/* @__PURE__ */ new Date()).toISOString() }]);
        showToast(`${label}\u5931\u8D25: ${err.message}`, "error");
      }
      setBusy(false);
    };
    const steps = pipelineState?.steps || {};
    const tts = pipelineState?.tts || {};
    const video = pipelineState?.video || {};
    const hasVideo = video.path !== null;
    return /* @__PURE__ */ React.createElement("div", { className: "app" }, /* @__PURE__ */ React.createElement("div", { className: "header" }, /* @__PURE__ */ React.createElement("div", { className: "header-left" }, /* @__PURE__ */ React.createElement("h1", null, "Remotion Video \u63A7\u5236\u53F0"), /* @__PURE__ */ React.createElement("div", { className: "subtitle" }, "SRT \u5B57\u5E55\u9A71\u52A8\u7684\u89C6\u9891\u751F\u6210\u5DE5\u4F5C\u6D41")), /* @__PURE__ */ React.createElement("div", { className: "header-right" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        placeholder: "SRT \u76EE\u5F55\u8DEF\u5F84",
        value: srtDir,
        onChange: (e) => setSrtDir(e.target.value),
        style: { width: "200px" }
      }
    ), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: refreshProjects }, "\u5237\u65B0"), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: currentProject || "",
        onChange: (e) => setCurrentProject(e.target.value),
        style: { width: "180px" }
      },
      /* @__PURE__ */ React.createElement("option", { value: "" }, "\u9009\u62E9\u9879\u76EE\u2026"),
      projects.map((p) => /* @__PURE__ */ React.createElement("option", { key: p.projectRoot, value: p.projectRoot }, p.name, " ", p.hasVideo ? "\u2713" : ""))
    ), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: () => setShowInit(true) }, "\u65B0\u5EFA"), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => setShowConfig(true) }, "\u914D\u7F6E"))), /* @__PURE__ */ React.createElement("div", { className: "main" }, /* @__PURE__ */ React.createElement("div", { className: "sidebar" }, /* @__PURE__ */ React.createElement("div", { className: "section-title" }, "\u5DE5\u4F5C\u6D41"), /* @__PURE__ */ React.createElement(
      PipelineStep,
      {
        index: 1,
        title: "\u521D\u59CB\u5316",
        detail: steps.init?.result?.projectRoot ? "\u9879\u76EE\u5DF2\u521B\u5EFA" : "\u7B49\u5F85 SRT \u6587\u4EF6",
        step: steps.init
      }
    ), /* @__PURE__ */ React.createElement(
      PipelineStep,
      {
        index: 2,
        title: "\u5206\u955C\u751F\u6210",
        detail: steps.storyboard?.result?.sceneCount ? `${steps.storyboard.result.sceneCount} \u4E2A\u573A\u666F` : "\u9700\u8981 Agent \u6267\u884C\uFF08AI \u8BED\u4E49\u5206\u7EC4\uFF09",
        step: steps.storyboard
      }
    ), /* @__PURE__ */ React.createElement(
      PipelineStep,
      {
        index: 3,
        title: "\u573A\u666F\u7EC4\u4EF6",
        detail: steps.creators?.total ? `${steps.creators.total} \u4E2A Creator \u5E76\u884C` : "\u9700\u8981 Agent \u6267\u884C\uFF08AI \u751F\u6210\u7EC4\u4EF6\uFF09",
        step: steps.creators
      },
      steps.creators?.creators?.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "creator-list" }, steps.creators.creators.map((c) => /* @__PURE__ */ React.createElement(CreatorCard, { key: c.id, creator: c })))
    ), /* @__PURE__ */ React.createElement(
      PipelineStep,
      {
        index: 4,
        title: "\u573A\u666F\u6CE8\u518C",
        detail: steps.registry?.result?.sceneCount ? `${steps.registry.result.sceneCount} \u4E2A\u573A\u666F\u5DF2\u6CE8\u518C` : "\u751F\u6210 generated-scenes.ts",
        step: steps.registry,
        onAction: () => runAction("/api/run/registry", {}, "\u573A\u666F\u6CE8\u518C"),
        actionLabel: "\u6CE8\u518C",
        disabled: !currentProject || busy
      }
    ), /* @__PURE__ */ React.createElement(
      PipelineStep,
      {
        index: 5,
        title: "\u6821\u9A8C",
        detail: steps.validate?.status === "done" ? "\u901A\u8FC7" : "\u6E32\u67D3\u524D\u68C0\u67E5",
        step: steps.validate,
        onAction: () => runAction("/api/run/validate", {}, "\u6821\u9A8C"),
        actionLabel: "\u6821\u9A8C",
        disabled: !currentProject || busy
      }
    ), /* @__PURE__ */ React.createElement(
      PipelineStep,
      {
        index: 6,
        title: "\u8BED\u97F3\u5408\u6210",
        detail: tts.status === "done" ? `${tts.provider} \xB7 ${tts.segments.done} \u6BB5` : "\u53EF\u9009\uFF1A\u4E3A\u89C6\u9891\u6DFB\u52A0\u914D\u97F3",
        step: { status: tts.status === "idle" ? "pending" : tts.status },
        onAction: () => runAction("/api/run/tts", {}, "\u8BED\u97F3\u5408\u6210"),
        actionLabel: "\u751F\u6210\u8BED\u97F3",
        disabled: !currentProject || busy
      }
    ), /* @__PURE__ */ React.createElement(
      PipelineStep,
      {
        index: 7,
        title: "\u6E32\u67D3\u8F93\u51FA",
        detail: steps.render?.status === "done" ? `${video.sizeMB} MB` : steps.render?.status === "running" ? `\u6E32\u67D3\u4E2D ${Math.round(renderProgress * 100)}%` : "\u8F93\u51FA MP4",
        step: steps.render,
        onAction: () => runAction("/api/run/render", {}, "\u6E32\u67D3"),
        actionLabel: "\u6E32\u67D3",
        disabled: !currentProject || busy
      }
    ), steps.render?.status === "running" && /* @__PURE__ */ React.createElement("div", { className: "progress-bar" }, /* @__PURE__ */ React.createElement("div", { className: "progress-fill", style: { width: `${renderProgress * 100}%` } }))), /* @__PURE__ */ React.createElement("div", { className: "content" }, /* @__PURE__ */ React.createElement("div", { className: "preview-area" }, /* @__PURE__ */ React.createElement("div", { className: "video-container" }, hasVideo ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
      "video",
      {
        controls: true,
        src: `/api/video/${encodeURIComponent(currentProject)}`
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "16px" } }, /* @__PURE__ */ React.createElement(
      "a",
      {
        className: "btn btn-primary",
        href: `/api/video/${encodeURIComponent(currentProject)}`,
        download: "output.mp4"
      },
      "\u4E0B\u8F7D MP4\uFF08",
      video.sizeMB,
      " MB\uFF09"
    ))) : /* @__PURE__ */ React.createElement("div", { className: "preview-placeholder" }, currentProject ? "\u5B8C\u6210\u5DE5\u4F5C\u6D41\u6B65\u9AA4\u540E\uFF0C\u89C6\u9891\u5C06\u5728\u6B64\u5904\u5448\u73B0" : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, "\u9009\u62E9\u6216\u65B0\u5EFA"), "\u4E00\u4E2A\u9879\u76EE\u5F00\u59CB")))), /* @__PURE__ */ React.createElement(LogPanel, { logs }))), toast && /* @__PURE__ */ React.createElement("div", { className: `toast ${toast.level}` }, toast.message), showConfig && /* @__PURE__ */ React.createElement(ConfigModal, { onClose: () => setShowConfig(false), onSave: () => {
    } }), showInit && /* @__PURE__ */ React.createElement(
      InitModal,
      {
        onClose: () => setShowInit(false),
        onInitiated: (pr) => {
          setCurrentProject(pr);
          setShowInit(false);
        }
      }
    ));
  }
  function mountApp() {
    if (typeof ReactDOM === "undefined" || typeof React === "undefined") {
      document.getElementById("root").innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#999;font-family:Georgia,serif;">\u6B63\u5728\u52A0\u8F7D React\u2026</div>';
      setTimeout(mountApp, 200);
      return;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
  }
  mountApp();
})();
