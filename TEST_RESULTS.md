# VisionSim HDR Web 0.6 verification

## Build and environment

Source: VisionSim HDR Web 0.5, updated independently of desktop Beta 6.3.
The browser tests execute the production application and worker bundles in an
in-memory Chromium page on Linux. Only document/resource base and worker URLs
are substituted. The uploaded folder has not been tested on the live host,
Firefox, Safari, a physical phone or native Windows. Narrow-width tests use
Chromium viewport resizing, not physical-device certification.

## Numerical checks: 117 passing groups/comparisons

| Suite | Passing groups |
|---|---:|
| Luminance filter, FFT, CSF and earlier math | 13 |
| Lossless EXR decoder fixtures | 10 |
| Crop, header, streaming-bracket preparation | 17 |
| Phone HDR, FOV and prior feature mathematics | 22 |
| Crop UI coordinate helpers | 9 |
| Whole-field geometry, tangent filter and overlays | 21 |
| New regions, angles, chromaticity and field-loss shapes | 25 |
| Total | 117 |

The codec suite also checks four truncated inputs fail safely. The earlier math
suite includes 18 NumPy-reference filter comparisons (maximum absolute mismatch
zero in the fixtures). These are regression checks, not new clinical validation.

The new 25 groups cover Snellen/logMAR round trips; rectangle/polygon agreement;
concave polygons; invalid/self-crossed polygons; exact set-difference counts and
ratios; partial overlap; empty/masked support; positive scale invariance;
field-intersection membership; analytic solid angles; all five projection
mappings for angle rings; shrinking equisolid gaps; radius versus diameter;
off-axis ring coordinates; Guth symmetry/asymmetry and projection invariance;
monotonic angular contraction; offset central masks; zero effect and determinism;
CSF chromaticity weights; uniform color; exact target-luminance reconstruction
within floating-point tolerance; high-frequency chroma attenuation; input bounds.

## Browser regression: 76 passing stages

| Suite | Passing stages |
|---|---:|
| Existing core workflow, including 16-image bracket | 16 |
| Existing crop/calibration workflow | 15 |
| Existing FOV, phone JPEG and false-color features | 13 |
| Existing whole-field, overlay and reset workflow | 14 |
| New precision measurement and simulation workflow | 18 |
| Total | 76 |

The new browser checks include drawing and refining polygon selections, saving
A, automatic enclosing-surround subtraction, explicit handling of partial
overlap, guide visibility and clear selection, Snellen synchronization, native
field measurements, selections intersecting fields, colored rings and annotated
exports, alternate cone-diameter convention, whole-circle color and grayscale,
Guth-shaped peripheral loss, irregular AMD-like central loss, isolated resets,
source preservation, narrow layout and the supplied Photosphere room file.
No uncaught page errors were recorded in these suites.

## Key invariants and observed fixtures

- Source PFM before and after field overlays/rings is byte-identical.
- Filtered luminance PFM is byte-identical between color and grayscale mode.
- Source calibration, geometry, dimensions, mask and summary remain unchanged by
  simulations and display annotations.
- Simulation reset preserves saved A/B region measurements as well as calibration.
- Crop and mask preserve the Photosphere scale, as in the previous release.
- Source-region means use original native luminance values, never overlay pixels.
- The supplied room HDR was tested with explicitly assumed equisolid 180-degree
  geometry; this is not an independent calibration of its lens.
- JPEG bracket examples are a different scene from the room HDR/EXR and are
  treated independently.

## Changes to scientific components

Thirteen existing JavaScript modules are byte-identical to 0.5, including the
luminance/CSF core, JPEG bracket reconstruction, projection geometry, EXR decoder,
phone HDR decoder, crop helpers, FOV calculator and false-color mapper. Exact
hashes and changed-file lists are in UNCHANGED_CORE.json. In io.js the only change
is the exported SOFTWARE version text, not image decoding or calibration.

Color processing adds an explicit xy-chromaticity filtering path and documented
gamut handling. Peripheral and central masks add configurable angular geometry.
Whole-field processing remains a local-tangent approximation. Successful
numerical tests do not make those additions patient-specific or clinically
validated. See METHODS.html for formulas, sampling and color/gamut definitions.

## Packaged-copy verification

MANIFEST_SHA256.json records each packaged file except the manifest itself.
PACKAGED_VERIFICATION.json, delivered with the evidence, records a fresh
extraction/hash check, numerical rerun and browser acceptance run. Detailed
VALIDATION.json contains the source-build test records and environment notes.
