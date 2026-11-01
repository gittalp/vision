"""Final v0.9 package acceptance: production bundles, in-memory document; engine assets bundled."""
from pathlib import Path
import re,json,shutil,hashlib
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa-output/package';OUT.mkdir(parents=True,exist_ok=True);checks=[]
manifest=json.loads((ROOT/'MANIFEST_SHA256.json').read_text())
assert all(hashlib.sha256((ROOT/k).read_bytes()).hexdigest()==v for k,v in manifest.items())
checks.append({'test':'All manifest file hashes match extracted package','passed':True,'files':len(manifest)})
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);page=b.new_page(viewport={'width':1550,'height':1250});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 html=re.sub(r'<script[^>]*src="js/app.bundle.js[^\"]*"[^>]*></script>','',(ROOT/'index.html').read_text());html=re.sub(r'<link[^>]*href="styles.css[^\"]*"[^>]*>','',html);page.set_content(html);page.add_style_tag(content=(ROOT/'styles.css').read_text());url=page.evaluate("s=>URL.createObjectURL(new Blob([s],{type:'text/javascript'}))",(ROOT/'js/engine.bundle.js').read_text());app=(ROOT/'js/app.bundle.js').read_text().replace("new URL('./engine.bundle.js?v=0.9.1',SCRIPT_URL)",json.dumps(url)).replace('const SCRIPT_URL=document.currentScript.src;',"const SCRIPT_URL='https://test.invalid/js/app.bundle.js';");page.add_script_tag(content=app)
 def ready():
  page.wait_for_function("!document.getElementById('load').disabled",timeout=60000)
  assert 'error' not in page.locator('#statusbar').get_attribute('class'),page.locator('#status').inner_text()
 def click(id):page.locator('#'+id).click();ready()
 page.locator('#single').set_input_files(str(ROOT/'tests/precision-fixture.hdr'));click('load')
 assert not page.locator('#cropShape').is_visible();assert page.locator('#roiShape').is_visible();assert float(page.locator('#eduFocusX').input_value())==.5
 checks.append({'test':'Initial fixation centered; crop-only shape controls hidden in measurement mode','passed':True})
 for name,role,xywh in [('Target','A',(200,200,100,100)),('Surround','B',(150,150,200,200))]:
  page.locator('#numericROI').evaluate('(e)=>e.open=true')
  for id,v in zip(['roiX','roiY','roiW','roiH'],xywh):page.locator('#'+id).fill(str(v))
  page.locator('#regionName').fill(name);click('save'+role)
 assert page.locator('#regionRows tr').count()==2;assert page.locator('#contrastRatio').inner_text()!='--';assert 'minus' in page.locator('#comparison').inner_text();assert page.locator('#saveA').is_disabled()
 checks.append({'test':'Named A/B rows, subtraction and contrast visible; saved draft ended','passed':True})
 assert page.locator('#glareRun').is_disabled();assert page.locator('#glareCard').is_visible();assert page.locator('.regionOmega').count()==2
 before_ratio=page.locator('#contrastRatio').inner_text();page.locator('#glareSkip').click();assert not page.locator('#glareControls').is_visible();assert page.locator('#regionRows tr').count()==2;assert page.locator('#contrastRatio').inner_text()==before_ratio
 page.locator('#glareEnable').click();assert page.locator('#glareControls').is_visible();assert page.locator('#glareRun').is_disabled();assert 'included' in page.locator('#glareEngineState').inner_text().lower()
 checks.append({'test':'Optional glare Skip/Enable preserves A/B; explicit sr column and prepare-before-run gating present','passed':True})
 page.locator('#measurementToolbar').screenshot(path=str(OUT/'single-toolbar.png'));page.locator('#measurementsCard').screenshot(path=str(OUT/'region-results.png'))
 click('cropToggle');assert page.locator('#cropShape').is_visible();assert not page.locator('#measurementToolbar').is_visible();click('cropToggle');assert not page.locator('#cropShape').is_visible();assert page.locator('#regionRows tr').count()==2
 checks.append({'test':'Crop and measurement controls are mutually exclusive; mode switch preserves records','passed':True})
 page.locator('#single').set_input_files(str(ROOT/'tests/precision-fixture.hdr'));click('load');assert page.locator('#regionRows tr').count()==0;assert page.locator('#contrastRatio').inner_text()=='--';assert 'No current whole-field measurement' in page.locator('#fieldMeasurementResult').inner_text();assert not errors
 checks.append({'test':'New source clears obsolete region/field results; no page errors','passed':True})
 (OUT/'tests.json').write_text(json.dumps({'passed':len(checks),'tests':checks,'pageErrors':errors,'browser':b.version},indent=2));b.close()
print(json.dumps({'passed':len(checks)}))
