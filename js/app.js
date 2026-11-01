import {setupGlarePanel} from './glareui.js';
let glareUI=null;
import {createRegionEditor} from './roiui.js';
import {regionBounds,validateRegion,paintRegion} from './selections.js';
import {ringParameters,drawAngleRings} from './angles.js';
import {logmarFromSnellen,snellenFromLogmar} from './chroma.js';
import {createCropEditor,circleFromRect} from './cropui.js';
import {SENSOR_PRESETS,calculateFov} from './fov.js';
import {falseValue,legendTicks} from './falsecolor.js';
import {encodeHDR,SRGB_PRIMARIES} from './io.js';
import {parseView,validateGeometry,viewString,geometryFromCircle,verticalFromHorizontal} from './geometry.js';
import {memoryPlan} from './resources.js';
let fixationPicker=null;
let cropEditor=null,regionEditor=null,stateGeneration=0;let ringConfig=ringParameters(),appliedField=null;
let visibilityPreview=null,fieldPreview=null;
let fovDraftProvenance=null,fovSourceKey=null,educationPreview=null;
const $=id=>document.getElementById(id),num=id=>Number($(id).value);let worker,workerReady=false,workerFailure=null,pending=new Map(),serial=0,busy=0,current=null,roi=null,bracketFiles=[],preview=null,drag=null,pixelTimer=null,bracketMeta=[],geometryDirty=false;
function createWorker(){workerReady=false;workerFailure=null;worker=new Worker(new URL('./engine.bundle.js?v=0.9.0',import.meta.url));worker.onmessage=({data:d})=>{if(d.event==='ready'){workerReady=true;return;}if(d.event==='progress'){status(d.text);$('progress').hidden=false;if(d.fraction===null)$('progress').removeAttribute('value');else{$('progress').max=1;$('progress').value=d.fraction;}return;}const p=pending.get(d.id);if(!p)return;pending.delete(d.id);if(d.event==='error')p.reject(Error(d.message));else p.resolve(d);};worker.onerror=e=>{workerFailure=e.message||'Worker initialization failed. Check hosting MIME types and content-security policy.';status(workerFailure,true);for(const p of pending.values())p.reject(Error(e.message||'Worker failed'));pending.clear();};}
async function request(op,data={}){const start=Date.now();while(!workerReady){if(workerFailure)throw Error(workerFailure);if(Date.now()-start>10000)throw Error('Worker did not start. Check the server path, JavaScript MIME type and content-security policy.');await new Promise(r=>setTimeout(r,20));}const id=++serial;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,op,...data});});}
function status(text,error=false){$('status').textContent=text;$('statusbar').classList.toggle('error',error);}
function controls(){
 document.querySelectorAll('input,select,textarea,button').forEach(el=>{if(el.id!=='cancel')el.disabled=busy>0;});
 document.querySelectorAll('.needs-image').forEach(el=>el.disabled=!current||busy>0);
 $('undoCrop').disabled=!current?.canUndoCrop||busy>0;
 $('headerOnly').disabled=!current?.canHeaderOnly||busy>0||geometryDirty||!current?.geometry?.confirmed;
 $('simulate').disabled=!current?.geometry?.confirmed||busy>0||geometryDirty;
 $('educate').disabled=$('simulate').disabled;$('eduPNG').disabled=!educationPreview||busy>0;
 $('simPNG').disabled=!visibilityPreview||busy>0;$('simExport').disabled=!visibilityPreview||busy>0;$('simMaskExport').disabled=!visibilityPreview||busy>0;
 $('showField').disabled=$('simulate').disabled||(current?.geometry?.projection!=='perspective'&&!current?.mask?.enabled);
 $('fieldPNG').disabled=!fieldPreview||busy>0;$('fieldMaskExport').disabled=!fieldPreview||busy>0;
 const full=fullMode();for(const id of ['viewFov','yaw','pitch','simWidth']){$(id).disabled=busy>0||full;$(id).closest('label').classList.toggle('inactive',full);$(id).closest('label').hidden=full;}
 for(const id of ['fullSize','tileSize'])$(id).disabled=busy>0||!full;
 $('domainInfo').textContent=full?'Whole circular field: '+(current?.geometry?.confirmed?'uses your applied '+current.geometry.projection+' geometry. ':'confirm source geometry first. ')+`${$('fullSize').value} x ${$('fullSize').value} is a separate simulation raster; the calibrated source is not resized. No explicit export conversion is required.`:'Local perspective detail only (5-60 degrees). This does not crop the source. Select Whole circular fisheye to analyze the complete image circle.';
 for(const [id,types] of [['fieldBand',['band']],['fieldCone',['cone']],['fieldUpper',['custom']],['fieldLower',['custom']]])$(id).disabled=busy>0||!types.includes($('fieldType').value);
 for(const id of ['hdr','viewExport','angularExport'])$(id).disabled=!current?.geometry?.confirmed||busy>0||geometryDirty;
 $('checkBracket').disabled=busy>0||!bracketFiles.length;
 $('cancel').hidden=busy===0;if(cropEditor){cropEditor.setDisabled(busy>0||!current);syncCropTools();}if(regionEditor){$('finishROI').disabled=busy>0||!regionEditor.state.drawing;$('measureField').disabled=busy>0||!appliedField;$('applyRings').disabled=busy>0||!current?.geometry?.confirmed;}conditionControls();for(const id of ['saveRegion','saveA','saveB','measureRoi'])$(id).disabled=busy>0||!current||!roi||!!regionEditor?.state.drawing;for(const id of ['compareA','compareB'])$(id).disabled=busy>0||!current?.regions?.length;$('pickFixation').disabled=busy>0||!current?.geometry?.confirmed||geometryDirty;glareUI?.sync();
}
async function task(fn){busy++;controls();try{await fn();}catch(e){status(e.message,true);}finally{busy--;if(busy<0)busy=0;$('progress').hidden=true;controls();}}
function fmt(v){if(v===null||v===undefined||!Number.isFinite(v))return 'undefined';const a=Math.abs(v);return a>=10000||a>0&&a<.001?v.toExponential(3):v.toLocaleString(undefined,{maximumSignificantDigits:5});}
function unit(){return current?.calibration.kind==='relative'?'relative Y':'cd/m\u00b2';}
function display(){return {mode:$('displayMode').value,ev:num('ev'),log:$('falseScale').value==='log',palette:$('falsePalette').value,bands:num('falseBands'),divisions:num('falseDivisions'),clip:$('falseClip').checked,min:$('falseMin').value===''?null:num('falseMin'),max:$('falseMax').value===''?null:num('falseMax')};}
function vector(id){return $(id).value.trim().split(/\s+/).map(Number);}
function geometry(){return {projection:$('projection').value,hfov:num('sourceFov'),vfov:num('sourceVFov'),shift:num('viewShift'),lift:num('viewLift'),vp:vector('viewPosition'),vd:vector('viewDirection'),vu:vector('viewUp'),fore:num('viewFore'),aft:num('viewAft')};}
function cleanGeometryNumber(v){return Math.abs(v)<1e-12?0:Number(v.toPrecision(12));}
function populateGeometry(g){
 const v=g||{projection:'unknown',hfov:90,vfov:60,shift:0,lift:0,vp:[0,0,0],vd:[0,1,0],vu:[0,0,1],fore:0,aft:0};
 $('projection').value=v.projection;for(const [id,key] of [['sourceFov','hfov'],['sourceVFov','vfov'],['viewShift','shift'],['viewLift','lift'],['viewFore','fore'],['viewAft','aft']])$(id).value=cleanGeometryNumber(v[key]??0);
 for(const [id,key] of [['viewPosition','vp'],['viewDirection','vd'],['viewUp','vu']])$(id).value=(v[key]||[]).join(' ');
 $('geometryConfirm').checked=!!v.confirmed;geometryDirty=false;
 $('viewText').value=g?(viewString(g)||''):'';
 $('viewPreview').textContent=g?.confirmed?(viewString(g)?'VIEW= '+viewString(g):'Equisolid pixels: custom geometry metadata. Use explicit angular reprojection for a standard -vta HDR.'):'No confirmed header yet.';
 $('geometryStatus').textContent=current?.geometryNote||'Review the current raster geometry, then confirm and apply.';
}
function dirtyGeometry(){glareUI?.invalidate('Geometry draft changed. Apply geometry, then prepare a new glare copy.');fovDraftProvenance=null;geometryDirty=true;$('geometryConfirm').checked=false;$('geometryStatus').textContent='Unapplied geometry edits. Confirm and apply before simulation or corrected-HDR export.';controls();}
function setCrop(r){for(const [id,k] of [['cropX','x'],['cropY','y'],['cropW','w'],['cropH','h']])$(id).value=r[k];}
function localPlan(){
 if(!bracketMeta.length)return null;const bytes=bracketFiles.reduce((a,f)=>Math.max(a,f.size),0),plan=memoryPlan(bracketMeta[0],bracketFiles.length,num('bracketWidth'),num('budgetMiB'),bytes);
 $('bracketPlan').textContent=`${plan.inputCount} exposures; working raster ${plan.width} x ${plan.height}. Estimated peak allocation: ${Math.ceil(plan.estimatedMiB)} MiB; selected budget: ${plan.budgetMiB} MiB. ${plan.fits?'All selected exposures will be used.':'Reduce working width or increase the budget on a suitable device.'}`;
 $('bracketPlan').classList.toggle('over-budget',!plan.fits);return plan;
}
function drawCanvas(id,p){const c=$(id);c.width=p.width;c.height=p.height;c.getContext('2d').putImageData(new ImageData(p.rgba,p.width,p.height),0,0);}
function update(s){$('fieldMeasurementResult').textContent='No current whole-field measurement. Show a viewing overlay, then Measure entire viewing field.';$('roiResult').textContent='No current draft measurement. Saved-region results are listed below.';$('selectionQuick').textContent='Draw or remeasure a selection; saved records remain in the list.';if(!s.appliedField){$('limitField').checked=false;$('activeMeasurementScope').textContent='Measurement scope: valid source image; no viewing-field restriction.';}fixationPicker=null;$('fixationPanel').hidden=true;appliedField=s.appliedField||null;ringConfig=s.annotationRings||ringConfig;visibilityPreview=null;fieldPreview=null;$('fieldView').hidden=true;$('simulationViews').hidden=true;stateGeneration++;current=s;educationPreview=null;$('educationViews').hidden=true;fovDraftProvenance=s.fovProvenance||null;updateFovSuggestion(s);$('phoneStatus').textContent=s.phone?`${s.phone.kind}. ${s.phone.decodedHDR?'HDR decoded into floating-point values.':'No reconstructed HDR in this route.'} ${s.phone.scope||''}`:'No phone source loaded.';populateGeometry(s.geometry);setCrop({x:0,y:0,w:s.width,h:s.height});$('circle').checked=!!s.mask.enabled;for(const k of ['cx','cy','radius'])$(k).value=s.mask[k]??.5;$('cropInfo').textContent=s.cropHistory?.length?`${s.cropHistory.length} crop(s); current raster ${s.width} x ${s.height}. Luminance multiplier preserved.`:'No pixel crop applied. Files already cropped elsewhere only need header review.';const names=s.source.map(x=>x.name);$('sourceName').textContent=names.length===1?names[0]:`${names.length} exposures / merged HDR`;$('sourceDetail').textContent=`${s.width.toLocaleString()} \u00d7 ${s.height.toLocaleString()} \u00b7 ${s.format.toUpperCase()} \u00b7 ${s.sampling}`;$('unitBadge').textContent=s.calibration.kind==='relative'?'RELATIVE / UNCALIBRATED':s.calibration.kind==='patch'?'SINGLE-PATCH ANCHORED':'FILE SCALE / UNVERIFIED';$('measurementUnit').textContent=unit();const t=s.summary;$('mean').textContent=fmt(t.mean);$('median').textContent=fmt(t.median);$('range').textContent=`${fmt(t.p05)} \u2013 ${fmt(t.p95)}`;$('count').textContent=t.count.toLocaleString();$('scaleInfo').textContent=`${s.scaleCandidate?`Supported file scale: ${fmt(s.scaleCandidate)} cd/m\u00b2 per normalized Y unit. `:'No supported absolute file scale. '}Current: ${s.calibration.kind}, multiplier ${fmt(s.calibration.scale)}. This is not independent validation.`;$('calibration').value=s.calibration.kind;$('patchControls').hidden=s.calibration.kind!=='patch';$('metadata').textContent=JSON.stringify(s,null,2);updateScaleBanner();$('cropToolbar').hidden=false;$('empty').hidden=true;$('canvasStage').hidden=false;renderRegionBook();updateCircleDiagnostic();glareUI?.sourceChanged();controls();
 const warn=[...(s.notes||[])];if(s.format==='ldr')warn.push('Single photograph: display-referred input, limited dynamic range. Transfer-function decoding does not undo tone mapping or recover clipped highlights.');if(s.sampling.includes('subsampling')&&s.width!==s.originalDimensions[0])warn.push(`Reduced working raster from ${s.originalDimensions.join(' x ')}. Source-pixel subsampling is not antialiased; avoid fine-detail claims.`);if((s.header?.view||s.header?.VIEW)&&!s.geometry?.confirmed)warn.push('The imported VIEW is a draft. Correct it for the actual projection/crop, then confirm and apply.');if(s.negativeFraction>0)warn.push(`${fmt(100*s.negativeFraction)}% of pixels have negative Y. Numeric values are retained; simulated luminance is clamped to zero.`);if(s.quality)warn.push(`Bracket: ${fmt(100*s.quality.invalidFraction)}% unsupported pixels; ${fmt(100*s.quality.disagreementFraction)}% show >0.5-stop channel disagreement. No motion correction was applied.`);if(s.response)warn.push('Response curves are independently anchored by channel. This establishes relative radiance, not validated color or photometry.');if(s.calibration.invalidated)warn.push(s.calibration.invalidated);$('warnings').textContent=warn.join('\n\n');$('warnings').hidden=!warn.length;
}
async function render(){const d=await request('render',{display:display(),editingCrop:!!cropEditor?.state.active,showFieldOnSource:$('showFieldOnSource').checked});preview=d.preview;drawCanvas('image',preview);sizeCropCanvas();overlay();$('legend').hidden=!preview.legend;if(preview.legend){drawLegend($('legendCanvas'),preview.legend,Math.max(300,Math.min(1100,$('canvasStage').clientWidth||preview.width)));$('legendLow').textContent='Minimum '+fmt(preview.legend.minimum);$('legendHigh').textContent='Maximum '+fmt(preview.legend.maximum);$('legendUnits').textContent=`${unit()} / ${preview.legend.log?'logarithmic':'linear'} / ${preview.legend.bands?preview.legend.bands+' bands':'continuous'}`;}status('Ready. Preview changes have not altered the source measurements.');}
function drawLegend(canvas,range,width=900){
 canvas.width=Math.round(width);canvas.height=135;const ctx=canvas.getContext('2d'),left=18,right=width-18,barY=44,barH=22,barW=right-left;
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,135);ctx.fillStyle='#172b37';ctx.font='600 14px system-ui';ctx.fillText(`Luminance / ${range.units==='cd/m2'?'cd/m\u00b2':range.units} / ${range.log?'logarithmic':'linear'} scale`,left,23);
 for(let x=0;x<barW;x++){const t=x/(barW-1),value=range.log?Math.exp(Math.log(range.minimum)+t*(Math.log(range.maximum)-Math.log(range.minimum))):range.minimum+t*(range.maximum-range.minimum),c=falseValue(Math.max(range.minimum,Math.min(range.maximum,value)),range);ctx.fillStyle=`rgb(${c.map(Math.round).join(',')})`;ctx.fillRect(left+x,barY,1,barH);}
 ctx.font='11px system-ui';ctx.fillStyle='#172b37';const ticks=legendTicks(range),stride=width<550?Math.ceil(range.divisions/4):1;for(let i=0;i<ticks.length;i++){if(i%stride&&i!==ticks.length-1)continue;const tick=ticks[i],x=left+tick.fraction*barW;ctx.fillRect(x,barY+barH,1,5);ctx.textAlign=i===0?'left':i===ticks.length-1?'right':'center';ctx.fillText(fmt(tick.value),x,barY+barH+21);}
 ctx.textAlign='left';ctx.font='11px system-ui';ctx.fillStyle='#536675';ctx.fillText(range.clip?'Below range: black | Above range: white':'Out-of-range values use endpoint colors',left,111);ctx.fillText('Negative: magenta | Excluded: checkerboard | Display only',left,128);
}
function updateFovSuggestion(s){
 const key=s.source.map(x=>x.sha256||x.name).join('|');if(key===fovSourceKey)return;fovSourceKey=key;const m=s.fovSuggestion||{};
 $('fovMetadata').textContent=`${m.model||'Camera not recorded'}. ${m.focalLengthMM?'Actual focal length '+m.focalLengthMM+' mm. ':''}${m.equivalentMM?'35-mm equivalent '+m.equivalentMM+' mm. ':''}${m.warning||''}`;
 if(m.sensor){$('sensorPreset').value='custom';$('sensorWidth').value=m.sensor.w;$('sensorHeight').value=m.sensor.h;}
 if(m.focalLengthMM)$('focalLength').value=m.focalLengthMM;if(m.equivalentMM)$('equivalentFocal').value=m.equivalentMM;$('fovMethod').value=m.method==='equivalent'?'equivalent':'sensor';
 if(m.method==='sensor'||m.method==='equivalent'){try{const v=calculateFov({...fovParameters(),width:s.originalDimensions[0],height:s.originalDimensions[1],cropHistory:s.cropHistory});$('fovResult').textContent=`Metadata estimate: horizontal ${fmt(v.geometry.hfov)} degrees; vertical ${fmt(v.geometry.vfov)} degrees. Use the button to adopt it as a draft only for a rectilinear lens.`;}catch(e){$('fovResult').textContent=e.message;}}
 else $('fovResult').textContent='Enter actual focal length and active sensor size, or a 35-mm equivalent. The tool has not guessed a sensor from the brand.';
}
function fovParameters(){return {method:$('fovMethod').value,sensorWidth:num('sensorWidth'),sensorHeight:num('sensorHeight'),focalLength:num('focalLength'),equivalent:num('equivalentFocal'),aspectPolicy:$('aspectPolicy').value};}
function phoneOptions(){return {mode:$('phoneMode').value,allowNetworkCodec:$('heifNetwork').checked,localCodecURL:new URL('../vendor/libheif-bundle.js',import.meta.url).href};}
function newSource(){glareUI?.sourceCleared();fixationPicker=null;$('fixationPanel').hidden=true;$('regionRows').replaceChildren();$('regionEmpty').hidden=false;$('viewRegionList').textContent='Saved regions (0)';$('selectionQuick').textContent='Draw a region to see its luminance here.';appliedField=null;ringConfig=ringParameters();if(regionEditor)regionEditor.clear();visibilityPreview=null;fieldPreview=null;$('fieldView').hidden=true;stateGeneration++;if(cropEditor){cropEditor.clear();cropEditor.setActive(false);}$('scaleBanner').hidden=true;$('cropToolbar').hidden=true;fovSourceKey=null;fovDraftProvenance=null;educationPreview=null;$('educationViews').hidden=true;$('phoneStatus').textContent='No phone source loaded.';if(!$('keepRange').checked){$('falseMin').value='';$('falseMax').value='';}current=null;renderRegionBook();$('fieldMeasurementResult').textContent='No native-resolution viewing-field measurement.';$('regionName').value='';populateGeometry(null);setCrop({x:0,y:0,w:1,h:1});roi=null;preview=null;drag=null;if(pixelTimer){clearTimeout(pixelTimer);pixelTimer=null;}for(const id of ['mean','median','range','count'])$(id).textContent='\u2014';$('sourceName').textContent='Your analysis canvas';$('sourceDetail').textContent='No image loaded';$('unitBadge').textContent='RELATIVE MODE';$('measurementUnit').textContent='relative Y';$('metadata').textContent='No source loaded.';$('scaleInfo').textContent='File metadata does not prove calibration. Relative mode is the default for every new source.';$('warnings').hidden=true;$('legend').hidden=true;$('pixel').textContent='Drag on the image to select a region. Exact coordinates can be entered below.';$('geometryConfirm').checked=false;$('projection').value='unknown';$('circle').checked=false;$('calibration').value='relative';$('patchControls').hidden=true;$('simulationViews').hidden=true;$('simulationInfo').textContent='No simulation run. Parameter edits apply only when Run is pressed.';$('comparison').textContent='Save two regions to compare their mean luminances.';$('roiResult').textContent='No region measured.';$('canvasStage').hidden=true;$('empty').hidden=false;}
function chosenROI(){
 if(!current)throw Error('Load an image first');if(regionEditor?.state.drawing)throw Error('Finish the polygon before measuring');
 if(roi)return validateRegion(roi,current.width,current.height);
 throw Error('Draw a new selection, or load a saved region. Old coordinate boxes are not an active selection.');
}
function updateROIFields(r){if(!r||!current)return;const b=regionBounds(r,current.width,current.height);for(const [a,k] of [['roiX','x'],['roiY','y'],['roiW','w'],['roiH','h']])$(a).value=b[k];}
function setROI(r){roi=r;if(regionEditor)regionEditor.setRegion(r);updateROIFields(r);overlay();}
function overlay(){
 if(!preview||!current)return;const c=$('overlay'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(cropEditor?.paint(ctx))return;
 if(current.geometry?.confirmed)drawAngleRings(ctx,current.geometry,current.width,current.height,ringConfig,appliedField||{},current.mask);
 const m=current.mask;if(m?.enabled&&$('showCircleBoundary').checked){ctx.strokeStyle='#f6f2d0';ctx.lineWidth=1.5;ctx.setLineDash([6,5]);ctx.beginPath();ctx.ellipse(m.cx*c.width,m.cy*c.height,m.radius*Math.min(current.width,current.height)*c.width/current.width,m.radius*Math.min(current.width,current.height)*c.height/current.height,0,0,2*Math.PI);ctx.stroke();ctx.setLineDash([]);}
 paintSavedRegions(ctx);
 if(regionEditor)regionEditor.paint(ctx);else if(roi)paintRegion(ctx,roi,current.width,current.height,{fill:true});
}
function point(e){const b=$('overlay').getBoundingClientRect();return {x:Math.min(current.width-1,Math.max(0,Math.floor((e.clientX-b.left)/b.width*current.width))),y:Math.min(current.height-1,Math.max(0,Math.floor((e.clientY-b.top)/b.height*current.height)))};}
$('overlay').addEventListener('pointermove',e=>{if(!current||busy||cropEditor?.state.active||regionEditor?.state.gesture||regionEditor?.state.drawing)return;const p=point(e);if(!pixelTimer)pixelTimer=setTimeout(async()=>{pixelTimer=null;try{const gen=stateGeneration,d=await request('pixel',p);if(gen!==stateGeneration)return;$('pixel').textContent=`Source pixel (${d.pixel.x}, ${d.pixel.y}): ${d.pixel.value===null?'outside valid support':fmt(d.pixel.value)+' '+d.pixel.units.replace('cd/m2','cd/m\u00b2')}`;}catch{}},90);});
async function measure(save=null){await task(async()=>{
 try{
 const r=chosenROI(),persist=!!save;$('selectionQuick').textContent='Measuring source pixels...';
 const d=await request('roi',{roi:r,save:save==='named'?null:save,persist,name:$('regionName').value,color:$('regionColor').value,autoSubtract:$('autoSubtract').checked,limitField:$('limitField').checked});
 const text=`${d.subtracted?'Surround (outer minus A)':'Selected region'}: mean ${fmt(d.roi.mean)} ${unit()}; median ${fmt(d.roi.median)}; SD ${fmt(d.roi.sd)}; ${d.roi.count.toLocaleString()} valid source pixels.`+(d.roi.field?' Restricted to the saved viewing field.':'');
 $('roiResult').textContent=text+(d.roi.solidAngleWeightedMean!==null?`\nSolid-angle-weighted mean ${fmt(d.roi.solidAngleWeightedMean)} ${unit()}; ${fmt(d.roi.solidAngleSteradians)} sr.`:'');
 acceptRegionState(d);
 if(persist){regionEditor.clear();$('regionName').value='';const palette=['#17a88d','#d08428','#8165cc','#ce5276','#3a90c9','#8e9025'];$('regionColor').value=palette[(current.regions?.length||0)%palette.length];$('selectionQuick').textContent=`Saved ${d.record.name}. ${text} Draw the next region; saved shapes remain below.`;status(`Saved ${d.record.name}. See the region list and contrast panel below the image.`);}
 else{$('selectionQuick').textContent=text+(d.subtracted?' Preview only: Save as B to retain the surround.':' Unsaved draft.');status('Selection measured; use Save named region or Save as A/B to retain it.');}
 }catch(e){$('selectionQuick').textContent=e.message;$('roiResult').textContent=e.message;throw e;}
 });}
$('route').onchange=()=>{$('singleControls').hidden=$('route').value!=='single';$('bracketControls').hidden=$('route').value!=='bracket';};
$('calibration').onchange=()=>{$('patchControls').hidden=$('calibration').value!=='patch';if(cropEditor?.state.active)task(()=>toggleCrop(false));};
$('load').onclick=()=>task(async()=>{const f=$('single').files[0];if(!f)throw Error('Choose an image first');newSource();const d=await request('load',{file:f,profile:$('profile').value,phone:phoneOptions(),scaleMode:$('importScale').value});update(d.state);roi=null;overlay();await render();});
$('bracket').onchange=()=>task(async()=>{
 bracketFiles=Array.from($('bracket').files).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));bracketMeta=[];$('bracketTable').replaceChildren();$('bracketConfirm').checked=false;
 if(!bracketFiles.length)throw Error('Select an exposure sequence');
 const d=await request('inspectBracket',{files:bracketFiles,maxWidth:num('bracketWidth'),budgetMiB:num('budgetMiB')});bracketMeta=d.meta;
 for(const m of d.meta){const row=document.createElement('div');row.className='bracket-row';const name=document.createElement('span');name.textContent=m.name;const input=document.createElement('input');input.type='number';input.step='any';input.min='0.00000001';input.value=m.exposureSeconds||'';input.className='exposure';input.setAttribute('aria-label',`Exposure seconds for ${m.name}`);input.title='Exposure time in seconds';row.append(name,input);$('bracketTable').append(row);}localPlan();status(`${bracketFiles.length} exposures selected. Review seconds and confirm the static aligned scene.`);
});
$('checkBracket').onclick=()=>task(async()=>{const d=await request('inspectBracket',{files:bracketFiles,maxWidth:num('bracketWidth'),budgetMiB:num('budgetMiB')});bracketMeta=d.meta;localPlan();status('Memory preflight complete; this is an estimate, not a measurement of free RAM.');});
for(const id of ['bracketWidth','budgetMiB'])$(id).onchange=()=>{try{localPlan();}catch(e){status(e.message,true);}};
$('merge').onclick=()=>task(async()=>{
 const times=Array.from(document.querySelectorAll('.exposure'),e=>Number(e.value)),response=$('responseFile').files[0]||null;
 if(bracketFiles.length<(response?2:3))throw Error(response?'Select at least two exposures':'Select at least three exposures to estimate a response');
 const plan=localPlan();if(!plan?.fits)throw Error('The selected working raster exceeds the memory budget; reduce width or adjust the budget.');
 const confirm=$('bracketConfirm').checked;if(!confirm)throw Error('Confirm the aligned static scene and fixed camera settings first');
 newSource();const d=await request('bracket',{files:bracketFiles,times,confirm,maxWidth:num('bracketWidth'),budgetMiB:num('budgetMiB'),response});update(d.state);roi=null;overlay();await render();
});
$('applyMask').onclick=()=>task(async()=>{regionEditor?.clear();$('showCircleBoundary').checked=false;cropEditor.clear();cropEditor.setActive(false);const d=await request('mask',{mask:{enabled:$('circle').checked,cx:num('cx'),cy:num('cy'),radius:num('radius')}});update(d.state);$('simulationViews').hidden=true;renderRegionBook();$('selectionQuick').textContent=d.unchanged?'Image mask unchanged. Saved regions retained.':'Image mask changed. Draw and save regions on the new support.';await render();});
$('applyCalibration').onclick=()=>task(async()=>{const kind=$('calibration').value;const d=await request('calibrate',{kind,roi:kind==='patch'?chosenROI():null,luminance:num('measured'),note:$('meterNote').value});update(d.state);$('simulationViews').hidden=true;renderRegionBook();$('roiResult').textContent='Luminance scale applied. Reselect or measure the target to compare its current reading.';await render();});
$('render').onclick=()=>task(render);$('ev').oninput=()=>{$('evValue').textContent=`${num('ev')} EV`;};$('ev').onchange=()=>{if(current&&!busy)task(render);};$('displayMode').onchange=()=>{if(current&&!busy)task(render);};
$('measureRoi').onclick=()=>measure();$('saveA').onclick=()=>measure('A');$('saveB').onclick=()=>measure('B');
function fullMode(){return $('simDomain').value==='full'||($('simDomain').value==='auto'&&!!current?.mask?.enabled&&!!current?.geometry&&current.geometry.projection!=='perspective');}
function simulationParameters(){const w=num('simWidth');return {domain:fullMode()?'full':'detail',fullSize:num('fullSize'),tileSize:num('tileSize'),width:w,height:w*.75,hfov:num('viewFov'),yaw:num('yaw'),pitch:num('pitch'),color:$('simColor').value,logmar:num('logmar'),pr:num('pr')};}
$('simDomain').onchange=controls;$('fullSize').onchange=controls;$('fieldType').onchange=controls;
$('simulate').onclick=()=>task(async()=>{
 const d=await request('simulate',{confirm:!!current?.geometry?.confirmed,parameters:simulationParameters(),display:display()}),s=d.simulation;visibilityPreview=s;
 $('beforeCaption').textContent=$('simColor').value==='mono'?'Source luminance (grayscale)':'Source color';$('afterCaption').textContent=$('simColor').value==='mono'?'Filtered luminance':'Filtered luminance + filtered chromaticity';drawCanvas('before',s.left);drawCanvas('after',s.right);$('simulationViews').hidden=false;const v=s.details,ny=v.conservativeNyquistCPD??v.centralNyquistCPD;
 $('simulationInfo').textContent=`Last run: ${v.domain}; Snellen 20/${fmt(snellenFromLogmar(v.logmar))}, logMAR ${v.logmar}, Pelli-Robson ${v.pr}; cutoff ${fmt(v.cutoff)} cycles/degree; peak sensitivity ${fmt(v.peakSensitivity)}.\nConservative analysis sampling limit: ${fmt(ny)} cycles/degree. ${v.cutoff>ny?'WARNING: cutoff exceeds available sampling; unresolved detail cannot be evaluated. Increase resolution or inspect a local detail.':'The original camera sampling and optical resolution may impose stricter limits.'}\n${v.patches?`${v.patches} overlapping tangent patches; ${s.left.width} x ${s.left.height} circular result. Local geometry approximation, not an exact spherical filter. `:''}${v.localFloorRule||''} ${v.boundary||''}`;
 status('Visibility simulation complete. Source crop, geometry, and luminance calibration are unchanged.');
});
async function resetPreview(which){
 await request('resetSimulation',{which});
 if(which==='visibility'||which==='all'){visibilityPreview=null;$('simulationViews').hidden=true;$('simulationInfo').textContent='Visibility simulation reset. The calibrated source and geometry were kept.';for(const [id,value] of [['logmar',1],['pr',1],['simColor','color']])$(id).value=value;}
 if(which==='education'||which==='all'){fixationPicker=null;$('fixationPanel').hidden=true;educationPreview=null;$('educationViews').hidden=true;$('educationInfo').textContent='Condition simulation reset. The calibrated source and geometry were kept.';for(const [id,value] of [['eduCondition','none'],['eduSeverity',75],['eduDiameter',15],['eduBlur',.15],['eduHaze',.3],['eduYellow',.25],['eduContrast',.75],['eduSaturation',1],['eduCVD','deuteranopia'],['eduSeed',2026],['eduFocusX',.5],['eduFocusY',.5]])$(id).value=value;$('eduAcuity').checked=false;for(const [id,value] of [['peripheralShape','guth-both'],['retainedField',30],['spotIrregularity',25],['spotElongation',1.35],['spotOffset',0],['spotDirection',0],['spotGrowth',25]])$(id).value=value;}
 if(which==='all'){for(const [id,value] of [['simDomain','auto'],['fullSize',800],['tileSize',192],['viewFov',45],['yaw',0],['pitch',0],['simWidth',512]])$(id).value=value;}
 if(which==='field'){fieldPreview=null;appliedField=null;ringConfig=ringParameters();$('ringsEnabled').checked=false;$('limitField').checked=false;await render();$('fieldView').hidden=true;$('fieldInfo').textContent='Viewing overlay reset. Source image mask and measurements were kept.';for(const [id,value] of [['fieldType','band'],['fieldBand',40],['fieldCone',60],['fieldUpper',50],['fieldLower',70],['fieldYaw',0],['fieldPitch',0],['fieldRoll',0],['fieldStyle','shade'],['fieldOpacity',.75],['fieldBackground','natural'],['fieldSize',800]])$(id).value=value;}
 syncAcuity('logmar');conditionControls();overlay();status('Reset complete. Source pixels, crop, image mask, FOV, calibration, and saved measurement regions were not changed.');
}
for(const [id,which] of [['resetVisibility','visibility'],['resetEducation','education'],['resetSimulations','all'],['resetField','field']])$(id).onclick=()=>task(()=>resetPreview(which));
$('showField').onclick=()=>task(async()=>{
 const parameters={type:$('fieldType').value,bandHeight:num('fieldBand'),coneDiameter:num('fieldCone'),upper:num('fieldUpper'),lower:num('fieldLower'),yaw:num('fieldYaw'),pitch:num('fieldPitch'),roll:num('fieldRoll'),style:$('fieldStyle').value,opacity:num('fieldOpacity'),color:$('fieldColor').value,size:num('fieldSize')};
 const d=await request('field',{parameters,display:{...display(),mode:$('fieldBackground').value}});fieldPreview=d.field;appliedField=parameters;current.appliedField=parameters;$('fieldMeasurementResult').textContent='Viewing field changed. Measure entire viewing field to refresh its native-source results.';await applyRingSettings(false);paintFieldPreview();await render();$('fieldView').hidden=false;
 const v=fieldPreview.details,L=fieldPreview.preview.legend;$('fieldLegend').hidden=!L;if(L)drawLegend($('fieldLegend'),L,fieldPreview.preview.width);
 $('fieldCaption').textContent=(v.type==='band'?`${v.bandHeight} degree total band (+/- ${v.bandHeight/2} degrees elevation)`:v.type==='cone'?`${v.coneDiameter} degree cone diameter`:v.type==='guth-total'?'Guth reference total field':v.type==='guth-both'?'Guth reference binocular overlap':v.type==='custom'?`Elevation +${v.upper} / -${v.lower} degrees`:'Captured forward field')+` | ${v.geometry.projection} | yaw ${v.yaw}, pitch ${v.pitch}, roll ${v.roll} degrees`;
 $('fieldInfo').textContent=`Selected ${v.count.toLocaleString()} simulation pixels; solid angle approximately ${fmt(v.solidAngleSteradians)} sr; solid-angle-weighted mean ${fmt(v.solidAngleWeightedMean)} ${v.units}; equal-pixel mean ${fmt(v.pixelMean)} ${v.units}. These are resampled viewing-region statistics, not replacements for native source measurements. ${v.guthReference||''}`;
 status('Viewing overlay complete. It did not change source measurements, calibration, or simulation filtering.');
});
$('fieldPNG').onclick=()=>task(async()=>{if(!fieldPreview)throw Error('Run a viewing overlay first');const a=$('fieldCanvas'),L=fieldPreview.preview.legend,legendHeight=L?$('fieldLegend').height:0,out=document.createElement('canvas');out.width=Math.max(800,a.width);out.height=a.height+legendHeight+104;const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(a,(out.width-a.width)/2,0);if(L)ctx.drawImage($('fieldLegend'),(out.width-a.width)/2,a.height);ctx.fillStyle='#172b37';ctx.font='13px system-ui';ctx.fillText($('fieldCaption').textContent,15,a.height+legendHeight+25,out.width-30);ctx.fillText('Reference viewing field; rings: '+ringConfig.convention+' degrees; source values unchanged.',15,out.height-45);ctx.fillText('See Analysis JSON for angular definition, projection, and sampling.',15,out.height-22);const b=await new Promise(r=>out.toBlob(r));download(await b.arrayBuffer(),'viewing-field-overlay.png','image/png');});
$('simPNG').onclick=()=>task(async()=>{if(!visibilityPreview)throw Error('Run a visibility simulation first');const a=$('before'),b=$('after'),out=document.createElement('canvas');out.width=a.width*2+30;out.height=a.height+120;const c=out.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,out.width,out.height);c.fillStyle='#172b37';c.font='15px system-ui';c.fillText($('beforeCaption').textContent,10,25);c.fillText('Reduced acuity / contrast sensitivity',a.width+20,25);c.drawImage(a,10,40);c.drawImage(b,a.width+20,40);const d=visibilityPreview.details;c.font='12px system-ui';c.fillText(`${d.domain} | logMAR ${d.logmar} | Pelli-Robson ${d.pr} | cutoff ${fmt(d.cutoff)} cycles/degree`,10,out.height-43);c.fillText('Shared display transform; retain Analysis JSON and numeric output for reproducibility.',10,out.height-20);const blob=await new Promise(r=>out.toBlob(r));download(await blob.arrayBuffer(),'visibility-comparison.png','image/png');});
function download(bytes,name,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([bytes],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
for(const [id,kind] of [['report','report'],['csv','csv'],['pfm','pfm'],['maskExport','mask'],['hdr','hdr'],['responseExport','response'],['simExport','simulation'],['simMaskExport','simulationMask'],['fieldMaskExport','fieldMask'],['headerOnly','headerOnly'],['viewExport','view'],['angularExport','angular']])$(id).onclick=()=>task(async()=>{const d=await request('export',{kind,extra:{geometry:current?.geometry,display:display(),angularSize:num('angularSize'),angularFov:num('angularFov')}});download(d.download.bytes,d.download.name,d.download.type);status(`Exported ${d.download.name}. Save the analysis JSON and validity mask with numeric image exports.`);});
$('png').onclick=()=>task(async()=>{if(!preview)throw Error('Render a preview first');const source=$('image'),out=document.createElement('canvas'),W=Math.max(720,source.width),legend=preview.legend?document.createElement('canvas'):null;if(legend)drawLegend(legend,preview.legend,W);out.width=W;out.height=56+source.height+(legend?legend.height:0)+30;const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);ctx.fillStyle='#172b37';ctx.font='600 16px system-ui';ctx.fillText(preview.legend?'VisionSim luminance false color':'VisionSim display preview',18,24);ctx.font='11px system-ui';ctx.fillText(($('sourceName').textContent+' / '+unit()+' / '+$('unitBadge').textContent).slice(0,130),18,44);const annotated=document.createElement('canvas');annotated.width=source.width;annotated.height=source.height;const ac=annotated.getContext('2d');ac.drawImage(source,0,0);if(current.geometry?.confirmed)drawAngleRings(ac,current.geometry,current.width,current.height,ringConfig,appliedField||{},current.mask);ctx.drawImage(annotated,(W-source.width)/2,56);if(legend)ctx.drawImage(legend,0,56+source.height);ctx.font='11px system-ui';ctx.fillStyle='#536675';ctx.fillText('Display image only. Scientific values are unchanged; retain the analysis JSON.',18,out.height-10);const blob=await new Promise(resolve=>out.toBlob(resolve));if(!blob)throw Error('PNG export failed');download(await blob.arrayBuffer(),preview.legend?'luminance-falsecolor-with-legend.png':'display-preview-not-photometric.png','image/png');status('Saved the preview with its applied legend and units.');});
$('cancel').onclick=()=>{worker.terminate();for(const p of pending.values())p.reject(Error('Operation cancelled; image session cleared'));pending.clear();createWorker();newSource();status('Cancelled. Source data was cleared; reload an image to continue.');controls();};
$('demo').onclick=()=>task(async()=>{newSource();const width=768,height=512,rgb=new Float32Array(width*height*3);for(let y=0;y<height;y++)for(let x=0;x<width;x++){let L=.01*10**(5*x/(width-1));if(y>height*.35&&y<height*.65)L*=1+.4*Math.cos(2*Math.PI*y/8);const i=(y*width+x)*3;rgb[i]=L;rgb[i+1]=L;rgb[i+2]=L;}const bytes=encodeHDR({rgb,width,height,primaries:SRGB_PRIMARIES}),file=new File([bytes],'synthetic-relative-gradient.hdr');const d=await request('load',{file,profile:'auto'});update(d.state);populateGeometry({projection:'perspective',hfov:60,vfov:verticalFromHorizontal('perspective',60,width,height),shift:0,lift:0,vp:[0,0,0],vd:[0,1,0],vu:[0,0,1],fore:0,aft:0,confirmed:false});await render();});

for(const id of ['projection','sourceFov','sourceVFov','viewShift','viewLift','viewPosition','viewDirection','viewUp','viewFore','viewAft'])$(id).addEventListener('input',dirtyGeometry);
$('geometryConfirm').addEventListener('change',()=>{geometryDirty=true;controls();});
$('discardGeometry').onclick=()=>{populateGeometry(current.geometry);controls();status('Pending header edits discarded. The current crop draft is unchanged.');};
$('applyGeometry').onclick=()=>task(async()=>{const d=await request('geometry',{geometry:geometry(),confirm:$('geometryConfirm').checked,fovProvenance:fovDraftProvenance,alignCircleCenter:$('alignCircleCenter').checked});update(d.state);$('simulationViews').hidden=true;overlay();status(d.state.geometryNote);});
$('parseView').onclick=()=>task(async()=>{const g=parseView($('viewText').value);if(!g)throw Error('Paste a valid VIEW record');populateGeometry(g);dirtyGeometry();status('VIEW loaded as draft. Confirm and apply after review.');});
$('deriveVertical').onclick=()=>task(async()=>{$('sourceVFov').value=verticalFromHorizontal($('projection').value,num('sourceFov'),current.width,current.height);dirtyGeometry();status('Vertical extent derived under a square-pixel assumption. Confirm and apply.');});
$('deriveCircle').onclick=()=>task(async()=>{const g=geometryFromCircle($('projection').value,num('circleFov'),current.mask,current.width,current.height,geometry());populateGeometry(g);dirtyGeometry();status('Raster view calculated from the applied circle. Review, confirm and apply.');});
$('selectionToCrop').onclick=()=>task(async()=>{setCrop(regionBounds(chosenROI(),current.width,current.height));status('Selection copied to crop fields. Press Apply pixel crop to keep this rectangle.');});
$('circleToCrop').onclick=()=>task(async()=>{const m=current.mask;if(!m.enabled)throw Error('Apply the image-circle mask first');const r=m.radius*Math.min(current.width,current.height),x=Math.max(0,Math.floor(m.cx*current.width-r)),y=Math.max(0,Math.floor(m.cy*current.height-r));setCrop({x,y,w:Math.min(current.width,Math.ceil(m.cx*current.width+r))-x,h:Math.min(current.height,Math.ceil(m.cy*current.height+r))-y});status('Circle bounds copied to crop fields. Review and apply the crop.');});
$('applyCrop').onclick=()=>task(async()=>{
 if(geometryDirty)throw Error('Apply or discard your pending geometry edits before cropping');const rect={x:num('cropX'),y:num('cropY'),w:num('cropW'),h:num('cropH')};
 const d=await request('crop',{rect,budgetMiB:num('budgetMiB')});cropEditor.clear();cropEditor.setActive(false);update(d.state);setROI(null);$('showCircleBoundary').checked=false;$('comparison').textContent='Crop changed: saved regions cleared.';$('roiResult').textContent='No region measured on this crop.';$('simulationViews').hidden=true;await render();status('Pixel crop applied. Luminance values and scale preserved; view parameters updated when known.');
});
$('undoCrop').onclick=()=>task(async()=>{const d=await request('undoCrop');cropEditor.clear();cropEditor.setActive(false);update(d.state);setROI(null);$('showCircleBoundary').checked=false;$('comparison').textContent='Crop undone: saved regions cleared.';$('simulationViews').hidden=true;await render();status('Previous crop / mask restored, including its geometry and calibration.');});
$('sensorPreset').onchange=()=>{const preset=SENSOR_PRESETS[$('sensorPreset').value];if(preset){$('sensorWidth').value=preset.w;$('sensorHeight').value=preset.h;}};
$('calculateFov').onclick=()=>task(async()=>{const d=await request('fov',{parameters:fovParameters()});populateGeometry(d.fov.geometry);dirtyGeometry();fovDraftProvenance=d.fov.provenance;$('fovResult').textContent=`Horizontal ${fmt(d.fov.geometry.hfov)} degrees; vertical ${fmt(d.fov.geometry.vfov)} degrees. ${d.fov.provenance.cropsApplied} in-app crops accounted for. Review, confirm, and apply the geometry below.`;status('Rectilinear FOV estimate loaded as a draft. The source pixels and luminance scale were not changed.');});
$('showFalse').onclick=()=>task(async()=>{$('displayMode').value='false';await render();});
$('rangeAuto').onclick=()=>task(async()=>{$('falseMin').value='';$('falseMax').value='';$('displayMode').value='false';await render();});
$('rangeFull').onclick=()=>task(async()=>{const low=current.summary.minimum,high=current.summary.maximum;$('falseMin').value=$('falseScale').value==='log'?Math.max(low>0?low:high*1e-6,1e-20):Math.max(0,low);$('falseMax').value=Math.max(high,Number($('falseMin').value)+1e-10);$('displayMode').value='false';await render();});
for(const value of [100,1000])$('range'+value).onclick=()=>task(async()=>{$('falseMin').value=0;$('falseMax').value=value;$('falseScale').value='linear';$('displayMode').value='false';await render();});
for(const id of ['falseScale','falsePalette','falseBands','falseDivisions','falseClip'])$(id).onchange=()=>{if(current&&!busy)task(render);};
$('educate').onclick=()=>task(async()=>{const parameters={...simulationParameters(),condition:$('eduCondition').value,severity:num('eduSeverity')/100,peripheralShape:$('peripheralShape').value,retainedField:num('retainedField'),irregularity:num('spotIrregularity')/100,elongation:num('spotElongation'),spotOffset:num('spotOffset'),growthDirection:num('spotDirection'),directionalGrowth:num('spotGrowth')/100,diameter:num('eduDiameter'),blurDegrees:num('eduBlur'),haze:num('eduHaze'),yellow:num('eduYellow'),contrast:num('eduContrast'),saturation:num('eduSaturation'),cvd:$('eduCVD').value,seed:num('eduSeed'),focusX:num('eduFocusX'),focusY:num('eduFocusY')},d=await request('educate',{parameters,useAcuity:$('eduAcuity').checked,display:display()});educationPreview=d.education;drawCanvas('eduBefore',educationPreview.left);drawCanvas('eduAfter',educationPreview.right);$('educationViews').hidden=false;$('educationInfo').textContent=`${educationPreview.details.name}; ${educationPreview.details.domain}; effect strength ${Math.round(parameters.severity*100)}%. ${educationPreview.details.useAcuity?'Reduced-detail step included. ':''}${educationPreview.details.scope} Settings are recorded in Analysis JSON.`;status('Condition preview complete. Source luminance measurements remain unchanged.');});
$('eduPNG').onclick=()=>task(async()=>{if(!educationPreview)throw Error('Run an condition preview first');const a=$('eduBefore'),b=$('eduAfter'),W=Math.max(720,a.width*2+30),out=document.createElement('canvas');out.width=W;out.height=a.height+116;const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,out.height);ctx.fillStyle='#172b37';ctx.font='600 16px system-ui';ctx.fillText('LOW VISION CONDITION SIMULATION / '+educationPreview.details.name,15,25);ctx.font='12px system-ui';ctx.fillText('Unaltered reprojected source',15,49);ctx.fillText('Simulated image effect',W/2+8,49);ctx.drawImage(a,15,58);ctx.drawImage(b,W/2+8,58);ctx.fillText('Not patient-specific appearance, diagnosis, or calibrated disease severity.',15,out.height-29);ctx.fillText('Source measurements are unchanged. Retain Analysis JSON for all parameters.',15,out.height-11);const blob=await new Promise(resolve=>out.toBlob(resolve));download(await blob.arrayBuffer(),'condition-vision-comparison.png','image/png');});
window.addEventListener('resize',()=>{if(preview?.legend)drawLegend($('legendCanvas'),preview.legend,Math.max(300,Math.min(1100,$('canvasStage').clientWidth||preview.width)));});
function updateScaleBanner(){
 if(!current)return;$('scaleBanner').hidden=false;$('pixel').textContent='Active units: '+unit()+'. Move over a pixel or draw a measurement region (crop tool off).';const c=current.calibration,available=current.scaleCandidate>0;
 $('activeScaleTitle').textContent=c.kind==='relative'?'Reading relative Y - not cd/m\u00b2':c.kind==='patch'?'Reading cd/m\u00b2 - measured-patch scale':'Reading cd/m\u00b2 - file scale, unverified';
 const h=current.header||{},detail=current.format==='hdr'?` EXPOSURE product: ${fmt(h.exposure)}; COLORCORR: ${(h.colorcorr||[1,1,1]).map(fmt).join(', ')}. These were already reversed by the reader.`:current.format==='exr'&&h.whiteLuminance?` File whiteLuminance: ${fmt(h.whiteLuminance)}.`:'';
 $('activeScaleText').textContent=(c.kind==='relative'?(available?'A supported file luminance scale is available but is not active. Use it before comparing with Photosphere.':'No supported absolute file scale. Use relative analysis or a measured-patch anchor.'):`Multiplier ${fmt(c.scale)} applied to normalized source Y. Compare an existing target before recalibrating.`)+detail+' FOV/header corrections are not required for pixel or area luminance.';
 $('useFileScale').hidden=!available||c.kind==='declared';
}
function syncCropTools(){
 if(!cropEditor)return;const a=cropEditor.state.active,r=cropEditor.state.selection,circle=cropEditor.state.shape==='circle',off=!current||busy>0;
 $('measurementToolbar').hidden=a||!current;$('cropToolbar').classList.toggle('active',a);$('cropToggle').setAttribute('aria-pressed',String(a));$('cropToggle').textContent=a?'Crop tool: On':'Crop tool: Off';
 $('cropShape').disabled=off;$('cropGuides').disabled=off||!a;$('cropFit').disabled=off||!a;$('cropRedraw').disabled=off||!a;
 for(const id of ['applyVisualCrop','circleMaskOnly'])$(id).disabled=off||!a||!r||r.w<2||r.h<2;
 $('circleMaskOnly').hidden=!a||!circle;$('exitCrop').hidden=!a;$('exitCrop').disabled=off;
 $('undoCanvasCrop').disabled=off||!current?.canUndoCrop;
 $('cropInstructions').textContent=a?(circle?'Drag corner-to-corner around the circle. Drag inside to move; drag a handle to resize. Apply crop trims to its square bounds AND excludes outside the circle.':'Drag a rectangle to keep. Drag inside to move; drag a handle to resize. Shaded pixels will be removed.')+' Arrow keys: 1 pixel; Shift+arrows: 10. Enter applies; Escape exits without applying a draft.':'Crop tool is off. Drag on the image to measure a region. Turn cropping on to prepare the image.';
 const info=a&&r?`${circle?'Circle diameter':'Rectangle'}: ${r.w.toLocaleString()}${circle?'':' x '+r.h.toLocaleString()} px | left ${r.x}, top ${r.y}. Draft only until applied.`:a?'Draw on the image; no coordinate entry is needed.':'';
 if($('cropSelectionInfo').textContent!==info)$('cropSelectionInfo').textContent=info;
}
function sizeCropCanvas(){
 if(!preview)return;const stage=$('canvasStage'),toolbar=$('cropToolbar');
 if(cropEditor?.state.active&&$('cropFit').checked){const maxHeight=Math.max(160,window.innerHeight-toolbar.offsetHeight-100);stage.style.maxWidth=Math.floor(maxHeight*preview.width/preview.height)+'px';stage.style.marginInline='auto';}
 else {stage.style.maxWidth='';stage.style.marginInline='';}
 const w=Math.max(preview.width,Math.ceil(stage.clientWidth*Math.min(2,window.devicePixelRatio||1)));$('overlay').width=w;$('overlay').height=Math.round(w*preview.height/preview.width);
}
function revealCropCanvas(){const top=$('canvasStage').getBoundingClientRect().top+window.scrollY-$('cropToolbar').offsetHeight-20;window.scrollTo({top:Math.max(0,top),behavior:'instant'});}
async function toggleCrop(active){
 if(!current)return;cropEditor.setActive(active);if(!active)cropEditor.clear();
 await render();status(active?'Visual crop is on. Draw on the image, adjust handles, then Apply crop. No measurements or pixels have changed yet.':'Crop tool off. Drag to measure a region.');
}
function visualCropChanged(r){if(r&&r.w>0&&r.h>0)setCrop(r);syncCropTools();}
async function applyVisualSelection(maskOnly=false){
 const r=cropEditor.state.selection;if(!r||r.w<2||r.h<2)throw Error('Draw a crop on the image first');
 const circle=cropEditor.state.shape==='circle'?circleFromRect(r,current.width,current.height):null;
 if(maskOnly&&!circle)throw Error('Choose Circle to exclude outside a circular image');
 if(geometryDirty)throw Error('Apply or discard pending header edits before cropping. The crop draft has been kept.');
 const d=maskOnly?await request('mask',{mask:circle}):await request('crop',{rect:r,circle,budgetMiB:num('budgetMiB')});
 cropEditor.clear();cropEditor.setActive(false);update(d.state);regionEditor?.clear();roi=null;$('showCircleBoundary').checked=false;overlay();
 $('comparison').textContent='Crop/mask changed: reselect measurement regions.';$('roiResult').textContent='No region measured on the prepared image.';$('simulationViews').hidden=true;
 await render();status(maskOnly?'Circle applied: outside pixels excluded. Raster size and luminance calibration unchanged. Review FOV when ready.':circle?'Circular crop applied: square bounds retained, outside-circle samples excluded. Luminance calibration preserved. Continue to FOV / header.':'Rectangle cropped. Retained pixel values and luminance calibration preserved. Continue to FOV / header.');
}
cropEditor=createCropEditor($('overlay'),{dimensions:()=>current?{width:current.width,height:current.height}:{width:1,height:1},onChange:visualCropChanged,onPaint:overlay,onApply:()=>task(()=>applyVisualSelection()),onExit:()=>task(()=>toggleCrop(false))});
$('cropToggle').onclick=()=>task(async()=>{await toggleCrop(!cropEditor.state.active);if(cropEditor.state.active)revealCropCanvas();});
$('startVisualCrop').onclick=()=>task(async()=>{await toggleCrop(true);revealCropCanvas();$('overlay').focus({preventScroll:true});});
$('cropShape').onchange=()=>task(async()=>{cropEditor.setShape($('cropShape').value);if(!cropEditor.state.active)await toggleCrop(true);});
$('cropGuides').onchange=()=>cropEditor.setGuides($('cropGuides').checked);
$('cropFit').onchange=()=>{sizeCropCanvas();overlay();revealCropCanvas();};
window.addEventListener('resize',()=>{sizeCropCanvas();overlay();});
$('cropRedraw').onclick=()=>{cropEditor.clear();$('overlay').focus({preventScroll:true});};
$('applyVisualCrop').onclick=()=>task(()=>applyVisualSelection());
$('circleMaskOnly').onclick=()=>task(()=>applyVisualSelection(true));
$('exitCrop').onclick=()=>task(()=>toggleCrop(false));
$('undoCanvasCrop').onclick=()=>$('undoCrop').click();
$('reviewGeometry').onclick=()=>{$('geometryCard').scrollIntoView({block:'start',behavior:'instant'});if(current?.mask.enabled){const helper=$('circleFov')?.closest('details');if(helper)helper.open=true;}};
$('inspectScale').onclick=()=>{$('calibrationCard').scrollIntoView({block:'start',behavior:'instant'});};
$('useFileScale').onclick=()=>task(async()=>{const d=await request('calibrate',{kind:'declared'});update(d.state);$('roiResult').textContent='File scale applied; remeasure the target before adding a patch calibration.';await render();status('File luminance scale applied once. Compare target readings with Photosphere before recalibrating.');});


function selectionChanged(r,st){roi=r;for(const id of ['saveRegion','saveA','saveB','measureRoi'])$(id).disabled=busy>0||!r||st.drawing;if(r&&current)updateROIFields(r);$('finishROI').disabled=busy>0||!st.drawing;$('selectionHelp').textContent=st.drawing?`Polygon: ${st.points.length} vertices. Click more vertices; click the first vertex, Enter, or Finish polygon to close. Backspace removes the last vertex.`:'Drag a rectangle/circle, or click polygon vertices. Drag a finished polygon vertex to refine; drag inside to move. New selection starts another region.';}
regionEditor=createRegionEditor($('overlay'),{dimensions:()=>current?{width:current.width,height:current.height}:{width:1,height:1},blocked:()=>!current||busy>0||!!cropEditor?.state.active,onChange:selectionChanged,onFinish:(r,error)=>error?status(error.message,true):measure(),onPaint:overlay});
$('roiShape').onchange=()=>regionEditor.setShape($('roiShape').value);
$('newROI').onclick=()=>{regionEditor.clear();$('regionName').value='';$('selectionQuick').textContent='Draw a new region. Saved regions will not move.';$('overlay').focus({preventScroll:true});};
$('clearROI').onclick=()=>{regionEditor.clear();$('selectionQuick').textContent='Draft cleared. Named regions and contrast results remain saved.';};
$('finishROI').onclick=()=>{try{regionEditor.finish();}catch(e){status(e.message,true);}};
$('saveRegion').onclick=()=>measure('named');
for(const id of ['roiX','roiY','roiW','roiH'])$(id).addEventListener('input',()=>{if(!current)return;const r={type:'rectangle',x:num('roiX'),y:num('roiY'),w:num('roiW'),h:num('roiH')};try{setROI(validateRegion(r,current.width,current.height));}catch{roi=null;regionEditor.state.region=null;overlay();}});
$('showCircleBoundary').onchange=overlay;
$('limitField').onchange=()=>{$('activeMeasurementScope').textContent=$('limitField').checked?'Measurement scope: selected source pixels intersected with the last applied viewing field.':'Measurement scope: valid source image; no viewing-field restriction.';if(roi&&!busy)measure();};
$('measureField').onclick=()=>task(async()=>{const d=await request('measureField'),r=d.measurement;$('fieldMeasurementResult').textContent=`Entire viewing field (native source): ${r.count.toLocaleString()} valid pixels; pixel mean ${fmt(r.mean)} ${unit()}; solid-angle-weighted mean ${fmt(r.solidAngleWeightedMean)} ${unit()}; approximately ${fmt(r.solidAngleSteradians)} sr. Shaded-out pixels are excluded, not counted as black.`;$('measurementsCard').scrollIntoView({block:'start'});});
function syncAcuity(from){try{if(from==='snellen')$('logmar').value=Number(logmarFromSnellen(num('snellen')).toPrecision(10));else $('snellen').value=Number(snellenFromLogmar(num('logmar')).toPrecision(10));$('acuityReadout').textContent=`logMAR ${fmt(num('logmar'))} = Snellen 20/${fmt(num('snellen'))}. Contrast sensitivity is independent; source sampling limits still apply.`;}catch(e){$('acuityReadout').textContent=e.message;}}
$('logmar').addEventListener('input',()=>syncAcuity('logmar'));$('snellen').addEventListener('input',()=>syncAcuity('snellen'));
function conditionControls(){
 const c=$('eduCondition')?.value;if(!c)return;const loss=['glaucoma','amd','diabetic'].includes(c);
 $('strengthLabel').textContent=loss?'Lost-field opacity (%)':'Effect strength (%)';
 const groups=[['peripheralShape',c==='glaucoma'],['retainedField',c==='glaucoma'&&$('peripheralShape').value!=='circle'],['spotIrregularity',c==='amd'],['spotElongation',c==='amd'],['spotOffset',c==='amd'],['spotDirection',c==='amd'],['spotGrowth',c==='amd'],['eduBlur',['cataract','custom'].includes(c)],['eduHaze',c==='cataract'],['eduYellow',c==='cataract'],['eduCVD',c==='color'],['eduSeed',c==='diabetic'],['eduDiameter',c==='amd'||c==='diabetic'||c==='glaucoma'&&$('peripheralShape').value==='circle']];
 for(const [id,show] of groups){$(id).closest('label').hidden=!show;$(id).disabled=busy>0||!show;}
 $('conditionControlHelp').textContent=loss?'Lost-field opacity: 0% adds no loss shading; 100% blocks the fully affected part. Soft boundaries remain graded. Set Contrast retained and Saturation retained to 1 to isolate the mask. Opacity is applied before the shared display transform, so 50% is not necessarily half as bright on screen. '+(c==='glaucoma'?'Angular field retained sets the visible envelope size, not opacity.':'Field / spot diameter sets the base size. Central offset moves it from fixation; direction sets its vector (0 right, 90 up). Irregularity, elongation and directional growth reshape it.'):'Effect strength blends the chosen image effect. Irrelevant controls are hidden; source luminance remains unchanged.';
}
$('eduCondition').onchange=conditionControls;$('peripheralShape').onchange=conditionControls;
function ringSettings(){return ringParameters({enabled:$('ringsEnabled').checked,step:num('ringStep'),maxAngle:num('ringMax'),convention:$('ringConvention').value,center:$('ringCenter').value,color:$('ringColor').value,opacity:num('ringOpacity')/100,lineWidth:num('ringWidth'),labels:$('ringLabels').checked});}
function paintFieldPreview(){if(!fieldPreview)return;drawCanvas('fieldCanvas',fieldPreview.preview);const v=fieldPreview.details;drawAngleRings($('fieldCanvas').getContext('2d'),v.geometry,fieldPreview.preview.width,fieldPreview.preview.height,ringConfig,v,{enabled:v.geometry.projection!=='perspective',cx:.5,cy:.5,radius:.5});}
async function applyRingSettings(repaint=true){const d=await request('rings',{parameters:ringSettings()});ringConfig=d.rings;if(current)current.annotationRings=ringConfig;if(repaint){overlay();paintFieldPreview();}status('Angular annotations applied. No luminance samples or calibration were changed.');}
$('applyRings').onclick=()=>task(()=>applyRingSettings());
$('showFieldOnSource').onchange=()=>{if(current&&!busy)task(render);};
$('selectOnSource').onclick=()=>{if(cropEditor?.state.active){task(async()=>{await toggleCrop(false);$('measurementToolbar').scrollIntoView({block:'start'});});}else $('measurementToolbar').scrollIntoView({block:'start'});$('selectionQuick').textContent='Draw a region here; its mean will appear automatically. Check Restrict new measurements to applied viewing field when needed.';$('overlay').focus({preventScroll:true});};
$('fieldCanvas').onclick=()=>$('selectOnSource').click();
$('ringConvention').onchange=()=>{if($('ringConvention').value==='diameter'&&num('ringMax')===80)$('ringMax').value=160;else if($('ringConvention').value==='radius'&&num('ringMax')===160)$('ringMax').value=80;};
function acceptRegionState(d){
 if(!current)return;for(const k of ['saved','regions','regionBook','regionComparison'])if(k in d)current[k]=d[k];
 $('metadata').textContent=JSON.stringify(current,null,2);renderRegionBook();overlay();
}
async function regionAction(action,extra={}){await task(async()=>{const d=await request('regionAction',{action,...extra});acceptRegionState(d);status('Saved-region list updated. Source luminance and geometry are unchanged.');});}
function renderRegionBook(){
 const rows=$('regionRows');rows.replaceChildren();const records=current?.regions||[],book=current?.regionBook||{},comparison=current?.regionComparison;
 $('regionEmpty').hidden=records.length>0;$('viewRegionList').textContent=`Saved regions (${records.length})`;
 const cell=(row,text)=>{const c=document.createElement('td');c.textContent=text;row.append(c);return c;};
 for(const r of records){
  const tr=document.createElement('tr');tr.dataset.regionId=r.id;
  const isA=book.A===r.id,isB=book.B===r.id,measured=isB&&comparison?.subtracted?comparison.B:r.measurement;
  const title=document.createElement('td'),head=document.createElement('div');head.className='region-title';
  const color=document.createElement('input');color.type='color';color.value=r.color;color.title='Region annotation color';color.setAttribute('aria-label',`Color for ${r.name}`);color.onchange=()=>regionAction('appearance',{regionId:r.id,color:color.value});
  const name=document.createElement('input');name.type='text';name.value=r.name;name.maxLength=100;name.setAttribute('aria-label',`Name for ${r.id}`);name.onchange=()=>regionAction('appearance',{regionId:r.id,name:name.value});head.append(color,name);title.append(head);
  const info=document.createElement('small');info.textContent=`${r.id}${isA?' / target A':''}${isB?' / background B':''} / ${r.region.type} / ${r.field?r.field.type+' field':'valid source'}`+(isB&&comparison?.subtracted?' / minus A':'');title.append(info);
  if(measured.solidAngleWeightedMean!==null&&measured.solidAngleWeightedMean!==undefined){const weighted=document.createElement('small');weighted.textContent=`Solid-angle mean ${fmt(measured.solidAngleWeightedMean)} ${unit()}; ${fmt(measured.solidAngleSteradians)} sr`;title.append(weighted);}
  tr.append(title);cell(tr,fmt(measured.mean)+' '+unit());cell(tr,fmt(measured.median));cell(tr,fmt(measured.minimum)+' / '+fmt(measured.maximum));cell(tr,fmt(measured.sd));cell(tr,measured.count.toLocaleString());
  const omega=cell(tr,measured.solidAngleSteradians==null?'Confirm geometry':fmt(measured.solidAngleSteradians)+' sr');omega.className='regionOmega';
  if(measured.solidAngleSteradians!=null){const fraction=document.createElement('small');fraction.textContent=fmt(100*measured.solidAngleSteradians/(2*Math.PI))+'% of 2 pi sr';omega.append(fraction);}

  const actions=document.createElement('td');actions.className='region-actions';
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;actions.append(b);return b;};
  button('A',()=>regionAction('role',{regionId:r.id,role:'A'})).title='Use as comparison target A';button('B',()=>regionAction('role',{regionId:r.id,role:'B'})).title='Use as comparison background B';
  button('Load shape',()=>{setROI(structuredClone(r.region));$('regionName').value=r.name;$('regionColor').value=r.color;$('selectionQuick').textContent='Loaded saved shape as a draft. Original record is unchanged; saving creates another record.';$('measurementToolbar').scrollIntoView({block:'start'});controls();});
  button(r.visible?'Hide':'Show',()=>regionAction('visible',{regionId:r.id,value:!r.visible}));button('Delete',()=>regionAction('delete',{regionId:r.id}));
  tr.append(actions);rows.append(tr);
 }
 for(const role of ['A','B']){const select=$('compare'+role);select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Choose saved region';select.append(empty);for(const r of records){const o=document.createElement('option');o.value=r.id;o.textContent=`${r.id}: ${r.name}`;select.append(o);}select.value=book[role]||'';}
 if(book.autoSubtract!==undefined)$('autoSubtract').checked=book.autoSubtract;
 const A=comparison?.A,B=comparison?.B,c=comparison?.contrast;
 $('contrastA').textContent=A?fmt(A.mean)+' '+unit():'--';$('contrastB').textContent=B?fmt(B.mean)+' '+unit():'--';
 $('contrastRatio').textContent=c&&B.mean>0?fmt(A.mean/B.mean):'--';$('contrastBright').textContent=c?fmt(c.ratio):'--';$('contrastWeber').textContent=c?fmt(c.weber):'--';$('contrastMichelson').textContent=c?fmt(c.michelson):'--';
 $('comparison').textContent=(comparison?.definition||'Save A and B, or choose two saved regions.')+(c?`\nTarget A: ${A.name}; background B: ${B.name}. A/B ${fmt(A.mean/B.mean)}; Weber ${fmt(c.weber)}; two-region Michelson ${fmt(c.michelson)}. These compare regional means, not a hazard-visibility score.`:'');
}
function paintSavedRegions(ctx){
 if(!$('showSavedRegions').checked)return;const w=current.width,h=current.height,sx=ctx.canvas.width/w,sy=ctx.canvas.height/h;
 const path=r=>{if(r.type==='difference'){path(r.outer);path(r.inner);}else if(r.type==='polygon'){r.points.forEach((p,i)=>i?ctx.lineTo(p.x*sx,p.y*sy):ctx.moveTo(p.x*sx,p.y*sy));ctx.closePath();}else if(r.type==='circle'){ctx.moveTo((r.cx+r.radius)*sx,r.cy*sy);ctx.ellipse(r.cx*sx,r.cy*sy,r.radius*sx,r.radius*sy,0,0,Math.PI*2);}else ctx.rect(r.x*sx,r.y*sy,r.w*sx,r.h*sy);};
 for(const r of current.regions||[]){if(!r.visible)continue;const shape=current.regionBook?.B===r.id&&current.regionComparison?.subtracted?current.regionComparison.B.region:r.region;
  ctx.save();ctx.beginPath();path(shape);ctx.fillStyle=r.color;ctx.globalAlpha=Math.max(0,Math.min(.6,num('regionTint')/100));ctx.fill('evenodd');ctx.restore();
  paintRegion(ctx,shape,w,h,{color:r.color,label:r.name+(current.regionBook?.A===r.id?' [A]':current.regionBook?.B===r.id?' [B]':'')});
 }
}
function updateCircleDiagnostic(){
 const help=$('circleGeometryHelp'),m=current?.mask;if(!m?.enabled||$('projection').value==='perspective'||$('projection').value==='unknown'){
  help.textContent='For a circular fisheye, apply the image circle first. Measurement selections do not define the optical center.';return;
 }
 const x=current.width*(.5-num('viewShift')),y=current.height*(.5+num('viewLift')),cx=current.width*m.cx,cy=current.height*m.cy,error=Math.hypot(x-cx,y-cy);
 help.textContent=`Applied circle center (${fmt(cx)}, ${fmt(cy)}) px; draft optical center (${fmt(x)}, ${fmt(y)}) px; difference ${fmt(error)} px. `+($('alignCircleCenter').checked?'Apply geometry will align shift/lift to this circle, retaining the entered FOV. ':'Manual center mode: use the circle helper to resolve a mismatch. ')+'Drawing or saving a measurement region cannot change these values.';
}
$('alignCircleCenter').onchange=updateCircleDiagnostic;
$('repairCircleGeometry').onclick=()=>$('deriveCircle').click();
for(const id of ['projection','sourceFov','sourceVFov','viewShift','viewLift'])$(id).addEventListener('input',updateCircleDiagnostic);
$('viewRegionList').onclick=()=>$('measurementsCard').scrollIntoView({block:'start'});
$('showSavedRegions').onchange=overlay;$('regionTint').oninput=overlay;
$('compareA').onchange=()=>regionAction('role',{regionId:$('compareA').value,role:'A'});
$('compareB').onchange=()=>regionAction('role',{regionId:$('compareB').value,role:'B'});
$('autoSubtract').onchange=()=>regionAction('autoSubtract',{value:$('autoSubtract').checked});
function drawFixationPicker(){
 if(!fixationPicker)return;drawCanvas('fixationCanvas',fixationPicker.preview);const canvas=$('fixationCanvas'),ctx=canvas.getContext('2d'),x=num('eduFocusX')*canvas.width,y=num('eduFocusY')*canvas.height;
 ctx.save();ctx.strokeStyle='#111';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-11,y);ctx.lineTo(x+11,y);ctx.moveTo(x,y-11);ctx.lineTo(x,y+11);ctx.stroke();ctx.strokeStyle='#f7e880';ctx.lineWidth=2;ctx.stroke();ctx.restore();
}
$('pickFixation').onclick=()=>task(async()=>{const d=await request('fixationView',{parameters:simulationParameters(),display:display()});fixationPicker=d.fixation;$('fixationPanel').hidden=false;drawFixationPicker();$('fixationPanel').scrollIntoView({block:'center'});status('Choose fixation inside the photographed field. No simulation or measurement settings were otherwise changed.');});
$('fixationCanvas').onclick=e=>{
 if(!fixationPicker)return;const c=$('fixationCanvas'),b=c.getBoundingClientRect(),u=(e.clientX-b.left)/b.width,v=(e.clientY-b.top)/b.height,x=Math.floor(u*c.width),y=Math.floor(v*c.height);
 if(x<0||y<0||x>=c.width||y>=c.height||!fixationPicker.valid[y*c.width+x]){$('fixationStatus').textContent='That point is outside captured support. Previous fixation kept; choose inside the photographed circle.';return;}
 $('eduFocusX').value=((x+.5)/c.width).toFixed(6);$('eduFocusY').value=((y+.5)/c.height).toFixed(6);drawFixationPicker();$('fixationStatus').textContent=`Fixation set to X ${$('eduFocusX').value}, Y ${$('eduFocusY').value}. Run condition simulation to apply.`;
};
$('centerFixation').onclick=()=>{$('eduFocusX').value=.5;$('eduFocusY').value=.5;drawFixationPicker();$('fixationStatus').textContent='Fixation centered. Run condition simulation to apply.';};
$('closeFixation').onclick=()=>{$('fixationPanel').hidden=true;};
for(const id of ['eduFocusX','eduFocusY'])$(id).addEventListener('input',drawFixationPicker);

glareUI=setupGlarePanel({request,current:()=>current,busy:()=>busy,geometryDirty:()=>geometryDirty,format:fmt,drawCanvas,download,scriptURL:import.meta.url,field:()=>appliedField,rings:()=>ringConfig});
syncAcuity('logmar');conditionControls();
if(!globalThis.Worker||!globalThis.OffscreenCanvas){status('This browser lacks Worker or OffscreenCanvas support required by this build.',true);}else{createWorker();controls();}
if(location.protocol==='file:')status('Serve this folder over HTTP(S). Direct file:// opening does not support workers reliably. See deployment instructions.',true);
