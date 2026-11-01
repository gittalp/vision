# Optional HEIC/HEIF decoder

The supplied application includes the HEIF container/color/gain-map adapter,
not the separately licensed libheif WebAssembly binary. The binary could not
be obtained in the build environment. End-to-end HEVC decoding is therefore
NOT a tested release claim.

Two ways to enable the adapter on a normal internet-connected deployment:

1. In the application, expand **Phone HDR / HEIC import** and explicitly allow
   the pinned CDN decoder. Only executable decoder code is downloaded. Image
   bytes remain in the browser worker and are never uploaded by this application.
2. For a same-origin deployment, run `python download_heif.py` (or the Windows
   launcher) on an internet-connected computer. Upload the resulting
   `libheif-bundle.js` in this vendor folder. The application tries that local
   file before the CDN. No Python is required on the web host or visitor device.

Pinned runtime: libheif-js **1.23.5**, author-documented bundled WASM build.
https://github.com/catdad-experiments/libheif-js
https://cdn.jsdelivr.net/npm/libheif-js@1.23.5/libheif-wasm/libheif-bundle.js

Native decoded RGB is requested as 16-bit interleaved data and normalized by
its reported sample bit depth. The adapter refuses missing bit-depth metadata
instead of guessing or converting HDR through an 8-bit display canvas.

Implemented adapter branches: SDR with supported ICC/nclx; PQ/HLG; legacy
Apple auxiliary HDR gain maps with required MakerNote headroom. These branches
need genuine device files and the actual codec for interoperability validation.
ISO Adaptive HDR HEIF `tmap`, backward/HDR-base gain maps, unrecognized color
profiles and undocumented gain conventions are not supported. They must not
silently be presented as decoded HDR. Explicit SDR-base fallback is available
only where the codec and container can decode the base image.

# Redistribution notices
libheif/libheif-js are LGPL-3.0 projects; their codec dependencies have their
own notices. This package does not relicense them or distribute their binary.
A deployer choosing to redistribute a binary should supply its applicable
notices and corresponding source/build information as required by the licenses.
The optional downloader records the URL, version and downloaded SHA-256; that
record is not an independently authenticated publisher signature.

Source/build provenance:
https://github.com/catdad-experiments/libheif-js/tree/v1.23.5
https://github.com/catdad-experiments/libheif-emscripten
https://github.com/strukturag/libheif
https://github.com/catdad-experiments/libheif-js/blob/master/LICENSE

Test this optional route before advertising HEIC compatibility on the live site.
A successful HEIF container inspection or a decoder-contract test is not an
actual HEVC decode test.
