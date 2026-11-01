/* Real evalglare in an isolated worker. No native programs or Python. */
import {makeEvalglareInvoker, validateEngineArguments} from './glare-engine.js';
import {sha256} from './glare.js';

self.onmessage = async ({data: message}) => {
  try {
    if (!['check', 'run'].includes(message?.action)) throw new Error('Invalid engine operation.');
    const root = new URL('../vendor/evalglare/', self.location.href);
    const fetchLocal = async name => {
      const response = await fetch(new URL(name, root), {cache: 'no-cache', credentials: 'same-origin'});
      if (!response.ok) throw new Error(`Cannot load bundled ${name} (HTTP ${response.status}). Upload the complete vendor/evalglare folder with the website.`);
      return response;
    };
    postMessage({type: 'progress', text: 'Loading the bundled browser engine; no local installation is used.'});
    const manifest = await (await fetchLocal('manifest.json')).json();
    if (!manifest.installed || manifest.format !== 'esm-default' || manifest.loader !== 'evalglare.js' ||
        manifest.wasm !== 'evalglare.wasm' || !manifest.version ||
        !manifest.sha256?.loader || !manifest.sha256?.wasm) throw new Error('Incomplete bundled-engine manifest.');
    const [jsResponse, wasmResponse] = await Promise.all([fetchLocal(manifest.loader), fetchLocal(manifest.wasm)]);
    const [loaderBytes, wasmBytes] = await Promise.all([
      jsResponse.arrayBuffer().then(b => new Uint8Array(b)),
      wasmResponse.arrayBuffer().then(b => new Uint8Array(b))
    ]);
    if (sha256(loaderBytes) !== manifest.sha256.loader) throw new Error('Bundled evalglare.js checksum mismatch. Re-upload the complete release.');
    if (sha256(wasmBytes) !== manifest.sha256.wasm) throw new Error('Bundled evalglare.wasm checksum mismatch. Re-upload the complete release.');
    // Import the exact bytes that were verified, retaining the uploaded loader.
    // The loader needs no relative imports; instantiateWasm supplies its module.
    const blobURL = URL.createObjectURL(new Blob([loaderBytes], {type: 'text/javascript'}));
    let factory;
    try { factory = (await import(blobURL)).default; }
    finally { URL.revokeObjectURL(blobURL); }
    const compiled = await WebAssembly.compile(wasmBytes);
    const invoke = makeEvalglareInvoker(factory, compiled);
    const version = await invoke(['-v']);
    const banner = (version.stdout + '\n' + version.stderr).trim();
    const match = banner.match(/\bevalglare\s+v?(\d+\.\d+(?:\.\d+)?)/i);
    if (![0, 1].includes(version.exitCode) || !match || match[1] !== manifest.version) {
      throw new Error('The bundled engine version does not match its manifest.');
    }
    if (message.action === 'check') {
      postMessage({ok: true, version: banner, manifest}); return;
    }
    const job = message.job, input = new Uint8Array(message.bytes || []);
    if (!job || !input.length || input.length > 64 * 1024 * 1024) throw new Error('Invalid prepared glare input.');
    if (sha256(input) !== job.inputSha256 || sha256(JSON.stringify(job.args)) !== job.argumentsSha256) {
      throw new Error('Prepared input/settings checksum mismatch. Prepare a fresh glare copy.');
    }
    validateEngineArguments(job.args);
    postMessage({type: 'progress', text: `Running ${banner}. You can cancel without altering the calibrated source.`});
    const start = performance.now();
    const result = await invoke(job.args, input);
    const document = {
      schema: 'visionsim-evalglare-result-1',
      inputSha256: job.inputSha256, argumentsSha256: job.argumentsSha256,
      args: [...job.args], engineVersion: banner, engineSha256: manifest.sha256.wasm,
      loaderSha256: manifest.sha256.loader, engineBuild: manifest.provenance,
      exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr,
      elapsedMilliseconds: performance.now() - start,
      provenance: 'Bundled evalglare WebAssembly executed locally in a browser worker. No Python, native executable, or image upload. Engine bytes unchanged from the user-supplied build.'
    };
    postMessage({ok: true, document, check: result.check, version: banner, manifest},
      result.check ? [result.check.buffer] : []);
  } catch (error) {
    postMessage({ok: false, error: error?.message || String(error)});
  }
};
