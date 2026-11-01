#!/usr/bin/env python3
"""Run an installed, real evalglare against a prepared VisionSim job.
No image is uploaded. No metric is computed or approximated by this wrapper.
Usage: python run_glare.py [path/to/evalglare] [job-directory]
"""
from __future__ import annotations
import base64
import hashlib
import json
import math
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validated_args(job: dict) -> list[str]:
    if job.get('schema') != 'visionsim-evalglare-job-1':
        raise ValueError('Not a supported VisionSim glare job.')
    q = job.get('options', {})
    def number(key: str, low: float, high: float, optional: bool = False):
        v = q.get(key)
        if optional and v is None:
            return None
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not low < v <= high:
            raise ValueError(f'Invalid {key}')
        return float(v)
    threshold = number('threshold', 100, 1e9)
    search = number('searchRadius', 0, 1)
    peak = number('peak', threshold, 1e12)
    ev = number('externalEv', 0, 1e7, True)
    if q.get('mode') not in ('hemisphere', 'limited'):
        raise ValueError('Invalid coverage mode.')
    if q['mode'] == 'limited' and ev is None:
        raise ValueError('Limited view requires independently measured illuminance.')
    a = job.get('args')
    if not isinstance(a, list) or not all(isinstance(x, str) for x in a):
        raise ValueError('Invalid argument list.')
    # Compare exact fixed arguments and numerical values. Never accept arbitrary
    # command-line switches or file names from an imported JSON file.
    expected = ['-d', '-b', threshold, '-r', search, '-C', 'l+' if q.get('lowLight') else 'l-', '-q', '0', '-Y', peak, '-c', 'glare-check.hdr']
    if ev is not None:
        expected += ['-i', ev]
    expected += ['input.hdr']
    if len(a) != len(expected):
        raise ValueError('Unexpected evalglare arguments.')
    for actual, want in zip(a, expected):
        if isinstance(want, float):
            if not math.isfinite(float(actual)) or float(actual) != want:
                raise ValueError('Arguments do not match preparation settings.')
        elif actual != want:
            raise ValueError('Unexpected evalglare option or file path.')
    encoded = json.dumps(a, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    if sha(encoded) != job.get('argumentsSha256'):
        raise ValueError('Argument checksum differs from the prepared job.')
    return a


def main() -> int:
    folder = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else Path(__file__).resolve().parent
    requested = sys.argv[1] if len(sys.argv) > 1 else 'evalglare'
    located = shutil.which(requested)
    if located is None and Path(requested).is_file():
        located = str(Path(requested).resolve())
    if located is None:
        raise FileNotFoundError('The real evalglare executable is not installed/found. Run: python run_glare.py "full/path/to/evalglare". This ZIP does not contain an evalglare executable.')
    executable = Path(located).resolve()
    job_path = folder / 'job.json'
    if job_path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('Oversized job JSON.')
    job = json.loads(job_path.read_text(encoding='utf-8'))
    arguments = validated_args(job)
    input_path = folder / 'input.hdr'
    if input_path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('Prepared HDR exceeds the runner safety limit.')
    image = input_path.read_bytes()
    if sha(image) != job.get('inputSha256'):
        raise ValueError('The HDR checksum does not match the job. Do not edit a prepared file in place.')
    version = subprocess.run([str(executable), '-v'], capture_output=True, timeout=30, check=False)
    banner = (version.stdout + version.stderr).decode('utf-8', errors='replace').strip()
    # Upstream evalglare intentionally exits 1 for -v; accept its version banner only.
    if version.returncode not in (0, 1) or not re.search(r'\bevalglare\s+v?\d+\.\d+', banner, re.I):
        raise ValueError('Executable did not identify itself as evalglare using -v.')
    with tempfile.TemporaryDirectory(prefix='visionsim-glare-') as temporary:
        tmp = Path(temporary)
        (tmp / 'input.hdr').write_bytes(image)
        run = subprocess.run([str(executable)] + arguments, cwd=tmp, capture_output=True, timeout=600, check=False)
        stdout = run.stdout.decode('utf-8', errors='replace')
        stderr = run.stderr.decode('utf-8', errors='replace')
        check = tmp / 'glare-check.hdr'
        result = dict(schema='visionsim-evalglare-result-1', inputSha256=job['inputSha256'], argumentsSha256=job['argumentsSha256'], args=arguments, engineVersion=banner, engineSha256=sha(executable.read_bytes()), exitCode=run.returncode, stdout=stdout, stderr=stderr, provenance='Native evalglare invoked with subprocess argument list; no source modification by this wrapper.')
        if check.exists() and check.stat().st_size <= 32 * 1024 * 1024:
            check_bytes = check.read_bytes()
            (folder / 'glare-check.hdr').write_bytes(check_bytes)
            result['checkImageBase64'] = base64.b64encode(check_bytes).decode('ascii')
        (folder / 'evalglare-result.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
        (folder / 'evalglare-stdout.txt').write_text(stdout, encoding='utf-8')
        (folder / 'evalglare-stderr.txt').write_text(stderr, encoding='utf-8')
    print('Saved evalglare-result.json. Import it into the same prepared web session.')
    if run.returncode:
        print(stderr, file=sys.stderr)
    return run.returncode


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(f'No valid glare result: {exc}', file=sys.stderr)
        raise SystemExit(1)
