# VisionSim HDR Web 0.4 - verification results

## Completed on the delivered code

| Suite | Result |
|---|---|
| New visual crop / scale browser checks | 15 / 15 passed |
| Retained FOV, phone-JPEG, falsecolor and educational browser checks | 13 / 13 passed |
| Core and supplied-sample browser regression | 22 / 22 passed |
| Filtering / numerical suite | 13 / 13 groups passed |
| Geometry, header preparation, streamed bracket suite | 17 / 17 groups passed |
| Retained 0.3 feature mathematics | 22 / 22 groups passed |
| New crop-coordinate / circle geometry suite | 9 / 9 groups passed |
| EXR fixtures | 10 lossless comparisons exact; 4 truncation checks passed |

The 50 browser checks include rectangle/circle drawing with actual pointer events,
move and handle resize, keyboard nudging, explicit Apply, cancellation, mask-only
mode, undo, source-coordinate correctness after CSS resizing, source/crop scales,
corrected HDR export/reimport, calibrated pixel inspection before FOV, falsecolor
independence, supported JPEG HDR, EXR import, and the separate exposure brackets.
The full-resolution room HDR/EXR and ten-JPEG bracket were used independently.
A synthetic 16-exposure sequence also passed. Source samples are not bundled.

## Photometric and geometric invariants

- The synthetic scaling fixture has EXPOSURE=2, then EXPOSURE=4, and
  COLORCORR=2 2 2. Each RGBE sample decodes to 7.96875. Normalized Y is
  7.96875 / (2 x 4 x 2) = 0.498046875, giving 89.150390625 cd/m2 when the
  Radiance 179 convention is applied. Browser import matched this result.
- Selecting relative mode, then applying file scale, gave the same result without
  double application. Geometry was not defined during this test.
- A 123.45 cd/m2 patch anchor remained unchanged after a circular mask and crop.
- Direct crop tests compare every retained luminance and RGB sample exactly.
- Crop + confirmed geometry + HDR export + reimport retained target luminance
  within the explicitly tested RGBE quantization tolerance (0.5%).
- Circle exclusion is a validity mask, not a black value in a mean calculation.
- A circle stays a circle in source pixels even as the canvas CSS size changes.
- 13 scientific modules are byte-identical to 0.3; see UNCHANGED_CORE.json.
  io.js arithmetic is unchanged; only its export software-version label changed.

## Corrections made while testing

The previous mask path reset measured-patch calibration to relative. It now keeps
the scalar. Mask-then-crop preflight no longer counts the same undo-frame buffers
twice. The crop canvas scrolls below its toolbar, fits the whole image on request,
and uses sufficiently high-resolution guides for small enlarged source images.
The crop draft survives a blocked apply when header edits are pending.
One combined regression attempt hit the tool runtime limit; the complete final
rerun finished with 22 / 22 checks passing.

## Boundary

These are implementation tests, not validation of a camera, a clinical simulation,
or a participant's vision. Chromium 144.0.7559.96 ran production bundles in an
in-memory page because HTTP navigation is blocked in this runtime. Only the test
worker/resource URLs were substituted. No live-host, Firefox, Safari or physical
touch-device acceptance test is claimed. Optional HEIC limitations are unchanged.
The screenshot's d10.hdr was not uploaded as a data file, so no claim is made that
its particular target mismatch has been independently reproduced or resolved.

Run `npm test` for numerical suites. Browser tests are documented in qa/README.md.
The full machine-readable record is VALIDATION.json. Preserve original files and
use a new deployment folder for the first acceptance check.
