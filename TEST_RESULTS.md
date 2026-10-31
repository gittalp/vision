# VisionSim HDR Web 0.5 - verification record

Verification date: 31 October 2026. This is a software and numerical verification
record, not clinical validation of the new whole-field approximation.

## Results

| Suite | Passing groups or stages |
|---|---:|
| Numerical core / reference comparisons | 13 |
| Codec fixtures | 10 |
| Image preparation / brackets | 17 |
| Metadata, phone-HDR mathematics, false color and educational functions | 22 |
| Visual-crop numerical geometry | 9 |
| New full-field / angular-mask numerical tests | 21 |
| **Total numerical groups** | **92** |
| Existing crop browser suite | 15 |
| Existing feature browser suite | 13 |
| Sample / regression browser suite | 22 |
| New complete full-field browser suite | 14 |
| **Browser regression stages** | **64** |
| Additional final targeted browser smoke | 5 |

The numerical core includes 18 image comparisons with the retained NumPy
reference fixtures. That equivalence applies to the existing planar filter,
not to the newly added whole-field approximation.

Complete browser suites passed during development. All six numerical suites
and the final five-stage UI smoke were rerun after the last changes. Exact
runtime hashes and detailed results are recorded in VALIDATION.json.

## New mathematical checks

- Pixel-to-ray and ray-to-pixel agreement, normalized viewing bases, projection
  Jacobians and radial/tangential angular sampling were checked independently.
- A 40-degree band means elevation +/-20 degrees. For a forward hemisphere its
  analytic solid angle is 2*pi*sin(20 degrees) = 2.1489759393 sr. The 800-pixel
  equidistant test gives 2.1489984948 sr.
- An 800-pixel 180-degree equidistant circle has radial Nyquist 2.2222
  cycles/degree. The same-size equisolid circle has a minimum of 1.7453
  cycles/degree at its rim. These are sampling bounds, not camera resolution.
- A 180-degree source is covered by 171 local tangent patches. Constant scenes
  remain constant, including at the circular boundary, for equidistant,
  equisolid, stereographic and orthographic/hemispherical mappings. A narrow
  20-degree circular cap is also covered by the boundary-support test.
- The measured relative-mode scale-equivariance maximum absolute discrepancy
  was 1.8311e-6 in the test's normalized units.
- Two encodings of the same analytic scene (equidistant and equisolid), evaluated
  on identical output rays, differed by RMS 1.2489e-5 and maximum 7.0572e-5
  against a base luminance of 20. This is a synthetic projection-consistency
  test, not an empirical accuracy estimate.
- Within the retained 12-degree radius of each 32-degree tangent patch, local
  perspective angular scale changes by at most 4.518% relative to its center.
  This is NOT a bound on overall model error. Context, resampling, nonlinear
  thresholding and blending add approximation.
- Guth reference masks are rotated in ray space; the binocular reference is
  constrained to the total envelope. Cone diameter and horizontal-band height
  are distinguished explicitly.

## Application checks

The full-circle source and result render at 800x800 without the angular export
operation. Simulation, educational and overlay resets retain source crop,
mask, geometry, calibration and saved ROIs. Binary masks, numeric PFM/support
exports, false-color legends, PNG comparisons and analysis JSON were exercised.
A binary viewing mask does not display a luminance legend.

The supplied Photosphere room HDR and EXR and the unrelated JPEG bracket were
used as separate examples. A 16-image synthetic bracket also completed. The
room sample was assigned an equisolid test geometry; that is not an independent
calibration of the lens. Fourteen existing scientific/support modules, including
calibration I/O, bracket reconstruction, planar filtering, crop UI, geometry,
phone decoding and false-color processing, are byte-for-byte unchanged from
0.4. The Blackmagic desktop application was not modified.

## Test environment and interpretation

Browser tests use production HTML/CSS/JavaScript bundles in an in-memory Chromium
page, replacing only resource and worker URLs. Network navigation is blocked in
this environment. Live hosting, Firefox, Safari and physical mobile devices have
not been exercised. No new end-to-end HEIC codec test is claimed.

The whole-field filter is an exploratory local tangent-patch approximation with
uniform acuity/contrast sensitivity across viewing directions. It is not an
exact spherical DeVAS implementation or a patient-specific/peripheral retinal
model. Constant preservation and synthetic projection consistency do not prove
clinical accuracy. Full numerical definitions and primary references are in
METHODS.html; per-test records are in VALIDATION.json.

## Delivered archive acceptance

The completed ZIP was extracted into a new folder. Every manifest entry was
verified, all 92 numerical groups passed there, and the five-stage production-
bundle browser smoke passed there with no page errors. Runtime bundle hashes
match those recorded in VALIDATION.json.
