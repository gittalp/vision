# VisionSim HDR Web 0.3.0 - verification report

Release scope: web tool only. Original desktop Beta 6.3 remains untouched.

## Completed tests

| Suite | Result | What the result supports |
|---|---|---|
| Retained math suite | 13 groups passed | CSF/FFT/EDT/scaling/geometry and 18 retained NumPy-reference comparisons |
| Retained EXR/codecs suite | Passed | Lossless scanline fixture comparisons, HDR checks and malformed input guards |
| Retained preparation suite | 17 groups passed | Crop/VIEW/mask/calibration and two-pass streaming behavior |
| New feature math suite | 22 groups passed | FOV, EXIF orientation, false-color math, gain reconstruction, color conditions and HEIF contract |
| Production-bundle sample/regression browser suite | 22/22 stages passed | Existing workflows, full provided HDR/EXR, separate ten-frame bracket, 16-frame synthetic merge |
| New production-bundle feature browser suite | 13/13 stages passed | FOV adoption, range/legend PNG, source invariance, all conditions, phone JPEG HDR and explicit fallback |

The earlier core-only run also passed 16 stages. These overlap with the 22-stage
run; they are not 38 independent tests. A first combined sample run hit the
execution time limit; the complete rerun passed all 22 stages. There were no
uncaught page errors in completed browser runs.

## Important numerical checks

- Full frame 36 x 24 mm with actual focal length 24 mm gives horizontal
  73.73979529168804 degrees and vertical 53.13010235415598 degrees.
- Resizing to the same aspect leaves FOV unchanged; portrait swaps those axes.
  In-app crop propagation follows the retained geometry engine.
- Linear 0-100 with four intervals produces 0,25,50,75,100. Log 0.1-1000 with
  four intervals produces 0.1,1,10,100,1000. Zero log minimum is rejected.
- Generated gain tests reconstruct approximately 4.217 relative units from an
  SDR code near 192 with a gain of 8. The browser tests require values above 4.
- Gain gamma, offsets, rational fields and unsupported directions are checked.
- Apple XMP headroom uses log2 gain, separate from the legacy HEIF convention.
- Eight EXIF orientations are exact permutations; source arrays are unchanged.
- Educational effects are deterministic with a fixed seed, preserve the source,
  and return identity at zero amount. Constant-image blur retains constants.
- False-color pixels are invariant to display EV, and source measurement JSON
  remains unchanged after display or condition operations.

## Samples

The supplied `room1.hdr` and `room1.exr` are Canon/Photosphere examples. They were
not interpreted as Blackmagic camera captures. The ten-JPEG bracket from
`sample_exp_bracket.zip` was tested as its own unrelated scene. Its reconstruction
was 1024 x 683, with 19 unsupported pixels flagged rather than treated as black.
The same browser run subsequently reconstructed a 16-exposure synthetic set,
showing that the earlier 12-frame restriction is absent.

## Phone validation boundary

Adobe/XMP, ISO and Apple-XMP gain fixtures contain generated JPEG base/gain planes
and metadata. Their real browser JPEG decoding, profile/transfer operation and
floating-point merge passed. They are not consumer-device interoperability
certificates or complete MPF/GContainer conformance fixtures.

HEIF container inspection used a native-generated uncompressed HEIF file.
PQ/HLG/headroom arithmetic was tested numerically. RGB16 bit-depth/stride handling
was checked using a decoder-contract double following the upstream interface.
**The libheif WASM binary was unavailable, so actual HEVC end-to-end decoding was
NOT tested.** The optional adapter is conditional and unsupported HDR variants
fail explicitly. Do not describe HEIC compatibility as validated from these tests.

## Browser and deployment boundary

Production app/worker bundles ran in an in-memory Chromium document. Worker and
resource-base URLs were substituted because network navigation is unavailable
in this environment. No live-host deployment, Firefox/Safari run or physical
phone test was performed. A 390-pixel window had no horizontal overflow. Exported
legend PNGs and desktop/mobile screenshots were visually inspected.

## Core preservation

Six core modules are byte-identical to v0.2: `math.js`, `geometry.js`, `bracket.js`,
`exr.js`, `reproject.js`, and `resources.js`. Exact hashes are in UNCHANGED_CORE.json.
No desktop files are in this release. Software checks are not camera/meter,
human-observer, clinical, hazard, glare or accessibility-code validation.
