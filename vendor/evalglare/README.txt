Bundled browser engine: evalglare 3.06 release 01.10.2025

Both evalglare.js and evalglare.wasm are the user-supplied files, unmodified.
The ES-module factory and FS/callMain are used by the separate host adapter.
No Python or local executable is used by the browser worker. The Windows
executable supplied for reference is not included in the web package.

manifest.json records SHA-256 checksums and the actual -v output. The exact
upstream commit and compiler build options were not supplied and are not claimed.
The runtime checks both file hashes, compiles the verified WASM bytes, checks
-v, and starts a fresh process-equivalent instance for each job. Source pixels
and named-region records are not handed to that instance; only a prepared copy.

Upload this directory intact with the website. Serve .js as JavaScript and
.wasm as application/wasm. Hosting must allow local workers, WebAssembly,
and blob module imports used for integrity-checked loader execution.

Required component acknowledgments and license text are in ../../licenses/.
