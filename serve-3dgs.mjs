import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const WORKSPACE = resolve(ROOT, '..');
const VIEWER_DIR = resolve(WORKSPACE, 'playcanvas/supersplat-viewer/public');
const DATA_DIR = resolve(WORKSPACE, 'data');
const SCENE_ROOTS = [
    { id: 'dianpu', label: 'Dianpu LOD scenes' },
    { id: '500w-sh0-lod', label: '500w SH0 LOD scenes' }
];
const SETTINGS_DIR = resolve(ROOT, 'settings');
const UWA_DIR = resolve(ROOT, 'uwa-decoder');
const PORT = Number(process.env.PORT ?? 8080);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.sog': 'application/octet-stream',
    '.glb': 'model/gltf-binary',
    '.ply': 'application/octet-stream',
    '.spz': 'application/octet-stream',
    '.bt': 'application/octet-stream'
};

const readJson = (file) => {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
};

const sceneGroups = SCENE_ROOTS.map((root) => {
    const rootDir = resolve(DATA_DIR, 'lod', root.id);
    const scenes = readdirSync(rootDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .map((scene) => {
        const dir = join(rootDir, scene);
        const sogManifest = join(dir, 'sog/lod-meta.json');
        const glbManifest = join(dir, 'glb/lod-meta.json');
        const settingsFile = join(SETTINGS_DIR, `${scene}.json`);
        const hasSog = existsSync(sogManifest);
        const hasGlb = existsSync(glbManifest);
        if (!hasSog && !hasGlb) {
            return null;
        }
        const settings = existsSync(settingsFile) ? `/settings/${scene}.json` : undefined;
        const formats = [];
        if (hasSog) {
            formats.push({
                label: 'SOG',
                content: `/data/lod/${root.id}/${scene}/lod-meta.json?format=sog`,
                settings
            });
        }
        if (hasGlb) {
            formats.push({
                label: 'GLB (adaptive)',
                content: `/data/lod/${root.id}/${scene}/lod-meta.json?format=glb`,
                settings
            });
        }
        return { name: scene, formats };
    })
    .filter(Boolean);
    return { ...root, scenes };
});

const allScenes = sceneGroups.flatMap(group => group.scenes);

const otherScenes = [
    {
        name: 'SanYaPo UAV (outdoor, LOD, SOG)',
        formats: [{
            label: 'SOG',
            content: '/data/lod/SanYaPo_UAV_diffuse_gsbox_lod_0611_edit/lod-meta.json',
            settings: '/settings/sanya.json'
        }]
    }
];

const sogCount = allScenes.filter(scene => scene.formats.some(format => format.label === 'SOG')).length;
const glbCount = allScenes.filter(scene => scene.formats.some(format => format.label.startsWith('GLB') && !format.disabled)).length;
const glbUnsupportedCount = allScenes.filter(scene => scene.formats.some(format => format.disabled)).length;

// Viewer url for a scene format. noanim parks the opening frame on the configured camera so
// the first drag/click takes over instead of starting the built-in auto-orbit.
const sceneUrl = (scene, format) => {
    const params = new URLSearchParams({ content: format.content });
    if (format.settings) params.set('settings', format.settings);
    if (format.collision) params.set('collision', format.collision);
    params.set('noanim', '');
    return `/viewer/?${params.toString()}`;
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

const sceneCard = (scene) => `
  <article class="card">
    <h3 title="${escapeHtml(scene.name)}">${escapeHtml(scene.name)}</h3>
    <div class="actions">
      ${scene.formats.map(format => `<a class="btn ${format.label.startsWith('GLB') ? 'glb' : 'sog'}" href="${sceneUrl(scene, format)}">${format.label}</a>`).join('\n      ')}
    </div>
  </article>`;

const sceneSection = (group) => `
  <h2>${escapeHtml(group.label)}</h2>
  <div class="grid">
    ${group.scenes.map(sceneCard).join('\n    ')}
  </div>`;

const landing = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>3DGS Local Viewer</title>
<style>
  body { margin: 0; min-height: 100vh; background: #0b0d10; color: #e8eaed; font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: min(1180px, 94vw); margin: 0 auto; padding: 32px 0 48px; }
  h1 { font-size: 24px; font-weight: 650; margin: 0 0 4px; }
  h2 { font-size: 15px; font-weight: 600; color: #9aa4b2; text-transform: uppercase; letter-spacing: .08em; margin: 28px 0 12px; }
  .hint { color: #9aa4b2; margin: 6px 0 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }
  .card { border: 1px solid #252b33; border-radius: 12px; background: #13171c; padding: 14px 16px 12px; }
  .card:hover { border-color: #3a4554; }
  .card h3 { font-size: 14px; font-weight: 600; line-height: 1.35; margin: 0 0 10px; word-break: break-all; color: #dfe6ee; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .btn { display: inline-block; padding: 5px 13px; border-radius: 999px; border: 1px solid #2f6feb; color: #cfe0ff; text-decoration: none; font-size: 13px; background: #101a2b; }
  .btn:hover { background: #1b2c4a; }
  .btn.glb { border-color: #3a9b6e; color: #c7f2dc; background: #0f1e17; }
  .btn.glb:hover { background: #163326; }
  .btn.disabled { border-color: #343a42; color: #6b7280; background: #101214; cursor: not-allowed; }
  .toggles { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin: 14px 0 0; padding: 10px 14px; border: 1px solid #252b33; border-radius: 10px; background: #10141a; }
  .toggles label { display: inline-flex; gap: 8px; align-items: center; cursor: pointer; color: #dfe6ee; font-size: 13px; }
  .toggles input { accent-color: #2f6feb; }
  .toggles .hint { margin: 0; }
  code { color: #cfe0ff; }
</style>
</head>
<body>
<main>
  <h1>3DGS Local Viewer</h1>
  <div class="toggles">
    <label><input type="checkbox" id="debugToggle" checked /> Debug 面板</label>
    <label><input type="checkbox" id="webglToggle" /> 强制 WebGL</label>
    <span class="hint">默认自动选择 WebGPU；WebGL 为兼容/对比模式</span>
  </div>
  <p class="hint">${allScenes.length} 个 LOD 场景 · SOG ${sogCount} · GLB ${glbCount}${glbUnsupportedCount ? `（${glbUnsupportedCount} 个变体暂不支持）` : ''}</p>

  <h2>Other</h2>
  <div class="grid">
    ${otherScenes.map(sceneCard).join('\n    ')}
  </div>

  ${sceneGroups.map(sceneSection).join('\n  ')}

  <p class="hint" style="margin-top:24px">SOG 体积小、加载快；GLB 使用 UWA EGSC 解码，首次加载较慢。SOG 和 GLB 都按 lod-meta 的 per-node LOD 自适应升降级。Debug 面板默认开启，可在上方关闭。默认自动选择 WebGPU（不可用时回退 WebGL2）；强制 WebGL 用于兼容性排查或与 WebGPU 对比性能，两者渲染的是同一份数据。</p>
</main>
  <script>
    (() => {
      const links = [...document.querySelectorAll('a.btn')];
      const debugToggle = document.getElementById('debugToggle');
      const webglToggle = document.getElementById('webglToggle');
      const read = (key, fallback) => {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value === '1';
      };
      const apply = () => {
        const debug = debugToggle.checked;
        const webgl = webglToggle.checked;
        localStorage.setItem('3dgs-debug', debug ? '1' : '0');
        localStorage.setItem('3dgs-webgl', webgl ? '1' : '0');
        for (const link of links) {
          const url = new URL(link.getAttribute('href'), location.href);
          if (debug) url.searchParams.set('debug', '1'); else url.searchParams.delete('debug');
          if (webgl) url.searchParams.set('webgl', '1'); else url.searchParams.delete('webgl');
          link.href = url.pathname + url.search;
        }
      };
      debugToggle.checked = read('3dgs-debug', true);
      webglToggle.checked = read('3dgs-webgl', false);
      debugToggle.addEventListener('change', apply);
      webglToggle.addEventListener('change', apply);
      apply();
    })();
  </script></body>
</html>`;
const safeJoin = (base, pathname) => {
    const target = resolve(join(base, pathname));
    if (target !== base && !target.startsWith(base + sep)) return null;
    return target;
};

const resolveDataFile = (pathname, searchParams) => {
    let file = safeJoin(DATA_DIR, pathname);
    if (!file) return null;

    if (file.endsWith('lod-meta.json')) {
        const dir = dirname(file);
        const format = searchParams?.get('format');
        if (format === 'sog') {
            const generated = join(dir, 'sog/lod-meta.json');
            if (existsSync(generated)) return generated;
        }
        if (format === 'glb') {
            const generated = join(dir, 'glb/lod-meta.json');
            if (existsSync(generated)) return generated;
        }

        // Some exported LOD scenes ship a .glb manifest plus an equivalent .sog one.
        // The engine only recognises the lod-meta.json basename, so prefer the SOG
        // variant whenever it exists.
        const sog = file.replace(/lod-meta\.json$/, 'lod-meta-sog.json');
        if (existsSync(sog)) file = sog;
    }

    return file;
};

const CROSS_ORIGIN_HEADERS = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin'
};

const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...CROSS_ORIGIN_HEADERS, ...headers });
    res.end(body);
};

const serveFile = (req, res, file) => {
    let stat;
    try {
        stat = statSync(file);
    } catch {
        return send(res, 404, 'Not found');
    }
    if (!stat.isFile()) return send(res, 404, 'Not found');

    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        ...CROSS_ORIGIN_HEADERS
    });
    if (req.method === 'HEAD') {
        res.end();
        return;
    }
    createReadStream(file).pipe(res);
};

const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch {
        return send(res, 400, 'Bad request');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, 'Method not allowed');
    }

    if (pathname === '/' || pathname === '') {
        return send(res, 200, landing, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    }

    if (pathname.startsWith('/viewer/')) {
        const rel = pathname.slice('/viewer/'.length) || 'index.html';
        if (rel === '/') return send(res, 302, '', { Location: '/viewer/' });
        const file = safeJoin(VIEWER_DIR, rel);
        if (!file) return send(res, 403, 'Forbidden');
        return serveFile(req, res, file);
    }

    if (pathname.startsWith('/data/')) {
        const file = resolveDataFile(pathname.slice('/data/'.length), url.searchParams);
        if (!file) return send(res, 403, 'Forbidden');
        return serveFile(req, res, file);
    }

    if (pathname.startsWith('/uwa/')) {
        const file = safeJoin(UWA_DIR, pathname.slice('/uwa/'.length));
        if (!file) return send(res, 403, 'Forbidden');
        return serveFile(req, res, file);
    }

    if (pathname.startsWith('/settings/')) {
        const file = safeJoin(SETTINGS_DIR, pathname.slice('/settings/'.length));
        if (!file) return send(res, 403, 'Forbidden');
        return serveFile(req, res, file);
    }

    return send(res, 404, 'Not found');
});

server.listen(PORT, () => {
    const base = `http://localhost:${PORT}`;
    console.log(`3DGS local server: ${base}`);
    console.log(`viewer : ${base}/viewer/`);
    console.log(`data   : ${DATA_DIR}`);
    console.log(`scenes : ${allScenes.length} scenes (SOG ${sogCount}, GLB ${glbCount})`);
    console.log(`landing: ${base}/`);
});













