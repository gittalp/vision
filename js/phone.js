/* Phone/JPEG gain-map decoding. Independent implementation of the public
 * Adobe/Android and ISO 21496-1 reconstruction equations. Camera-rendered HDR
 * is relative display light, NOT a calibrated reconstruction of scene light.
 * No canvas HDR auto-rendering is used for the JPEG numerical route.
 */
const P3=[.68,.32,.265,.69,.15,.06,.3127,.329];
const SRGB=[.64,.33,.3,.6,.15,.06,.3127,.329];
const ISO='urn:iso:std:iso:ts:21496:-1';
const decoder=new TextDecoder();
const text=a=>decoder.decode(a);
const linear=z=>z<=.04045?z/12.92:((z+.055)/1.055)**2.4;
function checkPixels(w,h){if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>25000000)throw Error('Photo exceeds the 25 MP decoder safety limit or has invalid dimensions');}
export function jpegParts(buffer){
 const b=new Uint8Array(buffer),v=new DataView(buffer),parts=[];let start=0;
 while(start+2<b.length){while(start+1<b.length&&(b[start]!==255||b[start+1]!==216))start++;if(start+1>=b.length)break;
  let p=start+2,segments=[],width=0,height=0,done=false;
  while(p<b.length){if(b[p]!==255)throw Error('Invalid JPEG marker boundary');const markerStart=p;while(b[p]===255)p++;const m=b[p++];if(m===217){parts.push({start,end:p,segments,width,height});start=p;done=true;break;}if(m===216||m===0)throw Error('Invalid JPEG marker');if((m>=208&&m<=215)||m===1)continue;
   if(p+2>b.length)throw Error('Truncated JPEG segment');const n=v.getUint16(p,false);if(n<2||p+n>b.length)throw Error('Truncated JPEG segment');const payload=p+2,end=p+n;segments.push({marker:m,start:markerStart,payload,end});
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m)){if(n<8)throw Error('Invalid JPEG frame');height=v.getUint16(payload+1,false);width=v.getUint16(payload+3,false);checkPixels(width,height);}
   p=end;if(m===218){while(p+1<b.length){if(b[p]!==255){p++;continue;}let q=p+1;while(b[q]===255)q++;if(b[q]===0||(b[q]>=208&&b[q]<=215)){p=q+1;continue;}break;}}
  }
  if(!done)throw Error('Truncated JPEG image');if(parts.length>32)throw Error('Too many embedded JPEG images');
 }
 return parts;
}
export function stripJPEG(buffer,part){
 const b=new Uint8Array(buffer),chunks=[];let p=part.start;
 for(const s of part.segments){if(s.marker===225||s.marker===226){chunks.push(b.subarray(p,s.start));p=s.end;}}
 chunks.push(b.subarray(p,part.end));const out=new Uint8Array(chunks.reduce((n,a)=>n+a.length,0));let at=0;for(const a of chunks){out.set(a,at);at+=a.length;}return out;
}
function tri(value,name){const a=Array.isArray(value)?value:[value];if(a.length!==1&&a.length!==3)throw Error('Invalid '+name+' channel count');const out=a.length===1?[a[0],a[0],a[0]]:a;if(out.some(v=>!Number.isFinite(v)))throw Error('Invalid '+name);return out;}
function validateGain(m){
 for(const name of ['min','max','gamma','offsetSdr','offsetHdr'])m[name]=tri(m[name],name);
 if(m.baseHDR)throw Error('HDR-base gain-map images are not supported; choose explicit SDR fallback or export a scene-linear HDR elsewhere');
 if(m.alternateColorSpace)throw Error('Gain map requests a different application color space; explicit SDR fallback is available');
 if(m.gamma.some(g=>g<=0)||m.min.some((v,i)=>v>m.max[i])||m.offsetSdr.some(v=>v<0)||m.offsetHdr.some(v=>v<0)||m.max.some(v=>Math.abs(v)>32)||m.min.some(v=>Math.abs(v)>32)||!(m.capacityMax>m.capacityMin)||!Number.isFinite(m.capacityMax)||!Number.isFinite(m.capacityMin))throw Error('Unsupported or invalid gain-map range/gamma/headroom');
 return m;
}
export function parseGainXMP(xmp){
 const ns=xmp.match(/xmlns:([\w]+)\s*=\s*["']http:\/\/ns\.adobe\.com\/hdr-gain-map\/1\.0\/["']/),prefix=ns?ns[1]:'hdrgm';
 const get=(name,fallback)=>{const q=prefix+':'+name;let m=xmp.match(new RegExp(q+'\\s*=\\s*["\']([^"\']+)["\']'));if(m)return m[1];m=xmp.match(new RegExp('<'+q+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+q+'>'));if(!m)return fallback;const li=[...m[1].matchAll(/<[^:>]+:li(?:\s[^>]*)?>([^<]+)<\/[^:>]+:li>/g)];return li.length?li.map(v=>Number(v[1])):m[1].replace(/<[^>]+>/g,'').trim();};
 const version=get('Version',null);if(version===null)return null;if(version!=='1.0')throw Error('Unsupported gain-map XMP version '+version);
 if(get('GainMapMax',null)===null)return null;
 const number=(name,def)=>{const v=get(name,def);return Array.isArray(v)?v.map(Number):Number(v);};
 return validateGain({schema:'Adobe/Android gain map 1.0',min:number('GainMapMin',0),max:number('GainMapMax',NaN),gamma:number('Gamma',1),offsetSdr:number('OffsetSDR',1/64),offsetHdr:number('OffsetHDR',1/64),capacityMin:number('HDRCapacityMin',0),capacityMax:number('HDRCapacityMax',NaN),baseHDR:/true/i.test(String(get('BaseRenditionIsHDR','False')))});
}
export function parseAppleGainXMP(xmp){
 // Explicit Apple HDRGainMapHeadroom convention, distinct from the older
 // Apple HEIC linear auxiliary-gain convention. See libavif's public reader.
 const ns=xmp.match(/xmlns:([\w]+)\s*=\s*["']http:\/\/ns\.apple\.com\/HDRGainMap\/1\.0\/["']/);
 if(!ns)return null;
 const field=name=>{const q=ns[1]+':'+name;let m=xmp.match(new RegExp(q+'\\s*=\\s*["\']([^"\']+)["\']'));if(m)return m[1];m=xmp.match(new RegExp('<'+q+'(?:\\s[^>]*)?>([^<]+)<\\/'+q+'>'));return m?m[1].trim():null;};
 if(field('HDRGainMapVersion')===null)return null;
 const headroom=Number(field('HDRGainMapHeadroom'));
 if(!(headroom>1)||!Number.isFinite(headroom))throw Error('Apple gain-map headroom is missing or not greater than one; no headroom is guessed');
 const stops=Math.log2(headroom);
 return validateGain({schema:'Apple XMP HDRGainMapHeadroom',min:0,max:stops,gamma:1,offsetSdr:0,offsetHdr:0,capacityMin:0,capacityMax:stops,baseHDR:false});
}
export function parseGainISO(bytes){
 const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),dv=new DataView(a.buffer,a.byteOffset,a.byteLength);let p=0;
 function u(n,signed=false){if(p+n>a.length)throw Error('Truncated ISO gain metadata');let v=n===1?dv.getUint8(p):n===2?dv.getUint16(p,false):signed?dv.getInt32(p,false):dv.getUint32(p,false);p+=n;return v;}
 if(a.length>=ISO.length+1&&text(a.subarray(0,ISO.length))===ISO)p=ISO.length+1;
 const reader=u(2),writer=u(2);if(reader!==0)throw Error('Unsupported ISO gain-map reader version');if(p===a.length)return null;
 const flags=u(1),channels=flags&128?3:1,common=!!(flags&8);let denom=common?u(4):null;
 const rational=signed=>{const n=u(4,signed),d=common?denom:u(4);if(!d)throw Error('Zero ISO gain-map denominator');return n/d;};
 const capacityMin=rational(false),capacityMax=rational(false),min=[],max=[],gamma=[],offsetSdr=[],offsetHdr=[];
 for(let i=0;i<channels;i++){min.push(rational(true));max.push(rational(true));gamma.push(rational(false));offsetSdr.push(rational(true));offsetHdr.push(rational(true));}
 return validateGain({schema:'ISO 21496-1',reader,writer,min,max,gamma,offsetSdr,offsetHdr,capacityMin,capacityMax,baseHDR:!!(flags&4)||capacityMax<capacityMin,alternateColorSpace:!(flags&64)});
}
export function gainPixel(base,gain,m){return [0,1,2].map(c=>{const encoded=Math.max(0,Math.min(1,gain[c])),logBoost=m.min[c]+(m.max[c]-m.min[c])*encoded**(1/m.gamma[c]);return Math.max(0,(base[c]+m.offsetSdr[c])*2**logBoost-m.offsetHdr[c]);});}
export function orientRGB(rgb,w,h,orientation=1){
 if(!Number.isInteger(orientation)||orientation<1||orientation>8)throw Error('Invalid EXIF orientation');if(orientation===1)return {rgb,width:w,height:h};
 const swap=orientation>=5,W=swap?h:w,H=swap?w:h,out=new rgb.constructor(rgb.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let xx=x,yy=y;if(orientation===2)xx=w-1-x;if(orientation===3){xx=w-1-x;yy=h-1-y;}if(orientation===4)yy=h-1-y;if(orientation===5){xx=y;yy=x;}if(orientation===6){xx=h-1-y;yy=x;}if(orientation===7){xx=h-1-y;yy=w-1-x;}if(orientation===8){xx=y;yy=w-1-x;}for(let c=0;c<3;c++)out[(yy*W+xx)*3+c]=rgb[(y*w+x)*3+c];}
 return {rgb:out,width:W,height:H};
}
function inverse(m){const[a,b,c,d,e,f,g,h,i]=m,A=e*i-f*h,B=c*h-b*i,C=b*f-c*e,D=f*g-d*i,E=a*i-c*g,F=c*d-a*f,G=d*h-e*g,H=b*g-a*h,I=a*e-b*d,det=a*A+b*D+c*G;if(Math.abs(det)<1e-12)throw Error('Singular ICC matrix');return[A,B,C,D,E,F,G,H,I].map(v=>v/det);}
function multiply(a,b){return Array.from({length:9},(_,i)=>[0,1,2].reduce((s,k)=>s+a[3*Math.floor(i/3)+k]*b[k*3+i%3],0));}
export function readICC(bytes){
 const a=bytes,v=new DataView(a.buffer,a.byteOffset,a.byteLength),str=(p,n)=>text(a.subarray(p,p+n));if(a.length<132||str(36,4)!=='acsp'||str(16,4)!=='RGB '||str(20,4)!=='XYZ ')throw Error('Unsupported phone ICC profile (requires matrix RGB/XYZ profile)');
 const tags={},count=v.getUint32(128,false);if(count>1024||132+12*count>a.length)throw Error('Invalid ICC tag table');for(let i=0;i<count;i++){const p=132+12*i,offset=v.getUint32(p+4,false),size=v.getUint32(p+8,false);if(offset+size>a.length)throw Error('Truncated ICC tag');tags[str(p,4)]={offset,size};}
 const fix=p=>v.getInt32(p,false)/65536;
 const xyz=name=>{const t=tags[name];if(!t||t.size<20||str(t.offset,4)!=='XYZ ')throw Error('Missing ICC '+name);return[fix(t.offset+8),fix(t.offset+12),fix(t.offset+16)];};
 const curves=['rTRC','gTRC','bTRC'].map(name=>{const t=tags[name];if(!t)throw Error('ICC transfer function missing');const p=t.offset,kind=str(p,4);
  if(kind==='curv'){const n=v.getUint32(p+8,false);if(n===0)return z=>z;if(n===1){const g=v.getUint16(p+12,false)/256;return z=>z**g;}if(n>65536||12+n*2>t.size)throw Error('Invalid ICC curve');const c=Array.from({length:n},(_,i)=>v.getUint16(p+12+2*i,false)/65535);return z=>{const q=Math.max(0,Math.min(1,z))*(n-1),j=Math.floor(q);return c[j]+(c[Math.min(n-1,j+1)]-c[j])*(q-j);};}
  if(kind==='para'){const type=v.getUint16(p+8,false),n=[1,3,4,5,7][type];if(!n||12+4*n>t.size)throw Error('Unsupported ICC parametric curve');const[g,A,B,C,D,E,F]=Array.from({length:n},(_,i)=>fix(p+12+4*i));return z=>type===0?z**g:type===1?(z>=-B/A?(A*z+B)**g:0):type===2?(z>=-B/A?(A*z+B)**g+C:C):type===3?(z>=D?(A*z+B)**g:C*z):(z>=D?(A*z+B)**g+E:C*z+F);}
  throw Error('Unsupported ICC transfer curve');});
 const r=xyz('rXYZ'),g=xyz('gXYZ'),b=xyz('bXYZ');let matrix=[r[0],g[0],b[0],r[1],g[1],b[1],r[2],g[2],b[2]];
 const ch=tags.chad;if(ch&&ch.size>=44&&str(ch.offset,4)==='sf32')matrix=multiply(inverse(Array.from({length:9},(_,i)=>fix(ch.offset+8+i*4))),matrix);
 else matrix=multiply([.9555766,-.0230393,.0631636,-.0282895,1.0099416,.0210077,.0122982,-.020483,.3299098+1],matrix); // Bradford D50 -> D65, last entry 1.3299098.
 const columns=[[matrix[0],matrix[3],matrix[6]],[matrix[1],matrix[4],matrix[7]],[matrix[2],matrix[5],matrix[8]]],white=[matrix[0]+matrix[1]+matrix[2],matrix[3]+matrix[4]+matrix[5],matrix[6]+matrix[7]+matrix[8]],xy=c=>[c[0]/(c[0]+c[1]+c[2]),c[1]/(c[0]+c[1]+c[2])],primaries=[...xy(columns[0]),...xy(columns[1]),...xy(columns[2]),...xy(white)];
 return {matrix,primaries,curves,description:'Embedded matrix/TRC ICC; source linear RGB recovered before gain application'};
}
function profileJPEG(buffer,part){const b=new Uint8Array(buffer),chunks=[];for(const s of part.segments)if(s.marker===226&&text(b.subarray(s.payload,s.payload+12))==='ICC_PROFILE\0'){chunks.push({index:b[s.payload+12],count:b[s.payload+13],data:b.subarray(s.payload+14,s.end)});}if(!chunks.length)return null;chunks.sort((a,b)=>a.index-b.index);if(chunks.length!==chunks[0].count||chunks.some((c,i)=>c.index!==i+1||c.count!==chunks.length))throw Error('Incomplete ICC chunks');const all=new Uint8Array(chunks.reduce((n,c)=>n+c.data.length,0));let p=0;for(const c of chunks){all.set(c.data,p);p+=c.data.length;}return readICC(all);}
export async function rasterCodes(bytes,maxWidth=4096,maxPixels=4000000,raw=false){
 const image=await createImageBitmap(new Blob([bytes]),{imageOrientation:'none',colorSpaceConversion:raw?'none':'default',premultiplyAlpha:'none'}),ow=image.width,oh=image.height;checkPixels(ow,oh);
 const ratio=Math.min(1,maxWidth?maxWidth/Math.max(ow,oh):1,Math.sqrt(maxPixels/(ow*oh))),w=Math.max(1,Math.round(ow*ratio)),h=Math.max(1,Math.round(oh*ratio));
 const canvas=new OffscreenCanvas(ow,oh),ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.drawImage(image,0,0);image.close();const data=ctx.getImageData(0,0,ow,oh).data,u8=new Uint8Array(w*h*3);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=Math.min(ow-1,Math.floor((x+.5)*ow/w)),sy=Math.min(oh-1,Math.floor((y+.5)*oh/h)),j=4*(sy*ow+sx),i=3*(y*w+x);if(data[j+3]!==255)throw Error('Transparent photos are not supported');u8[i]=data[j];u8[i+1]=data[j+1];u8[i+2]=data[j+2];}canvas.width=canvas.height=1;return {u8,width:w,height:h,originalWidth:ow,originalHeight:oh};
}
function gainSample(data,x,y,w,h){const xx=Math.max(0,Math.min(w-1,x)),yy=Math.max(0,Math.min(h-1,y)),x0=Math.floor(xx),y0=Math.floor(yy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=xx-x0,fy=yy-y0;return[0,1,2].map(c=>((1-fy)*((1-fx)*data[(y0*w+x0)*3+c]+fx*data[(y0*w+x1)*3+c])+fy*((1-fx)*data[(y1*w+x0)*3+c]+fx*data[(y1*w+x1)*3+c]))/255);}
export function reconstructGain(base,gain,metadata,curves=[linear,linear,linear]){
 const rgb=new Float32Array(base.u8.length),w=base.width,h=base.height;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=3*(y*w+x),b=[0,1,2].map(c=>curves[c](base.u8[p+c]/255)),g=gainSample(gain.u8,(x+.5)*gain.width/w-.5,(y+.5)*gain.height/h-.5,gain.width,gain.height),out=gainPixel(b,g,metadata);for(let c=0;c<3;c++){if(!Number.isFinite(out[c])||out[c]>3.4e38)throw Error('Gain-map reconstruction overflow');rgb[p+c]=out[c];}}return rgb;
}
export async function decodePhoneJPEG(buffer,meta={},options={}){
 const b=new Uint8Array(buffer),parts=jpegParts(buffer);if(!parts.length)throw Error('No JPEG image');let gain=null,gainMeta=null,detected=false,problem=null;const primary=parts[0];
 try{for(const part of parts){let xmp='',iso=null;for(const s of part.segments){const a=b.subarray(s.payload,s.end);if(s.marker===225){const t=text(a);if(t.includes('hdr-gain-map')||t.includes('HDRGainMap')){detected=true;xmp+=t;}}if(s.marker===226&&text(a.subarray(0,ISO.length))===ISO){detected=true;const m=parseGainISO(a);if(m)iso=m;}}
   const m=iso||parseGainXMP(xmp)||parseAppleGainXMP(xmp);if(m&&part!==primary){if(gain)throw Error('Multiple supported gain images; ambiguous reconstruction');gain=part;gainMeta=m;}}
  if(detected&&!gain)throw Error('HDR metadata detected but no supported matching SDR-base gain image');
 }catch(e){problem=e.message;detected=true;}
 const sdrOnly=options.mode==='sdr';if(detected&&(problem||!gain)&&!sdrOnly)throw Error((problem||'Unsupported gain map')+'. Select "SDR base only" explicitly to inspect the ordinary photograph.');
 const icc=profileJPEG(buffer,primary),base=await rasterCodes(stripJPEG(buffer,primary),options.maxWidth||4096,4000000,true);let rgb,phone;
 if(gain&&!sdrOnly){const g=await rasterCodes(stripJPEG(buffer,gain),0,25000000,true);if(Math.abs((base.originalWidth/base.originalHeight)/(g.originalWidth/g.originalHeight)-1)>.025)throw Error('Gain map and base image have incompatible aspect ratios');rgb=reconstructGain(base,g,gainMeta,icc?.curves);phone={kind:'gain-map HDR',decodedHDR:true,standard:gainMeta.schema,metadata:gainMeta,gainDimensions:[g.originalWidth,g.originalHeight],relativeWhite:1,scope:'Rendered HDR light; computational camera processing is retained, not recovered scene radiance'};}
 else {rgb=Float32Array.from(base.u8,(z,i)=>(icc?.curves[i%3]||linear)(z/255));phone={kind:detected?'explicit SDR base of HDR image':'ordinary SDR photograph',decodedHDR:false,detectedHDR:detected,fallbackReason:sdrOnly?(problem||'Operator requested SDR base'):null,scope:'Illustrative simulation of processed photograph; not scene photometry'};}
 const oriented=orientRGB(rgb,base.width,base.height,meta.orientation||1),swap=(meta.orientation||1)>=5;
 return {...oriented,originalWidth:swap?base.originalHeight:base.originalWidth,originalHeight:swap?base.originalWidth:base.originalHeight,format:phone.decodedHDR?'phone-hdr':'ldr',header:{...meta,phone,orientationApplied:meta.orientation||1},primaries:icc?.primaries||SRGB,matrixOverride:icc?.matrix,sampling:'Source-pixel subsampling; orientation applied to RGB once; gain maps bilinearly resampled',phoneNotes:[icc?.description||'No embedded ICC: sRGB assumed; confirm the photo export color space',phone.scope]};
}
