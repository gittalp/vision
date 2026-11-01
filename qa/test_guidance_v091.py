"""Compatibility entry point: the 0.9.1 guidance suite is extended by 0.9.2.
Runs the production bundles and real uploaded evalglare WASM in Chromium.
"""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('test_maintenance_v092.py')),run_name='__main__')
