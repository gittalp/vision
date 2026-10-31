/* Rectilinear pinhole estimates. Sensor dimensions are active dimensions, not
 * raster pixel counts. Resizing alone never changes FOV. */
import {validateGeometry,cropGeometry} from './geometry.js';
export const SENSOR_PRESETS={
 fullframe:{label:'Full frame (36 x 24 mm)',w:36,h:24},
 apsc_canon:{label:'Canon APS-C (22.3 x 14.9 mm, typical)',w:22.3,h:14.9},
 apsc:{label:'APS-C (23.5 x 15.6 mm, typical)',w:23.5,h:15.6},
 mft:{label:'Micro Four Thirds (17.3 x 13 mm)',w:17.3,h:13},
 custom:{label:'Custom active sensor dimensions',w:36,h:24}
};
export function metadataSuggestion(meta={}){
 const m=meta.cameraMetadata||meta;let sensor=null,method='manual';
 const name=String(m.model||'').trim();
 // Exact matching only. Never infer sensor format from manufacturer alone.
 if(/^(Canon )?EOS 6D$/i.test(name))sensor={w:36,h:24,label:'Canon EOS 6D',source:'exact camera model preset'};
 const unit=({2:25.4,3:10,4:1,5:.001})[m.focalPlaneResolutionUnit];
 if(!sensor&&unit&&m.focalPlaneXResolution>0&&m.focalPlaneYResolution>0&&m.exifPixelWidth>0&&m.exifPixelHeight>0){
  const w=m.exifPixelWidth/m.focalPlaneXResolution*unit,h=m.exifPixelHeight/m.focalPlaneYResolution*unit;
  if(w>.1&&w<100&&h>.1&&h<100)sensor={w:Math.max(w,h),h:Math.min(w,h),label:'EXIF focal-plane estimate',source:'EXIF dimensions and focal-plane resolution; review active crop'};
 }
 if(sensor&&m.focalLengthMM>0)method='sensor';else if(m.focalLength35MM>0)method='equivalent';
 return {sensor,method,focalLengthMM:m.focalLengthMM||null,equivalentMM:m.focalLength35MM||null,model:name||'Not recorded',make:m.make||'',orientation:m.orientation||1,warning:method==='manual'?'No sufficient sensor/focal metadata. Select active sensor dimensions and enter the actual focal length.':'Estimate only: confirm lens type, active sensor area, digital zoom, and any external crop.'};
}
export function calculateFov({method='sensor',sensorWidth=36,sensorHeight=24,focalLength=24,equivalent=24,width,height,aspectPolicy='strict',cropHistory=[]}={}){
 if(![width,height].every(Number.isFinite)||width<=0||height<=0)throw Error('A positive reference raster is required');
 let sw=Number(sensorWidth),sh=Number(sensorHeight),f=Number(focalLength),notes=[];
 if(method==='equivalent'){
  if(!(Number(equivalent)>0))throw Error('Enter a positive 35-mm-equivalent focal length');
  const diagonal=Math.hypot(36,24),ratio=width/height;
  sw=diagonal*ratio/Math.hypot(ratio,1);sh=diagonal/Math.hypot(ratio,1);f=Number(equivalent);
  notes.push('35-mm equivalent treated as diagonal equivalence for this aspect ratio. Manufacturer conventions, computational crop and zoom may differ.');
 }else if(method==='sensor'){
  if(![sw,sh,f].every(v=>Number.isFinite(v)&&v>0))throw Error('Sensor dimensions and actual focal length must be positive');
  // Orient the sensor to the already oriented source raster.
  const long=Math.max(sw,sh),short=Math.min(sw,sh);sw=width>=height?long:short;sh=width>=height?short:long;
  const ratio=width/height,mismatch=Math.abs((sw/sh)/ratio-1);
  if(mismatch>.025){
   if(aspectPolicy!=='center-crop')throw Error('Sensor and image aspect ratios differ. Confirm a centered aspect crop or enter the active sensor dimensions; the tool will not guess.');
   if(sw/sh>ratio)sw=sh*ratio;else sh=sw/ratio;
   notes.push('Operator-confirmed centered aspect-ratio crop; active sensor area reduced, not focal length.');
  }
 }else throw Error('Unknown focal-length convention');
 let g=validateGeometry({projection:'perspective',hfov:2*Math.atan(sw/(2*f))*180/Math.PI,vfov:2*Math.atan(sh/(2*f))*180/Math.PI,confirmed:false});
 const uncropped={...g};
 for(const entry of cropHistory){g=cropGeometry(g,entry.rect,...entry.sourceDimensions);}
 return {geometry:g,provenance:{method,sensorWidth:sw,sensorHeight:sh,focalLength:f,referenceRaster:[width,height],aspectPolicy,uncroppedHFOV:uncropped.hfov,uncroppedVFOV:uncropped.vfov,cropsApplied:cropHistory.length,notes,assumptions:'Ideal rectilinear lens; no lens-distortion or focus-breathing calibration. Resize preserves FOV.'}};
}
