# Documentation addendum to the version 0.9 technical report

This release adds application-interface guidance and an optional task-reference
adapter. The version 0.9 mathematical core and browser engine remain the baseline.

## Detection reference

For saved source region R (intersected with its saved field and valid support),
L_task = sum(L_i * dOmega_i) / sum(dOmega_i); threshold = m * L_task.
This is not cosine weighting. Native pixel-center solid-angle estimates and the
existing region measurement code are used. The scalar is supplied as -b only
when it exceeds 100 cd/m2. No -t circle, -A mask, hidden crop or gaze rotation is
claimed. This is an implementation extension, not a validation of arbitrary
task shapes as psychophysical adaptation fields.

## Low-light default distinction

The v2.10 manual says ON. The 2024 slides say OFF since v2.14. Version 0.9
explicitly passed -C l+ and did not merely inherit the bundled engine default.
Version 0.9.1 preserves that exact choice on initial load and labels it legacy.
The operator can explicitly select documented defaults or uncheck it. This
changes DGP correction, not calculated image illuminance or calibration. The
current result summary and exports record the actual arguments and state.

## Scope of verification

See TEST_RESULTS_0_9_1.md for tests actually rerun for this release. Historical
release documents are retained as versioned evidence, not represented as new
clinical or field-validation results. No change to Blackmagic desktop Beta 6.3.
