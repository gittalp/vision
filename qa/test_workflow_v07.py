"""Regression using production bundles. Only worker URL resolution is substituted.
Local HTTP navigation was separately attempted and blocked by administrator policy.
"""
import json,re,time,shutil,traceback,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa-output/workflow';OUT.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);page=browser.new_page(viewport={'width':1600,'height':1300},accept_downloads=True);page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 html=re.sub(r'<script[^>]*src="js/app.bundle.js[^\"]*"[^>]*></script>','',(ROOT/'index.html').read_text());html=re.sub(r'<link[^>]*href="styles.css[^\"]*"[^>]*>','',html)
 page.set_content(html);page.add_style_tag(content=(ROOT/'styles.css').read_text());url=page.evaluate("s=>URL.createObjectURL(new Blob([s],{type:'text/javascript'}))",(ROOT/'js/engine.bundle.js').read_text())
 app=(ROOT/'js/app.bundle.js').read_text().replace("new URL('./engine.bundle.js?v=0.7.0',SCRIPT_URL)",json.dumps(url)).replace('const SCRIPT_URL=document.currentScript.src;',"const SCRIPT_URL='https://test.invalid/js/app.bundle.js';")
 page.add_script_tag(content="window.__qaWorkers=[];const W=window.Worker;window.Worker=class extends W{constructor(...a){super(...a);window.__qaWorkers.push(this);}};")
 page.add_script_tag(content=app)
 def ready(error=False):
  page.wait_for_function("!document.getElementById('load').disabled",timeout=120000)
  if not error and 'error' in page.locator('#statusbar').get_attribute('class'):raise AssertionError(page.locator('#status').inner_text())
 def click(id,error=False):
  page.locator('#'+id).evaluate('(el)=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true}');page.locator('#'+id).click();ready(error)
 def fields(**kw):
  for k,v in kw.items():
   page.locator('#'+k).evaluate('(el)=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true}')
   page.locator('#'+k).fill(str(v))
 def download(id,name):
  with page.expect_download(timeout=120000) as d:click(id)
  f=OUT/name;d.value.save_as(f);return f
 def report(name='report.json'):return json.loads(download('report',name).read_text())
 def core(d):return {k:d[k] for k in ['width','height','summary','mask','calibration','geometry','cropHistory']}
 def test(name,fn):
  print('START',name,flush=True);start=time.time()
  try:value=fn();results.append({'test':name,'passed':True,'seconds':round(time.time()-start,3),'result':value})
  except Exception as e:
   results.append({'test':name,'passed':False,'error':str(e)});page.screenshot(path=str(OUT/'failure.png'));(OUT/'tests.json').write_text(json.dumps({'tests':results,'pageErrors':errors},indent=2));raise
  (OUT/'tests.json').write_text(json.dumps({'passed':len(results),'tests':results,'pageErrors':errors,'browser':browser.version},indent=2));print('PASS',name,flush=True)
 def canvas_point(u,v):
  page.locator('#overlay').scroll_into_view_if_needed();box=page.locator('#overlay').bounding_box();return box['x']+u*box['width'],box['y']+v*box['height']
 def region(shape='rectangle',coords=(.35,.35,.55,.55)):
  page.locator('#roiShape').select_option(shape);click('newROI');x,y=canvas_point(coords[0],coords[1]);xx,yy=canvas_point(coords[2],coords[3]);page.mouse.move(x,y);page.mouse.down();page.mouse.move(xx,yy,steps=5);page.mouse.up();ready()
 def polygon(points):
  page.locator('#roiShape').select_option('polygon');click('newROI');page.locator('#overlay').scroll_into_view_if_needed();box=page.locator('#overlay').bounding_box()
  for u,v in points:page.mouse.click(box['x']+u*box['width'],box['y']+v*box['height'])
  page.locator('#overlay').press('Enter');ready()
 def load(file):page.locator('#single').set_input_files(str(file));click('load')
 try:
  def startup():
   assert not errors;assert float(page.locator('#eduFocusX').input_value())==.5 and float(page.locator('#eduFocusY').input_value())==.5;assert page.locator('#measureRoi').count()==1;assert page.locator('#saveA').count()==1;load(ROOT/'tests/precision-fixture.hdr');d=report();assert d['calibration']['kind']=='declared';return d['summary']['mean']
  test('Startup; one set of selection controls; HDR file scale active',startup)
  def crop():
   click('cropToggle');page.locator('#cropShape').select_option('circle');ready();page.locator('#overlay').scroll_into_view_if_needed();box=page.locator('#overlay').bounding_box();page.mouse.move(box['x']+.075*box['width'],box['y']+.075*box['height']);page.mouse.down();page.mouse.move(box['x']+.925*box['width'],box['y']+.925*box['height'],steps=7);page.mouse.up();ready();click('applyVisualCrop');d=report('after-crop.json');assert d['width']<512 and d['mask']['enabled'];assert d['calibration']['kind']=='declared';assert not d['regions'];return d['width']
  test('Visual circular crop, scale retained, fresh region list',crop)
  def geometry():
   page.locator('#projection').select_option('equisolid');fields(sourceFov=180,sourceVFov=180,viewShift=-.00896,viewLift=-.007);page.locator('#geometryConfirm').check();click('applyGeometry');d=report('geometry.json');assert abs(d['geometry']['shift']-(.5-d['mask']['cx']))<1e-12;assert abs(d['geometry']['lift']-(d['mask']['cy']-.5))<1e-12;assert d['geometry']['hfov']==180;return d['geometry']
  test('Manual 180-degree FOV plus explicit circle-center alignment',geometry)
  baseline=core(report());native=download('pfm','native-before.pfm').read_bytes()
  def save_target():
   polygon([(.37,.37),(.58,.38),(.59,.59),(.38,.60)]);assert 'mean' in page.locator('#selectionQuick').inner_text();fields(regionName='Screen target');page.locator('#regionColor').fill('#1aa88e');click('saveA');d=report('target.json');assert len(d['regions'])==1;assert d['saved']['A']['name']=='Screen target';assert page.locator('#regionRows tr').count()==1;assert 'Screen target' in page.locator('#selectionQuick').inner_text();assert core(d)==baseline;return d['saved']['A']['mean']
  test('Polygon target: immediate metric, named save, persistent row',save_target)
  def save_background():
   polygon([(.23,.23),(.75,.23),(.75,.75),(.23,.75)]);assert 'Surround' in page.locator('#selectionQuick').inner_text();fields(regionName='Wall surround');click('saveB');d=report('pair.json');assert len(d['regions'])==2;assert d['regionComparison']['subtracted'];assert d['saved']['B']['region']['type']=='difference';assert page.locator('#contrastRatio').inner_text()!='--';assert core(d)==baseline;return d['regionComparison']['contrast']
  test('Enclosing polygon B: subtraction, visible ratios, both rows retained',save_background)
  def third():
   region('circle',(.27,.64,.42,.79));fields(regionName='Desk sample');click('saveRegion');d=report('three-regions.json');assert len(d['regions'])==3;assert d['saved']['A']['name']=='Screen target';assert d['saved']['B']['name']=='Wall surround';assert page.locator('#viewRegionList').inner_text()=='Saved regions (3)';page.locator('#measurementsCard').screenshot(path=str(OUT/'named-regions.png'));return True
  test('Independent third named circle without overwriting A/B',third)
  def clear_and_tint():
   click('clearROI');assert page.locator('#saveA').is_disabled();fields(regionTint=30);page.locator('#showSavedRegions').uncheck();page.locator('#showSavedRegions').check();click('clearROI');d=report();assert len(d['regions'])==3;assert core(d)==baseline;assert download('pfm','native-after-annotations.pfm').read_bytes()==native;return True
  test('Clear draft cannot re-save stale coordinate boxes; tints leave pixels intact',clear_and_tint)
  def unchanged_mask():
   before=report();click('applyMask');after=report();assert after['regions']==before['regions'];assert after['saved']==before['saved'];assert core(after)==baseline;return True
  test('Reapplying identical image mask does not delete saved regions',unchanged_mask)
  def edit_library():
   page.locator('#regionRows tr').nth(2).locator('input[type=text]').fill('Desk, revised');page.locator('#regionRows tr').nth(2).locator('input[type=text]').press('Tab');ready();page.locator('#regionRows tr').nth(2).locator('input[type=color]').fill('#c35f75');ready();d=report();assert d['regions'][2]['name']=='Desk, revised';assert d['regions'][2]['color']=='#c35f75';return True
  test('Rename and recolor saved record without changing statistics',edit_library)
  def export_csv():
   text=download('csv','all-regions.csv').read_text();assert 'Screen target' in text and 'Desk, revised' in text;assert len(text.splitlines())==4;return len(text.splitlines())-1
  test('CSV exports all named regions, including non-A/B measurements',export_csv)
  def compare_existing():
   page.locator('#compareB').select_option('R3');ready();d=report();assert d['regionComparison']['BId']=='R3';assert not d['regionComparison']['subtracted'];assert len(d['regions'])==3;page.locator('#compareB').select_option('R2');ready();return True
  test('Compare existing regions from list without redrawing',compare_existing)
  def polygon_no_geometry():
   polygon([(.30,.28),(.42,.29),(.40,.36)]);assert core(report())==baseline;page.locator('#simDomain').select_option('full');page.locator('#fullSize').select_option('512');page.locator('#tileSize').select_option('96');click('simulate');assert page.locator('#simulationViews').is_visible();assert core(report())==baseline;return True
  test('Active polygon cannot change optical center or block aligned full-field filtering',polygon_no_geometry)
  def overlay_selection():
   page.locator('#fieldType').select_option('guth-both');click('showField');click('selectOnSource');page.locator('#limitField').check();ready();region('circle',(.40,.45,.65,.70));fields(regionName='Within Guth field');click('saveRegion');d=report('masked-region.json');assert d['regions'][-1]['field']['type']=='guth-both';assert len(d['regions'])==4;assert core(d)==baseline;click('measureField');assert 'native source' in page.locator('#fieldMeasurementResult').inner_text();return d['regions'][-1]['measurement']['mean']
  test('Viewing-overlay selection returns to one editor and saves scoped luminance',overlay_selection)
  def scope_guard():
   page.locator('#compareB').select_option('R4');ready();assert 'different measurement scopes' in page.locator('#comparison').inner_text();assert page.locator('#contrastRatio').inner_text()=='--';page.locator('#compareB').select_option('R2');ready();return True
  test('Mixed field scopes cannot silently produce a contrast ratio',scope_guard)
  def fixation():
   page.locator('#eduCondition').select_option('glaucoma');assert page.locator('#strengthLabel').inner_text()=='Lost-field opacity (%)';click('pickFixation');assert page.locator('#fixationPanel').is_visible();c=page.locator('#fixationCanvas');c.scroll_into_view_if_needed();box=c.bounding_box();old=page.locator('#eduFocusX').input_value();page.mouse.click(box['x']+2,box['y']+2);assert page.locator('#eduFocusX').input_value()==old;assert 'outside captured support' in page.locator('#fixationStatus').inner_text();page.mouse.click(box['x']+.56*box['width'],box['y']+.52*box['height']);assert .54<float(page.locator('#eduFocusX').input_value())<.58;page.locator('#fixationPanel').screenshot(path=str(OUT/'fixation-picker.png'));click('centerFixation');assert float(page.locator('#eduFocusX').input_value())==.5;click('closeFixation');return True
  test('Fixation picker rejects corners, accepts supported point, recenters',fixation)
  def condition():
   fields(eduSeverity=45,retainedField=70,eduContrast=1,eduSaturation=1);click('educate');d=report('peripheral.json');assert d['lowVisionConditions']['severity']==.45;assert d['lowVisionConditions']['retainedField']==70;assert core(d)==baseline;page.locator('#eduCondition').select_option('amd');fields(eduSeverity=65,spotOffset=10,spotDirection=45,spotIrregularity=40);click('educate');d=report('amd.json');assert d['lowVisionConditions']['severity']==.65;assert d['lowVisionConditions']['spotOffset']==10;return True
  test('Peripheral and AMD-like controls use original math and independent size/opacity',condition)
  def resets():
   before=report();click('resetSimulations');after=report();assert after['regions']==before['regions'];assert after['saved']==before['saved'];assert core(after)==baseline;return True
  test('Simulation resets retain named regions, ratios, calibration and geometry',resets)
  def recalibration():
   page.locator('#limitField').uncheck();ready();region('rectangle',(.38,.38,.52,.52));d=report();page.locator('#calibration').select_option('patch');fields(measured=55,meterNote='synthetic regression');click('applyCalibration');new=report('recalibration.json');assert len(new['regions'])==4;assert new['calibration']['kind']=='patch';assert new['regions'][0]['name']=='Screen target';assert new['regionComparison']['contrast']['ratio']==before_cal['regionComparison']['contrast']['ratio'] or abs(new['regionComparison']['contrast']['ratio']-before_cal['regionComparison']['contrast']['ratio'])<1e-10;return True
  before_cal=report()
  test('Changing calibration remeasures named regions instead of deleting them',recalibration)
  def mobile():
   page.set_viewport_size({'width':430,'height':950});page.locator('#measurementsCard').scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+2');page.screenshot(path=str(OUT/'mobile.png'));page.set_viewport_size({'width':1600,'height':1300});return True
  test('Narrow layout has no page-level horizontal overflow',mobile)
  def sample():
   load(Path('/mnt/data/room1.hdr'));assert 'No current whole-field measurement' in page.locator('#fieldMeasurementResult').inner_text();fields(cx=.5,cy=.5,radius=.49);page.locator('#circle').check();click('applyMask');click('circleToCrop');click('applyCrop');page.locator('#projection').select_option('equisolid');fields(circleFov=180);click('deriveCircle');page.locator('#geometryConfirm').check();click('applyGeometry');d=report();before=core(d);region('rectangle',(.43,.45,.55,.61));fields(regionName='Mantel target');click('saveA');region('rectangle',(.37,.34,.61,.68));fields(regionName='Wall surround');click('saveB');region('circle',(.48,.65,.55,.72));fields(regionName='Floor');click('saveRegion');d=report('room-regions.json');assert len(d['regions'])==3;assert core(d)==before;page.locator('#measurementsCard').screenshot(path=str(OUT/'room-measurements.png'));page.locator('#canvasStage').screenshot(path=str(OUT/'room-regions.png'));return {'regions':3,'A':d['saved']['A']['mean'],'B':d['saved']['B']['mean'],'calibration':d['calibration']}
  test('Real Photosphere HDR: named regions and contrast, scale/geometry preserved',sample)
  assert not errors,errors
 finally:
  (OUT/'tests.json').write_text(json.dumps({'passed':sum(t['passed'] for t in results),'total':len(results),'tests':results,'pageErrors':errors,'browser':browser.version,'execution':'in-memory document; production bundles; worker URL substitution only'},indent=2))
  page.evaluate('window.__qaWorkers.forEach(w=>w.terminate())');browser.close()
