"""Production bundle visual-crop and calibration regression. No d10.hdr supplied.
Uses an in-memory page because runtime browser navigation is blocked by policy.
"""
import json,re,time,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa-output/visual-crop';OUT.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1450,'height':1300},accept_downloads=True);page.set_default_timeout(15000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 html=re.sub(r'<script[^>]*src="js/app.bundle.js[^\"]*"[^>]*></script>','',(ROOT/'index.html').read_text());html=re.sub(r'<link[^>]*href="styles.css[^\"]*"[^>]*>','',html)
 page.set_content(html);page.add_style_tag(content=(ROOT/'styles.css').read_text());url=page.evaluate("s=>URL.createObjectURL(new Blob([s],{type:'text/javascript'}))",(ROOT/'js/engine.bundle.js').read_text())
 app=(ROOT/'js/app.bundle.js').read_text().replace("new URL('./engine.bundle.js?v=0.9.2',SCRIPT_URL)",json.dumps(url)).replace('const SCRIPT_URL=document.currentScript.src;',"const SCRIPT_URL='https://test.invalid/js/app.bundle.js';")
 page.add_script_tag(content=app)
 def ready(error=False):
  page.wait_for_function("!document.querySelector('#load').disabled",timeout=90000)
  if not error and 'error' in page.locator('#statusbar').get_attribute('class'):raise AssertionError(page.locator('#status').inner_text())
 def click(id,error=False):page.locator('#'+id).click();ready(error)
 def state():return json.loads(page.locator('#metadata').text_content())
 def fields(**kw):
  for k,v in kw.items():
   page.locator('#'+k).evaluate('(el)=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true}')
   page.locator('#'+k).fill(str(v))
 def load(file):page.locator('#single').set_input_files(str(file));click('load')
 def open_crop(shape='rectangle'):
  if page.locator('#cropToggle').get_attribute('aria-pressed')!='true':click('cropToggle')
  if page.locator('#cropShape').input_value()!=shape:page.locator('#cropShape').select_option(shape);ready()
  page.evaluate('window.scrollTo(0,Math.max(0,document.getElementById("canvasStage").getBoundingClientRect().top+scrollY-document.getElementById("cropToolbar").offsetHeight-20))')
 def screen(x,y):
  s=state();box=page.locator('#overlay').bounding_box();return box['x']+x/s['width']*box['width'],box['y']+y/s['height']*box['height']
 def drag(a,z):
  page.evaluate('window.scrollTo(0,Math.max(0,document.getElementById("canvasStage").getBoundingClientRect().top+scrollY-document.getElementById("cropToolbar").offsetHeight-20))');x,y=screen(*a);ex,ey=screen(*z)
  page.mouse.move(x,y);page.mouse.down();page.mouse.move(ex,ey,steps=8);page.mouse.up();ready()
 def selected():return {k:int(page.locator('#'+id).input_value()) for k,id in [('x','cropX'),('y','cropY'),('w','cropW'),('h','cropH')]}
 def download(id,name):
  with page.expect_download(timeout=90000) as d:click(id)
  dest=OUT/name;d.value.save_as(dest);return dest
 def test(name,fn):
  print('START',name,flush=True);start=time.perf_counter()
  try:
   val=fn();results.append({'name':name,'passed':True,'seconds':round(time.perf_counter()-start,3),'result':val});print('PASS',name,flush=True)
  except Exception as e:
   results.append({'name':name,'passed':False,'error':str(e)});page.screenshot(path=str(OUT/'failure.png'));(OUT/'results.json').write_text(json.dumps({'tests':results,'pageErrors':errors},indent=2));raise
 def startup():
  click('demo');assert state()['version']=='0.9.0';assert state()['calibration']['kind']=='relative';assert not page.locator('#advancedCrop').get_attribute('open');assert page.locator('#cropToggle').get_attribute('aria-pressed')=='false';return True
 test('New demo remains relative; coordinates are optional',startup)
 def rectangle():
  before=state();open_crop();drag((80,60),(600,420));r=selected();assert r=={'x':80,'y':60,'w':520,'h':360};assert state()['summary']==before['summary'];click('applyVisualCrop');s=state();assert [s['width'],s['height']]==[520,360];assert s['calibration']==before['calibration'];assert page.locator('#cropToggle').get_attribute('aria-pressed')=='false';return s['cropHistory'][-1]
 test('Draw rectangle on canvas without coordinate boxes; only Apply changes image',rectangle)
 def undo():
  click('undoCanvasCrop');assert [state()['width'],state()['height']]==[768,512];return True
 test('On-canvas undo restores original raster',undo)
 def moving():
  open_crop();drag((100,80),(400,300));drag((230,190),(250,200));r=selected();assert r=={'x':120,'y':90,'w':300,'h':220};page.locator('#overlay').press('Shift+ArrowRight');assert selected()['x']==130;page.locator('#overlay').press('ArrowDown');assert selected()['y']==91
  drag((430,311),(470,350));assert selected()=={'x':130,'y':91,'w':340,'h':259};click('exitCrop');assert state()['width']==768;return selected()
 test('Move, resize, keyboard nudge and cancel leave no accidental crop',moving)
 def circle():
  open_crop('circle');drag((140,40),(570,470));r=selected();assert r=={'x':140,'y':40,'w':430,'h':430};page.mouse.move(*screen(500,400));page.screenshot(path=str(OUT/'circle-crosshairs.png'))
  click('applyVisualCrop');s=state();assert s['width']==430 and s['height']==430;assert s['mask']=={'enabled':True,'cx':.5,'cy':.5,'radius':.5};assert s['summary']['count']<430**2;assert page.locator('#simulate').is_disabled();return {'mask':s['mask'],'valid':s['summary']['count']}
 test('Circle crop trims square bounds and excludes outside; no FOV guessed',circle)
 def maskundo():
  click('undoCanvasCrop');assert not state()['mask']['enabled'];open_crop('circle');drag((120,40),(520,440));click('circleMaskOnly');assert state()['width']==768;assert state()['mask']['enabled'];assert state()['undoKind']=='mask';click('undoCanvasCrop');assert not state()['mask']['enabled'];return True
 test('Mask-only option and undo do not crop or rescale',maskundo)
 def scaled_import():
  load(ROOT/'tests/crop-fixtures/known-scale.hdr');s=state();assert s['calibration']['kind']=='declared';assert s['calibration']['scale']==179;assert abs(s['summary']['mean']-89.150390625)<1e-5;assert s['geometry'] is None;assert 'unverified' in page.locator('#activeScaleTitle').inner_text();return s['summary']['mean']
 test('HDR file scale applied at import; repeated EXPOSURE and COLORCORR are reversed once',scaled_import)
 def relative():
  page.locator('#importScale').select_option('relative');load(ROOT/'tests/crop-fixtures/known-scale.hdr');assert abs(state()['summary']['mean']-.498046875)<1e-7;assert page.locator('#useFileScale').is_visible();click('useFileScale');assert abs(state()['summary']['mean']-89.150390625)<1e-5;assert not page.locator('#useFileScale').is_visible();return True
 test('Explicit relative route and single-click file-scale recovery',relative)
 def patch_mask():
  fields(roiX=80,roiY=65,roiW=20,roiH=20);page.locator('#calibration').select_option('patch');fields(measured=123.45);click('applyCalibration');before=state()['calibration'];assert abs(state()['summary']['mean']-123.45)<1e-4
  open_crop('circle');drag((40,20),(160,140));click('circleMaskOnly');assert state()['calibration']==before;assert abs(state()['summary']['mean']-123.45)<1e-4
  open_crop('circle');drag((40,20),(160,140));click('applyVisualCrop');assert state()['calibration']==before;assert abs(state()['summary']['mean']-123.45)<1e-4;return before['scale']
 test('Patch calibration survives circle mask AND subsequent circular crop',patch_mask)
 def pixels():
  x,y=screen(0,0);page.mouse.move(x+1,y+1);page.wait_for_timeout(500);assert 'outside valid support' in page.locator('#pixel').inner_text();x,y=screen(60,60);page.mouse.move(x,y);page.wait_for_timeout(500);assert '123.45' in page.locator('#pixel').inner_text();return page.locator('#pixel').inner_text()
 test('Pixel inspection respects mask and current calibrated scale before FOV',pixels)
 def exports():
  page.locator('#projection').select_option('equidistant');fields(sourceFov=180,sourceVFov=180);page.locator('#geometryConfirm').check();click('applyGeometry');orig=state();f=download('hdr','cropped-and-calibrated.hdr');report=json.loads(download('report','cropped-and-calibrated.json').read_text());assert report['calibration']['kind']=='patch';assert report['mask']['enabled']
  page.locator('#importScale').select_option('file');load(f);s=state();assert [s['width'],s['height']]==[120,120];assert s['mask']['enabled'];assert abs(s['summary']['mean']-123.45)/123.45<.005;return {'before':orig['summary']['mean'],'reimport':s['summary']['mean']}
 test('Crop, geometry, calibrated HDR export and reimport retain scale and circle',exports)
 def display_independence():
  before=state()['summary'];click('range1000');fields(ev=3);page.locator('#ev').dispatch_event('change');ready();assert state()['summary']==before;assert 'cd/m' in page.locator('#legendUnits').inner_text();return True
 test('Falsecolor range and preview exposure remain measurement-independent',display_independence)
 def cssresize():
  page.locator('#demo').evaluate('(e)=>e.click()');ready();page.set_viewport_size({'width':390,'height':900});open_crop('circle');drag((140,40),(570,470));r=selected();assert r=={'x':140,'y':40,'w':430,'h':430},r
  assert page.evaluate('document.documentElement.scrollWidth')<=390;page.screenshot(path=str(OUT/'mobile-crop.png'));click('exitCrop');page.set_viewport_size({'width':1450,'height':1300});return r
 test('Narrow viewport CSS scaling selects the same source pixels',cssresize)
 def dirty():
  fields(sourceFov=80);open_crop('rectangle');drag((100,50),(500,400));click('applyVisualCrop',True);assert 'pending header edits' in page.locator('#status').inner_text();assert state()['width']==768;assert selected()['w']==400;click('discardGeometry');click('applyVisualCrop');assert state()['width']==400;return True
 test('Pending header edits block crop without destroying draft or image',dirty)
 def room():
  load('/mnt/data/room1.hdr');s=state();assert s['calibration']['kind']=='declared';assert [s['width'],s['height']]==[5472,3648];mean=s['summary']['mean'];fields(ev=0);page.locator('#displayMode').select_option('natural');ready();open_crop('circle');drag((956,44),(4516,3604));r=selected();assert r['w']==r['h']==3560,r
  page.locator('#displayMode').select_option('natural');ready();page.mouse.move(*screen(3200,900));page.screenshot(path=str(OUT/'room-crosshair-preview.png'));page.locator('.workspace > section').first.screenshot(path=str(OUT/'room-visual-crop.png'))
  click('applyVisualCrop');s=state();assert s['calibration']['scale']==179;assert [s['width'],s['height']]==[3560,3560];click('range1000');download('png','room-cropped-falsecolor.png');return {'originalMean':mean,'croppedMean':s['summary']['mean'],'scale':s['calibration']['scale'],'note':'Different whole-image means are expected from selecting a different pixel subset; the per-pixel multiplier is unchanged.'}
 test('Full-resolution provided Photosphere HDR: visual circular crop with file scale retained',room)
 assert not errors,errors
 (OUT/'results.json').write_text(json.dumps({'browser':b.version,'navigation':'In-memory production bundles; worker URL substituted. localhost HTTP navigation is blocked in this environment.','tests':results,'pageErrors':errors},indent=2));b.close()
print(json.dumps({'passed':len(results),'total':len(results)},indent=2))
