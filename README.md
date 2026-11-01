# VisionSim HDR Web 0.9.2

Maintenance update to the working 0.9.1 workspace. No new circadian calculation is enabled.

## Changes

- Explicit ON/OFF DGP low-light correction switch. Initial ON is retained; OFF is the documented engine default.
- A separate source-detection reset never changes correction, sampling, resolution, measured lux or source calibration.
- DGP is included in the UGR/VCP help, with a cautious explanation of 0.20 and values below it.
- Diabetic retinopathy simulation names the existing scattered-loss illustration. The model and saved condition ID are unchanged.
- Workspace and linked methods/help pages use a release label generated from package.json; the report records the same release.

Calibration, image crops, named-region statistics, task references, projection conversion, visibility filters and the actual evalglare engine remain as in 0.9.1. The desktop application is not part of this package.

Use index.html for the workspace, METHODS.html for methods, GLARE_GUIDE.html for glare interpretation, and TEST_RESULTS.md for tests actually run on this release. Required notices for used components are in licenses/.

For development, build.py regenerates local bundles and release labels; npm test runs the numerical/codec/engine suites. No build tools are required for a visitor to the hosted website.
