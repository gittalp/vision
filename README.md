# VisionSim HDR Web 0.9.1

Glare calculation now runs directly in the browser using the included
evalglare 3.06 JavaScript/WebAssembly files. No Python, Node, local Radiance,
Windows executable, server calculation, or image upload is required.

## Prepare the source

Open an HDR, supported EXR or photograph, or reconstruct an HDR from an aligned
JPEG bracket. Crop or apply the image-circle mask when needed, then confirm the
projection and geometry. File-scale and measured-patch calibration remain
separate from preview controls. The desktop Blackmagic application is not part
of this update.

## One region-measurement workflow

Use **Measure regions** immediately above the source image. Crop mode is a
separate mode; turn it off before measuring. Choose Rectangle, Circle or Polygon.
For a polygon, click vertices, then press Enter or Finish polygon. The completed
selection's luminance appears immediately in the same toolbar.

Enter a region name and annotation color. **Save named region** retains it in the
current session. **Save as A (target)** or **Save as B (surround)** also assigns a
comparison role. Saving ends that draft, so the next drag draws a new region
instead of moving the saved one. **Clear draft** does not delete saved records.

The results panel below the image is a list, not a second drawing tool. It shows
mean, median, minimum, maximum, standard deviation and valid-pixel count. An
explicit Solid angle (sr) column reports the same selected pixel set. Confirmed
geometry is required; a solid-angle-weighted mean remains separately labeled.
Rename or recolor a row, hide its annotation, load its shape as a new draft, assign
A/B, or delete it. Use the Tint opacity control to distinguish multiple regions.
Annotation pixels never enter the measurements.

## Contrasts and surrounding regions

Save the target as A, then select a larger outer area and save it as B. With
automatic subtraction enabled and complete pixel containment, the background is
B minus A. Otherwise B is used as drawn. The saved B row reports the subtracted
background when that comparison is active; the original outer shape is retained.
The panel reports A/B, brighter/darker ratio, Weber (A-B)/B, and two-region
Michelson abs(A-B)/(A+B), using mean luminances. Undefined denominators do not
produce a numerical contrast value.

Any two saved regions can be assigned to A/B without redrawing. A and B must
have matching measurement scopes; a field-restricted region is not silently
compared with a differently restricted region.

After showing a viewing overlay, **Select / measure on source image** returns to
the same editor. Check **Restrict new measurements to applied viewing field**
when that intersection is intended. The selected field is stored with each
region. **Measure entire viewing field** reads native source pixels; shade and
mask colors are excluded, not counted as black.

## Geometry and optical center

Horizontal/vertical FOV and optical-center offsets are different parameters.
A centered circular image may have the correct 180-degree FOV but stale shift or
lift. The geometry panel now reports the two centers and their difference.
**Align optical center to the applied image circle when applying geometry**
updates shift/lift explicitly without changing the entered FOV. Uncheck it to
retain manual offsets. The circle helper computes both FOV and center as a draft.
Measurement polygons never define the image circle or optical axis. Very small
floating-point display residues are formatted as zero.

## Condition opacity and fixation

For peripheral, central (AMD-like), or scattered field loss, **Lost-field opacity
(%)** is the old Effect strength control with a clearer label. Zero adds no loss
shading; 100 blocks fully affected parts of the mask. The soft transition remains
graded. This acts in linear image values before the common display transform,
not as a screen-alpha control. Set Contrast retained and Saturation retained to
1 to isolate field shading. **Angular field retained** changes peripheral shape
size, not transparency. Viewing-overlay opacity affects only the separate
annotation layer, not the condition simulation.

For AMD-like central loss, use diameter for base size, irregularity for boundary
variation, elongation for aspect ratio, offset for displacement from fixation,
and direction/growth for its vector and asymmetry (0 degrees right, 90 up).
These remain configurable representations, not individual clinical measurements.

Fixation coordinates span the simulation image: X increases left to right, Y top
to bottom, and (0.5, 0.5) is its center. On a circular view the square's corners
are outside captured support. **Choose fixation on image** provides a clickable
preview; invalid points are rejected without replacing the previous fixation.
**Center fixation** restores (0.5, 0.5). Run the condition again to apply changes.

## Saving results and retaining work

Named regions persist for the current source/session through simulation resets,
geometry confirmation, preview edits and calibration changes. Calibration edits
recompute their luminance values. Reapplying an identical image mask keeps them.
A genuinely new crop, changed image mask, or new source clears the old region
coordinates. Save JSON/CSV before changing the source or closing the page.

Regions CSV now includes every saved named region, not just A/B. Analysis JSON
includes region shapes, names, colors, measurement scope and comparison results.
The existing source-HDR, float32 PFM, validity mask, response-curve and preview
exports remain available. The optional angular HDR conversion is not required
before simulation or measurement.

For developers only (not required to use or upload this website): editable code is in `js/`. `python build.py` rebuilds the local bundles; `npm test`
runs numerical checks. `qa/test_workflow_v07.py` tests the current interaction
workflow; `qa/test_browser.py --mode samples` covers retained sample workflows.
See TEST_RESULTS.md for the checks actually performed and METHODS.html for the
model definitions and used-component notices.

## Optional glare analysis

Confirm the source calibration and geometry. **Prepare / convert glare copy**
creates a separate angular 180-degree image for a confirmed fisheye, including
real equisolid conversion. Press **Run evalglare (in browser)**. The engine is
loaded and verified automatically; no separate installation check is needed.

Inspect DGP, other indices, the colored source check image and the source table
with steradians. Low-brightness and other engine warnings are displayed. Current
fixed detection threshold and prepared resolution are recorded. **Skip glare**,
**Cancel glare operation** and **Reset glare only** do not change the calibrated
source or named regions. Detection can be more expensive for some source patterns;
Cancel terminates only the glare worker.

Save the source CSV, engine result JSON (including its check image), check HDR,
or displayed diagnostic PNG. Current viewing masks and angle rings may be drawn
on the result without changing DGP. Source-in-field labels describe centroids,
not complete source footprints.

The optional external comparison-job exporter is under a collapsed advanced
section. Only that independent comparison workflow uses a native executable and
Python; it is not part of normal browser use. See GLARE.html for the method and
TEST_RESULTS.md for actual validation scope.

This product includes the evalglare software, developed at Fraunhofer ISE and
EPFL by J. Wienold. This product includes Radiance software developed by the
Lawrence Berkeley National Laboratory. Used-component notices are in licenses/.

## Glare parameter guidance and saved task reference (0.9.1)

Short help is attached to the conversion, threshold, peak, merging and low-light
controls. See GLARE_GUIDE.html for source-linked explanations and the distinction
between the older manual and the 2024 update. The fixed path retains version
0.9 settings. Use documented engine defaults explicitly switches the legacy
low-light correction OFF without changing the image or its illuminance.

A saved rectangle, circle or polygon can supply the angular task mean times a
multiplier (initially 5). The scalar is passed to unchanged evalglare as -b > 100.
The full hemisphere remains the analysis view; no task-dependent gaze rotation
or adaptation model is introduced. Thresholds at or below 100 cd/m2 are rejected
rather than clamped or misinterpreted as scene-average multipliers. The selected
shape's saved viewing field is used, but A/B subtraction is not applied to tasks.

Glare JSON now includes the prepared-analysis metadata and task provenance.
Changing the task measurement invalidates stale results; annotation-only edits
do not. Existing selection and calibration modules are unchanged.
