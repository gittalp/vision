"""Real evalglare WASM in Chromium. Navigation is administrator-blocked here,
so only static file transport and worker URL resolution use in-memory blobs.
The loader, WASM, application calculations, engine adapter and outputs are real.
No stub returns glare data. This is not a live-host or native-Windows test.
"""
from pathlib import Path
import base64,hashlib,json,re,shutil,time,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa-output/browser-maintenance';OUT.mkdir(parents=True,exist_ok=True)
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
   assert page.locator('#glareLowLight').is_checked()
   assert page.locator('#glareDetection').input_value()=='fixed'
   page.locator('#single').set_input_files(str(ROOT/'tests/maintenance-dim-cap.hdr'));click('load')
   page.locator('#circle').check();fields(cx=.5,cy=.5,radius=.5);click('applyMask')
   page.locator('#projection').select_option('equidistant');fields(sourceFov=180,sourceVFov=180)
   page.locator('#geometryConfirm').check();click('applyGeometry');page.locator('#glareSize').select_option('800')
   return report()['calibration']
  test('Initial fixed calculation retains legacy ON explicitly; calibrated image and geometry load',startup)
  def task_record():
   polygon([(.42,.42),(.55,.42),(.55,.55),(.42,.55)],'Laptop task','A')
   polygon([(.32,.32),(.65,.32),(.65,.65),(.32,.65)],'Surround','B')
   d=report();assert len(d['regions'])==2 and d['regionComparison']['subtracted']
   return d['regions'][0]['measurement']
  test('Existing editor saves task polygon and enclosing background with visible contrast',task_record)
  baseline=core(report());source=download('pfm','source-before.pfm').read_bytes()
  def baseline_run():
   prepare();run();doc=json.loads(download('glareResultJSON','fixed-result.json').read_text())
   assert 'analysisPreparation' in doc and 'taskReference' not in doc['analysisPreparation']
   expected=json.loads((ROOT/'qa-output/real-engine/one-cap.json').read_text())
   assert doc['args'][2]=='2000';assert core(report())==baseline
   return {'args':doc['args'],'Ev':page.locator('#glareEv').inner_text()}
  test('Existing fixed path calculates with actual engine; export records its settings',baseline_run)
  baseline_ev=page.locator('#glareEv').inner_text()
  def correction_only():
   before=json.loads((OUT/'fixed-result.json').read_text())
   fixed_inputs={k:page.locator('#'+k).input_value() for k in ['glareThreshold','glareRadius','glarePeak','glareSize','glareSamples']}
   previous_hdr=download('glareExportHDR','correction-on.hdr').read_bytes()
   reveal('glareLowLight');page.locator('#glareLowLight').uncheck();ready()
   assert page.locator('#glareLowLightBadge').inner_text()=='OFF'
   assert not page.locator('#glarePreparedView').is_visible()
   assert fixed_inputs=={k:page.locator('#'+k).input_value() for k in fixed_inputs}
   prepare();assert download('glareExportHDR','correction-off.hdr').read_bytes()==previous_hdr
   run();after=json.loads(download('glareResultJSON','correction-off.json').read_text())
   assert '-C' in after['args'] and after['args'][after['args'].index('-C')+1]=='l-'
   assert page.locator('#glareEv').inner_text()==baseline_ev
   # Engine output parsed through the same numerical parser under test.
   def metric_map(doc):
    tail=[x for x in doc['stdout'].splitlines() if x.lower().startswith('dgp,')][-1]
    names,values=tail.split(':',1)
    return dict(zip(names.split(','),[float(v) for v in values.split()]))
   a,b=metric_map(before),metric_map(after)
   for key in ['E_v','av_lum','lum_backg','omega_sources','ugr','vcp']:assert a[key]==b[key],(key,a[key],b[key])
   assert a['dgp']!=b['dgp']
   assert core(report())==baseline and download('pfm','source-after-toggle.pfm').read_bytes()==source
   page.locator('#glareLowLight').check();ready()
   return {'DGP_on':a['dgp'],'DGP_off':b['dgp'],'Ev_unchanged':a['E_v'],'prepared_HDR_identical':True}
  test('Real engine correction ON/OFF changes DGP only and preserves calibrated prepared raster',correction_only)

  def choose_task():
   reveal('glareDetection');page.locator('#glareDetection').select_option('task')
   page.locator('#glareTaskRegion').select_option('R1');ready()
   assert 'angular mean' in page.locator('#glareTaskInfo').inner_text()
   assert page.locator('#glareThreshold').is_disabled()
   prepare();d=report('task-prepared.json');t=d['glareAnalysis']['preparation']['taskReference']
   mean=d['regions'][0]['measurement']['solidAngleWeightedMean']
   assert abs(t['threshold']-5*mean)<1e-8 and t['regionId']=='R1' and t['gazeChanged']==False
   page.locator('#glareDetectionDetails').screenshot(path=str(OUT/'task-help-panel.png'))
   assert core(d)==baseline;return t
  test('Task option uses saved polygon angular mean and shows exact scalar threshold',choose_task)
  def task_run():
   run();assert page.locator('#glareEv').inner_text()==baseline_ev
   doc=json.loads(download('glareResultJSON','task-result.json').read_text())
   assert doc['analysisPreparation']['taskReference']['name']=='Laptop task'
   assert abs(float(doc['args'][2])-doc['analysisPreparation']['taskReference']['threshold'])<1e-8
   assert core(report())==baseline and download('pfm','source-after-task.pfm').read_bytes()==source
   return {'Ev':page.locator('#glareEv').inner_text(),'threshold':doc['args'][2]}
  test('Actual task engine run/export leaves hemisphere illuminance, calibration and pixels unchanged',task_run)
  def annotations():
   r=page.locator('#regionRows tr').first
   r.locator('input[type=text]').fill('Laptop renamed');r.locator('input[type=text]').press('Tab');ready()
   r.locator('input[type=color]').fill('#ff9933');ready()
   assert page.locator('#glareResults').is_visible();assert page.locator('#glareEv').inner_text()==baseline_ev
   d=report();assert d['regions'][0]['measurement']==baseline['regions'][0]['measurement']
   assert d['glareAnalysis']['preparation']['taskReference']['name']=='Laptop task'
   return True
  test('Renaming and tint changes retain numerical result and original prepared provenance',annotations)
  def multiplier():
   fields(glareTaskMultiplier=6);page.locator('#glareTaskMultiplier').dispatch_event('change')
   assert not page.locator('#glarePreparedView').is_visible() and page.locator('#glareRun').is_disabled()
   assert len(report()['regions'])==2;prepare()
   assert abs(report()['glareAnalysis']['preparation']['taskReference']['multiplier']-6)<1e-9
   return True
  test('Changed task multiplier invalidates only glare result and is recorded on preparation',multiplier)
  def delete():
   page.locator('#regionRows tr').first.get_by_role('button',name='Delete',exact=True).click();ready()
   assert not page.locator('#glarePreparedView').is_visible() and page.locator('#glareRun').is_disabled()
   assert len(report()['regions'])==1 and 'no longer' not in page.locator('#status').inner_text()
   assert download('pfm','source-after-delete.pfm').read_bytes()==source
   return page.locator('#glareTaskInfo').inner_text()
  test('Deleted active task cannot leave a runnable stale result; source stays intact',delete)
  def defaults():
   reveal('glareLowLight');page.locator('#glareLowLight').uncheck();ready()
   assert page.locator('#glareLowLightBadge').inner_text()=='OFF'
   fields(glareTaskMultiplier=8)
   page.locator('#glareDetection').select_option('fixed')
   fields(glareThreshold=2600,glareRadius=.07,glarePeak=40000)
   page.locator('#glareSamples').select_option('4');fields(glareExternalEv=123)
   click('glareDetectionDefaults')
   assert not page.locator('#glareLowLight').is_checked()
   assert page.locator('#glareDetection').input_value()=='fixed'
   for key,value in [('glareThreshold','2000'),('glareRadius','0.2'),('glarePeak','50000'),('glareTaskMultiplier','5'),('glareSize','800'),('glareSamples','4'),('glareExternalEv','123')]:
    assert page.locator('#'+key).input_value()==value,(key,page.locator('#'+key).input_value())
   page.locator('#glareLowLight').check();ready()
   assert page.locator('#glareLowLightBadge').inner_text()=='ON'
   assert page.locator('#glareExternalEv').input_value()=='123'
   assert page.locator('#glareEngineDefaults').count()==0 and page.locator('#glareLegacyDefaults').count()==0
   fields(glareExternalEv='');page.locator('#glareSamples').select_option('2')
   assert len(report()['regions'])==1
   return True
  test('Explicit correction switch and detection reset are independent and preserve source settings',defaults)
  def reselect():
   page.locator('#glareDetection').select_option('task');page.locator('#glareTaskRegion').select_option('R2')
   click('glareTaskSelect');assert page.locator('#measurementToolbar').is_visible()
   assert not page.locator('#cropToggle').get_attribute('aria-pressed')=='true'
   assert 'task' in page.locator('#selectionQuick').inner_text().lower()
   return True
  test('Task selection shortcut reuses existing measurement toolbar rather than another crop editor',reselect)
  def dim_guard():
   fields(glareTaskMultiplier=.1);page.locator('#glareTaskMultiplier').dispatch_event('change')
   assert '100 or less' in page.locator('#glareTaskInfo').inner_text()
   click('glarePrepare');glare_done(True)
   assert not page.locator('#glarePreparedView').is_visible()
   assert download('pfm','source-after-rejected-task.pfm').read_bytes()==source
   click('glareDetectionDefaults');prepare();run();assert page.locator('#glareEv').inner_text()==baseline_ev
   return True
  test('Dim-task threshold ambiguity is blocked; fixed path recovers without rescaling',dim_guard)
  def guide_help():
   reveal('glareDetection');assert '-r' in page.locator('#glareDetectionDetails').inner_text()
   assert '11.46' in page.locator('#glareRadiusHelp').inner_text()
   assert 'legacy' in page.locator('#glareLowLightState').inner_text().lower()
   assert (ROOT/'GLARE_GUIDE.html').is_file()
   page.locator('#glareDetectionDetails').screenshot(path=str(OUT/'clear-glare-controls.png'))
   return True
  test('Inline help and result context expose parameter semantics and actual correction state',guide_help)
  def release_labels():
   expected=json.loads((ROOT/'package.json').read_text())['version']
   assert expected=='0.9.2'
   assert page.locator('[data-workspace-version]').inner_text()==expected
   assert report()['version']==expected
   for name in ['METHODS.html','GLARE.html','GLARE_GUIDE.html','START_HERE.html']:
    other=browser.new_page();other.set_content((ROOT/name).read_text())
    assert other.locator('[data-workspace-version]').count()>0,name
    assert all(t==expected for t in other.locator('[data-workspace-version]').all_text_contents()),name
    other.close()
   return True
  test('Workspace, methods, glare pages and exported session report agree on release 0.9.2',release_labels)
  def interpretation():
   summary=page.get_by_text('What do DGP, UGR and VCP mean?',exact=True)
   summary.click()
   section=summary.locator('..')
   assert '0.20' in section.inner_text() and 'personal' in section.inner_text()
   section.screenshot(path=str(OUT/'dgp-ugr-vcp-help.png'))
   guide=browser.new_page();guide.set_content((ROOT/'GLARE_GUIDE.html').read_text())
   assert guide.locator('#dgp').count()==1
   assert '0.20' in guide.locator('body').inner_text()
   guide.close();return True
  test('DGP interpretation explains 0.20 with the original low-end evidence limit',interpretation)
  def diabetic_name():
   page.locator('#eduCondition').select_option('diabetic')
   assert page.locator('#eduCondition option:checked').inner_text()=='Diabetic retinopathy simulation'
   assert 'disease stage' in page.locator('#conditionControlHelp').inner_text()
   page.locator('#simDomain').select_option('detail')
   # Choose a small local viewport; effect implementation is the existing seeded pattern.
   click('educate');assert 'Diabetic retinopathy simulation' in page.locator('#educationInfo').inner_text()
   assert download('pfm','source-after-condition.pfm').read_bytes()==source
   page.locator('#educationCard').screenshot(path=str(OUT/'diabetic-label.png'))
   return True
  test('Diabetic-retinopathy label reaches controls and real condition results without altering source',diabetic_name)
  def mobile():
   page.set_viewport_size({'width':430,'height':950});reveal('glareDetection')
   page.locator('#glareDetectionDetails').scroll_into_view_if_needed()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
   page.screenshot(path=str(OUT/'mobile-guidance.png'));return True
  test('New help and task controls do not cause narrow-screen page overflow',mobile)
  assert not errors,errors
 finally:
  (OUT/'tests.json').write_text(json.dumps({'passed':sum(t['passed'] for t in checks),'total':len(checks),'tests':checks,'pageErrors':errors,'browser':browser.version,'scope':__doc__},indent=2));browser.close()
print(json.dumps({'passed':len(checks)}))
