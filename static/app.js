const tg = window.Telegram?.WebApp;

const els = {
  badge: document.getElementById("badge"),
  newProjectName: document.getElementById("newProjectName"),
  createProjectBtn: document.getElementById("createProjectBtn"),
  projectSelect: document.getElementById("projectSelect"),
  refreshBtn: document.getElementById("refreshBtn"),
  projHint: document.getElementById("projHint"),

  tabs: document.querySelectorAll(".tab"),
  panes: {
    upload: document.getElementById("tab-upload"),
    editor: document.getElementById("tab-editor"),
    config: document.getElementById("tab-config"),
    export: document.getElementById("tab-export"),
  },

  importUrl: document.getElementById("importUrl"),
  importBtn: document.getElementById("importBtn"),

  uploadPath: document.getElementById("uploadPath"),
  uploadFile: document.getElementById("uploadFile"),
  uploadBtn: document.getElementById("uploadBtn"),

  fileSelect: document.getElementById("fileSelect"),
  loadFileBtn: document.getElementById("loadFileBtn"),
  filePath: document.getElementById("filePath"),
  saveFileBtn: document.getElementById("saveFileBtn"),
  newFileBtn: document.getElementById("newFileBtn"),
  reloadFilesBtn: document.getElementById("reloadFilesBtn"),

  reqTxt: document.getElementById("reqTxt"),
  envJson: document.getElementById("envJson"),
  saveReqBtn: document.getElementById("saveReqBtn"),
  saveEnvBtn: document.getElementById("saveEnvBtn"),

  zipLink: document.getElementById("zipLink"),
  sendToBotBtn: document.getElementById("sendToBotBtn"),

  repoName: document.getElementById("repoName"),
  repoDesc: document.getElementById("repoDesc"),
  repoPrivate: document.getElementById("repoPrivate"),
  publishBtn: document.getElementById("publishBtn"),

  exportInfo: document.getElementById("exportInfo"),
};

let currentProjectId = null;

// Monaco
let editor = null;
let editorReady = false;

function setBadge(text) { els.badge.textContent = text; }
function toast(msg) {
  tg?.HapticFeedback?.notificationOccurred("success");
  alert(msg);
}

async function api(path, opts = {}) {
  const headers = opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined;
  const res = await fetch(path, { headers, ...opts });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

function selectTab(name) {
  els.tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  Object.entries(els.panes).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
  if (name === "editor" && editorReady) setTimeout(() => editor.layout(), 150);
}
els.tabs.forEach(btn => btn.addEventListener("click", () => selectTab(btn.dataset.tab)));

function langFromPath(path) {
  const p = (path || "").toLowerCase();
  if (p.endsWith(".py")) return "python";
  if (p.endsWith(".js")) return "javascript";
  if (p.endsWith(".ts")) return "typescript";
  if (p.endsWith(".html")) return "html";
  if (p.endsWith(".css")) return "css";
  if (p.endsWith(".json")) return "json";
  if (p.endsWith(".yml") || p.endsWith(".yaml")) return "yaml";
  if (p.endsWith(".md")) return "markdown";
  if (p.endsWith(".txt") || p.endsWith(".env")) return "plaintext";
  return "plaintext";
}

function initMonaco() {
  return new Promise((resolve) => {
    // Monaco loader config
    window.require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" } });
    window.require(["vs/editor/editor.main"], function () {
      editor = monaco.editor.create(document.getElementById("editor"), {
        value: "# Select a file and click Load\n",
        language: "python",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
      });
      editorReady = true;
      resolve();
    });
  });
}

async function refreshProjects() {
  const list = await api("/api/projects");
  els.projectSelect.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Select a project…";
  els.projectSelect.appendChild(opt0);

  for (const p of list) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.id})`;
    els.projectSelect.appendChild(opt);
  }
}

async function loadProject(pid) {
  if (!pid) {
    currentProjectId = null;
    els.projHint.textContent = "Select a project to manage files.";
    return;
  }
  currentProjectId = pid;
  const data = await api(`/api/projects/${pid}/files`);
  els.projHint.textContent = `Managing: ${data.project.name}`;

  // files dropdown
  els.fileSelect.innerHTML = "";
  for (const f of data.files) {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    els.fileSelect.appendChild(opt);
  }

  // export link
  els.zipLink.href = `/api/projects/${pid}/export.zip`;
  els.exportInfo.textContent = JSON.stringify(
    { projectId: pid, fileCount: data.files.length, exportZip: `${location.origin}${els.zipLink.getAttribute("href")}` },
    null, 2
  );

  await tryLoadConfig(pid);
}

async function tryLoadConfig(pid) {
  try {
    const r = await api(`/api/projects/${pid}/file?path=requirements.txt`);
    els.reqTxt.value = r.content || "";
  } catch { els.reqTxt.value = ""; }

  try {
    const e = await api(`/api/projects/${pid}/file?path=ENV_VARS.json`);
    els.envJson.value = e.content || "";
  } catch {
    els.envJson.value = JSON.stringify({ EXAMPLE_KEY: "value" }, null, 2);
  }
}

els.refreshBtn.addEventListener("click", refreshProjects);

els.createProjectBtn.addEventListener("click", async () => {
  const name = els.newProjectName.value.trim() || "project";
  const created = await api("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
  await refreshProjects();
  els.projectSelect.value = created.id;
  await loadProject(created.id);
  toast("Project created ✅");
});

els.projectSelect.addEventListener("change", async () => {
  await loadProject(els.projectSelect.value);
});

// Import
els.importBtn.addEventListener("click", async () => {
  if (!currentProjectId) return toast("Select a project first.");
  const repo_url = (els.importUrl.value || "").trim();
  if (!repo_url) return toast("Paste a GitHub repo URL.");

  els.importBtn.disabled = true;
  els.importBtn.textContent = "Importing…";
  try {
    await api(`/api/projects/${currentProjectId}/import_github`, {
      method: "POST",
      body: JSON.stringify({ repo_url })
    });
    await loadProject(currentProjectId);
    toast("Imported ✅");
  } catch (e) {
    alert("Import failed:\n" + (e.message || e));
  } finally {
    els.importBtn.disabled = false;
    els.importBtn.textContent = "Import";
  }
});

// Upload
els.uploadBtn.addEventListener("click", async () => {
  if (!currentProjectId) return toast("Select a project first.");
  const file = els.uploadFile.files[0];
  if (!file) return toast("Choose a file to upload.");

  const fd = new FormData();
  fd.append("file", file);
  if (els.uploadPath.value.trim()) fd.append("path", els.uploadPath.value.trim());

  await api(`/api/projects/${currentProjectId}/upload`, { method: "POST", body: fd });
  await loadProject(currentProjectId);
  toast("Uploaded ✅");
});

// Editor: load file
els.loadFileBtn.addEventListener("click", async () => {
  if (!currentProjectId) return toast("Select a project first.");
  const path = els.fileSelect.value;
  if (!path) return toast("Select a file.");

  const data = await api(`/api/projects/${currentProjectId}/file?path=${encodeURIComponent(path)}`);
  els.filePath.value = data.path;
  editor.setValue(data.content || "");
  monaco.editor.setModelLanguage(editor.getModel(), langFromPath(data.path));
});

// Editor: new file
els.newFileBtn.addEventListener("click", () => {
  els.filePath.value = "";
  editor.setValue("");
  monaco.editor.setModelLanguage(editor.getModel(), "plaintext");
});

// Editor: save file
els.saveFileBtn.addEventListener("click", async () => {
  if (!currentProjectId) return toast("Select a project first.");
  const path = els.filePath.value.trim();
  if (!path) return toast("Enter file path (e.g. bot.py).");

  await api(`/api/projects/${currentProjectId}/file`, {
    method: "POST",
    body: JSON.stringify({ path, content: editor.getValue() })
  });

  await loadProject(currentProjectId);
  toast("Saved ✅");
});

els.reloadFilesBtn.addEventListener("click", async () => {
  if (!currentProjectId) return toast("Select a project first.");
  await loadProject(currentProjectId);
  toast("File list refreshed ✅");
});

// Config
els.saveReqBtn.addEventListener("click", async () => {
  if (!currentProjectId) return toast("Select a project first.");
  await api(`/api/projects/${currentProjectId}/file`, {
    method: "POST",
    body: JSON.stringify({ path: "requirements.txt", content: els.reqTxt.value || "" })
  });
  await loadProject(currentProjectId);
  toast("requirements.txt saved ✅");
});

els.saveEnvBtn.addEventListener("click", async () => {
  if (!currentProjectId) return toast("Select a project first.");
  try { JSON.parse(els.envJson.value || "{}"); }
  catch { return toast("ENV_VARS.json must be valid JSON."); }

  await api(`/api/projects/${currentProjectId}/file`, {
    method: "POST",
    body: JSON.stringify({ path: "ENV_VARS.json", content: els.envJson.value || "{}" })
  });
  await loadProject(currentProjectId);
  toast("ENV_VARS.json saved ✅");
});

// Send info to bot
els.sendToBotBtn.addEventListener("click", () => {
  if (!tg) return toast("Open inside Telegram to send data to bot.");
  if (!currentProjectId) return toast("Select a project first.");

  const payload = {
    type: "project_info",
    projectId: currentProjectId,
    exportZip: `${location.origin}/api/projects/${currentProjectId}/export.zip`,
    ts: new Date().toISOString(),
  };
  tg.sendData(JSON.stringify(payload));
  toast("Sent to bot ✅");
});

// Publish to GitHub
els.publishBtn.addEventListener("click", async () => {
  if (!currentProjectId) return toast("Select a project first.");

  const repo_name = (els.repoName.value || "").trim();
  if (!repo_name) return toast("Enter repo name.");

  els.publishBtn.disabled = true;
  els.publishBtn.textContent = "Publishing…";

  try {
    const result = await api(`/api/projects/${currentProjectId}/publish_github`, {
      method: "POST",
      body: JSON.stringify({
        repo_name,
        description: (els.repoDesc.value || "").trim(),
        private: !!els.repoPrivate.checked
      })
    });

    els.exportInfo.textContent = JSON.stringify(result, null, 2);

    if (tg) {
      tg.sendData(JSON.stringify({
        type: "github_published",
        projectId: currentProjectId,
        repo: result.repo,
        url: result.html_url,
        ts: new Date().toISOString()
      }));
    }

    toast(`Published ✅\n${result.html_url}`);
  } catch (e) {
    alert("Publish failed:\n" + (e.message || e));
  } finally {
    els.publishBtn.disabled = false;
    els.publishBtn.textContent = "🚀 Publish";
  }
});

// Init
(async function init() {
  if (tg) { tg.ready(); tg.expand(); setBadge("Telegram WebApp"); }
  else setBadge("Browser");

  await initMonaco();
  await refreshProjects();
  selectTab("upload");
})();
