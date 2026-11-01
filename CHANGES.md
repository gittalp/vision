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
