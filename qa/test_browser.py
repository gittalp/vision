"""Production bundle UI tests in an in-memory Chromium document.
The local environment blocks HTTP navigation; only the worker URL is substituted.
Run a normal live-host smoke test after deployment as described in START_HERE.
"""
import argparse,json,re,time,hashlib,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ap=argparse.ArgumentParser();ap.add_argument('--site',type=Path,default=Path(__file__).resolve().parents[1]);ap.add_argument('--data',type=Path,default=Path('/mnt/data'));ap.add_argument('--output',type=Path,default=Path('qa-output'));ap.add_argument('--mode',choices=['core','samples'],default='core');ap.add_argument('--brackets',type=Path);ap.add_argument('--synthetic',type=Path,default=Path(__file__).resolve().parent/'fixtures/synthetic16');ap.add_argument('--browser',default=shutil.which('chromium') or shutil.which('google-chrome'));args=ap.parse_args();root=args.site;O=args.output;O.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=args.browser,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 html=(root/'index.html').read_text();html=re.sub(r'<script[^>]*src="js/app.bundle.js[^\"]*"[^>]*></script>','',html);html=re.sub(r'<link[^>]*href="styles.css[^\"]*"[^>]*>','',html)
 page.set_content(html);page.add_style_tag(content=(root/'styles.css').read_text());engine=(root/'js/engine.bundle.js').read_text();worker_url=page.evaluate("s=>URL.createObjectURL(new Blob([s],{type:'text/javascript'}))",engine)
 app=(root/'js/app.bundle.js').read_text().replace("new URL('./engine.bundle.js?v=0.3.0',SCRIPT_URL)",json.dumps(worker_url)).replace('const SCRIPT_URL=document.currentScript.src;',"const SCRIPT_URL='https://test.invalid/js/app.bundle.js';");page.add_script_tag(content=app)
 def run(name,fn):
  print('START',name,flush=True);start=time.perf_counter()
  try:
   value=fn();results.append({'test':name,'passed':True,'seconds':round(time.perf_counter()-start,3),'result':value});print('PASS',name,'seconds',round(time.perf_counter()-start,3),flush=True);(O/'browser-tests-progress.json').write_text(json.dumps({'tests':results},indent=2))
  except Exception as e:
   results.append({'test':name,'passed':False,'error':str(e)});page.screenshot(path=str(O/'failure.png'),full_page=True);(O/'browser-tests.json').write_text(json.dumps({'tests':results,'pageErrors':errors},indent=2));raise
 def ready(allow_error=False):
  page.wait_for_function("!document.getElementById('load').disabled",timeout=60000)
  if not allow_error and 'error' in page.locator('#statusbar').get_attribute('class'):raise AssertionError(page.locator('#status').inner_text())
 def click(id,allow_error=False):page.locator('#'+id).click();ready(allow_error)
 def state():return json.loads(page.locator('#metadata').text_content())
 def fields(values):
  for key,value in values:page.locator('#'+key).fill(str(value))
 def configure(projection,hfov,vfov):
  page.locator('#projection').select_option(projection);fields([('sourceFov',hfov),('sourceVFov',vfov)]);page.locator('#geometryConfirm').check();click('applyGeometry')
 def dl(id,name):
  with page.expect_download(timeout=60000) as d:click(id)
  target=O/name;d.value.save_as(target);return target
 def demo():click('demo');assert state()['version']=='0.3.0';assert state()['width']==768;assert page.locator('#simulate').is_disabled();return state()['summary']['mean']
 run('startup and demo',demo)
 def geometry():
  before=state()['summary']['mean'];configure('perspective',60,42.10344887074584);assert state()['geometry']['confirmed'];assert state()['summary']['mean']==before;assert '-vtv' in page.locator('#viewPreview').inner_text();return state()['geometry']
 run('apply header geometry without pixel/calibration changes',geometry)
 def cal():
  fields([('roiX',250),('roiY',120),('roiW',40),('roiH',30)]);page.locator('#calibration').select_option('patch');fields([('measured',73)]);click('applyCalibration');click('measureRoi');assert '73' in page.locator('#roiResult').inner_text();return state()['calibration']['scale']
 run('single patch calibration',cal)
 before_crop=state()
 def crop():
  fields([('cropX',120),('cropY',70),('cropW',500),('cropH',350)]);click('applyCrop');s=state();assert s['width']==500 and s['height']==350;assert s['calibration']['scale']==before_crop['calibration']['scale'];assert s['geometry']['confirmed'];assert s['cropHistory'];assert s['canUndoCrop'];assert not s['canHeaderOnly'];assert page.locator('#headerOnly').is_disabled();return {'size':[s['width'],s['height']],'geometry':s['geometry']}
 run('actual off-center crop with scale preservation',crop)
 def header_export():
  f=dl('hdr','prepared-crop.hdr');head=f.read_bytes().split(b'\n\n',1)[0].decode();assert 'VIEW= -vtv' in head;assert 'VISIONSIM_GEOMETRY=' in head;assert b'-Y 350 +X 500\n' in f.read_bytes()[:5000];return {'bytes':f.stat().st_size,'view':next(x for x in head.splitlines() if x.startswith('VIEW='))}
 run('cropped HDR export includes corrected VIEW',header_export)
 def sim():
  fields([('viewFov',25)]);click('simulate');assert page.locator('#simulationViews').is_visible();return page.locator('#simulationInfo').inner_text()[:260]
 run('simulation uses applied cropped geometry',sim)
 def display():
  before=state()['summary'];page.locator('#displayMode').select_option('false');ready();fields([('ev',3)]);page.locator('#ev').dispatch_event('change');ready();assert state()['summary']==before;assert page.locator('#legend').is_visible();return True
 run('display controls do not alter measurements',display)
 page.screenshot(path=str(O/'desktop-crop.png'),full_page=True)
 def report():
  f=dl('report','crop-report.json');d=json.loads(f.read_text());assert d['cropHistory'];assert d['geometry']['confirmed'];assert d['calibration']['scale']==before_crop['calibration']['scale'];return d['schema']
 run('JSON includes crop, calibration and applied geometry',report)
 def undo():
  click('undoCrop');s=state();assert s['width']==768 and s['height']==512;assert s['calibration']==before_crop['calibration'];assert s['geometry']==before_crop['geometry'];assert s['summary']==before_crop['summary'];return True
 run('undo restores full raster and metadata',undo)
 def header_only():
  f=dl('headerOnly','demo-header-only.hdr');head=f.read_bytes().split(b'\n\n',1)[0].decode();assert 'EXPOSURE=1\n' in head;assert 'VISIONSIM_UNITS=relative' in head;return 'Retained original relative file records despite a session patch calibration.'
 run('header-only export does not apply session calibration',header_only)
 def failure_recovery():
  fields([('cropW',999999)]);click('applyCrop',True);assert 'error' in page.locator('#statusbar').get_attribute('class');assert state()['width']==768;fields([('cropW',768)]);click('render');return True
 run('invalid crop does not destroy current image',failure_recovery)
 def badview():
  page.locator('summary').filter(has_text='Paste / inspect').click();fields([('viewText','VIEW= -vta -vh 180 -vv 180')]);click('parseView');assert page.locator('#simulate').is_disabled();page.locator('#geometryConfirm').check();click('applyGeometry');assert '-vta' in page.locator('#viewPreview').inner_text();return True
 run('manual VIEW draft parse and confirm',badview)
 if args.mode=='samples':
  def load_hdr():
   page.locator('#single').set_input_files(str(args.data/'room1.hdr'));click('load');assert state()['width']==5472;assert not state()['geometry']['confirmed'];return {'width':state()['width'],'height':state()['height'],'mean':state()['summary']['mean']}
  run('provided Canon/Photosphere HDR full-resolution import',load_hdr)
  def room_prepare():
   # Test geometry is explicitly assumed; this is not a lens calibration.
   page.locator('#circle').check();fields([('cx',.5),('cy',.5),('radius',.49)]);click('applyMask');click('circleToCrop');click('applyCrop');page.locator('#projection').select_option('equidistant');page.locator('summary').filter(has_text='Define angles').click();fields([('circleFov',180)]);click('deriveCircle');page.locator('#geometryConfirm').check();click('applyGeometry');assert state()['cropHistory'];return {'shape':[state()['width'],state()['height']],'geometry':state()['geometry']}
  run('room image circle to pixel crop to corrected header',room_prepare)
  run('room crop simulation',sim)
  f=dl('hdr','prepared-room.hdr')
  def reimport():
   page.locator('#single').set_input_files(str(f));click('load');assert state()['header']['geometry']['projection']=='equidistant';assert state()['mask']['enabled'];assert not state()['geometry']['confirmed'];return [state()['width'],state()['height']]
  run('prepared HDR reimport retains circle and geometry draft',reimport)
  page.screenshot(path=str(O/'room-prepared.png'),full_page=True)
  def load_exr():
   page.locator('#single').set_input_files(str(args.data/'room1.exr'));click('load');assert state()['width']==5472;return {'width':state()['width'],'height':state()['height'],'mean':state()['summary']['mean']}
  run('provided Canon/Photosphere PIZ EXR import',load_exr)
  def bracket_sample():
   page.locator('#route').select_option('bracket');files=sorted((args.brackets or args.data/'bracket').glob('*.JPG'));page.locator('#bracket').set_input_files([str(f) for f in files]);ready();assert page.locator('.exposure').count()==len(files);page.locator('#bracketWidth').select_option('1024');page.locator('#bracketConfirm').check();click('merge');s=state();assert s['quality']['inputCount']==len(files);return {'inputCount':len(files),'dimensions':[s['width'],s['height']],'quality':s['quality'],'memory':s['memoryPlan']}
  run('separate-scene supplied exposure bracket streaming reconstruction',bracket_sample)
  page.screenshot(path=str(O/'bracket-merged.png'),full_page=True)
 # A generated 16-JPEG sequence proves the browser no longer rejects file 13.
 def sixteen():
  print('sixteen: select route',flush=True);page.locator('#route').select_option('bracket');files=sorted(args.synthetic.glob('*.jpg'));assert len(files)==16;print('sixteen: select files',flush=True);page.locator('#bracket').set_input_files([str(f) for f in files]);print('sixteen: wait inspection',flush=True);ready();print('sixteen: fill times',flush=True);assert page.locator('.exposure').count()==16
  for i,el in enumerate(page.locator('.exposure').all()):
   print('sixteen: exposure',i,flush=True);el.fill(str(2**(i-12)))
  page.locator('#bracketWidth').select_option('1024');page.locator('#bracketConfirm').check();click('merge');s=state();assert s['quality']['inputCount']==16;return {'inputCount':16,'dimensions':[s['width'],s['height']],'quality':s['quality']}
 run('16-exposure browser merge (above former count cap)',sixteen)
 def budget():
  before=state()['summary'];fields([('budgetMiB',64)]);page.locator('#budgetMiB').dispatch_event('change');click('merge',True);assert 'memory budget' in page.locator('#status').inner_text();assert state()['summary']==before;fields([('budgetMiB',1024)]);click('render');return True
 run('size-based memory gate preserves previous result',budget)
 def mobile():
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(O/'mobile.png'),full_page=True);d=page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert d['scroll']<=390;return d
 run('mobile no horizontal overflow',mobile)
 assert not errors,errors
 results.append({'test':'no uncaught page errors','passed':True})
 (O/'browser-tests.json').write_text(json.dumps({'mode':args.mode,'browser':browser.version,'navigation':'in-memory production bundles; worker and resource-base URLs substituted','tests':results},indent=2));browser.close()
print(json.dumps({'passed':sum(t['passed'] for t in results),'tests':len(results)},indent=2))
