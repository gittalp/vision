# VisionSim HDR Web 0.9.2 verification

Date: 1 November 2026. Baseline: the delivered VisionSim HDR Web 0.9.1 ZIP.

## Changes

- Replaced version-named glare reset presets with one explicit DGP low-light ON/OFF switch and a separate source-detection reset.
- Kept initial low-light correction ON for continuity. OFF passes the documented engine correction default. No hidden change to previous analysis settings.
- Added DGP interpretation, including the meaning and evidence boundary of 0.20, to the UGR/VCP help and linked guide.
- Renamed the existing `diabetic` condition to Diabetic retinopathy simulation in controls, result metadata and exported captions. Its seeded effect arithmetic is unchanged.
- Unified current visible workspace/method/help/reported version to 0.9.2 via build-time stamping from package.json. Historical evidence and stable component/schema tags remain historical.
- No circadian estimator is enabled. The supplied studies are assessed in a separate feasibility note.

## Executed checks

The existing numerical suite completed successfully: 174 groups plus 10 lossless EXR fixtures (184 total). Four additional codec truncation assertions are part of that suite. The six new maintenance groups passed: current-release identity, explicit switch/reset separation, DGP help, legacy seeded-image output equivalence after condition relabeling, l+/l- argument isolation, and absence of an uncalibrated circadian calculation.

The 17-stage maintenance browser suite passed using the genuine uploaded evalglare WASM. It covers task selection, calibration/region preservation, task-threshold guards, current version markers, DGP help, the renamed condition, and narrow layout. The retained 20-stage crop/measurement/field/fixation regression also passed, including the independently supplied Photosphere room HDR.

The correction-only browser fixture produced DGP 0.182501 with correction ON and 0.265580 with correction OFF. Both reported 199.457081 lx. The calibrated prepared HDR was byte-identical; UGR, VCP, source solid angle and image statistics were unchanged. These numbers describe a synthetic regression fixture, not the user's room or an accuracy study.

The unchanged scattered-loss float32 before/after outputs match stored hashes from 0.9.1 under an identical seed and parameters. The source luminance PFM remains byte-identical across glare controls and condition simulation. The renamed result is an illustrative representation, not an independently validated retinopathy model.

## Preserved components

31 existing JavaScript files are byte-for-byte unchanged from 0.9.1. Changes are app interface wiring, glare interface wiring, the condition display-name string, worker release identity, and their regenerated bundles. The uploaded evalglare.js, evalglare.wasm and vendor manifest are unchanged. UNCHANGED_CORE.json records the file-by-file baseline and current hashes.

No camera calibration coefficients, projection transform, source selection/contrast calculation, CSF or chromaticity filter, HDR merge algorithm, glare conversion or engine mathematics were modified. Desktop Beta 6.3 was not edited.

## Browser and empirical scope

Chromium executes production bundles in an in-memory document, with static asset/worker URL delivery adapted for this environment. A direct localhost navigation attempt was blocked by administrator policy. The engine is real; no substituted glare scores are used. These tests do not validate live hosting, Firefox, Safari, phones, or native-Windows parity. Previously recorded broad release evidence is kept as historical evidence, not counted as newly run tests.

No independent spectral or circadian measurements were supplied or performed. No clinical or field accuracy claim is inferred from these regressions.

## Reproduction

For development, run `python build.py`, then `npm test`. Browser tests require Playwright and Chromium: `python qa/test_maintenance_v092.py`, `python qa/test_workflow_v07.py`, and `python qa/test_package_v09.py`. The workflow's Photosphere test expects the separately supplied room1.hdr and does not redistribute it. Website visitors require neither Python nor Node.

The delivery manifest excludes generated qa-output, Python caches and itself. Verify MANIFEST_SHA256.json against the extracted folder before making local edits.

## Extracted-package acceptance

The complete 190-group/fixture numerical suite was rerun from the extracted delivery folder and passed, including the real WASM engine and six maintenance groups. Six additional packaged-browser stages passed. All 150 manifest-listed files matched their hashes. The latter count identifies shipped files, not test cases. After adding this verification record, only documentation/manifest bytes were repackaged; tested application and engine bytes remained unchanged.
