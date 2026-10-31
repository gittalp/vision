# VisionSim HDR Web 0.7 verification

## Scope

This is a region-workflow and interface update to 0.6. The desktop Beta 6.3
application is not part of the package and was not modified.

## Numerical checks: 131 passing groups / fixtures

| Suite | Passing checks |
|---|---:|
| Luminance math, FFT, CSF and response reconstruction | 13 |
| Lossless EXR HALF/FLOAT fixture comparisons | 10 |
| Crop, header and streaming-bracket preparation | 17 |
| Phone HDR, FOV and false-color checks | 22 |
| Visual crop coordinate helpers | 9 |
| Whole-field geometry and filtering | 21 |
| Polygon, angular, chromaticity and field-loss checks | 25 |
| New region book and workflow mathematics | 14 |
| Total | 131 |

The 13 luminance-math groups include one group of 18 comparisons with the
existing numerical filter reference; those cases are not counted again in 131.
The codec tests also reject truncated inputs safely.

New checks cover immutable named shapes; enclosing set subtraction; all-region
CSV with escaping; calibration refresh; mismatched measurement scopes; zero
background support; optical-center mismatch with an unchanged 180-degree FOV;
direction preservation under crop; and unchanged field-loss opacity endpoints.

## Browser checks: 42 passing stages

The 20-stage new workflow tests exercise actual drawing, polygon completion,
post-crop region saving, naming/recoloring, saved roles and contrast cards,
clearing a draft, unchanged-mask reapplication, CSV, field restriction, fixation
picking, full-circle filtering with an active polygon, both condition types,
recalibration, narrow layout and the supplied Photosphere HDR.

The retained 22-stage sample suite exercises calibration, crop/undo, corrected
HDR export/reimport, simulation, display independence, original-header-only
export, full-resolution supplied HDR/EXR, the separate JPEG bracket, a 16-JPEG
synthetic bracket, memory protection and narrow layout.

The tests reported no uncaught page errors. Original luminance PFM bytes before
and after region annotations were identical. Color tints are canvas annotations;
all numeric region measurements still use source arrays.

## Source preservation

24 existing JS modules are byte-for-byte identical to 0.6, including math.js,
geometry.js, spherical.js, conditions.js, fieldloss.js, chroma.js, io.js, exr.js,
bracket.js and regionstats.js. UNCHANGED_CORE.json contains hashes. Existing
module changes are limited to app.js and worker.js; regionbook.js is new.
The new circle-center alignment is an explicit interface option that supplies
consistent offsets to the unchanged geometry code.

## Browser environment

Chromium 144 on Linux was used with the production bundles in an in-memory
page. Only the script resource base and worker URL were substituted. A real
local HTTP navigation was attempted and was blocked by administrator policy
(ERR_BLOCKED_BY_ADMINISTRATOR), so these tests do not certify deployment headers
or the live website. Firefox, Safari, physical phones and native Windows were
not tested. The specific HDR shown in the user's screenshots was not available;
that center mismatch was reproduced numerically using the displayed offsets.
The full-resolution supplied room1 HDR/EXR and separate bracket were used for
file regressions. A new-source check verifies that the previous whole-field
measurement cannot remain on screen as a stale reading. The room's equisolid geometry in example screenshots is a
user-specified test assumption, not an independently measured lens calibration.

Run `npm test` for numerical checks. The current region interaction test is
`python qa/test_workflow_v07.py`; retained sample workflows use
`python qa/test_browser.py --mode samples --brackets /path/to/brackets`.
