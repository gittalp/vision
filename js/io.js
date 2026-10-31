import {decodePhoneJPEG,orientRGB,jpegParts,stripJPEG,rasterCodes} from './phone.js';
import {decodeHEIF,heifContainer} from './heif.js';
import {decodeEXR,exrHeader} from './exr.js';
import {geometryHeader} from './geometry.js';
export const LIMIT_PIXELS=25000000;
export const SRGB_PRIMARIES=[.64,.33,.30,.60,.15,.06,.3127,.3290];
export const RAD_PRIMARIES=[.64,.33,.29,.60,.15,.06,1/3,1/3];
export const srgbDecode=z=>z<=.04045?z/12.92:((z+.055)/1.055)**2.4;
export const srgbEncode=z=>z<=.0031308?12.92*z:1.055*z**(1/2.4)-.055;
export function inverse3(m){const [a,b,c,d,e,f,g,h,i]=m,A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,D=c*h-b*i,E=a*i-c*g,F=b*g-a*h,G=b*f-c*e,H=c*d-a*f,I=a*e-b*d,det=a*A+b*B+c*C;if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw Error('Invalid/singular primaries');return [A,D,G,B,E,H,C,F,I].map(x=>x/det);}
export function mul3(a,b){const r=Array(9).fill(0);for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)r[3*i+j]+=a[3*i+k]*b[3*k+j];return r;}
export function vec3(m,v){return [0,1,2].map(i=>m[i*3]*v[0]+m[i*3+1]*v[1]+m[i*3+2]*v[2]);}
export function rgbMatrix(p){if(!Array.isArray(p)||p.length!==8||p.some(x=>!Number.isFinite(x)))throw Error('Invalid primaries');const [rx,ry,gx,gy,bx,by,wx,wy]=p;if([ry,gy,by,wy].some(v=>v<=0))throw Error('Invalid chromaticity denominator');const base=[rx/ry,gx/gy,bx/by,1,1,1,(1-rx-ry)/ry,(1-gx-gy)/gy,(1-bx-by)/by],s=vec3(inverse3(base),[wx/wy,1,(1-wx-wy)/wy]);return base.map((v,i)=>v*s[i%3]);}
const XYZ_SRGB=inverse3(rgbMatrix(SRGB_PRIMARIES));
export function hdrHeader(buffer){const b=new Uint8Array(buffer);let p=0;const lines=[];const line=()=>{const start=p;while(p<b.length&&b[p]!==10){if(p-start>16384)throw Error('Overlong HDR header line');p++;}if(p>=b.length)throw Error('Truncated HDR header');const s=new TextDecoder().decode(b.subarray(start,p)).replace(/\r$/,'');p++;return s;};
 const magic=line();if(!['#?RADIANCE','#?RGBE'].includes(magic))throw Error('Not a Radiance RGBE/XYZE file');let exposure=1,colorcorr=[1,1,1],primaries=null,format=null,view=null,units=null,geometry=null,circle=null;
 for(let i=0;i<4096;i++){const s=line();if(!s)break;lines.push(s);const [key,...rest]=s.split('='),v=rest.join('=').trim();if(key==='EXPOSURE'){const n=Number(v);if(!(n>0)||!Number.isFinite(n))throw Error('Invalid HDR exposure');exposure*=n;}if(key==='COLORCORR'){const n=v.split(/\s+/).map(Number);if(n.length!==3||n.some(x=>!(x>0)||!Number.isFinite(x)))throw Error('Invalid HDR COLORCORR');colorcorr=colorcorr.map((x,i)=>x*n[i]);}if(key==='PRIMARIES')primaries=v.split(/\s+/).map(Number);if(key==='FORMAT')format=v;if(key==='VIEW')view=v;if(key==='VISIONSIM_UNITS')units=v;if(key==='VISIONSIM_GEOMETRY'){try{geometry=JSON.parse(v);}catch{throw Error('Invalid geometry metadata');}}if(key==='VISIONSIM_VALID_CIRCLE'){try{circle=JSON.parse(v);}catch{throw Error('Invalid image-circle metadata');}}if(p>1024*1024)throw Error('HDR header too large');}
 const res=line().trim().match(/^([+-])([XY])\s+(\d+)\s+([+-])([XY])\s+(\d+)$/);if(!res||res[2]===res[5])throw Error('Unsupported HDR orientation record');const major=Number(res[3]),minor=Number(res[6]),width=res[2]==='Y'?minor:major,height=res[2]==='Y'?major:minor;
 if(width*height>LIMIT_PIXELS||width<1||height<1||width>32768||height>32768)throw Error('Image exceeds 25 million pixel safety limit');if(!['32-bit_rle_rgbe','32-bit_rle_xyze'].includes(format))throw Error('Only RGBE and XYZE HDR formats supported');if(!Number.isFinite(exposure))throw Error('HDR exposure product overflow');return {width,height,major,minor,orientation:res.slice(1),offset:p,exposure,colorcorr,primaries,format,view,units,geometry,circle,lines};}
export function decodeHDR(buffer,progress=()=>{}){const header=hdrHeader(buffer),b=new Uint8Array(buffer),{width:w,height:h,minor,major}=header,rgb=new Float32Array(w*h*3),scan=new Uint8Array(minor*4);let p=header.offset;
 const get=()=>{if(p>=b.length)throw Error('Truncated RGBE data');return b[p++];};
 const set=(maj,min,rr,gg,bb,ee)=>{const q=header.orientation;let x,y;if(q[1]==='Y'){y=q[0]==='-'?maj:h-1-maj;x=q[3]==='+'?min:w-1-min;}else{x=q[0]==='+'?maj:w-1-maj;y=q[3]==='-'?min:h-1-min;}
  const at=(y*w+x)*3,scale=ee?2**(ee-136):0; // Radiance decode uses bin center, not lower edge.
  rgb[at]=ee?(rr+.5)*scale:0;rgb[at+1]=ee?(gg+.5)*scale:0;rgb[at+2]=ee?(bb+.5)*scale:0;};
 for(let y=0;y<major;y++){const a=get(),c=get(),d=get(),e=get();if(minor>=8&&minor<=32767&&a===2&&c===2&&(d&128)===0){if(((d<<8)|e)!==minor)throw Error('RGBE scanline size mismatch');for(let ch=0;ch<4;ch++){let x=0;while(x<minor){const run=get();if(!run)throw Error('Zero RGBE run');if(run>128){const n=run-128,v=get();if(x+n>minor)throw Error('RGBE run overflow');scan.fill(v,ch*minor+x,ch*minor+x+n);x+=n;}else{if(x+run>minor)throw Error('RGBE literal overflow');for(let j=0;j<run;j++)scan[ch*minor+x++]=get();}}}for(let x=0;x<minor;x++)set(y,x,scan[x],scan[minor+x],scan[2*minor+x],scan[3*minor+x]);}
  else {let x=0,prev=null,shift=0,px=[a,c,d,e];while(x<minor){if(px[0]===1&&px[1]===1&&px[2]===1){if(!prev||shift>24)throw Error('Invalid old RGBE repeat');const n=px[3]*2**shift;if(x+n>minor)throw Error('Old RGBE run overflow');for(let j=0;j<n;j++)set(y,x++,...prev);shift+=8;}else{set(y,x++,...px);prev=px;shift=0;}if(x<minor)px=[get(),get(),get(),get()];}}
  if(y%64===0)progress((y+1)/major);
 }
 return {rgb,width:w,height:h,header,format:'hdr'};}
export function jpegMetadata(buffer){const b=new Uint8Array(buffer),dv=new DataView(buffer);const result={};if(b[0]!==255||b[1]!==216)return result;let p=2;
 while(p+4<=b.length){if(b[p++]!==255)break;const marker=b[p++];if(marker===217||marker===218)break;const n=dv.getUint16(p,false);if(n<2||p+n>b.length)break;const start=p+2;
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&n>=8){result.encodedWidth=dv.getUint16(start+3,false);result.encodedHeight=dv.getUint16(start+1,false);}
  if(marker===226&&new TextDecoder().decode(b.subarray(start,start+11))==='ICC_PROFILE')result.embeddedICC=true;
  if(marker===225&&new TextDecoder().decode(b.subarray(start,start+6))==='Exif\0\0'){try{const base=start+6,little=dv.getUint16(base,false)===0x4949;const u16=o=>dv.getUint16(base+o,little),u32=o=>dv.getUint32(base+o,little);if(u16(2)!==42)break;const seen=new Set();function ifd(off,depth=0){if(depth>2||seen.has(off)||off<8||base+off+2>p+n)return;seen.add(off);const k=u16(off);if(k>1024)return;for(let i=0;i<k;i++){const pos=off+2+12*i;if(base+pos+12>p+n)return;const tag=u16(pos),type=u16(pos+2),len=u32(pos+4),size=({1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8})[type];if(!size||len>4096)continue;const vpos=len*size<=4?pos+8:u32(pos+8);if(base+vpos+len*size>p+n)continue;let value;if(type===2)value=new TextDecoder().decode(b.subarray(base+vpos,base+vpos+len)).replace(/\0.*$/,'');else if(type===3)value=u16(vpos);else if(type===4)value=u32(vpos);else if(type===5)value=u32(vpos+4)?u32(vpos)/u32(vpos+4):null;else continue;const name=({271:'make',272:'model',274:'orientation',33434:'exposureSeconds',33437:'fNumber',34855:'iso',37386:'focalLengthMM',40961:'colorSpace',41987:'whiteBalance',41989:'focalLength35MM',40962:'exifPixelWidth',40963:'exifPixelHeight',41486:'focalPlaneXResolution',41487:'focalPlaneYResolution',41488:'focalPlaneResolutionUnit',42036:'lensModel'})[tag];if(name)result[name]=value;if(tag===34665)ifd(value,depth+1);}}ifd(u32(4));}catch{result.exifWarning='Malformed EXIF; review exposure times manually';}}
  p+=n;
 }return result;}
export async function decodePhoto(file,maxWidth=2048,maxPixels=4000000){
 const data=await file.arrayBuffer(),meta=jpegMetadata(data),bytes=new Uint8Array(data),isJPEG=bytes[0]===255&&bytes[1]===216;
 let clean=data;if(isJPEG){const parts=jpegParts(data);const tagText=new TextDecoder().decode(bytes.subarray(0,Math.min(bytes.length,500000)));if(/hdr-gain-map|21496|HDRGainMap/.test(tagText))throw Error('Gain-map phone HDR is not suitable as a fixed-response exposure bracket. Import it as a single image.');clean=stripJPEG(data,parts[0]);}
 const decoded=await rasterCodes(clean,maxWidth,maxPixels,isJPEG),oriented=orientRGB(decoded.u8,decoded.width,decoded.height,meta.orientation||1),swap=(meta.orientation||1)>=5;
 return {u8:oriented.rgb,width:oriented.width,height:oriented.height,originalWidth:swap?decoded.originalHeight:decoded.originalWidth,originalHeight:swap?decoded.originalWidth:decoded.originalHeight,header:{...meta,orientationApplied:meta.orientation||1},format:'ldr',sampling:'Source-pixel subsampling; EXIF orientation applied once; no antialiasing'};
}
export function interpret(decoded,profile='auto'){
 let prim=decoded.primaries||SRGB_PRIMARIES,xyz=false,scale=null,normalization=[1,1,1],notes=[...(decoded.phoneNotes||[])];const h=decoded.header||{};
 if(decoded.format==='hdr'){xyz=h.format==='32-bit_rle_xyze';prim=h.primaries||RAD_PRIMARIES;normalization=h.colorcorr.map(c=>1/(h.exposure*c));scale=h.units==='relative'?null:179;notes.push('Header EXPOSURE and COLORCORR are reversed before analysis. File convention is not independent calibration.');}
 if(decoded.format==='exr'){prim=Array.isArray(h.chromaticities)?h.chromaticities:SRGB_PRIMARIES;scale=Number.isFinite(h.whiteLuminance)&&h.whiteLuminance>0?h.whiteLuminance:null;if(!h.chromaticities)notes.push('No chromaticities: confirm input color interpretation.');}
 if(profile==='xyz'){xyz=true;notes.push('Operator selected standard XYZ in R/G/B. Not the empirical Blackmagic display bridge.');}
 if(profile==='rec709'){prim=SRGB_PRIMARIES;xyz=false;}
 let matrix=xyz?[1,0,0,0,1,0,0,0,1]:(profile==='auto'&&decoded.matrixOverride?decoded.matrixOverride:rgbMatrix(prim));
 if(profile==='bmd'){matrix=[.606530,.220408,.123479,.267989,.832731,-.100720,-.029442,-.086611,1.204861];xyz=false;scale=null;notes.push('Blackmagic Wide Gamut Gen 5 LINEAR explicitly selected; no camera calibration or vignetting profile applied.');}
 const display=mul3(XYZ_SRGB,matrix),yWeights=matrix.slice(3,6),Y=new Float32Array(decoded.width*decoded.height);let negative=0;
 for(let i=0;i<Y.length;i++){const at=i*3;for(let c=0;c<3;c++){decoded.rgb[at+c]*=normalization[c];if(!Number.isFinite(decoded.rgb[at+c]))throw Error('Pixel normalization overflow');}Y[i]=yWeights[0]*decoded.rgb[at]+yWeights[1]*decoded.rgb[at+1]+yWeights[2]*decoded.rgb[at+2];if(!Number.isFinite(Y[i]))throw Error('Nonfinite luminance');if(Y[i]<0)negative++;}
 return {...decoded,Y,matrix,display,primaries:prim,scaleCandidate:scale,notes,negativeFraction:negative/Y.length,colorProfile:profile,xyz};
}
export async function loadSingle(file,profile='auto',progress=()=>{},options={}){const ext=file.name.toLowerCase().split('.').pop();if(file.size>256*1024*1024)throw Error('Input exceeds 256 MiB safety limit');let d;
 if(ext==='hdr'||ext==='pic')d=decodeHDR(await file.arrayBuffer(),progress);
 else if(ext==='exr')d=await decodeEXR(await file.arrayBuffer(),progress);
 else if(['jpg','jpeg'].includes(ext)){const data=await file.arrayBuffer();d=await decodePhoneJPEG(data,jpegMetadata(data),options);}
 else if(['heic','heif','hif'].includes(ext)){const data=await file.arrayBuffer();d=await decodeHEIF(data,options);try{const c=heifContainer(data),e=c.metadata.find(m=>m.type==='Exif')?.data;if(e&&e.length<65000){const at=4+new DataView(e.buffer,e.byteOffset,e.byteLength).getUint32(0,false),tiff=e.subarray(at),payload=new Uint8Array(tiff.length+6);payload.set(new TextEncoder().encode('Exif\0\0'));payload.set(tiff,6);const n=payload.length+2,j=new Uint8Array(n+6);j.set([255,216,255,225,n>>8,n&255]);j.set(payload,6);j.set([255,217],j.length-2);d.header.cameraMetadata=jpegMetadata(j.buffer);const orientation=d.header.cameraMetadata.orientation||1;if(orientation!==1&&!c.primaryProps.some(p=>p.type==='irot'||p.type==='imir')){const rotated=orientRGB(d.rgb,d.width,d.height,orientation);d.rgb=rotated.rgb;d.width=rotated.width;d.height=rotated.height;if(orientation>=5){const t=d.originalWidth;d.originalWidth=d.originalHeight;d.originalHeight=t;}d.header.orientationApplied=orientation;d.phoneNotes.push('EXIF orientation applied because no HEIF rotation/mirror property was present.');}}}catch(e){d.phoneNotes.push('HEIF camera metadata could not be parsed: '+e.message);}}
 else if(['png','webp'].includes(ext)){d=await decodePhoto(file,4096);d.rgb=Float32Array.from(d.u8,z=>srgbDecode(z/255));delete d.u8;}
 else throw Error('Use HDR, lossless scanline EXR, JPEG, PNG, WebP or HEIC/HEIF');
 if(d.header?.phone&&profile!=='auto')throw Error('Phone/photo imports require Auto color interpretation; their embedded profile is handled by the importer');
 return interpret(d,profile);
}
export function encodeHDR(frame,scale=1,absolute=false,options={}){const {width:w,height:h,rgb}=frame,prim=frame.primaries||SRGB_PRIMARIES;if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid export scale');if(rgb.length!==w*h*3||rgb.some(v=>!Number.isFinite(v)||v<0))throw Error('RGBE cannot preserve negative or nonfinite channels. Use float32 PFM for luminance or the original file.');const header=`#?RADIANCE\nSOFTWARE=VisionSim HDR Workspace 0.3\nVISIONSIM_UNITS=${absolute?'cd/m2_declared':'relative'}\nEXPOSURE=${absolute?179/scale:1}\n${options.geometry?geometryHeader(options.geometry):''}${options.mask?.enabled?'VISIONSIM_VALID_CIRCLE='+JSON.stringify(options.mask)+'\n':''}PRIMARIES=${prim.join(' ')}\nFORMAT=${frame.xyz?'32-bit_rle_xyze':'32-bit_rle_rgbe'}\n\n-Y ${h} +X ${w}\n`,head=new TextEncoder().encode(header),out=new Uint8Array(head.length+h*(4+4*w+4*Math.ceil(w/128)));out.set(head);let p=head.length;const scan=new Uint8Array(w*4);
 if(w<8||w>32767)throw Error('HDR export width must be 8..32767');
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const at=(y*w+x)*3,maximum=Math.max(rgb[at],rgb[at+1],rgb[at+2],0);if(!Number.isFinite(maximum))throw Error('Nonfinite export');if(maximum<1e-32){for(let c=0;c<4;c++)scan[c*w+x]=0;continue;}const exponent=Math.floor(Math.log2(maximum))+1;if(exponent+128>=256)throw Error('RGBE overflow');const fact=256/2**exponent;for(let c=0;c<3;c++)scan[c*w+x]=Math.max(0,Math.min(255,Math.floor(rgb[at+c]*fact)));scan[3*w+x]=exponent+128;}
 out.set([2,2,w>>>8,w&255],p);p+=4;for(let c=0;c<4;c++)for(let x=0;x<w;x+=128){const n=Math.min(128,w-x);out[p++]=n;out.set(scan.subarray(c*w+x,c*w+x+n),p);p+=n;}}
 return out.subarray(0,p);
}
export function encodePFM(Y,w,h,scale=1){if(!Number.isFinite(scale)||scale<=0||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||Y.length!==w*h)throw Error('Invalid PFM shape or scale');const head=new TextEncoder().encode(`Pf\n${w} ${h}\n-1.0\n`),bytes=new Uint8Array(head.length+Y.length*4),v=new DataView(bytes.buffer);bytes.set(head);let p=head.length;for(let y=h-1;y>=0;y--)for(let x=0;x<w;x++){const value=Math.fround(Y[y*w+x]*scale);if(!Number.isFinite(value))throw Error('PFM export would contain nonfinite/overflowed values');v.setFloat32(p,value,true);p+=4;}return bytes;}

// Header-only edit: preserve every original payload byte and photometric record.
// No decode/re-encode, exposure adjustment, gamut clipping, or resampling.
export function rewriteHDRGeometry(buffer,geometry){
 const h=hdrHeader(buffer),bytes=new Uint8Array(buffer);
 const original=new TextDecoder().decode(bytes.subarray(0,h.offset));
 const split=original.replace(/\r\n/g,'\n').split('\n\n');
 const lines=split[0].split('\n').filter(s=>!/^\s*(?:VIEW|VISIONSIM_GEOMETRY)\s*=/.test(s));
 const resolution=split.slice(1).join('\n\n').trim();
 const head=new TextEncoder().encode(lines.join('\n')+'\n# Geometry-only header edit; original pixel payload and photometric records retained.\n'+geometryHeader(geometry)+'\n'+resolution+'\n');
 const out=new Uint8Array(head.length+bytes.length-h.offset);out.set(head);out.set(bytes.subarray(h.offset),head.length);return out;
}
