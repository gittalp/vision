# VisionSim HDR Web 0.9 - actual browser evalglare verification

## Engine and release status

**The actual supplied evalglare JavaScript and WebAssembly files are bundled and
were executed in Chromium. No Python or native Radiance installation is required
for normal website use.** The runtime reports:

`evalglare 3.06 release 01.10.2025 by J.Wienold, EPFL`

The two supplied files are unmodified. SHA-256 hashes and the observed banner are
in `vendor/evalglare/manifest.json`. The exact source commit and compiler settings
were not supplied and are not inferred from the banner. The uploaded Windows
executable was not run and is not bundled. No Windows/WASM equivalence is claimed.
The desktop Blackmagic Beta 6.3 application was not modified.

## Numerical / codec / real-engine tests: 170 passing groups or fixtures

| Suite | Groups / fixtures |
|---|---:|
| Luminance, FFT, CSF, response calculations | 13 |
| EXR HALF/FLOAT fixtures | 10 |
| Crop/header/streaming bracket preparation | 17 |
| Phone HDR, FOV, false color | 22 |
| Visual crop helpers | 9 |
| Whole-field geometry and filtering | 21 |
| Polygons, chromaticity, angular rings, field loss | 25 |
| Named-region and workflow calculations | 14 |
| Glare preparation, projection, interchange | 24 |
| **New actual evalglare WASM tests** | **15** |
| **Total** | **170** |

The first suite includes a group containing 18 filter-reference comparisons;
those internal cases are not counted again. Run `npm test` for these developer
checks; Node is a test tool, not a website visitor dependency.

The 15 real-engine checks cover exact asset hashes, the version banner, uniform
hemispheres with no sources, one and two synthetic bright caps, source solid angle,
repeated runs, low-light correction, external illuminance, threshold effects,
check-image decoding, argument and input checksums, malformed input, allowed
argument validation, and calibrated equisolid-to-angular preparation. These are
actual engine results, not protocol stubs.

For a uniform hemisphere, image-derived illuminance is checked against pi times
the luminance decoded from the engine input (including ordinary RGBE quantization).
The independently calculated DGP is checked using the 3.06 implementation's
coefficients and low-light expression. Bright-cap source areas are compared with
2*pi*(1-cos(radius)); finite-raster tolerance is 1.2% for the tested cap. Low-light
test results are mathematical checks, not clinical comfort validations.

## Photometry / projection preparation

At 800 x 800, before HDR encoding, a uniform 100 cd/m2 forward hemisphere gives:

| Quantity | Analytical | Prepared raster |
|---|---:|---:|
| Solid angle, sr | 6.28318530718 | 6.28315769098 |
| Eye-plane illuminance, lux | 314.159265359 | 314.159283260 |

The encoded RGBE test patch reads 100.337891 cd/m2; the actual engine returns
315.221059 lux. The test compares with the encoded luminance, not an incorrect
claim of lossless RGBE. Original floating-point source measurements are untouched.

## Browser regression: 53 passing stages

- Existing post-crop/named-region workflow: 20 stages.
- Retained core workflow including 16-frame brackets, exports and budget controls:
  16 stages.
- **New actual browser-engine workflow: 17 stages.**

The new workflow includes automatic engine loading on Run, source PFM byte
preservation, named polygon/target-surround records, exact repeat results,
viewing-field/ring annotation independence, export/reimport of real metrics and
check images, source CSV and diagnostic PNG, missing/corrupt-asset recovery,
cancellation and rerun, Reset, warnings, stale-setting handling, the supplied
Photosphere HDR, an explicit source-threshold change, and narrow-layout checks.
No mocked calculation returns metrics. Only static file transport and worker URL
resolution are adapted to the restricted test environment.

Browser: Chromium 144.0.7559.96. Tests run the production bundles in an in-memory
page because HTTP/file navigation is administrator-blocked. The actual uploaded
WASM, loader, worker adapter and data processing execute. Live-host delivery,
Firefox, Safari, physical phones and real-memory limits on user devices are not
verified by these tests.

## Actual sample runs

The Photosphere room HDR was prepared at 1000 x 1000 with an explicitly assumed
180-degree equisolid source geometry. This is not independent lens verification.
At the 2000 cd/m2 fixed threshold it has zero detected glare sources. At an
explicit 600 cd/m2 diagnostic threshold it has four. Both runs return the engine's
low-brightness/out-of-range warnings; the UI displays them. The threshold was
changed to exercise detection, not to select a preferred comfort classification.
The interface records threshold, resolution, engine version and full raw output.

For limited-view runs with external illuminance, evalglare's detailed E_v field
continues to report image-derived illuminance while DGP uses the supplied value.
The UI explicitly distinguishes those quantities and does not relabel one as the
other. Source settings and external lux are retained in exported results.

## Same-engine cross-runtime checks: 3 passed

On identical prepared bytes and arguments, Chromium and Node (using the exact same
supplied WASM) produced identical numeric stdout for the one-source fixture and
both room runs. This checks integration consistency; it is not an independent
native-executable comparison.

## Preservation and packaging

**28 existing source modules are byte-for-byte unchanged from 0.8.**
`UNCHANGED_CORE.json` records their hashes and the few changed glue modules.
The supplied engine files are likewise byte-identical to the uploads. Calibration,
region membership, projection, luminance/CSF filtering, field-loss, bracket and
false-color mathematics have not been changed for this integration.

`MANIFEST_SHA256.json` records the delivered files. Final extracted-package checks
are recorded separately in the accompanying evidence archive. Test evidence is
not part of the website's runtime. Optional native-comparison scripts remain
separate from the browser route and were not used to compute the browser results.

## Diagnostic meaning

Source-check images and viewing overlays are display diagnostics. Overlaying a
field does not recalculate DGP. Membership currently refers to source centroids,
not full footprint overlap. A score depends on radiometric validity, adequate
field coverage, projection and source detection settings; a successful software
run alone does not establish capture quality or metric applicability.
