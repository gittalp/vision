# Version 0.9.1: glare guidance and optional named task

- Preserve fixed-path settings and the real uploaded evalglare 3.06 assets.
- Add brief source-grounded inline help, angular-degree readout and a linked guide.
- Label version 0.9 low-light ON explicitly as legacy; add deliberate engine-default
  and prior-setting buttons. No hidden default change.
- Derive optional source threshold from a named region's solid-angle mean times
  multiplier. Recompute from calibrated pixels in the worker, export provenance.
- Guard <=100 thresholds against native -b mode-switch ambiguity; never clamp.
- Invalidate only affected glare results when task/source/geometry/settings change.
- Explain UGR/VCP without automatically adding unvalidated severity categories
  or a visual glare halo.

## Earlier release notes

# Version 0.9

- Bundle the uploaded, unmodified evalglare.js and evalglare.wasm; record exact
  SHA-256 hashes and the observed evalglare 3.06 runtime banner.
- Connect the actual ES-module factory with verified WASM instantiation inside a
  separate cancellable browser worker. Use a fresh engine instance for each run.
- Run automatically loads the engine. No Python, Node or native Radiance required
  for browser use. Native comparison remains optional and collapsed.
- Preserve job arguments despite Emscripten callMain modifying its argument array.
- Export the real result with its check image, source CSV, check HDR and annotated
  PNG. Show engine warnings, source threshold and analysis resolution.
- Clearly distinguish image-derived illuminance from an external lux input when
  the latter is used by DGP.
- Preserve all source calibration, region, geometry and vision model mathematics;
  see UNCHANGED_CORE.json for the exact file comparison.
- Add actual-engine numerical and browser tests, including malformed files,
  corrupt/missing assets, repeated runs, cancellation and source preservation.
