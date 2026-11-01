/* Host adapter only. The bundled engine loader and WASM remain byte-identical
 * to the supplied files. A fresh instance is used for every invocation because
 * evalglare and its C runtime have process-global state and exit after main().
 */
export function makeEvalglareInvoker(factory, compiled, onLine = () => {}) {
  if (typeof factory !== 'function' || !(compiled instanceof WebAssembly.Module)) {
    throw new Error('Invalid browser engine module.');
  }
  return async function invoke(args, input = null) {
    const stdout = [], stderr = [];
    let textSize = 0;
    function capture(kind, line) {
      const text = String(line);
      textSize += text.length;
      if (textSize > 8 * 1024 * 1024) throw new Error('Engine text output exceeds the safety limit.');
      (kind === 'stdout' ? stdout : stderr).push(text);
      onLine(kind, text);
    }
    // This supplied loader exports instantiateWasm but does not consume
    // Module.wasmBinary. Instantiate the integrity-checked compiled module
    // directly instead of allowing a second, unverified network retrieval.
    const engine = await factory({
      thisProgram: 'evalglare', noInitialRun: true,
      instantiateWasm(imports, receive) {
        const instance = new WebAssembly.Instance(compiled, imports);
        receive(instance);
        return instance.exports;
      },
      print: line => capture('stdout', line),
      printErr: line => capture('stderr', line)
    });
    if (!engine.FS || typeof engine.callMain !== 'function') {
      throw new Error('The browser engine must export FS and callMain.');
    }
    if (input) engine.FS.writeFile('/input.hdr', new Uint8Array(input));
    let exitCode = 0;
    try {
      // Emscripten callMain prepends argv[0] in place. Never pass the job's
      // original array or its input/settings checksum would be invalidated.
      exitCode = engine.callMain([...args]) || 0;
    } catch (error) {
      if (error?.name === 'ExitStatus') exitCode = error.status;
      else throw error;
    }
    let check = null;
    try { check = new Uint8Array(engine.FS.readFile('/glare-check.hdr')); } catch {}
    return {stdout: stdout.join('\n'), stderr: stderr.join('\n'), exitCode, check};
  };
}

export function validateEngineArguments(args) {
  if (!Array.isArray(args) || ![14, 16].includes(args.length) ||
      args[0] !== '-d' || args[1] !== '-b' || args[3] !== '-r' ||
      args[5] !== '-C' || !['l+', 'l-'].includes(args[6]) ||
      args[7] !== '-q' || args[8] !== '0' || args[9] !== '-Y' ||
      args[11] !== '-c' || args[12] !== 'glare-check.hdr' ||
      args.at(-1) !== 'input.hdr') throw new Error('Unsupported engine arguments.');
  const threshold = Number(args[2]), radius = Number(args[4]), peak = Number(args[10]);
  if (!Number.isFinite(threshold) || threshold <= 100 || threshold > 1e9 ||
      !Number.isFinite(radius) || radius <= 0 || radius > 1 ||
      !Number.isFinite(peak) || peak <= threshold || peak > 1e12) {
    throw new Error('Invalid numerical engine arguments.');
  }
  if (args.length === 16 && (args[13] !== '-i' ||
      !Number.isFinite(Number(args[14])) || Number(args[14]) <= 0 || Number(args[14]) > 1e7)) {
    throw new Error('Invalid measured illuminance argument.');
  }
}
