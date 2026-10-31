# 0.5 changes

- Added automatic/full-circle fisheye analysis at 512, 800, or 1024 square pixels.
- Added local tangent-patch filtering with center-angle scaling, normalized
  angular blending, explicit captured-rim boundary support, and sampling warnings.
- Kept the existing local perspective detail mode and unchanged clinical/filter core.
- Extended educational angular masks and local angular blur to circular output.
- Added visibility, educational, combined-simulation, and viewing-overlay resets;
  these preserve calibrated source data and saved source measurement regions.
- Added elevation bands, cones, Guth total/binocular reference envelopes, custom
  vertical limits, gaze rotation, overlay/PGM export and resampled region statistics.
- Added full-field simulation support-mask and labeled comparison exports.
- Kept bracket reconstruction, HDR/EXR import, source cropping/calibration,
  FOV/header preparation and false-color source measurement routes.
- Simplified public introduction, README and component notices; retained required
  adapted-component attributions. Mathematical qualifications are in Methods.

The desktop Blackmagic application is not part of this update.
