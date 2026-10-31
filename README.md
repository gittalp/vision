# VisionSim HDR Web 0.5

## Image workflow

Open an HDR, supported EXR or photograph, or reconstruct an HDR from an aligned
JPEG exposure sequence. Crop visually when needed, confirm projection and FOV,
and inspect or anchor the luminance scale. Preview controls do not alter source
measurements. The original Blackmagic desktop application is separate.

## Simulations

- Automatic analysis area uses the full circle for a confirmed, masked fisheye.
  Choose 512, 800, or 1024 pixels square for the separate simulation result.
- Local perspective detail remains available for inspecting smaller directions.
- Whole-field reduced-detail filtering blends overlapping local tangent views.
  It is an exploratory projection-aware adaptation, not an exact spherical model.
- Reset visibility, Reset educational simulation, and Reset both simulations
  discard only the corresponding results/settings. Source crop, image mask,
  geometry, calibration, and saved measurement regions are retained.
- The angular-HDR conversion in Export is an optional file conversion, not a
  prerequisite for simulations or viewing-field overlays.

## Viewing-field overlays

Display a horizontal elevation band (40 degrees total means +/-20 degrees),
a central cone, Guth total-field or binocular-reference envelopes, or custom
upper/lower elevation bounds. Gaze yaw, pitch, and roll rotate the viewing region.
The reference is clipped to captured support. Shade, outline, or binary display
is available; export PNG and a binary PGM mask. These overlays do not replace
or modify the image-circle mask. Their statistics use the resampled view;
solid-angle and equal-pixel means are reported separately.

## Measurements and exports

Native source pixel/region readings and the calibrated false-color map remain
independent of all simulations. Use Prepared HDR for the source reconstruction;
use simulation PFM plus its support mask for reduced-detail numerical output.
Save Analysis JSON to retain geometry, calibration, processing parameters, and
viewing-field definitions. A preview PNG is a display image, not a luminance file.

## Code and tests

Editable modules are in `js/`. `python build.py` rebuilds the local bundles;
`npm test` runs the numerical tests. Browser tests and fixtures are in `qa/`
and `tests/`. Mathematical definitions and reference citations are in
`METHODS.html`. Component notices are listed in `LICENSE_SCOPE.txt`.
