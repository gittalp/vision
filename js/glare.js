/* Independent preparation and result interchange for the real evalglare engine.
 * No glare index or source detector is approximated here. Reprojection operates
 * on calibrated luminance, not display RGB, and never mutates the source image.
 */
import {validateGeometry,pixelToRay,rayToPixel} from './geometry.js';
import {solidAnglePerPixel} from './angles.js';
import {inCircle} from './math.js';
import {encodeHDR,RAD_PRIMARIES,srgbEncode} from './io.js';

export const GLARE_SCHEMA='visionsim-evalglare-job-1';
export const RESULT_SCHEMA='visionsim-evalglare-result-1';
export function glareOptions(o={}){
 const q={mode:'hemisphere',size:1000,samples:2,threshold:2000,searchRadius:.2,lowLight:true,externalEv:null,peak:50000,...o};
 if(!['hemisphere','limited'].includes(q.mode))throw Error('Choose whole-hemisphere or explicitly limited-field glare analysis.');
 if(![800,1000,1200,1400].includes(q.size))throw Error('Glare raster must be 800, 1000, 1200, or 1400 pixels.');
 if(![1,2,4].includes(q.samples))throw Error('Use 1, 2, or 4 samples per pixel axis.');
 if(!Number.isFinite(q.threshold)||q.threshold<=100||q.threshold>1e9)throw Error('Fixed source threshold must exceed 100 cd/m2 (evalglare interprets smaller -b values as multipliers).');
 if(!Number.isFinite(q.searchRadius)||q.searchRadius<=0||q.searchRadius>1)throw Error('Source merging radius must be in (0, 1] radians.');
 if(!Number.isFinite(q.peak)||q.peak<=q.threshold||q.peak>1e12)throw Error('Peak extraction threshold must exceed the source threshold.');
 if(q.externalEv!==null&&(!Number.isFinite(q.externalEv)||q.externalEv<=0||q.externalEv>1e7))throw Error('Measured eye-plane illuminance must be positive lux.');
 if(q.mode==='limited'&&q.externalEv===null)throw Error('Limited-field evaluation requires independent eye-plane illuminance in lux. Missing glare sources are still not recovered.');
 q.lowLight=!!q.lowLight;return q;
}
export function evalglareArguments(options){const q=glareOptions(options),a=['-d','-b',String(q.threshold),'-r',String(q.searchRadius),'-C',q.lowLight?'l+':'l-','-q','0','-Y',String(q.peak),'-c','glare-check.hdr'];if(q.externalEv!==null)a.push('-i',String(q.externalEv));return [...a,'input.hdr'];}
// Map normalized radius in a 180-degree angular output to a 180-degree
// ideal equisolid source: theta = pi/2 * outputRadius.
export function equisolidRadiusForAngular(q){if(!Number.isFinite(q)||q<0||q>1)throw Error('Normalized circular radius must be within [0,1].');return Math.SQRT2*Math.sin(Math.PI*q/4);}
function sampleY(frame,g,mask,ray){
 const p=rayToPixel(g,frame.width,frame.height,...ray);if(!p)return null;const [sx,sy]=p,w=frame.width,h=frame.height;
 if(sx<-.5-1e-8||sy<-.5-1e-8||sx>w-.5+1e-8||sy>h-.5+1e-8||!inCircle(sx,sy,w,h,mask))return null;
 const x0=Math.floor(sx),y0=Math.floor(sy),dx=sx-x0,dy=sy-y0;let sum=0,weights=0;
 for(let j=0;j<2;j++)for(let i=0;i<2;i++){
  const x=x0+i,y=y0+j,t=(i?dx:1-dx)*(j?dy:1-dy);if(t<=1e-12||x<0||y<0||x>=w||y>=h||!inCircle(x,y,w,h,mask))continue;
  const at=y*w+x,v=frame.Y[at];if((frame.valid&&!frame.valid[at])||!Number.isFinite(v)||v<0)return null;
  sum+=v*t;weights+=t;
 }
 return weights>0?sum/weights:null;
}
export function prepareGlare(frame,source,mask,scale,calibration,options={},progress=()=>{}){
 const q=glareOptions(options),g=validateGeometry(source);if(!g.confirmed)throw Error('Confirm and apply source geometry before glare preparation.');
 if(!calibration||calibration.kind==='relative'||!(scale>0)||!Number.isFinite(scale))throw Error('Glare evaluation needs an absolute cd/m2 scale. Confirm the HDR file scale or use a measured luminance target first.');
 if(!frame?.Y||frame.Y.length!==frame.width*frame.height)throw Error('Missing source luminance.');
 if(frame.format&&!['hdr','exr','bracket'].includes(frame.format))throw Error('Glare requires scene-linear HDR/EXR or a calibrated bracket reconstruction. Matching one luminance patch does not validate a tone-mapped ordinary/phone photograph for glare.');
 if(q.mode==='hemisphere'&&g.projection==='perspective')throw Error('A rectilinear frame does not capture the full forward hemisphere. Skip glare or choose limited-field analysis with independently measured eye-plane illuminance.');
 if(q.mode==='hemisphere'&&!mask?.enabled)throw Error('Apply the valid image-circle mask before whole-hemisphere glare preparation.');
 const full=q.mode==='hemisphere';if(!full&&g.projection!=='perspective')throw Error('This limited-field route currently supports rectilinear images only. A cropped fisheye must not be filled with invented black pixels.');
 const factor=q.size/Math.max(frame.width,frame.height),W=full?q.size:Math.max(8,Math.round(frame.width*factor)),H=full?q.size:Math.max(8,Math.round(frame.height*factor));
 const geometry=full?validateGeometry({...g,projection:'equidistant',hfov:180,vfov:180,shift:0,lift:0,confirmed:true}):g;
 const outputMask=full?{enabled:true,cx:.5,cy:.5,radius:.5}:{enabled:false};
 const Y=new Float32Array(W*H),rgb=new Float32Array(W*H*3),valid=new Uint8Array(W*H);let holes=0,included=0,omega=0,Ev=0,maximum=0,sum=0;
 for(let y=0;y<H;y++){
  for(let x=0;x<W;x++){
   if(!inCircle(x,y,W,H,outputMask))continue;included++;
   const ray=pixelToRay(geometry,W,H,x,y);if(!ray||ray[2]<-1e-12)throw Error('Glare input extends behind the receiving plane.');
   const center=sampleY(frame,g,mask,ray);if(center===null){holes++;continue;}
   let integral=0,weight=0,unsupported=false;
   for(let j=0;j<q.samples;j++)for(let i=0;i<q.samples;i++){
    const xx=x+(i+.5)/q.samples-.5,yy=y+(j+.5)/q.samples-.5;
    if(!inCircle(xx,yy,W,H,outputMask))continue;
    const r=pixelToRay(geometry,W,H,xx,yy);if(!r||r[2]<-1e-12)continue;
    const v=sampleY(frame,g,mask,r),wt=solidAnglePerPixel(geometry,W,H,xx,yy)/(q.samples*q.samples);
    if(v===null){unsupported=true;continue;}if(wt>0){integral+=v*wt;weight+=wt;}
   }
   if(unsupported||!(weight>0)){holes++;continue;}
   const at=y*W+x,L=integral/weight*scale;if(!Number.isFinite(Math.fround(L)))throw Error('Prepared luminance exceeds float32 range.');
   Y[at]=L;valid[at]=1;for(let c=0;c<3;c++)rgb[3*at+c]=L/179;
   const wt=solidAnglePerPixel(geometry,W,H,x,y);omega+=wt;Ev+=L*Math.max(0,ray[2])*wt;sum+=L;maximum=Math.max(maximum,L);
  }
  if(y%16===0)progress(y/H);
 }
 if(holes)throw Error(`${holes} of ${included} glare pixels lack valid captured luminance, or contain negative/invalid samples. Correct circle/geometry or use a more complete image; missing scene pixels were not replaced with black.`);
 if(!included||maximum<=0)throw Error('Glare input contains no positive luminance.');
 const encoded=encodeHDR({width:W,height:H,rgb,primaries:RAD_PRIMARIES},179,true,{geometry,mask:outputMask}),at=encoded.indexOf(10)+1,tag=new TextEncoder().encode('VISIONSIM_GLARE_PREPARATION=0.8.0\n'),hdr=new Uint8Array(encoded.length+tag.length);hdr.set(encoded.subarray(0,at));hdr.set(tag,at);hdr.set(encoded.subarray(at),at+tag.length);
 const warnings=[];
 if(!full)warnings.push('LIMITED FIELD: independently measured illuminance does not recover glare sources outside the photograph. These are not full-view results.');
 if(calibration.kind==='declared')warnings.push('Using the file-declared luminance convention; calibration has not been independently verified by this program.');
 if(maximum>50000)warnings.push('Bright pixels present. Check capture clipping and resolution sensitivity; resampling cannot recover saturated sources.');
 return {hdr,Y,valid,width:W,height:H,geometry,options:q,args:evalglareArguments(q),metadata:{schema:GLARE_SCHEMA,preparationSoftware:'VisionSim HDR Web 0.8.0',createdUTC:new Date().toISOString(),sourceGeometry:g,outputGeometry:geometry,sourceDimensions:[frame.width,frame.height],outputDimensions:[W,H],inputScale:scale,calibration:structuredClone(calibration),options:q,args:evalglareArguments(q),coverage:{mode:full?'full-forward-hemisphere':'limited-rectilinear',solidAngleSteradians:omega,percentForwardHemisphere:100*omega/(2*Math.PI),validPixels:included,unsupportedPixels:holes},imagePlaneIlluminanceLux:Ev,meanLuminance:sum/included,maximumLuminance:maximum,measuredIlluminanceLux:q.externalEv,units:'cd/m2',sampling:`${q.samples} x ${q.samples} solid-angle-weighted subpixel samples; bilinear source lookup; valid edge weights renormalized; no inpainting`,photometry:'Source calibrated Y -> neutral Radiance RGB = Y/179; EXPOSURE=1; no tone mapping, false color, viewing overlay, vision filter, or ROI annotation included',reprojection:full?(g.projection==='equisolid'?'equisolid-to-equidistant ray mapping':'source-to-equidistant ray mapping'):'native perspective geometry retained with resized raster',warnings}};
}
export function glarePreview(Y,valid,W,H,colors=null){
 const ratio=Math.min(1,800/W,800/H),w=Math.round(W*ratio),h=Math.round(H*ratio),rgba=new Uint8ClampedArray(w*h*4);let sum=0,n=0;
 for(let i=0;i<Y.length;i++)if(valid[i]&&Y[i]>=0){sum+=Y[i];n++;}const gain=.18/Math.max(1e-12,sum/Math.max(1,n));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=Math.min(H-1,Math.floor((y+.5)*H/h))*W+Math.min(W-1,Math.floor((x+.5)*W/w)),p=(y*w+x)*4;rgba[p+3]=255;if(!valid[i]){const v=((x>>3)+(y>>3))%2?34:25;rgba[p]=rgba[p+1]=rgba[p+2]=v;continue;}
  const d=1+Y[i]*gain;for(let c=0;c<3;c++)rgba[p+c]=255*Math.max(0,Math.min(1,srgbEncode(Math.max(0,colors?colors[3*i+c]:Y[i])*gain/d)));
 }return {width:w,height:h,rgba};
}
function numericToken(s){if(/^[-+]?(?:nan|inf(?:inity)?)$/i.test(s))return null;const v=Number(s);if(!Number.isFinite(v))throw Error('Unexpected nonnumeric evalglare output.');return v;}
export function parseEvalglare(text){
 if(typeof text!=='string'||text.length>8*1024*1024)throw Error('Invalid or oversized evalglare output.');
 const lines=text.split(/\r?\n/);let metrics=null,sources=[],sourceHeader=false,reportedSources=null;
 for(const line of lines){
  const s=line.trim();if(!s)continue;
  if(/^dgp,/i.test(s)&&s.includes(':')){const p=s.indexOf(':'),names=s.slice(0,p).split(',').map(x=>x.trim()),values=s.slice(p+1).trim().split(/\s+/).map(numericToken);if(names.length!==values.length)throw Error('evalglare summary fields and values differ; preserve raw output for inspection.');metrics=Object.fromEntries(names.map((k,i)=>[k,values[i]]));sourceHeader=false;continue;}
  if(/^\d+ No pixels x-pos y-pos L_s Omega_s /i.test(s)){reportedSources=Number(s.split(' ')[0]);sourceHeader=true;continue;}
  if(sourceHeader&&/^\d+\s/.test(s)){
   const a=s.split(/\s+/).map(numericToken);if(a.length<20)throw Error('Incomplete evalglare source row.');if(a[0]===0&&a[1]===0)continue;
   if(a.slice(0,7).some(v=>v===null)||a[0]<=0||a[1]<=0||a[5]<0)throw Error('Invalid glare-source statistics.');
   sources.push({id:a[0],pixels:a[1],x:a[2],y:a[3],luminance:a[4],solidAngleSteradians:a[5],positionIndex:a[6],background:a[7],taskLuminance:a[8],illuminance:a[9],directIlluminance:a[10],imageMaximum:a[11],sigma:a[12],direction:[a[13],a[14],a[15]],sourceIlluminance:a[16],veiling:a[17],theta:a[18],zone:a[19],raw:a});
  }
 }
 if(!metrics||!Object.hasOwn(metrics,'dgp')||!Object.hasOwn(metrics,'E_v')||!Object.hasOwn(metrics,'omega_sources'))throw Error('A detailed evalglare result (-d) with E_v and omega_sources is required. No result has been fabricated.');
 if(metrics.dgp===null||metrics.dgp<0||metrics.dgp>1)throw Error('evalglare did not return a finite DGP between 0 and 1.');
 if(reportedSources===null||reportedSources!==sources.length)throw Error('Source-table count is absent or inconsistent.');
 return {metrics,sources,reportedSources,undefinedMetrics:Object.keys(metrics).filter(k=>metrics[k]===null)};
}
export function glareSourceCSV(result){const headers=['source','pixels','mean_cd_m2','solid_angle_sr','position_index','x_engine','y_engine','image_maximum_cd_m2','source_illuminance_lux'];return [headers.join(','),...result.sources.map(s=>[s.id,s.pixels,s.luminance,s.solidAngleSteradians,s.positionIndex,s.x,s.y,s.imageMaximum,s.sourceIlluminance].map(v=>v===null?'':v).join(','))].join('\r\n');}
export function sha256(input){
 const data=typeof input==='string'?new TextEncoder().encode(input):input instanceof Uint8Array?input:new Uint8Array(input),len=data.length,total=Math.ceil((len+9)/64)*64,bytes=new Uint8Array(total);bytes.set(data);bytes[len]=128;const dv=new DataView(bytes.buffer);dv.setUint32(total-8,Math.floor(len/0x20000000));dv.setUint32(total-4,(len*8)>>>0);
 const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2],H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64),r=(v,n)=>(v>>>n)|(v<<(32-n));
 for(let off=0;off<total;off+=64){for(let i=0;i<16;i++)w[i]=dv.getUint32(off+i*4);for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(r(a,7)^r(a,18)^(a>>>3))+w[i-7]+(r(b,17)^r(b,19)^(b>>>10)))>>>0;}let [a,b,c,d,e,f,g,h]=H;for(let i=0;i<64;i++){const t1=(h+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}[a,b,c,d,e,f,g,h].forEach((v,i)=>H[i]=(H[i]+v)>>>0);}
 return H.map(v=>v.toString(16).padStart(8,'0')).join('');
}
export function glareJob(prepared){const inputSha256=sha256(prepared.hdr),args=prepared.args;return {...prepared.metadata,inputSha256,argumentsSha256:sha256(JSON.stringify(args)),args,inputFile:'input.hdr',checkFile:'glare-check.hdr'};}
export function acceptGlareResult(document,job){
 if(!job)throw Error('Prepare this source before importing its result.');
 if(document?.schema!==RESULT_SCHEMA||document.inputSha256!==job.inputSha256||document.argumentsSha256!==job.argumentsSha256||JSON.stringify(document.args)!==JSON.stringify(job.args))throw Error('Result does not match this prepared image and these calculation settings.');
 if(document.exitCode!==0)throw Error('evalglare did not exit successfully. '+String(document.stderr||'').slice(0,600));
 if(!document.engineVersion||typeof document.stdout!=='string')throw Error('Missing engine version or raw calculation output.');
 return {...parseEvalglare(document.stdout),engineVersion:String(document.engineVersion),engineSha256:document.engineSha256||null,provenance:document.provenance||'externally supplied result; not independently authenticated',warnings:String(document.stderr||''),raw:document.stdout,inputSha256:job.inputSha256,argumentsSha256:job.argumentsSha256,mode:job.coverage.mode};
}
