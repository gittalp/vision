# VisionSim HDR Web 0.9.1: verification and change scope

Release date: November 1, 2026. Baseline: delivered 0.9.0. Browser engine: evalglare 3.06.

## Completed checks

- 170 existing numerical/codec/geometry/engine groups or fixtures passed in split
  invocations. The initial aggregate command hit a runtime limit during engine
  tests; the complete actual-engine suite then passed separately.
- 14 new groups passed: task angular averaging, source immutability, stored-field
  scope, calibration scaling, <=100 mode-switch guard, invalid-input handling,
  annotation-independent fingerprints, original argv preservation, identical
  prepared HDR across detection-reference changes, real-WASM illuminance
  preservation, correction ON/OFF separation, aligned vta sampling and constant
  fields at 1x1, 2x2 and 4x4.
- 20 existing browser workflow stages passed: actual visual crop, named polygons,
  subtraction, visible contrast, region annotation, recalibration, field masks,
  fixation picker, full-field vision simulations, reset and room-HDR loading.
- 17 existing real-engine browser stages passed: actual WASM calculation,
  repeatability, exports/import guards, missing and tampered asset handling,
  cancellation, zero-source warnings, source preservation, real Photosphere-room
  reprojection and diagnostic sources.
- 13 new browser stages passed: saved task selection, displayed scalar reference,
  actual engine invocation, task provenance exports, tint/rename preservation,
  stale-state invalidation, modern and legacy buttons, reuse of the existing
  measurement editor, low-threshold rejection and fixed-path recovery, and
  narrow layout. The final text/cache-key build passed this suite again.

Numerical total: 184 groups/fixtures (not 184 independent clinical experiments).
Browser regression total: 50 stages (before extracted-package acceptance).

## Source preservation

31 existing JavaScript files are byte-identical to 0.9.0, including the
calibration/image I/O, selections and region calculations, projection geometry,
reprojection, luminance/CSF filtering, field-loss models, bracket reconstruction,
false-color calculations, glare preparation and engine invocation. The generated
glare-worker bundle is also unchanged. Both uploaded evalglare assets retain
the exact original bytes and manifest checksums.

Changed existing source modules: app.js, worker.js and glareui.js. The first two
only connect the optional task path, state changes, and analysis-report metadata.
The new glaretask.js adapter computes and guards the scalar. App/processing
bundles are regenerated. No engine source or scientific-core rewrite.

## Boundaries

Tests used the genuine supplied WASM engine in Chromium, with in-memory document
and asset delivery because live navigation is restricted. No live-host, Firefox,
Safari, physical-phone, or Windows-native parity claim is made. Screenshots and
mathematical fixtures establish implementation behavior, not empirical glare
prediction accuracy. User-reported meter comparisons are not regression fixtures.

The older manual and newer slides disagree about the historical low-light
*default*. The update records both correctly; it does not silently toggle the
operator's setting or reinterpret the meter measurement. Native -t is not
implemented as arbitrary polygons: the new option explicitly uses a scalar
computed from the saved shape, passed via -b > 100. This version does not claim
psychophysical validation of arbitrary task boundaries or adaptation fields.

See GLARE_GUIDE.html and DOCUMENTATION_ADDENDUM_0_9_1.md for methods and sources.
The earlier 0.9 test report is retained as TEST_RESULTS_0_9_HISTORICAL.md.
