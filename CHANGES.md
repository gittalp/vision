# 0.6 changes from 0.5

- Separate whole-valid-image and selected-region statistics; hide crop guide when
  cropping is off, with an independent guide-visibility control.
- Add rectangle, circle and editable polygon measurement selections; pixel-level
  containment check and explicit outer-minus-target surround measurement.
- Measure regions intersected with the active angular field, or the whole field,
  directly from native source pixels. Add independently labeled angular weights.
- Add synchronized Snellen 20/x and logMAR controls.
- Add color output with CSF-filtered xy chromaticity and unchanged luminance-core
  output; retain grayscale. Whole-field color uses the existing local-patch approach.
- Rename condition UI and exports; effect strength is shown as percent.
- Add contracted Guth total/binocular peripheral fields and irregular central
  masks with elongation, offset and directional growth, all defined on rays.
- Add projection-aware 10-degree angular rings, selectable radius/diameter labels,
  centering, color, opacity and line width; support annotations on perspective views.
- Preserve calibration, pixel arrays, crop geometry and saved regions across
  annotations and simulation resets. Update HDR SOFTWARE version text only.
- Retain all existing image import, bracket, calibration, false-color and crop
  workflows. Required component notices remain in place.
