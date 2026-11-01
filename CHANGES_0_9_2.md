# 0.9.2 maintenance changes

User-facing changes only: one explicit DGP correction switch, independent detection reset, DGP help, diabetic-retinopathy condition label, and consistent application release identity. No camera calibration coefficients, selected-region math, projection transforms, low-vision filter equations or evalglare assets were replaced.

The previous Restore version 0.9 settings button also reset fixed threshold, merging angle, peak threshold and detection mode. The new control separation removes that ambiguity. Initial correction ON remains for reproducibility; users can switch OFF explicitly to use the documented engine correction default.

Current release labels derive from package.json. Historical reports and stable algorithm/schema tags retain their original versions. No empirical accuracy, clinical validation or circadian-analysis functionality is claimed by this update.
