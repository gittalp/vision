# VisionSim HDR Web 0.4

A complete static web application. Open `START_HERE.html` for deployment and use.

## What changed from 0.3

- On-image rectangle/circle cropping with a clear on/off toggle, crosshair guides,
  move/resize handles, shaded exclusion, whole-image fit, keyboard nudging,
  explicit Apply, mask-only circle selection, and one-step undo.
- Coordinate fields remain available under Optional exact coordinates; they are
  no longer the primary preparation workflow. Crop and measurement modes differ.
- Compatible HDR/EXR imports use the available file luminance convention by
  default, prominently labeled FILE SCALE / UNVERIFIED. Relative analysis is an
  explicit import choice. Photos and relative HDR reconstructions remain relative.
- Changing an image-circle mask now preserves a measured-patch luminance scale.
  Pixel crops, masks, and header geometry do not apply a new calibration factor.
- Mask-only undo references an existing frame rather than counting that same
  frame twice in the crop memory budget.
- Numerical visibility, reconstruction, geometry, color and phone-codec modules
  listed in UNCHANGED_CORE.json are byte-identical to the 0.3 release.

## Deployment

Upload this complete `hdr-analyzer-v04` directory next to the existing website.
Serve it over HTTP(S); do not open index.html using file://. Relative JavaScript
and worker paths must remain intact. No server processing is required.
Use the included Python preview launcher only for local testing with Python.

`js/app.js` and `js/worker.js` are editable sources. Run `python build.py` to
regenerate the classic bundles, and `npm test` to run the Node numerical suites.
The bundled files do not require npm or Python for website visitors.

## Important boundaries

The update does not modify the Blackmagic desktop application or change its FOV.
It does not establish a clinical or photometric validation of your data. File
scale is not proof of calibration. Geometry is required for angular simulations,
not for comparing a retained pixel's luminance with Photosphere or a meter.
The screenshot-only d10.hdr has not been numerically compared: its bytes and a
Photosphere target reading were not supplied with the crop-tool request.

HEIC still requires its optional external codec and remains subject to the
validation limitations in METHODS.html and vendor/README.md. No new HEIC support
or clinical model is claimed by this crop/scale update.
