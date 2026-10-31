# Browser tests
Install Python Playwright and a Chromium executable to run these optional tests.
The scripts test production bundles in an in-memory page; they are not a live
HTTP deployment test. Adjust --browser for test_browser.py where needed.

python qa/test_features_v03.py
python qa/test_browser.py --site . --output qa-output/core
python qa/test_browser.py --site . --mode samples --data /path/to/hdr-exr --brackets /path/to/jpeg-bracket --output qa-output/samples

The last command requires the user-owned sample files, deliberately not bundled.
A HEIF contract double is not HEVC decoder validation.
