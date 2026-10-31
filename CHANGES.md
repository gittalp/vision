# 0.3.0 web-only changes

- Added reviewable EXIF/sensor/focal/equivalent FOV estimates, portrait handling,
  active-area/aspect guards, crop propagation and recorded provenance.
- Added JPEG gain-map decoding (supported Adobe/ISO/Apple XMP SDR-base forms),
  source ICC matrix/TRC interpretation, float reconstruction and all EXIF rotations.
- Added an optional, high-bit-depth HEIF adapter. Actual WASM codec is NOT bundled
  or end-to-end validated; Adaptive HDR HEIF tmap is NOT supported.
- Added educational color conditions with angular masks, deterministic spots,
  linear-RGB color-deficiency tables and source-independent export.
- Added luminance false color: linear/log range, zero-safe linear mode, editable
  legend, palettes/bands, range presets/lock, under/over handling and legend PNG.
- Retained response/streaming/crop/header/calibration/EXR and grayscale math.
  UNCHANGED_CORE.json confirms six numerical modules byte-for-byte from v0.2.
- No desktop Beta 6.3 file changed. No 6.3.1 update is included.

## Data boundaries
Phone HDR is rendered camera output, not inferred absolute scene luminance.
Educational effects are not patient-specific/clinical disease models.
A patch anchor is not independent validation. Original images should be retained.

## Verification
See TEST_RESULTS.md. New browser paths use generated gain-map fixtures, not a
survey of real phones. Live hosting, physical devices and HEVC need acceptance
checks. Actual user HDR/EXR and the unrelated bracket were tested separately.
