# VisionSim HDR Web 0.6

## Image workflow

Open an HDR, supported EXR or photograph, or reconstruct an HDR from an aligned
JPEG exposure sequence. Crop visually when needed, confirm projection and FOV,
and inspect or anchor the luminance scale. Display settings and simulations do
not modify source measurements. The Blackmagic desktop application is separate.

## Source measurements

The **Whole valid image** figures use all valid source pixels, inside the applied
image-circle mask when enabled. A drawn region has its own results below. Crop
mode hides its circle guide when finished; **Show image-circle boundary** reveals
the guide without changing the mask.

Choose Rectangle, Circle or Polygon in the toolbar above the source image.
For a polygon, click vertices and press Enter, click the first vertex, or choose
Finish polygon. Drag vertices to refine; drag inside a completed selection to
move it. New selection starts another shape. Escape cancels an unfinished draft.

Save a target as **A**. With automatic subtraction enabled, an enclosing selection
is measured as **outer region minus A**. Save B retains that surround. Partial
overlap is not silently subtracted. Results report A/B, Weber contrast,
two-region Michelson contrast and brighter/darker ratio. This is set subtraction,
not subtraction of mean values. The validity mask always applies.

After showing a viewing field, select **Restrict measurements to applied viewing
field** to intersect regions with that field. **Measure entire viewing field**
uses native source luminance. Pixel and solid-angle-weighted means are reported
separately. Overlay colors, shading and angle-ring pixels never enter measurements.

## Simulations

The reduced-acuity/contrast-sensitivity panel has linked logMAR and Snellen 20/x
inputs. Color output combines threshold-filtered luminance with filtered CIE xy
chromaticity; luminance-only grayscale remains an option. The filtered luminance
PFM is independent of this display choice.

Automatic analysis uses the full circle for a confirmed, masked fisheye; choose
512, 800 or 1024 pixels square. Local perspective detail remains available.
Whole-field filtering blends overlapping tangent views, a local approximation
rather than an exact spherical model. The source is not resized.

Low vision condition simulations include percentage effect strength, a contracted
Guth-reference peripheral envelope, and irregular central loss (AMD-like) with
shape, offset and directional-growth controls. These are configurable visual
illustrations, not clinical disease stages or patient-specific perimetry.
Simulation resets preserve the source, crop, mask, calibration and saved regions.

## Angular annotations

The Viewing-field panel offers horizontal bands, cones, Guth-reference fields and
custom elevation limits. **Angle rings** are generated using the confirmed
projection. Default 10-degree steps mean eccentricity (angular radius) from the
optical axis. Cone-diameter labels are available: a 60-degree cone has radius
30 degrees. Choose the ring color, opacity, width, interval and maximum angle;
use either optical-axis or viewing-direction centering. Ring spacing follows the
lens mapping. Angle rings are exported with display PNGs, not numeric images.

## Outputs and source

Use Prepared HDR for the prepared source; keep analysis JSON with numeric PFM and
validity-mask exports. The optional angular-HDR conversion is for exporting a
reprojected file, not a required step before simulation. JPEG bracket merging,
response-profile reuse, false-color range controls and legends remain available.

Editable modules are in `js/`. `python build.py` rebuilds local bundles; `npm test`
runs numerical checks. Browser checks are in `qa/`. Mathematical definitions and
references are in `METHODS.html`; used-component notices are in `LICENSE_SCOPE.txt`.
