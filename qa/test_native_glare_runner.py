"""Protocol/security tests of the native job runner; fake CLI is clearly a fixture.
No actual evalglare engine or glare mathematics is tested by this script.
"""
from pathlib import Path
import importlib.util,json,tempfile,subprocess,sys,hashlib,shutil,zipfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa-output/native-runner';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('runner',ROOT/'native/run_glare.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
checks=[]
def test(name,fn):
 fn();checks.append({'test':name,'passed':True});print('PASS',name)
base=ROOT/'qa-output/glare-numerical';job=json.loads((base/'job.json').read_text())
def valid():assert module.validated_args(job)==job['args']
test('Exported numerical job passes independent Python argument/checksum validation',valid)
def injection():
 for args in [job['args']+['-f'],['-d',';rm','x'],[x if x!='input.hdr' else '../outside.hdr' for x in job['args']]]:
  j={**job,'args':args,'argumentsSha256':hashlib.sha256(json.dumps(args,separators=(',',':')).encode()).hexdigest()}
  try:module.validated_args(j)
  except ValueError:pass
  else:raise AssertionError('Unsafe argument accepted')
test('Unexpected switches and path traversal are rejected even with updated hashes',injection)
def zipcheck():
 with zipfile.ZipFile(base/'export.zip') as z:
  assert z.testzip() is None;assert z.read('input.hdr')==(base/'input.hdr').read_bytes();assert z.read('test.txt')==b'test text\n'
test('Native zipfile reads the browser STORE ZIP and verifies all CRCs',zipcheck)
with tempfile.TemporaryDirectory() as folder:
 p=Path(folder);shutil.copy(base/'input.hdr',p/'input.hdr');shutil.copy(base/'job.json',p/'job.json');shutil.copy(ROOT/'native/run_glare.py',p/'run_glare.py')
 fixture=json.loads((base/'synthetic-parser-fixture.json').read_text())
 fake=p/'fake_evalglare_protocol_only';fake.write_text('#!'+sys.executable+'\nimport sys\nif sys.argv[1:]==["-v"]:\n print("evalglare 3.06 SYNTHETIC PROTOCOL FIXTURE - NOT AN ENGINE")\n sys.exit(1)\nprint('+repr(fixture['stdout'])+')\n');fake.chmod(0o755)
 def version1():
  run=subprocess.run([sys.executable,str(p/'run_glare.py'),str(fake)],capture_output=True,text=True,timeout=30);assert run.returncode==0,run.stderr
  doc=json.loads((p/'evalglare-result.json').read_text());assert doc['inputSha256']==job['inputSha256'];assert doc['engineSha256']==hashlib.sha256(fake.read_bytes()).hexdigest();assert 'SYNTHETIC' in doc['engineVersion'];assert doc['exitCode']==0
 test('Upstream-style -v exit 1 accepted only with version banner (protocol fixture)',version1)
 def altered():
  (p/'input.hdr').write_bytes(b'changed');run=subprocess.run([sys.executable,str(p/'run_glare.py'),str(fake)],capture_output=True,text=True,timeout=30);assert run.returncode==1;assert 'checksum' in run.stderr
 test('Altered prepared image is rejected before executing the calculation',altered)
 def absent():
  run=subprocess.run([sys.executable,str(p/'run_glare.py'),str(p/'missing')],capture_output=True,text=True,timeout=30);assert run.returncode==1;assert 'not installed/found' in run.stderr
 test('Missing actual executable is an explicit failure, not a computed score',absent)
(OUT/'tests.json').write_text(json.dumps({'passed':len(checks),'tests':checks,'scope':__doc__},indent=2));print(json.dumps({'passed':len(checks)}))
