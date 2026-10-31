# VisionSim HDR Web 0.3.0

Open START_HERE.html for deployment and use. This is a complete static website
folder, not a patch. It does not modify the desktop VisionSim application.

## Production
Host this complete folder over HTTP(S). JavaScript/worker paths are relative.
The optional HEIC codec is separate; see vendor/README.md. Core formats need
no CDN, WebAssembly, GPU, server computation or account.

## Development
- `python build.py` rebuilds local production JS bundles (Python stdlib only).
- `npm test` runs numerical, codec, geometry, streaming and feature tests
  (Node built-ins only; no npm install).
- `qa/test_features_v03.py` and `qa/test_browser.py` need Python Playwright and
  Chromium. The harness uses in-memory navigation because HTTP navigation was
  unavailable in the build environment. Inspect TEST_RESULTS.md.
- Do not replace a real HEVC test with the HEIF contract double.

Files: METHODS.html, TEST_RESULTS.md, CHANGES.md, UNCHANGED_CORE.json,
LICENSE_SCOPE.txt, licenses/, vendor/, source in js/, tests/.
