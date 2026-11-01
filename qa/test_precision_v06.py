"""Production UI tests: polygon regions, fields, chromaticity, Snellen, annotations.
In-memory Chromium page; only resource resolution is substituted.
"""
import json,re,time,shutil,hashlib,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa-output/precision';OUT.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1600,'height':1500},accept_downloads=True);page.set_default_timeout(20000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 html=re.sub(r'<script[^>]*src="js/app.bundle.js[^\"]*"[^>]*></script>','',(ROOT/'index.html').read_text());html=re.sub(r'<link[^>]*href="styles.css[^\"]*"[^>]*>','',html)
 page.set_content(html);page.add_style_tag(content=(ROOT/'styles.css').read_text());url=page.evaluate("s=>URL.createObjectURL(new Blob([s],{type:'text/javascript'}))",(ROOT/'js/engine.bundle.js').read_text())
 app=(ROOT/'js/app.bundle.js').read_text().replace("new URL('./engine.bundle.js?v=0.9.0',SCRIPT_URL)",json.dumps(url)).replace('const SCRIPT_URL=document.currentScript.src;',"const SCRIPT_URL='https://test.invalid/js/app.bundle.js';");page.add_script_tag(content="window.__qaWorkers=[];const OriginalWorker=window.Worker;window.Worker=class extends OriginalWorker{constructor(...args){super(...args);window.__qaWorkers.push(this);}};");page.add_script_tag(content=app)
 def ready(error=False):
  page.wait_for_function("!document.getElementById('load').disabled",timeout=60000)
  if not error and 'error' in page.locator('#statusbar').get_attribute('class'):raise AssertionError(page.locator('#status').inner_text())
 def click(id,error=False):
  if os.getenv('QA_TRACE'): print('CLICK',id,flush=True)
  page.locator('#'+id).click();
  if os.getenv('QA_TRACE'): print('DISPATCH',id,flush=True)
  ready(error)
  if os.getenv('QA_TRACE'): print('DONE',id,flush=True)
 def fields(**kw):
  for k,v in kw.items():
   page.locator('#'+k).evaluate('(el)=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true}')
   page.locator('#'+k).fill(str(v))
 def download(id,name):
  with page.expect_download(timeout=60000) as e:click(id)
  f=OUT/name;e.value.save_as(f);return f
 def report(name='report.json'):return json.loads(download('report',name).read_text())
 def core(d):return {k:d[k] for k in ['width','height','summary','mask','calibration','geometry','cropHistory']}
 def test(name,fn):
  print('START',name,flush=True);t=time.time()
  try:r=fn();results.append({'test':name,'passed':True,'seconds':time.time()-t,'result':r});print('PASS',name,flush=True)
  except Exception as e:results.append({'test':name,'passed':False,'error':str(e)});print('ERROR',str(e),flush=True);(OUT/'tests.json').write_text(json.dumps({'tests':results,'pageErrors':errors},indent=2));raise
  (OUT/'tests.json').write_text(json.dumps({'tests':results,'pageErrors':errors},indent=2))
 def polygon(points):
  page.locator('#roiShape').select_option('polygon');click('newROI');page.locator('#overlay').scroll_into_view_if_needed();bb=page.locator('#overlay').bounding_box()
  for x,y in points:page.mouse.click(bb['x']+x*bb['width'],bb['y']+y*bb['height']);page.wait_for_timeout(25)
  click('finishROI')
 def rect(x,y,w,h):fields(roiX=x,roiY=y,roiW=w,roiH=h)
 def load():
  page.locator('#single').set_input_files(str(ROOT/'tests/precision-fixture.hdr'));click('load');assert not page.locator('#showCircleBoundary').is_checked();page.locator('#geometryConfirm').check();click('applyGeometry');d=report('baseline.json');assert d['calibration']['kind']=='declared';return d['summary']
 test('Load calibrated circular fixture; crop circle guide hidden by default',load)
 baseline=core(report());native=download('pfm','baseline.pfm').read_bytes()
 def target():
  polygon([(.40,.40),(.57,.40),(.59,.56),(.43,.58)]);click('saveA');d=report('polygon-target.json');assert d['saved']['A']['region']['type']=='polygon';assert d['saved']['A']['count']>5000;assert core(d)==baseline;return d['saved']['A']['mean']
 test('Draw and save polygon target on primary source canvas',target)
 def surround():
  polygon([(.30,.30),(.68,.30),(.68,.68),(.30,.68)]);assert 'outer minus A' in page.locator('#roiResult').inner_text();assert 'Preview only' in page.locator('#selectionQuick').inner_text();click('saveB');d=report('surround.json');assert d['saved']['B']['region']['type']=='difference';assert d['saved']['B']['mean']<d['saved']['A']['mean'];assert d['contrast']['ratio']>2;assert core(d)==baseline;page.locator('#measurementsCard').screenshot(path=str(OUT/'polygon-statistics.png'));return {'A':d['saved']['A']['count'],'B_without_A':d['saved']['B']['count'],'ratio':d['contrast']['ratio']}
 test('Automatic contained-target subtraction and A/background ratio',surround)
 def partial():
  rect(50,50,180,180);click('saveB');d=report('partial.json');assert d['saved']['B']['region']['type']=='rectangle';assert core(d)==baseline;return True
 test('Partial overlap remains explicit B region, no automatic subtraction',partial)
 def circle_clear():
  page.locator('#showCircleBoundary').check();page.locator('#showCircleBoundary').uncheck();click('clearROI');assert 'Draft cleared' in page.locator('#selectionQuick').inner_text();assert core(report())==baseline;return True
 test('Show/hide guide and clear selection do not change measured image',circle_clear)
 def snellen():
  fields(snellen=20);assert float(page.locator('#logmar').input_value())==0;fields(snellen=40);assert abs(float(page.locator('#logmar').input_value())-.3010299957)<1e-9;fields(logmar=1);assert float(page.locator('#snellen').input_value())==200;return page.locator('#acuityReadout').inner_text()
 test('Snellen and logMAR synchronize bidirectionally without coarse snapping',snellen)
 def field():
  page.locator('#fieldType').select_option('guth-both');page.locator('#fieldStyle').select_option('outline');page.locator('#fieldColor').fill('#ee5656');click('showField');assert page.locator('#fieldView').is_visible();assert core(report())==baseline;click('measureField');assert 'native source' in page.locator('#fieldMeasurementResult').inner_text();return page.locator('#fieldMeasurementResult').inner_text()
 test('Guth field rendered on primary canvas and native region luminance measured',field)
 def intersection():
  page.locator('#limitField').check();ready();rect(70,20,350,180);click('measureRoi');assert 'Restricted to the saved viewing field' in page.locator('#roiResult').inner_text();click('saveA');d=report('field-roi.json');assert d['saved']['A']['field']['type']=='guth-both';assert d['saved']['A']['count']<350*180;assert core(d)==baseline;return d['saved']['A']['count']
 test('Region selection intersects viewing field using source pixels',intersection)
 def rings():
  page.locator('#ringsEnabled').check();fields(ringStep=10,ringMax=80,ringOpacity=65);page.locator('#ringColor').fill('#d9eced');click('applyRings');d=report('rings.json');assert d['annotationRings']['step']==10 and d['annotationRings']['opacity']==.65;assert core(d)==baseline;download('fieldPNG','guth-and-rings.png');download('png','source-with-rings.png');assert download('pfm','with-annotations.pfm').read_bytes()==native;return d['annotationRings']
 test('Colored transparent 10-degree rings export without changing numeric pixels',rings)
 def cone_diameter():
  page.locator('#ringConvention').select_option('diameter');fields(ringMax=60,ringStep=60);click('applyRings');d=report();assert d['annotationRings']['convention']=='diameter';assert core(d)==baseline;return True
 test('Cone diameter labels selected independently from radius convention',cone_diameter)
 def color():
  page.locator('#simDomain').select_option('full');page.locator('#fullSize').select_option('512');page.locator('#tileSize').select_option('96');page.locator('#simColor').select_option('color');click('simulate');assert page.locator('#simulationViews').is_visible();d=report('color-filter.json');assert 'CIE xy' in d['simulation']['colorMode'];assert core(d)==baseline
  colored=page.locator('#after').evaluate('(c)=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-d[i+1])>10)n++;return n;}');assert colored>5000;download('simExport','simulation-color.pfm');download('simPNG','color-comparison.png');return colored
 test('Whole-field chromaticity-filtered color output retains color',color)
 def grayscale():
  page.locator('#simColor').select_option('mono');click('simulate');f=download('simExport','simulation-mono.pfm');assert f.read_bytes()==(OUT/'simulation-color.pfm').read_bytes();assert core(report())==baseline;return True
 test('Color/grayscale choice leaves filtered luminance PFM byte-identical',grayscale)
 def peripheral():
  page.locator('#eduCondition').select_option('glaucoma');fields(eduSeverity=100,retainedField=40);click('educate');d=report('peripheral.json');v=d['lowVisionConditions'];assert v['severity']==1 and v['retainedField']==40;assert v['peripheralShape']=='guth-both';assert core(d)==baseline;download('eduPNG','peripheral-guth.png');return v['fieldMaskInterpretation']
 test('Projection-aware Guth-shaped peripheral loss and percentage controls',peripheral)
 def central():
  page.locator('#eduCondition').select_option('amd');fields(eduSeverity=85,spotIrregularity=45,spotElongation=1.8,spotOffset=8,spotDirection=35,spotGrowth=70);click('educate');d=report('central.json');v=d['lowVisionConditions'];assert 'AMD' in v['name'];assert v['growthDirection']==35 and v['spotOffset']==8;assert v['irregularity']==.45;assert core(d)==baseline;download('eduPNG','central-irregular.png');return True
 test('Irregular AMD-like central loss with eccentric offset and directional growth',central)
 def resets():
  before=report();click('resetSimulations');after=report('reset.json');assert core(after)==baseline;assert after['saved']==before['saved'];assert after['simulation'] is None and after['lowVisionConditions'] is None;assert page.locator('#eduSeverity').input_value()=='75';assert page.locator('#spotOffset').input_value()=='0';assert float(page.locator('#snellen').input_value())==200;return True
 test('Simulation resets retain calibration, geometry, source samples and saved regions',resets)
 def text():
  visible=page.locator('body').inner_text();assert 'educational' not in visible.lower();assert not errors;return True
 test('Revised simulation labels and no uncaught JavaScript errors',text)
 def mobile():
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.locator('#measurementsCard').screenshot(path=str(OUT/'mobile-measurements.png'));page.set_viewport_size({'width':1600,'height':1500});return True
 test('Mobile controls stay within viewport width',mobile)
 # Real supplied Photosphere sample: same crop calibration convention as previous tests.
 if Path('/mnt/data/room1.hdr').exists() and not os.getenv('QA_SKIP_ROOM'):
  def room():
   page.locator('#single').set_input_files('/mnt/data/room1.hdr');click('load');d=report('room-import.json');scale=d['calibration']['scale'];w=d['width'];h=d['height'];fields(cropX=(w-h)//2,cropY=0,cropW=h,cropH=h);click('applyCrop');page.locator('#circle').evaluate('(el)=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true}');page.locator('#circle').check();fields(cx=.5,cy=.5,radius=.5);click('applyMask');page.locator('#projection').select_option('equisolid');fields(sourceFov=180,sourceVFov=180,viewShift=0,viewLift=0);page.locator('#geometryConfirm').check();click('applyGeometry');page.locator('#fieldType').select_option('guth-both');page.locator('#fieldStyle').select_option('outline');page.locator('#ringsEnabled').check();page.locator('#ringConvention').select_option('radius');fields(ringStep=10,ringMax=80,ringOpacity=55);click('showField');download('fieldPNG','room-rings-guth.png');polygon([(.35,.42),(.55,.41),(.58,.58),(.34,.58)]);click('saveA');polygon([(.24,.30),(.70,.30),(.70,.70),(.24,.70)]);click('saveB');d=report('room-polygons.json');assert d['calibration']['scale']==scale;download('png','room-annotated.png');print('ROOM assertions and image exports complete',flush=True);return {'raster':[d['width'],d['height']],'scale':scale,'target':d['saved']['A']['mean'],'surround':d['saved']['B']['mean']}
  test('Provided Photosphere HDR: crop, calibrated polygons, Guth field and 10-degree rings',room)
 (OUT/'tests.json').write_text(json.dumps({'passed':sum(t['passed'] for t in results),'total':len(results),'tests':results,'pageErrors':errors,'browser':b.version},indent=2));print('TEARDOWN workers',flush=True);page.evaluate('window.__qaWorkers.forEach(w=>w.terminate())');print('TEARDOWN page',flush=True);page.close();print('TEARDOWN browser',flush=True);b.close();print('TEARDOWN complete',flush=True)
print(json.dumps({'passed':len(results),'total':len(results)}))
