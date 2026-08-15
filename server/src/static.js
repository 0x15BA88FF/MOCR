import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PUBLIC_DIST, MIME_TYPES, CORS } from "./config.js";
import { json } from "./responses.js";

export function serveStatic(_req, res, _url, pathname) {
  const filePath = path.join(
    PUBLIC_DIST,
    pathname === "/" ? "index.html" : pathname,
  );
  if (existsSync(filePath)) {
    try {
      const fileContent = readFileSync(filePath);
      const ext = path.extname(filePath);
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType, ...CORS });
      res.end(fileContent);
      return;
    } catch {}
  }

  const indexFile = path.join(PUBLIC_DIST, "index.html");
  if (existsSync(indexFile)) {
    const ext = path.extname(pathname);
    if (ext && ext !== ".html") {
      json(res, 404, { error: "not found" });
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html", ...CORS });
    res.end(readFileSync(indexFile));
    return;
  }

  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(dashboardHtml());
    return;
  }

  json(res, 404, { error: "not found" });
}

export function dashboardHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Slooh feeds</title>
<style>
body{font-family:ui-monospace,monospace;background:#0a0f1e;color:#dfe7f5;margin:0;padding:24px}
h1{font-size:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{background:#131a2e;border:1px solid #26314f;border-radius:10px;padding:12px}
.card.offline{opacity:.45}
.card .name{font-weight:700}
.card .meta{color:#8aa0c8;font-size:11px;margin:4px 0 10px}
.badge{display:inline-block;padding:1px 8px;border-radius:20px;font-size:10px;text-transform:uppercase}
.badge.online{background:#173b2a;color:#5ad98c}
.badge.offline{background:#3b1720;color:#e06c86}
.badge.sse{background:#1c2a4d;color:#7aa2ff;margin-left:6px}
.badge.video{background:#4d3a1c;color:#ffd27a;margin-left:6px}
img{width:100%;border-radius:6px;aspect-ratio:1;object-fit:cover;background:#000}
iframe{width:100%;aspect-ratio:16/9;border:0;border-radius:6px}
.empty{color:#5b6b8c;font-size:12px;padding:40px 0;text-align:center}
</style></head><body>
<h1>Slooh live feeds</h1><div class="grid" id="grid"></div>
<div class="empty" id="empty">loading...</div>
<script>
async function tick() {
  const r = await fetch('/api/telescopes');
  const { telescopes } = await r.json();
  document.getElementById('empty').style.display = telescopes.length ? 'none' : 'block';
  const grid = document.getElementById('grid');
  const seen = new Set();
  for (const t of telescopes) {
    seen.add(t.teleUniqueId);
    let el = document.getElementById('t-' + t.teleUniqueId);
    if (!el) {
      el = document.createElement('div');
      el.id = 't-' + t.teleUniqueId;
      el.className = 'card';
      el.innerHTML = '<div class="name">' + t.telescopeName + '</div><div class="meta">' + t.obsName + ' / ' + t.telescopeId + '</div>' +
        '<div class="badges"></div><div class="view"></div>';
      grid.appendChild(el);
    }
    el.className = 'card' + (t.online ? '' : ' offline');
    const badges = el.querySelector('.badges');
    const badge = t.online ? '<span class="badge online">online</span>' : '<span class="badge offline">offline</span>';
    const type = t.feedType === 'video' ? '<span class="badge video">youtube</span>' : (t.feedType === 'sse' ? '<span class="badge sse">sse</span>' : '');
    badges.innerHTML = badge + type;
    const view = el.querySelector('.view');
    if (t.feedType === 'video' && t.online) {
      view.innerHTML = '<iframe src="' + (t.feedURL || '') + '" allow="autoplay; fullscreen" allowfullscreen></iframe>';
    } else if (t.feedType === 'sse' && t.online) {
      view.innerHTML = t.currentImgURL ? '<img src="' + t.currentImgURL + '">' : '';
    } else {
      view.innerHTML = '';
    }
  }
  for (const el of grid.children) if (!seen.has(el.id.replace('t-', ''))) el.remove();
}
setInterval(tick, 5000);
tick();
</script></body></html>`;
}
