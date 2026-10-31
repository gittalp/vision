# 0.4.0 - visual preparation and explicit luminance scale

## User-visible

The canvas crop toggle switches between measurement mode and visual crop mode.
Rectangle and circle tools use source pixel-edge coordinates independent of CSS
size, device-pixel ratio, and preview sampling. Selection guides never resample or
alter the numerical image. Drag inside to move, drag handles to resize, use arrow
keys for 1-pixel moves (Shift: 10), Enter to apply, Escape to discard the draft.

Circle Apply trims to an integer square bounding box and applies a circular
validity mask. Exclude outside only keeps raster dimensions. Outside-mask samples
are excluded, not averaged as zero. Cropping is not lens reprojection. The numeric
fields remain accessible under advanced disclosures. Header geometry still needs
review after preparing the crop. Projection and 180-degree coverage are not guessed.

On import, available HDR/EXR file scaling is used by default as an explicitly
unverified convention. Relative mode remains selectable; decoded SDR/phone HDR and
relative reconstructed HDR do not gain physical scene units from this setting.
The near-image banner exposes the active units and supported scale metadata.
There is a direct button to activate a supported file scale from relative mode.

## Corrections

- Circular-mask changes no longer silently discard an existing patch calibration.
- One-step undo covers crop and mask operations with their saved scale/geometry.
- Avoid double-counting the same raster in the mask-then-crop memory estimate.
- Pixel readouts disregard stale replies after a source/scale state change.
- Clear old error status after discarding pending header edits.
- Draw high-resolution guides even when a small source is enlarged on screen.
- Fit the entire image while cropping; safely bring the canvas below its toolbar.

## Scope

No changes to desktop Beta 6.3 or 6.3.1. No changes to the visibility mathematics,
FOV equations, reconstruction method, false-color mapping, or phone decoding.
The io.js change is only the exported software-version label; its decoding,
normalization, and color-weight arithmetic are unchanged.
See TEST_RESULTS.md for executed tests and remaining deployment boundaries.
