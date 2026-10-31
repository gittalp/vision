# 0.7 changes from 0.6

- One drawing/measurement toolbar; result table below the image is not a second editor.
- Session region library with names, colors, optional tints, raw shapes, measured
  scope, per-region metrics, visibility, deletion and A/B role reassignment.
- Saved A/B results and numerical contrast cards stay visible after clearing a draft.
- Clear outdated draft and whole-field readouts when loading or changing source geometry/scale.
- No fallback to stale coordinate boxes when no active selection exists.
- Complete enclosure subtraction remains source-pixel set subtraction; partial
  overlap remains as drawn. Mixed measurement scopes block comparison.
- Calibration changes remeasure named regions instead of deleting them.
- Identical image-mask reapplication preserves saved regions. Actual crop/mask
  changes clear source-coordinate selections explicitly.
- Geometry diagnostic separates angular extent from optical-center offsets.
  Operator-visible circle-center alignment updates shift/lift, not entered FOV.
- Lost-field opacity label and context help; irrelevant condition controls hidden.
- Clickable fixation picker, invalid-support guard, recenter control, and consistent
  initial/reset fixation at (0.5, 0.5). Corrected unintended 0.6 HTML defaults for
  the circle fields and fixation fields, and restored the 0.5-degree diameter step.
- All-region CSV and JSON schema v4, including scope and comparison records.
- 24 existing JS scientific/support modules remain byte-identical to 0.6.
  Changes are in app.js, worker.js, UI, documentation, and the added regionbook.js.
