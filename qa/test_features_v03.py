"""Tests production v0.3 bundles; replaces worker/resource URLs for in-memory Chromium."""
import json,re,time,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(__file__).resolve().parents[1]/'qa-output/features-browser';OUT.mkdir(parents=True,exist_ok=True)
FIX=ROOT/'tests/phone-fixtures';results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1500,'height':1000},accept_downloads=True);page.set_default_timeout(12000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 html=re.sub(r'<script[^>]*src="js/app.bundle.js[^\"]*"[^>]*></script>','',(ROOT/'index.html').read_text());html=re.sub(r'<link[^>]*href="styles.css[^\"]*"[^>]*>','',html)
 page.set_content(html);page.add_style_tag(content=(ROOT/'styles.css').read_text());url=page.evaluate("s=>URL.createObjectURL(new Blob([s],{type:'text/javascript'}))",(ROOT/'js/engine.bundle.js').read_text());app=(ROOT/'js/app.bundle.js').read_text().replace("new URL('./engine.bundle.js?v=0.9.0',SCRIPT_URL)",json.dumps(url)).replace('const SCRIPT_URL=document.currentScript.src;',"const SCRIPT_URL='https://test.invalid/js/app.bundle.js';");page.add_script_tag(content=app)
 def state():return json.loads(page.locator('#metadata').text_content())
 def ready(error=False):
  page.wait_for_function("!document.getElementById('load').disabled",timeout=30000)
  if not error and 'error' in page.locator('#statusbar').get_attribute('class'):raise AssertionError(page.locator('#status').inner_text())
 def click(id,error=False):page.locator('#'+id).click();ready(error)
 def fields(**kw):
  for k,v in kw.items():page.locator('#'+k).fill(str(v))
 def load(name,error=False):page.locator('#single').set_input_files(str(FIX/name));click('load',error)
 def apply():page.locator('#geometryConfirm').check();click('applyGeometry')
 def download(id,name):
  with page.expect_download() as d:click(id)
  dest=OUT/name;d.value.save_as(dest);return dest
 def test(name,fn):
  print('START',name,flush=True);start=time.perf_counter()
  try:val=fn();results.append({'name':name,'passed':True,'seconds':round(time.perf_counter()-start,3),'result':val});print('PASS',name,flush=True)
  except Exception as e:
   results.append({'name':name,'passed':False,'error':str(e)});page.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'results.json').write_text(json.dumps({'tests':results,'pageErrors':errors},indent=2));raise
 def fov():
  click('demo');click('calculateFov');assert abs(float(page.locator('#sourceFov').input_value())-73.73979529168804)<1e-9;apply();assert state()['fovProvenance']['method']=='sensor';return state()['geometry']
 test('FOV calculator integrates into confirmed VIEW',fov)
 def falsecolor():
  before=state()['summary'];click('range1000');assert page.locator('#falseScale').input_value()=='linear';assert page.locator('#legend').is_visible();assert 'linear' in page.locator('#legendUnits').text_content();assert state()['summary']==before
  page.locator('#falsePalette').select_option('thermal');ready();page.locator('#falseBands').select_option('10');ready();assert state()['summary']==before
  f=download('png','falsecolor-linear-with-legend.png');return {'pngBytes':f.stat().st_size,'range':[page.locator('#falseMin').input_value(),page.locator('#falseMax').input_value()]}
 test('Linear falsecolor includes zero, palette, bands and PNG legend',falsecolor)
 def invalid_log():
  fields(falseMin=0,falseMax=100);page.locator('#falseScale').select_option('log');ready(True);assert 'greater than zero' in page.locator('#status').inner_text();fields(falseMin=.1,falseMax=1000);click('render');assert 'logarithmic' in page.locator('#legendUnits').text_content();f=download('png','falsecolor-log-with-legend.png');return f.stat().st_size
 test('Log minimum validation and recovery',invalid_log)
 def independence():
  mean=state()['summary']['mean'];a=page.locator('#image').evaluate('(c)=>c.toDataURL()');fields(ev=4);page.locator('#ev').dispatch_event('change');ready();assert page.locator('#image').evaluate('(c)=>c.toDataURL()')==a;assert state()['summary']['mean']==mean;return True
 test('Falsecolor is invariant to display exposure and source measurements',independence)
 def education():
  original=state()['summary'];fields(viewFov=40,ev=0);page.locator('#simWidth').select_option('256');out={}
  for c in ['none','cataract','glaucoma','amd','diabetic','color','custom']:
   page.locator('#eduCondition').select_option(c);click('educate');assert page.locator('#educationViews').is_visible();assert state()['summary']==original;out[c]=page.locator('#eduAfter').evaluate('(c)=>c.toDataURL()')
  assert out['none']!=out['cataract'];assert out['glaucoma']!=out['amd'];assert out['color'] # grayscale demo makes CVD nearly identity
  page.locator('#eduCondition').select_option('diabetic');click('educate');assert page.locator('#eduAfter').evaluate('(c)=>c.toDataURL()')==out['diabetic']
  f=download('eduPNG','educational-comparison.png');report=json.loads(download('report','educational-report.json').read_text());assert report['lowVisionConditions']['sourceMeasurementUnchanged'];return {'conditions':len(out),'pngBytes':f.stat().st_size}
 test('All educational conditions, deterministic spots, unchanged measurements and exports',education)
 def acuity():
  page.locator('#eduAcuity').check();click('educate');assert 'Reduced-detail step included' in page.locator('#educationInfo').text_content();page.locator('#eduAcuity').uncheck();return True
 test('Optional reduced-detail step precedes educational effect',acuity)
 def photo():
  load('plain-camera.jpg');s=state();assert s['fovSuggestion']['focalLengthMM']==24;assert 'Metadata estimate' in page.locator('#fovResult').text_content();assert not s['geometry'];click('calculateFov');apply();assert abs(state()['geometry']['hfov']-73.73979529168804)<1e-9;return s['fovSuggestion']
 test('Camera EXIF auto suggestion and reviewable rectilinear FOV',photo)
 def portrait():
  load('orientation-6.jpg');s=state();assert [s['width'],s['height']]==[64,96];click('calculateFov');apply();assert abs(state()['geometry']['hfov']-53.13010235415598)<1e-9;return [s['width'],s['height']]
 test('Phone portrait rotation and FOV axes',portrait)
 def hdr_jpeg():
  for name in ['gain-xmp.jpg','gain-iso.jpg','gain-apple.jpg']:
   load(name);s=state();assert s['phone']['decodedHDR'];assert s['summary']['maximum']>4;assert s['calibration']['kind']=='relative';assert s['scaleCandidate'] is None
  click('calculateFov');apply();click('educate');assert page.locator('#educationViews').is_visible();return {'maxRelativeY':s['summary']['maximum'],'kind':s['phone']['kind']}
 test('Actual browser JPEG decode and float HDR gain reconstruction (Adobe XMP, ISO and Apple XMP)',hdr_jpeg)
 def phone_cal():
  fields(roiX=60,roiY=20,roiW=20,roiH=20);page.locator('#calibration').select_option('patch');fields(measured=120);click('applyCalibration');click('measureRoi');assert '120' in page.locator('#roiResult').text_content();click('range1000');assert 'cd/m' in page.locator('#legendUnits').text_content();return state()['calibration']['kind']
 test('Phone patch anchor remains explicitly an anchor; legend uses active units',phone_cal)
 def explicit_fallback():
  load('gain-unsupported.jpg',True);assert 'SDR base only' in page.locator('#status').text_content();page.locator('summary').filter(has_text='Phone HDR / HEIC import').click();page.locator('#phoneMode').select_option('sdr');load('gain-unsupported.jpg');assert not state()['phone']['decodedHDR'];assert state()['phone']['detectedHDR'];page.locator('#phoneMode').select_option('auto');return state()['phone']
 test('Unsupported gain metadata fails closed; explicit SDR fallback is recorded',explicit_fallback)
 def heic_guard():
  load('native-container.heif',True);assert 'optional local libheif codec' in page.locator('#status').text_content();return page.locator('#status').text_content()
 test('HEIF codec absence gives explicit install/permission route',heic_guard)
 def screenshot():
  click('demo');click('calculateFov');apply();click('range1000');page.locator('#falsePalette').select_option('photosphere');ready();page.locator('#falseBands').select_option('0');ready();page.locator('#eduCondition').select_option('cataract');click('educate');page.screenshot(path=str(OUT/'desktop.png'),full_page=True);page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'mobile.png'),full_page=True);assert page.evaluate('document.documentElement.scrollWidth')<=390;return True
 test('Desktop screenshot and narrow layout without horizontal overflow',screenshot)
 assert not errors,errors
 (OUT/'results.json').write_text(json.dumps({'browser':b.version,'tests':results,'pageErrors':errors,'navigation':'Production bundles in in-memory page; worker and resource base URLs substituted. HEIC binary unavailable in environment.'},indent=2));b.close()
print(json.dumps({'passed':len(results),'total':len(results)},indent=2))
