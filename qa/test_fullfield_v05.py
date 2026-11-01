"""Full-field, viewing masks, and calibration-preserving reset acceptance tests.
Production bundles, in-memory Chromium; only resource/worker URLs substituted.
"""
import json,re,time,shutil,hashlib,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa-output/fullfield';OUT.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1500,'height':1200},accept_downloads=True);page.set_default_timeout(20000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 html=re.sub(r'<script[^>]*src="js/app.bundle.js[^\"]*"[^>]*></script>','',(ROOT/'index.html').read_text());html=re.sub(r'<link[^>]*href="styles.css[^\"]*"[^>]*>','',html)
 page.set_content(html);page.add_style_tag(content=(ROOT/'styles.css').read_text());url=page.evaluate("s=>URL.createObjectURL(new Blob([s],{type:'text/javascript'}))",(ROOT/'js/engine.bundle.js').read_text())
 app=(ROOT/'js/app.bundle.js').read_text().replace("new URL('./engine.bundle.js?v=0.9.1',SCRIPT_URL)",json.dumps(url)).replace('const SCRIPT_URL=document.currentScript.src;',"const SCRIPT_URL='https://test.invalid/js/app.bundle.js';")
 page.add_script_tag(content=app)
 def ready(error=False):
  deadline=time.monotonic()+240
  while page.locator('#load').is_disabled():
   if time.monotonic()>deadline:raise AssertionError('Operation timeout: '+page.locator('#status').inner_text())
   page.wait_for_timeout(1000)
   if os.getenv('V05_TRACE'):print('WAIT',page.locator('#status').inner_text()[:160],flush=True)
  if not error and 'error' in page.locator('#statusbar').get_attribute('class'):raise AssertionError(page.locator('#status').inner_text())
 def click(id,error=False):
  if os.getenv('V05_TRACE'):print('CLICK',id,flush=True)
  page.locator('#'+id).click();ready(error)
  if os.getenv('V05_TRACE'):print('DONE',id,page.locator('#status').inner_text()[:160],flush=True)
 def state():return json.loads(page.locator('#metadata').text_content())
 def fields(**kw):
  for k,v in kw.items():
   page.locator('#'+k).evaluate('(el)=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true}')
   page.locator('#'+k).fill(str(v))
 def load(path):page.locator('#single').set_input_files(str(path));click('load')
 def download(id,name):
  with page.expect_download(timeout=240000) as d:click(id)
  dest=OUT/name;d.value.save_as(dest);return dest
 def report(name='session.json'):return json.loads(download('report',name).read_text())
 def core(d):return {k:d[k] for k in ['source','width','height','geometry','cropHistory','calibration','mask','summary','saved']}
 def test(name,fn):
  if os.getenv('V05_ROOM_ONLY') and not name.startswith(('Provided Photosphere','Narrow layout')):return
  if os.getenv('V05_QUICK') and not name.startswith(('Confirmed circular','Unaltered full-field','40-degree band','Viewing overlay can','Narrow layout')):return
  print('START',name,flush=True);start=time.perf_counter()
  try:
   val=fn();results.append({'name':name,'passed':True,'seconds':round(time.perf_counter()-start,3),'result':val});print('PASS',name,flush=True);(OUT/'progress.json').write_text(json.dumps({'tests':results,'pageErrors':errors},indent=2))
  except Exception as e:
   results.append({'name':name,'passed':False,'error':str(e)});page.screenshot(path=str(OUT/'failure.png'));(OUT/'results.json').write_text(json.dumps({'tests':results,'pageErrors':errors},indent=2));raise
 baseline=None
 def prepare():
  global baseline
  load(ROOT/'tests/fullfield-fixture.hdr');assert state()['version']=='0.9.0';assert state()['calibration']['kind']=='declared';assert state()['mask']['enabled'];page.locator('#geometryConfirm').check();click('applyGeometry')
  fields(roiX=115,roiY=115,roiW=25,roiH=25);page.locator('#calibration').select_option('patch');fields(measured=123.45);click('applyCalibration');click('saveA');fields(roiX=145,roiY=115,roiW=25,roiH=25);click('saveB')
  baseline=core(report('source-before.json'));assert baseline['saved']['A'];assert page.locator('#viewFov').is_disabled();assert page.locator('#fullSize').input_value()=='800';return baseline['calibration']
 test('Confirmed circular source selects whole-field mode and retains measured calibration and ROIs',prepare)
 def fullrun():
  click('simulate');assert page.locator('#simulationViews').is_visible();assert page.locator('#before').evaluate('(c)=>[c.width,c.height]')==[800,800];d=report('full-simulation.json');assert core(d)==baseline;assert d['simulation']['domain']=='full circular fisheye';assert d['simulation']['patches']==171;assert d['simulation']['geometry']['hfov']==180
  assert 'NaN' not in page.locator('#simulationInfo').inner_text();assert 'undefined' not in page.locator('#simulationInfo').inner_text();page.locator('#visibilityCard').screenshot(path=str(OUT/'full-circle-simulation.png'));download('simPNG','full-circle-comparison.png');return d['simulation']
 test('800x800 full-field simulation, no angular-export prerequisite, source unchanged',fullrun)
 def numeric_export():
  pfm=download('simExport','simulation.pfm').read_bytes();pgm=download('simMaskExport','simulation-support.pgm').read_bytes();assert pfm.startswith(b'Pf\n800 800\n-1.0\n');head=b'P5\n800 800\n255\n';assert pgm.startswith(head);v=pgm[len(head):];assert v[0]==0 and v[400*800+400]==255;return {'pfmBytes':len(pfm),'maskBytes':len(pgm)}
 test('Numeric full-field export includes explicit circular support mask',numeric_export)
 def reset_visibility():
  click('resetVisibility');d=report('visibility-reset.json');assert core(d)==baseline;assert d['simulation'] is None;assert page.locator('#simulationViews').is_hidden();assert page.locator('#simExport').is_disabled();assert page.locator('#sourceName').inner_text()!='Your analysis canvas';return True
 test('Reset visibility clears result, not crop geometry scale or saved measurements',reset_visibility)
 def unaltered():
  click('educate');assert page.locator('#eduAfter').evaluate('(c)=>[c.width,c.height]')==[800,800];assert page.locator('#eduAfter').evaluate('(c)=>c.toDataURL()')==page.locator('#eduBefore').evaluate('(c)=>c.toDataURL()');assert core(report())==baseline;return True
 test('Unaltered full-field color is identical before and after',unaltered)
 def band():
  page.locator('#fieldStyle').select_option('binary');click('showField');d=report('band-40.json');assert core(d)==baseline;v=d['fieldOverlay'];assert v['bandHeight']==40;assert abs(v['solidAngleSteradians']-2.148975939303298)<.003
  pgm=download('fieldMaskExport','band-40.pgm').read_bytes();data=pgm[len(b'P5\n800 800\n255\n'):];assert data[400*800+400]==255 and data[100*800+400]==0;assert data[400*800+750]==255;download('fieldPNG','band-40.png');page.locator('#fieldCard').screenshot(path=str(OUT/'band-40-interface.png'));return v
 test('40-degree band spans full fisheye width, exports binary mask, preserves source',band)
 def guth():
  page.locator('#fieldStyle').select_option('shade');counts={}
  masks={}
  for kind in ['guth-total','guth-both','cone','custom']:
   page.locator('#fieldType').select_option(kind);click('showField');d=report(kind+'.json');counts[kind]=d['fieldOverlay']['count'];assert core(d)==baseline;masks[kind]=download('fieldMaskExport',kind+'.pgm').read_bytes()[len(b'P5\n800 800\n255\n'):];download('fieldPNG',kind+'.png')
  assert counts['guth-total']>counts['guth-both']>counts['cone'];assert all(not b or a for a,b in zip(masks['guth-total'],masks['guth-both']));return counts
 test('Guth total, binocular subset, cone and custom upper-lower fields',guth)
 def falsecolor_overlay():
  page.locator('#fieldType').select_option('band');page.locator('#fieldBackground').select_option('false');fields(falseMin=1,falseMax=1000);page.locator('#falseScale').select_option('log');ready();page.locator('#fieldStyle').select_option('shade');click('showField');assert page.locator('#fieldLegend').is_visible();download('fieldPNG','band-falsecolor-legend.png');assert core(report())==baseline;page.locator('#fieldStyle').select_option('binary');click('showField');assert page.locator('#fieldLegend').is_hidden();assert core(report())==baseline;page.locator('#fieldStyle').select_option('shade');return True
 test('Viewing overlay can use luminance falsecolor and export its legend',falsecolor_overlay)
 def rotate_reset():
  fields(fieldYaw=25,fieldPitch=10,fieldRoll=15);click('showField');d=report();assert d['fieldOverlay']['yaw']==25;assert core(d)==baseline;click('resetField');d=report();assert d['fieldOverlay'] is None;assert core(d)==baseline;assert page.locator('#fieldView').is_hidden();assert page.locator('#fieldBand').input_value()=='40';return True
 test('Rotating and resetting field overlay does not alter calibrated image or simulations',rotate_reset)
 def educational():
  page.locator('#eduCondition').select_option('glaucoma');fields(eduSeverity=100,eduDiameter=40);click('educate');assert core(report())==baseline;page.locator('#educationCard').screenshot(path=str(OUT/'full-field-loss.png'));download('eduPNG','full-field-loss.png')
  fields(eduFocusX=0,eduFocusY=0);click('educate',True);assert 'outside the captured circular field' in page.locator('#status').inner_text();assert core(report())==baseline
  click('resetEducation');d=report();assert d['lowVisionConditions'] is None;assert core(d)==baseline;assert page.locator('#eduCondition').input_value()=='none';assert page.locator('#eduFocusX').input_value()=='0.5';return True
 test('Angular educational effect, invalid fixation guard, and isolated educational reset',educational)
 def combined():
  page.locator('#fullSize').select_option('512');page.locator('#tileSize').select_option('96');page.locator('#eduCondition').select_option('custom');page.locator('#eduAcuity').check();fields(eduBlur=.2);click('educate');d=report('combined-full-field.json');assert d['lowVisionConditions']['filterDetails']['patches']==171;assert d['lowVisionConditions']['blurDetails']['patches']==171;assert core(d)==baseline;return True
 test('Reduced-detail plus local angular Gaussian can run over full circular color image',combined)
 def detail_reset():
  page.locator('#simDomain').select_option('detail');fields(viewFov=30);page.locator('#simWidth').select_option('256');click('simulate');assert page.locator('#after').evaluate('(c)=>[c.width,c.height]')==[256,192];assert core(report())==baseline
  click('resetSimulations');d=report();assert core(d)==baseline;assert d['simulation'] is None and d['lowVisionConditions'] is None;assert page.locator('#simDomain').input_value()=='auto';assert page.locator('#fullSize').input_value()=='800';return True
 test('Local perspective mode remains available; Reset both restores defaults without source changes',detail_reset)
 def room():
  load('/mnt/data/room1.hdr');before=state()['calibration'];page.locator('#advancedMask').evaluate('(e)=>e.open=true');page.locator('#circle').check();fields(cx=.5,cy=.5,radius=.49);click('applyMask');page.locator('#advancedCrop').evaluate('(e)=>e.open=true');click('circleToCrop');click('applyCrop');page.locator('#projection').select_option('equisolid');fields(circleFov=180);click('deriveCircle');page.locator('#geometryConfirm').check();click('applyGeometry');source=core(report('room-source.json'));assert source['calibration']==before
  page.locator('#fullSize').select_option('800');page.locator('#tileSize').select_option('192');click('simulate');d=report('room-full-800.json');assert core(d)==source;assert d['simulation']['outputProjection']=='equisolid';assert page.locator('#after').evaluate('(c)=>[c.width,c.height]')==[800,800];download('simPNG','room-full-800.png');page.locator('#visibilityCard').screenshot(path=str(OUT/'room-full-800-interface.png'))
  page.locator('#fieldType').select_option('band');page.locator('#fieldBackground').select_option('natural');page.locator('#fieldStyle').select_option('shade');click('showField');download('fieldPNG','room-band-40.png');page.locator('#fieldType').select_option('guth-total');click('showField');download('fieldPNG','room-guth.png');assert core(report())==source
  click('resetSimulations');assert core(report('room-after-reset.json'))==source;return {'sourceDimensions':[source['width'],source['height']],'fileScale':source['calibration'],'sampling':d['simulation']['conservativeNyquistCPD'],'note':'Equisolid test geometry is an explicit assumption, not lens calibration.'}
 test('Provided Photosphere room: full 180-degree equisolid test, masks and resets preserve file calibration',room)
 def narrow():
  page.set_viewport_size({'width':390,'height':1000});assert page.evaluate('document.documentElement.scrollWidth')<=390;page.locator('#fieldCard').screenshot(path=str(OUT/'narrow-field-controls.png'));page.set_viewport_size({'width':1500,'height':1200});return True
 test('Narrow layout has no horizontal overflow',narrow)
 assert not errors,errors
 (OUT/'results.json').write_text(json.dumps({'tests':results,'pageErrors':errors},indent=2));b.close();print(json.dumps({'passed':len(results),'total':len(results)},indent=2))
