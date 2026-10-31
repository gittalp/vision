# Browser tests

These optional tests need Python Playwright and a Chromium executable.
They test production bundles in an in-memory page, not a live server.

```
python qa/test_visual_crop_v04.py
python qa/test_features_v03.py
python qa/test_browser.py --site . --mode samples --data /path/to/hdr-exr --brackets /path/to/jpegs --output qa-output/samples
```

The crop test uses /mnt/data/room1.hdr for its last sample stage; adjust that path
for your environment. The other synthetic fixtures are bundled. The sample files
are not redistributed. TEST_RESULTS.md and VALIDATION.json record the completed
checks. A decoder contract test is not end-to-end HEVC validation.
