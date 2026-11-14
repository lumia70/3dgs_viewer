# 3DGS Viewer Demo

Local demo harness for PlayCanvas `supersplat-viewer`, including UWA EGSC GLB decoding, scene catalog generation and a small static server.

## Workspace layout

This repository expects two sibling directories in a workspace:

```text
<workspace>/
  playcanvas/
    supersplat-viewer/      # viewer source; build the dev_lod branch here
  data/                     # LOD datasets (not tracked)
  <this-repo>/
```

`data/` and `playcanvas/` are intentionally outside this repository. The LOD scene roots are configured in `prepare-scenes.mjs` (`SCENE_ROOTS`); point each entry at a directory under your data root.

## Prerequisites

1. Build the viewer (the local `dev_lod` branch contains the GLB/UWA changes):

   ```powershell
   cd <workspace>/playcanvas/supersplat-viewer
   npm install
   npm run build
   ```

2. Place the LOD scenes under `<workspace>/data` and update `SCENE_ROOTS` in `prepare-scenes.mjs`.

## Run

```powershell
cd <this-repo>
npm run prepare
npm run serve
```

Open <http://localhost:8080/>.

`npm run prepare` scans the configured scene roots and writes:

- `<scene>/sog/lod-meta.json`
- `<scene>/glb/lod-meta.json`
- `settings/<scene>.json`
- `scene-catalog.json` (ignored; diagnostic report)

The viewer-facing URLs use `lod-meta.json?format=sog` / `?format=glb`, which the server maps to those generated manifests.

## UWA decoder

`uwa-decoder/` is the runtime for `UWA_gaussian_splatting_compression_EGSC` GLB chunks:

- `splat_uwa_wasm*.js/.wasm` — coordinator (single-thread + pthread)
- `splat_uwa_reconstruction_wasm*.js/.wasm` — reconstruction kernel
- `SplatDecoder*.worker.js` / `SplatReconstruction.worker.js` — worker glue
- `uwa-pack.worker.js` — pre-packs PlayCanvas `splatColor` / transform / SH streams off the render thread
- `sh0-support.patch`, `README.md`, `LICENSE` — source patch, provenance and MIT license

The artifacts were built with Emscripten from the MIT-licensed
<https://github.com/UHD-World-Association/spatial-vivid-web-viewer> reference implementation; see `uwa-decoder/README.md`.

The server sets `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy` and `Cross-Origin-Resource-Policy` so the pthread coordinator can use `SharedArrayBuffer`.

## Viewer options

The server forwards the usual viewer query parameters. Useful demo flags:

- `?format=sog` / `?format=glb` — select the generated manifest variant
- `?perf` — log GLB decode/pack/build timings
- `?legacy` — use the old main-thread GPU stream packing instead of `uwa-pack.worker.js`
- `?budget=1` — cap the splat budget in millions
- `?moveSpeed=60` — fly/walk speed in m/s; defaults to a scene-size-scaled value
- `?debug` — viewer debug panel (on by default on the landing page)
- `?webgl` — force the WebGL2 renderer

## Notes

- `settings/` is generated locally by `npm run prepare` and is intentionally not tracked; rerun it after changing a scene's `default.scene.json`.
- The original UWA decoder source and WASM build are external; `uwa-decoder/` contains the local patched build used by this demo.
- `data/` is not versioned; generated manifests and settings can be recreated with `npm run prepare`.
