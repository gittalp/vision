"""Real evalglare WASM in Chromium. Navigation is administrator-blocked here,
so only static file transport and worker URL resolution use in-memory blobs.
The loader, WASM, application calculations, engine adapter and outputs are real.
No stub returns glare data. This is not a live-host or native-Windows test.
"""
from pathlib import Path
import base64,hashlib,json,re,shutil,time,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa-output/browser-engine';OUT.mkdir(parents=True,exist_ok=True)
checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1550,'height':1100},accept_downloads=True);page.set_default_timeout(20000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:print('CONSOLE',m.type,m.text,flush=True));page.on('requestfailed',lambda r:print('REQUESTFAIL',r.url,r.failure,flush=True))
 html=re.sub(r'<script[^>]*src="js/app.bundle.js[^\"]*"[^>]*></script>','',(ROOT/'index.html').read_text())
 html=re.sub(r'<link[^>]*href="styles.css[^\"]*"[^>]*>','',html)
 page.set_content(html);page.add_style_tag(content=(ROOT/'styles.css').read_text())
 def blob(source):return page.evaluate("s=>URL.createObjectURL(new Blob([s],{type:'text/javascript'}))",source)
 modules={}
 def module(name):
  if name in modules:return modules[name]
  source=(ROOT/'js'/name).read_text()
  source=re.sub(r"(from\s+['\"])(\./[^'\"]+)(['\"])",lambda m:m[1]+module(m[2][2:])+m[3],source)
  modules[name]=blob(source);return modules[name]
 assets={name:base64.b64encode((ROOT/'vendor/evalglare'/name).read_bytes()).decode() for name in ['manifest.json','evalglare.js','evalglare.wasm']}
 urls={}
 for mode in ['good','missing','tampered']:
  source=(ROOT/'js/glare-runner.bundle.js').read_text()
  source=re.sub(r"(from\s+['\"])(\./[^'\"]+)(['\"])",lambda m:m[1]+module(m[2][2:])+m[3],source)
  source=source.replace("new URL('../vendor/evalglare/', self.location.href)","new URL('https://test.invalid/vendor/evalglare/')")
  local=dict(assets)
  if mode=='tampered':
   bad=bytearray((ROOT/'vendor/evalglare/evalglare.wasm').read_bytes());bad[-1]^=1;local['evalglare.wasm']=base64.b64encode(bad).decode()
  if mode=='missing':del local['evalglare.wasm']
  shim="""const __staticAssets=ASSETS;globalThis.fetch=async url=>{const name=String(url).split('/').pop();if(!__staticAssets[name])return new Response('missing',{status:404});const b=Uint8Array.from(atob(__staticAssets[name]),c=>c.charCodeAt(0));return new Response(b,{status:200,headers:{'Content-Type':name.endsWith('.json')?'application/json':name.endsWith('.wasm')?'application/wasm':'text/javascript'}});};\n""".replace('ASSETS',json.dumps(local))
  urls[mode]=blob(shim+source)
 engine_url=blob((ROOT/'js/engine.bundle.js').read_text())
 app=(ROOT/'js/app.bundle.js').read_text().replace("new URL('./engine.bundle.js?v=0.9.2',SCRIPT_URL)",json.dumps(engine_url)).replace('const SCRIPT_URL=document.currentScript.src;',"const SCRIPT_URL='https://test.invalid/js/app.bundle.js';")
 page.add_script_tag(content="window.__engineURLs="+json.dumps(urls)+";window.__engineMode='good';const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(url,options){if(String(url).includes('glare-runner.bundle.js'))url=window.__engineURLs[window.__engineMode];super(url,options);}};")
 page.add_script_tag(content=app);page.add_script_tag(content="new MutationObserver(()=>console.log('GLARESTATE',document.getElementById('glareStatus').textContent)).observe(document.getElementById('glareStatus'),{childList:true,subtree:true});")
 def ready():
  page.wait_for_function("!document.getElementById('load').disabled",timeout=180000)
  if 'error' in page.locator('#statusbar').get_attribute('class'):raise AssertionError(page.locator('#status').inner_text())
 def reveal(id):page.locator('#'+id).evaluate('(el)=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true}')
 def click(id):reveal(id);page.locator('#'+id).click();ready()
 def fields(**kw):
  for k,v in kw.items():reveal(k);page.locator('#'+k).fill(str(v))
 def download(id,name):
  with page.expect_download(timeout=180000) as d:click(id)
  f=OUT/name;d.value.save_as(f);return f
 def report(name='report.json'):return json.loads(download('report',name).read_text())
 def core(d):return {k:d[k] for k in ['width','height','summary','mask','calibration','geometry','cropHistory','regions','regionComparison']}
 def glare_done(error=False):
  page.wait_for_function("document.getElementById('glareCancel').hidden",timeout=180000)
  text=page.locator('#glareStatus').inner_text()
  if not error:assert 'error' not in (page.locator('#glareStatus').get_attribute('class') or ''),text
  return text
 def prepare():click('glarePrepare');glare_done();assert page.locator('#glarePreparedView').is_visible()
 def run():click('glareRun');glare_done();assert page.locator('#glareResults').is_visible()
 def polygon(points,name,role):
  page.locator('#roiShape').select_option('polygon');click('newROI');page.locator('#overlay').scroll_into_view_if_needed();box=page.locator('#overlay').bounding_box()
  for u,v in points:page.mouse.click(box['x']+u*box['width'],box['y']+v*box['height'])
  page.locator('#overlay').press('Enter');ready();fields(regionName=name);click('save'+role)
 def test(name,fn):
  print('START',name,flush=True);start=time.time()
  try:value=fn();checks.append({'name':name,'passed':True,'seconds':time.time()-start,'result':value})
  except Exception as e:
   checks.append({'name':name,'passed':False,'error':str(e)});page.screenshot(path=str(OUT/'failure.png'));raise
  finally:(OUT/'tests.json').write_text(json.dumps({'passed':sum(t['passed'] for t in checks),'tests':checks,'pageErrors':errors,'browser':browser.version,'scope':__doc__},indent=2))
  print('PASS',name,flush=True)
 try:
  def startup():
   assert page.locator('#glareEngineState').inner_text().startswith('Browser engine included');assert page.locator('#glareRun').is_disabled()
   page.locator('#single').set_input_files(str(ROOT/'qa-output/real-engine/one-cap.hdr'));click('load');page.locator('#circle').check();fields(cx=.5,cy=.5,radius=.5);click('applyMask');page.locator('#projection').select_option('equidistant');fields(sourceFov=180,sourceVFov=180);page.locator('#geometryConfirm').check();click('applyGeometry');return report()['calibration']
  test('App starts with bundled-engine status; calibrated HDR import and circle geometry',startup)
  def save_regions():
   polygon([(.42,.42),(.55,.42),(.55,.55),(.42,.55)],'Target A','A');polygon([(.32,.32),(.65,.32),(.65,.65),(.32,.65)],'Surround B','B');d=report();assert len(d['regions'])==2 and d['regionComparison']['subtracted'];assert all('sr' in t for t in page.locator('.regionOmega').all_inner_texts());return d['regionComparison']
  test('Existing named polygons, subtraction, contrast and steradian readings',save_regions)
  before=core(report());source=download('pfm','before.pfm').read_bytes()
  test('Skip and enable leave the source and region records unchanged',lambda:(click('glareSkip'),click('glareEnable'),core(report())==before)[-1])
  def first_run():
   page.locator('#glareSize').select_option('800');prepare();assert page.locator('#glareRun').is_enabled();run();assert '3.06' in page.locator('#glareEngineState').inner_text();assert page.locator('#glareSourceRows tr').count()==1;assert core(report())==before;assert download('pfm','after-run.pfm').read_bytes()==source
   page.locator('#glareResults').screenshot(path=str(OUT/'real-engine-result.png'));return {'dgp':page.locator('#glareDGP').inner_text(),'omega':page.locator('#glareOmega').inner_text()}
  test('Prepare then Run invokes real engine automatically; no engine-install step',first_run)
  def exports():
   doc=json.loads(download('glareResultJSON','result.json').read_text());assert 'Browser' in page.locator('#glareStatus').inner_text();assert doc['exitCode']==0;assert 'evalglare 3.06' in doc['engineVersion'];assert doc['checkImageBase64'];check=download('glareCheckHDR','check.hdr').read_bytes();assert base64.b64decode(doc['checkImageBase64'])==check;hdr=download('glareExportHDR','prepared.hdr').read_bytes();assert hashlib.sha256(hdr).hexdigest()==doc['inputSha256'];assert len(doc['args'])==14 and doc['args'][0]=='-d';csv=download('glareSourcesCSV','sources.csv').read_text();assert 'solid_angle_sr' in csv;assert len(csv.splitlines())==2;png=download('glareSavePNG','diagnostic.png');assert png.read_bytes().startswith(b'\x89PNG');return {'version':doc['engineVersion'],'checkBytes':len(check)}
  test('Results, source CSV, raw check HDR and diagnostic PNG export actual engine data',exports)
  def repeated():
   original=json.loads((OUT/'result.json').read_text());run();doc=json.loads(download('glareResultJSON','repeat.json').read_text());assert doc['stdout']==original['stdout'];assert core(report())==before;return True
  test('Second browser run uses fresh engine state and identical numerical results',repeated)
  def overlays():
   dgp=page.locator('#glareDGP').inner_text();page.locator('#fieldType').select_option('band');click('showField');page.locator('#glareOverlayField').check();page.locator('#glareOverlayRings').check();assert page.locator('#glareDGP').inner_text()==dgp;assert core(report())==before;return True
  test('Viewing-field and ring annotations do not recalculate or modify baseline glare',overlays)
  def import_match():
   page.locator('#glareImport').set_input_files(str(OUT/'result.json'));page.wait_for_function("document.getElementById('glareStatus').textContent.includes('imported')");assert page.locator('#glareCheckHDR').is_enabled();doc=json.loads((OUT/'result.json').read_text());doc['inputSha256']='mismatch';(OUT/'wrong.json').write_text(json.dumps(doc));previous=page.locator('#glareDGP').inner_text();page.locator('#glareImport').set_input_files(str(OUT/'wrong.json'));page.wait_for_function("document.getElementById('glareStatus').textContent.includes('does not match')");assert page.locator('#glareDGP').inner_text()==previous;return True
  test('Actual browser result/check-image reimport works; mismatched result is rejected',import_match)
  def missing():
   page.evaluate("window.__engineMode='missing'");click('glareCheckEngine');text=glare_done(True);assert 'HTTP 404' in text;assert core(report())==before;page.evaluate("window.__engineMode='good'");click('glareCheckEngine');glare_done();return text
  test('Missing bundled WASM reports upload problem, not a Python-install prompt; recovery',missing)
  def corrupt():
   page.evaluate("window.__engineMode='tampered'");click('glareCheckEngine');text=glare_done(True);assert 'checksum mismatch' in text;assert core(report())==before;page.evaluate("window.__engineMode='good'");run();return text
  test('Tampered engine fails integrity validation without changing source or regions',corrupt)
  def cancel():
   page.locator('#glareRun').click();page.locator('#glareCancel').click();assert 'cancelled' in glare_done().lower();assert core(report())==before;run();return True
  test('Cancel and rerun terminate only the glare worker and preserve the session',cancel)
  def reset():
   click('glareReset');assert not page.locator('#glareResults').is_visible();assert core(report())==before;assert download('pfm','after-reset.pfm').read_bytes()==source;return True
  test('Glare-only reset preserves calibrated pixels and all named-region measurements',reset)
  def warnings():
   page.locator('#single').set_input_files(str(ROOT/'qa-output/real-engine/uniform.hdr'));click('load');page.locator('#circle').check();fields(cx=.5,cy=.5,radius=.5);click('applyMask');page.locator('#projection').select_option('equidistant');fields(sourceFov=180,sourceVFov=180);page.locator('#geometryConfirm').check();click('applyGeometry');prepare();run();assert page.locator('#glareSourceCount').inner_text()=='0';assert page.locator('#glareWarnings').is_visible();assert 'Low brightness' in page.locator('#glareWarnings').inner_text();return page.locator('#glareDGP').inner_text()
  test('Zero-source scene and real low-brightness warnings displayed correctly',warnings)
  def stale():
   fields(glareThreshold=2100);page.locator('#glareThreshold').dispatch_event('change');assert not page.locator('#glarePreparedView').is_visible();assert page.locator('#glareRun').is_disabled();assert not page.locator('#glareResults').is_visible();fields(glareThreshold=2000);page.locator('#glareThreshold').dispatch_event('change');return True
  test('Changing detection settings invalidates stale prepared data and results',stale)
  def room():
   page.locator('#single').set_input_files('/mnt/data/room1.hdr');click('load');page.locator('#circle').check();fields(cx=.5,cy=.5,radius=.49);click('applyMask');click('circleToCrop');click('applyCrop');page.locator('#projection').select_option('equisolid');fields(circleFov=180);click('deriveCircle');page.locator('#geometryConfirm').check();click('applyGeometry');snapshot=core(report('room-before.json'));page.locator('#glareSize').select_option('1000');prepare();run();assert core(report('room-after.json'))==snapshot
   doc=json.loads(download('glareResultJSON','room-result.json').read_text());download('glareExportHDR','room-prepared.hdr');download('glareSourcesCSV','room-sources.csv');download('glareSavePNG','room-diagnostic.png');page.locator('#glareResults').screenshot(path=str(OUT/'room-results-panel.png'));return {'engine':doc['engineVersion'],'dgp':page.locator('#glareDGP').inner_text(),'sources':page.locator('#glareSourceCount').inner_text(),'geometryNote':'Equisolid 180-degree test assumption, not independently calibrated lens'}
  test('Supplied Photosphere room: real equisolid conversion and browser glare calculation',room)
  def room_sources():
   print('ROOM600: edit',flush=True);fields(glareThreshold=600);page.locator('#glareThreshold').dispatch_event('change')
   print('ROOM600: prepare',flush=True);prepare();print('ROOM600: save-prepared',flush=True);download('glareExportHDR','room600-before-run.hdr');print('ROOM600: run',flush=True);run();print('ROOM600: result',flush=True);assert page.locator('#glareSourceRows tr').count()>0
   doc=json.loads(download('glareResultJSON','room-threshold600-result.json').read_text());print('ROOM600: json',flush=True)
   download('glareExportHDR','room-threshold600-prepared.hdr');print('ROOM600: hdr',flush=True)
   download('glareSourcesCSV','room-threshold600-sources.csv');print('ROOM600: csv',flush=True)
   download('glareSavePNG','room-threshold600-diagnostic.png');print('ROOM600: png',flush=True)
   page.locator('#glareResults').screenshot(path=str(OUT/'room-threshold600-panel.png'));print('ROOM600: screenshot',flush=True)
   return {'dgp':page.locator('#glareDGP').inner_text(),'sources':page.locator('#glareSourceCount').inner_text(),'fixedThresholdCdM2':600,'note':'Diagnostic threshold test, not a validated comfort conclusion'}
  test('Room threshold control reaches real source detector; source steradians and numbered check image',room_sources)
  def narrow():
   page.set_viewport_size({'width':430,'height':900});page.locator('#glareResults').scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2');page.screenshot(path=str(OUT/'narrow-layout.png'));page.set_viewport_size({'width':1550,'height':1100});return True
  test('Glare results and source table fit narrow layout without page overflow',narrow)
  assert not errors,errors
 finally:
  (OUT/'tests.json').write_text(json.dumps({'passed':sum(t['passed'] for t in checks),'total':len(checks),'tests':checks,'pageErrors':errors,'browser':browser.version,'scope':__doc__},indent=2));browser.close()
print(json.dumps({'passed':len(checks)}))
