/**
 * Builds a self-contained HTML document that can preview a virtual file system
 * project (React / Vite / Next-like / plain HTML / TS / JS) directly inside an
 * iframe, with no build step: transpilation happens in the browser via Babel
 * standalone and bare imports are resolved through esm.sh.
 */

export type PreviewFile = { path: string; content: string };

const HTML_EXT = [".html", ".htm"];
const CODE_ENTRY_CANDIDATES = [
  "src/main.tsx",
  "src/main.jsx",
  "src/main.ts",
  "src/main.js",
  "src/index.tsx",
  "src/index.jsx",
  "src/index.ts",
  "src/index.js",
  "main.tsx",
  "main.jsx",
  "index.tsx",
  "index.jsx",
  "src/App.tsx",
  "src/app.tsx",
  "App.tsx",
  "app/page.tsx",
  "src/app/page.tsx",
  "pages/index.tsx",
  "src/pages/index.tsx",
  "app/page.jsx",
  "pages/index.jsx",
];

function norm(p: string) {
  return p.replace(/^\.\//, "").replace(/^\/+/, "");
}

export type PreviewKind = "html" | "react" | "none";

export function detectPreviewKind(files: PreviewFile[]): PreviewKind {
  if (files.length === 0) return "none";
  const paths = files.map((f) => norm(f.path));
  if (paths.some((p) => HTML_EXT.some((e) => p.endsWith(e)))) return "html";
  if (paths.some((p) => /\.(tsx|jsx)$/.test(p))) return "react";
  if (paths.some((p) => /\.(ts|js|mjs)$/.test(p))) return "react";
  return "none";
}

function findEntry(files: PreviewFile[]): string | null {
  const map = new Map(files.map((f) => [norm(f.path), f] as const));
  for (const c of CODE_ENTRY_CANDIDATES) if (map.has(c)) return c;
  // Fallback: first tsx/jsx that looks like a component
  const candidate = files
    .map((f) => norm(f.path))
    .filter((p) => /\.(tsx|jsx)$/.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (candidate) return candidate;
  const anyScript = files
    .map((f) => norm(f.path))
    .filter((p) => /\.(ts|js|mjs)$/.test(p) && !p.endsWith(".d.ts") && !/\.config\./.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  return anyScript ?? null;
}

/** Plain HTML project: inline all css/js siblings. */
export function buildHtmlPreviewDoc(files: PreviewFile[]): string {
  const htmlFile =
    files.find((f) => norm(f.path) === "index.html") ??
    files.find((f) => HTML_EXT.some((e) => norm(f.path).endsWith(e)));
  if (!htmlFile) return buildEmptyDoc("Aucun fichier HTML");
  const styles = files
    .filter((f) => f.path.endsWith(".css"))
    .map((f) => `<style>${f.content}</style>`)
    .join("\n");
  const scripts = files
    .filter((f) => /\.(js|mjs)$/.test(f.path))
    .map((f) => `<script type="module">${f.content}</script>`)
    .join("\n");

  let html = htmlFile.content;
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${styles}\n<script src="https://cdn.tailwindcss.com"></script></head>`);
  } else {
    html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script>${styles}</head><body>${html}</body></html>`;
  }
  if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${scripts}</body>`);
  else html += scripts;
  return html;
}

export function buildEmptyDoc(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:ui-sans-serif,system-ui;background:#1D1D1C;color:#a3a3a3;font-size:14px;text-align:center;padding:24px}</style></head><body>${escapeHtml(message)}</body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

/**
 * React / TS / JS project: in-browser transpilation + tiny CommonJS loader.
 */
export function buildReactPreviewDoc(files: PreviewFile[]): string {
  const entry = findEntry(files);
  if (!entry) return buildEmptyDoc("Aucun point d'entrée détecté.");

  const fileMap: Record<string, string> = {};
  for (const f of files) fileMap[norm(f.path)] = f.content;

  const payload = JSON.stringify({ files: fileMap, entry })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/@babel/standalone@7.25.6/babel.min.js"></script>
<style>
  html,body,#root{height:100%;margin:0}
  body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff}
  #__err{position:fixed;inset:0;background:#1D1D1C;color:#fca5a5;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:20px;overflow:auto;white-space:pre-wrap;display:none;z-index:99999}
</style>
</head>
<body>
<div id="root"></div>
<div id="__err"></div>
<script>
(function () {
  var DATA = ${payload};
  var errBox = document.getElementById("__err");
  var capturedLogs = [];
  ["log", "info", "warn", "error"].forEach(function (level) {
    var orig = console[level].bind(console);
    console[level] = function () {
      try {
        capturedLogs.push("[" + level + "] " + Array.prototype.map.call(arguments, function (a) {
          return typeof a === "string" ? a : JSON.stringify(a);
        }).join(" "));
      } catch (e) {}
      orig.apply(null, arguments);
    };
  });
  function notifyParent(type, message) {
    try {
      parent.postMessage({ source: "capitole-preview", type: type, message: message, logs: capturedLogs.slice(-30) }, "*");
    } catch (e) {}
  }
  function showError(e) {
    var detail = (e && (e.stack || e.message)) || String(e);
    errBox.style.display = "block";
    errBox.textContent = "Erreur de rendu de l'aperçu\\n\\n" + detail;
    notifyParent("error", detail);
  }
  window.addEventListener("error", function (ev) { showError(ev.error || ev.message); });
  window.addEventListener("unhandledrejection", function (ev) { showError(ev.reason); });

  var EXTS = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

  function normalize(p) {
    var parts = p.split("/");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i];
      if (!s || s === ".") continue;
      if (s === "..") out.pop();
      else out.push(s);
    }
    return out.join("/");
  }

  function resolvePath(fromPath, spec) {
    var base;
    if (spec.charAt(0) === ".") {
      base = normalize(fromPath.split("/").slice(0, -1).join("/") + "/" + spec);
    } else if (spec.charAt(0) === "/") {
      base = normalize(spec);
    } else if (spec.indexOf("@/") === 0) {
      base = normalize("src/" + spec.slice(2));
    } else if (spec.indexOf("~/") === 0) {
      base = normalize("src/" + spec.slice(2));
    } else {
      return null;
    }
    for (var i = 0; i < EXTS.length; i++) {
      var cand = base + EXTS[i];
      if (Object.prototype.hasOwnProperty.call(DATA.files, cand)) return cand;
    }
    // also try without src/ prefix
    if (base.indexOf("src/") === 0) {
      var alt = base.slice(4);
      for (var j = 0; j < EXTS.length; j++) {
        if (Object.prototype.hasOwnProperty.call(DATA.files, alt + EXTS[j])) return alt + EXTS[j];
      }
    }
    return null;
  }

  // Collect bare specifiers used anywhere so we can pre-load them from esm.sh
  var bare = {};
  var importRe = /(?:import\\s[^;]*?from\\s*|import\\s*|export\\s[^;]*?from\\s*|require\\s*\\()\\s*["']([^"']+)["']/g;
  Object.keys(DATA.files).forEach(function (p) {
    if (!/\\.(t|j)sx?$|\\.mjs$/.test(p)) return;
    var src = DATA.files[p], m;
    importRe.lastIndex = 0;
    while ((m = importRe.exec(src))) {
      var spec = m[1];
      if (!spec) continue;
      if (spec.charAt(0) === "." || spec.charAt(0) === "/" || spec.indexOf("@/") === 0 || spec.indexOf("~/") === 0) continue;
      if (/\\.(css|scss|sass|less|png|jpe?g|svg|gif|webp|json)$/.test(spec)) continue;
      bare[spec] = true;
    }
  });

  function cdnUrl(spec) {
    // next/* and node builtins get shimmed instead of fetched
    return "https://esm.sh/" + spec + "?dev";
  }

  var NEXT_SHIMS = {
    "next/link": function (React) {
      return { __esModule: true, default: function (props) {
        var rest = Object.assign({}, props);
        delete rest.href; delete rest.children;
        return React.createElement("a", Object.assign({ href: typeof props.href === "string" ? props.href : "#" }, rest), props.children);
      } };
    },
    "next/image": function (React) {
      return { __esModule: true, default: function (props) {
        var rest = Object.assign({}, props);
        return React.createElement("img", rest);
      } };
    },
    "next/head": function (React) {
      return { __esModule: true, default: function () { return null; } };
    },
    "next/navigation": function () {
      return {
        __esModule: true,
        useRouter: function () { return { push: function () {}, replace: function () {}, back: function () {}, refresh: function () {} }; },
        usePathname: function () { return "/"; },
        useSearchParams: function () { return new URLSearchParams(); },
        redirect: function () {},
      };
    },
  };

  var registry = {};   // bare specifier -> module namespace
  var moduleCache = {};

  function interop(ns) {
    if (ns && ns.__esModule) return ns;
    return ns;
  }

  function requireModule(fromPath, spec) {
    // asset / style imports are no-ops
    if (/\\.(css|scss|sass|less)$/.test(spec)) return {};
    if (/\\.(png|jpe?g|svg|gif|webp|avif)$/.test(spec)) return { __esModule: true, default: "" };

    var resolved = resolvePath(fromPath, spec);
    if (resolved) return loadFile(resolved);

    if (/\\.json$/.test(spec)) {
      var jsonPath = resolvePathRawJson(fromPath, spec);
      if (jsonPath) {
        try { return { __esModule: true, default: JSON.parse(DATA.files[jsonPath]) }; } catch (e) { return { __esModule: true, default: {} }; }
      }
    }

    if (registry[spec]) return interop(registry[spec]);

    // Unknown bare module -> permissive proxy so rendering never hard-crashes
    return new Proxy({ __esModule: true }, {
      get: function (t, k) {
        if (k === "__esModule") return true;
        if (k === "default") return function () { return null; };
        return function () { return null; };
      },
    });
  }

  function resolvePathRawJson(fromPath, spec) {
    var base = normalize(fromPath.split("/").slice(0, -1).join("/") + "/" + spec);
    return Object.prototype.hasOwnProperty.call(DATA.files, base) ? base : null;
  }

  function loadFile(path) {
    if (moduleCache[path]) return moduleCache[path].exports;
    var source = DATA.files[path];
    var isTs = /\\.tsx?$/.test(path);
    // Babel standalone cannot read babel.config or package.json from this
    // virtual file system. Enable JSX directly for JavaScript modules too.
    var supportsJsx = /\\.(tsx|jsx|js|mjs)$/.test(path);
    var presets = [["env", { modules: "commonjs", targets: { chrome: "100" } }]];
    if (supportsJsx) presets.push(["react", { runtime: "classic" }]);
    if (isTs) presets.push(["typescript", { isTSX: /\\.tsx$/.test(path), allExtensions: true }]);

    var code;
    try {
      code = Babel.transform(source, {
        filename: path,
        presets: presets,
        sourceType: "module",
      }).code;
    } catch (e) {
      throw new Error("Erreur de compilation dans " + path + "\\n" + (e.message || e));
    }

    var module = { exports: {} };
    moduleCache[path] = module;
    var req = function (spec) { return requireModule(path, spec); };
    try {
      // eslint-disable-next-line no-new-func
      new Function("require", "module", "exports", "React", code)(req, module, module.exports, registry["react"] && (registry["react"].default || registry["react"]));
    } catch (e) {
      delete moduleCache[path];
      throw new Error("Erreur d'exécution dans " + path + "\\n" + (e.stack || e.message || e));
    }
    return module.exports;
  }

  function pickComponent(ns) {
    if (!ns) return null;
    if (typeof ns === "function") return ns;
    if (typeof ns.default === "function") return ns.default;
    var keys = Object.keys(ns);
    for (var i = 0; i < keys.length; i++) {
      var v = ns[keys[i]];
      if (typeof v === "function" && /^[A-Z]/.test(keys[i])) return v;
    }
    return null;
  }

  async function boot() {
    var specs = Object.keys(bare);
    if (specs.indexOf("react") === -1) specs.push("react");
    if (specs.indexOf("react-dom/client") === -1) specs.push("react-dom/client");

    var ReactMod = await import("https://esm.sh/react@18.3.1");
    var ReactDomMod = await import("https://esm.sh/react-dom@18.3.1/client");
    registry["react"] = ReactMod;
    registry["react/jsx-runtime"] = await import("https://esm.sh/react@18.3.1/jsx-runtime").catch(function () { return {}; });
    registry["react-dom"] = await import("https://esm.sh/react-dom@18.3.1").catch(function () { return ReactDomMod; });
    registry["react-dom/client"] = ReactDomMod;

    var React = ReactMod.default || ReactMod;
    window.React = React;

    await Promise.all(specs.map(async function (spec) {
      if (registry[spec]) return;
      if (NEXT_SHIMS[spec]) { registry[spec] = NEXT_SHIMS[spec](React); return; }
      if (spec.indexOf("next/") === 0 || spec === "next") { registry[spec] = { __esModule: true, default: function () { return null; } }; return; }
      try {
        registry[spec] = await import(cdnUrl(spec));
      } catch (e) {
        registry[spec] = null; // falls back to permissive proxy
      }
    }));

    var rootEl = document.getElementById("root");
    var root = ReactDomMod.createRoot(rootEl);

    var ns = loadFile(DATA.entry);
    // If the entry already mounted itself (main.tsx style), we're done.
    if (rootEl.childNodes.length > 0) return;

    var Comp = pickComponent(ns);
    if (!Comp) {
      // Try well-known app components
      var fallbacks = ["src/App.tsx", "src/App.jsx", "App.tsx", "app/page.tsx", "src/app/page.tsx", "pages/index.tsx"];
      for (var i = 0; i < fallbacks.length && !Comp; i++) {
        if (DATA.files[fallbacks[i]]) Comp = pickComponent(loadFile(fallbacks[i]));
      }
    }
    if (!Comp) {
      renderConsoleView();
      return;
    }
    root.render(React.createElement(Comp));
  }

  // Fallback view for projects without UI (scripts, API/back-end code)
  function renderConsoleView() {
    var list = Object.keys(DATA.files).sort().map(function (p) {
      return '<li style="padding:2px 0">' + p + '</li>';
    }).join("");
    var logs = capturedLogs.length
      ? '<pre style="margin:16px 0 0;padding:12px;border-radius:8px;background:#111;color:#a7f3d0;white-space:pre-wrap">' + capturedLogs.join("\\n").replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }) + "</pre>"
      : "";
    document.getElementById("root").innerHTML =
      '<div style="height:100%;overflow:auto;padding:28px;background:#1D1D1C;color:#e5e5e5;font:13px/1.6 ui-sans-serif,system-ui">' +
      '<div style="font-size:16px;font-weight:600;margin-bottom:4px">Projet sans interface</div>' +
      '<div style="color:#a3a3a3">Ce projet ne contient pas de composant à afficher. Voici son contenu et la sortie console.</div>' +
      '<ul style="margin:16px 0 0;padding:0;list-style:none;color:#a3a3a3;font-family:ui-monospace,monospace">' + list + "</ul>" +
      logs + "</div>";
  }

  function start() {
    boot().then(function () {
      setTimeout(function () {
        if (errBox.style.display !== "block") notifyParent("ok", "");
      }, 300);
    }).catch(showError);
  }

  if (window.Babel) start();
  else window.addEventListener("load", start);
})();
</script>
</body>
</html>`;
}

/** Single entry point: always returns a renderable document. */
export function buildPreviewDoc(files: PreviewFile[]): string {
  const kind = detectPreviewKind(files);
  if (kind === "html") return buildHtmlPreviewDoc(files);
  if (kind === "react") return buildReactPreviewDoc(files);
  return buildEmptyDoc("Aucun fichier à prévisualiser pour le moment.");
}
