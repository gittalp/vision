# Developer verification only

Website visitors do not run any of these files and need no Python/Node installation.
The compiled production bundles and browser engine are already included.

- `npm test`: numerical/codec checks and actual supplied WASM engine in Node.
- `python qa/test_glare_v09.py`: real engine in Chromium, 17 stages. Run npm test
  first to create its synthetic HDR fixtures. Its two room stages expect the
  separately supplied `/mnt/data/room1.hdr` (not redistributed).
- `python qa/test_workflow_v07.py`: retained selection/crop/calibration workflow.
- `python qa/test_package_v09.py`: final manifest and interface acceptance.

Browser scripts need Playwright and Chromium for development. They use production
bundles in an in-memory page because this environment blocks HTTP navigation.
Only delivery/worker URLs are adapted, not the calculation. Older feature scripts
remain developer regression utilities; their version suffix identifies their
origin. The obsolete absent-engine v0.8 browser tests are superseded by v0.9.
The optional native runner has independent protocol tests, not a native-engine
parity assertion. Synthetic protocol stubs are never used by the real-engine test.
