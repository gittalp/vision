#!/usr/bin/env python3
"""Fetch an optional, version-pinned libheif browser codec; never uploads images.
Run on an internet-connected computer before deploying a fully local HEIC route.
The core HDR/EXR/JPEG/Ultra HDR application does not require this codec.
"""
from __future__ import annotations
import hashlib
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

VERSION = '1.23.5'
URL = f'https://cdn.jsdelivr.net/npm/libheif-js@{VERSION}/libheif-wasm/libheif-bundle.js'
DEST = Path(__file__).resolve().parent / 'libheif-bundle.js'
MAX_BYTES = 48 * 1024 * 1024

def main() -> int:
    try:
        print(f'Downloading optional libheif-js {VERSION} from jsDelivr...')
        req = Request(URL, headers={'User-Agent': 'VisionSim-codec-setup/0.3'})
        with urlopen(req, timeout=90) as response:
            data = response.read(MAX_BYTES + 1)
        if not 100000 <= len(data) <= MAX_BYTES or b'libheif' not in data[:20000]:
            raise ValueError('Unexpected codec response; no existing file was replaced.')
        tmp = DEST.with_suffix('.js.part')
        tmp.write_bytes(data)
        tmp.replace(DEST)
        record = {'package': 'libheif-js', 'version': VERSION, 'url': URL,
                  'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                  'integrity': 'Recorded after HTTPS download, not an independently authenticated publisher checksum.',
                  'license': 'LGPL-3.0; retain required notices and corresponding source when redistributing.',
                  'source': 'https://github.com/catdad-experiments/libheif-js',
                  'build_source': 'https://github.com/catdad-experiments/libheif-emscripten'}
        DEST.with_name('libheif-download.json').write_text(json.dumps(record, indent=2))
        print(f'Installed {DEST.name} ({len(data):,} bytes).')
        print('Before public redistribution, review vendor/README.md and the codec source/license obligations.')
        return 0
    except Exception as exc:
        print(f'Codec download failed: {exc}', file=sys.stderr)
        print('The main application still works. The optional in-page CDN permission is another route.', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
