# UWA Spatial Vivid EGSC decoder

Source: https://github.com/UHD-World-Association/spatial-vivid-web-viewer
Commit: `8702f5f92274abfd1bb4234bd320345b68894bbd`
License: MIT (see `LICENSE`)

Built artifacts:
- `splat_uwa_wasm.js/.wasm` (single-thread coordinator)
- `splat_uwa_reconstruction_wasm.js/.wasm` (reconstruction kernel)
- decoder/reconstruction worker glue

## SH0 / masked payload support

The reference decoder only decodes CPU `features_rest` when the payload has a
non-zero SH degree. The local build carries these fixes:

- `gs_decoder.cpp`: `decodeFeaturesRest = cpuOutput && descriptor_.shDegree > 0`
  (see `sh0-support.patch`).
- `SplatDecoder.worker.js`: accept CPU output with
  `decodeFeaturesRest === false` when `prepared.shDegree === 0`.
- `SphericalHarmonicsQuantization.js`: provide a harmless single-component
  range for SH0 when the ASTC fallback asks for SH ranges.

Rebuild with Emscripten using
`3DGS_Render_glb_unpack/build_wasm_windows.ps1`, then copy the four
`splat_uwa_*.js/.wasm` files from `output/` into this directory.

These files are served under `/uwa/` and used by
`supersplat-viewer/src/gsplat-glb-parser.ts` to decode
`UWA_gaussian_splatting_compression_EGSC` GLB chunks into PlayCanvas
`GSplatData`.

## GPU stream pre-pack

- `uwa-pack.worker.js` converts decoded UWA positions/scales/rotations/colors/SH into the
  exact `splatColor`/`transformA`/`transformB`/`splatSH_*` streams used by
  PlayCanvas `GSplatResource`, keeping the packing off the render thread.

