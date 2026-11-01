/* HEIF container inspection + optional, pinned libheif-js decoder adapter.
 * The external codec runs locally; no image is uploaded. Unsupported HDR
 * structures are refused rather than silently flattened to SDR.
 */
import {readICC,parseGainXMP,reconstructGain} from './phone.js';
const decoder=new TextDecoder(),txt=a=>decoder.decode(a);
export const HEIF_CODEC_VERSION='1.23.5';
export const HEIF_CODEC_CDN='https://cdn.jsdelivr.net/npm/libheif-js@1.23.5/libheif-wasm/libheif-bundle.js';
const SRGB=[.64,.33,.3,.6,.15,.06,.3127,.329],P3=[.68,.32,.265,.69,.15,.06,.3127,.329],BT2020=[.708,.292,.170,.797,.131,.046,.3127,.329];
export function transferDecode(z,transfer=13){z=Math.max(0,z);if(transfer===13)return z<=.04045?z/12.92:((z+.055)/1.055)**2.4;if(transfer===1||transfer===6||transfer===14||transfer===15)return z<.081?z/4.5:((z+.099)/1.099)**(1/.45);if(transfer===8)return z;
 if(transfer===16){const m1=2610/16384,m2=2523/32,c1=3424/4096,c2=2413/128,c3=2392/128,p=z**(1/m2);return 10000*(Math.max(p-c1,0)/(c2-c3*p))**(1/m1)/203;}
 if(transfer===18){const a=.17883277,b=1-4*a,c=.5-a*Math.log(4*a);return z<=.5?z*z/3:(Math.exp((z-c)/a)+b)/12;}
 throw Error('Unsupported HEIF transfer characteristic '+transfer);
}
export function heifContainer(buffer){
 const bytes=new Uint8Array(buffer),v=new DataView(buffer),N=bytes.length,readText=(p,n)=>txt(bytes.subarray(p,p+n));
 function boxes(start,end){const out=[];for(let p=start;p<end;){if(p+8>end)throw Error('Truncated HEIF box');let n=v.getUint32(p,false),head=8;if(n===1){if(p+16>end)throw Error('Truncated extended HEIF box');n=Number(v.getBigUint64(p+8,false));head=16;}if(n===0)n=end-p;if(!Number.isSafeInteger(n)||n<head||p+n>end)throw Error('Invalid HEIF box length');out.push({type:readText(p+4,4),start:p,data:p+head,end:p+n});p+=n;}return out;}
 const top=boxes(0,N),ftyp=top.find(b=>b.type==='ftyp'),meta=top.find(b=>b.type==='meta');if(!ftyp||!meta)throw Error('Not a supported HEIF container');const children=boxes(meta.data+4,meta.end),items={},locations={},properties=[null],associations={},refs=[];let primary=null,idat=0;
 const getItem=id=>items[id]||(items[id]={id,type:null,name:''});
 for(const box of children){let p=box.data,version=bytes[p];
  if(box.type==='pitm'){primary=version===0?v.getUint16(p+4,false):v.getUint32(p+4,false);}
  if(box.type==='idat')idat=box.data;
  if(box.type==='iinf'){for(const q of boxes(p+(version===0?6:8),box.end)){if(q.type!=='infe')continue;const ver=bytes[q.data];if(ver!==2&&ver!==3)continue;let a=q.data+4,id=ver===2?v.getUint16(a,false):v.getUint32(a,false);a+=ver===2?2:4;a+=2;const item=getItem(id);item.type=readText(a,4);a+=4;const end=bytes.indexOf(0,a);if(end<0||end>=q.end)throw Error('Invalid HEIF item string');item.name=readText(a,end-a);a=end+1;if(item.type==='mime'){const end2=bytes.indexOf(0,a);item.contentType=readText(a,(end2<0?q.end:end2)-a);}}}
  if(box.type==='iloc'){
   let a=p+4;const sizes=bytes[a++],sizes2=bytes[a++],offsetSize=sizes>>4,lengthSize=sizes&15,baseSize=sizes2>>4,indexSize=version===1||version===2?sizes2&15:0;
   function uint(n){if(![0,1,2,4,8].includes(n)||a+n>box.end)throw Error('Unsupported HEIF extent size');let val=0;for(let i=0;i<n;i++)val=val*256+bytes[a++];if(!Number.isSafeInteger(val))throw Error('HEIF extent overflow');return val;}
   const count=uint(version<2?2:4);if(count>100000)throw Error('Too many HEIF items');for(let i=0;i<count;i++){const id=uint(version<2?2:4),method=version===1||version===2?uint(2)&15:0,dataRef=uint(2),base=uint(baseSize),n=uint(2),extents=[];if(dataRef)throw Error('Externally referenced HEIF items are not supported');for(let j=0;j<n;j++){if(indexSize)uint(indexSize);extents.push({offset:uint(offsetSize),length:uint(lengthSize)});}locations[id]={method,base,extents};}
  }
  if(box.type==='iprp'){for(const sub of boxes(p,box.end)){
   if(sub.type==='ipco')for(const prop of boxes(sub.data,sub.end)){const item={type:prop.type,bytes:bytes.slice(prop.data,prop.end)};if(prop.type==='ispe'&&item.bytes.length>=12){item.width=v.getUint32(prop.data+4,false);item.height=v.getUint32(prop.data+8,false);}if(prop.type==='auxC')item.auxType=txt(item.bytes.subarray(4)).replace(/\0.*$/s,'');if(prop.type==='colr'){item.profileType=readText(prop.data,4);if(item.profileType==='nclx'&&item.bytes.length>=11)item.nclx={primaries:v.getUint16(prop.data+4,false),transfer:v.getUint16(prop.data+6,false),matrix:v.getUint16(prop.data+8,false),fullRange:!!(bytes[prop.data+10]&128)};}properties.push(item);}
   if(sub.type==='ipma'){let a=sub.data;const ver=bytes[a],flags=v.getUint32(a,false)&0xffffff;a+=4;const count=v.getUint32(a,false);a+=4;if(count>100000)throw Error('Invalid property associations');for(let i=0;i<count;i++){const id=ver<1?v.getUint16(a,false):v.getUint32(a,false);a+=ver<1?2:4;const n=bytes[a++],list=associations[id]||(associations[id]=[]);for(let j=0;j<n;j++){if(a+(flags&1?2:1)>sub.end)throw Error('Truncated HEIF association');const z=flags&1?v.getUint16(a,false):bytes[a];a+=flags&1?2:1;list.push(z&(flags&1?32767:127));}}}
  }}
  if(box.type==='iref'){const wide=version!==0;for(const q of boxes(p+4,box.end)){let a=q.data;const from=wide?v.getUint32(a,false):v.getUint16(a,false);a+=wide?4:2;const count=v.getUint16(a,false);a+=2;const to=[];for(let i=0;i<count;i++){if(a+(wide?4:2)>q.end)throw Error('Truncated HEIF references');to.push(wide?v.getUint32(a,false):v.getUint16(a,false));a+=wide?4:2;}refs.push({type:q.type,from,to});}}
 }
 function itemData(id){const loc=locations[id];if(!loc||loc.method>1)throw Error('Unsupported HEIF metadata storage');const segments=[];let total=0;for(const e of loc.extents){const start=(loc.method===1?idat:0)+loc.base+e.offset,end=start+e.length;if(end>N||start<0)throw Error('Truncated HEIF item extent');segments.push(bytes.subarray(start,end));total+=e.length;}const out=new Uint8Array(total);let p=0;for(const s of segments){out.set(s,p);p+=s.length;}return out;}
 const props=id=>(associations[id]||[]).map(i=>properties[i]).filter(Boolean);
 if(primary===null)throw Error('No HEIF primary image');const primaryProps=props(primary),size=primaryProps.find(p=>p.type==='ispe');if(!size||size.width*size.height>25000000)throw Error('HEIF primary dimensions are missing or exceed 25 MP');
 const auxiliary=refs.filter(r=>r.type==='auxl'&&r.to.includes(primary)).map(r=>({id:r.from,properties:props(r.from),type:props(r.from).find(p=>p.type==='auxC')?.auxType||''}));
 const metadata=Object.values(items).filter(i=>i.type==='Exif'||i.type==='mime').map(i=>{let data=null;try{data=itemData(i.id);}catch{}return {...i,data};});
 const gain=auxiliary.find(a=>/hdrgainmap|hdr-gain-map|21496/i.test(a.type));
 return {primary,items,primaryProps,auxiliary,gain,metadata,refs,properties,props,itemData,width:size.width,height:size.height,adaptiveHDR:Object.values(items).some(i=>i.type==='tmap'),brand:readText(ftyp.data,4)};
}
let codecPromise=null;
async function codec(options){
 if(codecPromise)return codecPromise;
 codecPromise=(async()=>{
  if(!globalThis.libheif){try{importScripts(options.localCodecURL);}catch(e){if(!options.allowNetworkCodec)throw Error('HEIC needs the optional local libheif codec. Install it with vendor/download_heif.py, or enable the pinned CDN codec. Your image is never uploaded.');importScripts(HEIF_CODEC_CDN);}}
  const m=typeof globalThis.libheif==='function'?await globalThis.libheif():globalThis.libheif;if(!m?.HeifDecoder)throw Error('libheif failed to initialize');return m;
 })();try{return await codecPromise;}catch(e){codecPromise=null;throw e;}
}
async function decodeHandle(lib,handle,maxWidth=4096,maxPixels=4000000){
 const img=await lib.heif_js_decode_image2(handle,lib.heif_colorspace.heif_colorspace_RGB,lib.heif_chroma.heif_chroma_interleaved_RRGGBB_LE);if(!img||img.code)throw Error('HEIF RGB16 decoding failed: '+(img?.message||'unknown error'));
 try{
  const c=img.channels.find(c=>c.id===lib.heif_channel.heif_channel_interleaved);if(!c)throw Error('HEIF RGB plane missing');const w=c.width,h=c.height;if(w*h>25000000)throw Error('HEIF plane exceeds 25 MP');
  const bits=c.bits_per_pixel??lib.heif_image_get_bits_per_pixel_range?.(img.image,lib.heif_channel.heif_channel_interleaved);if(!Number.isInteger(bits)||bits<8||bits>16)throw Error('HEIF decoder did not report a supported RGB bit depth');
  const raw=c.data instanceof Uint8Array?c.data:new Uint8Array(c.data.buffer,c.data.byteOffset,c.data.byteLength),dv=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),ratio=Math.min(1,maxWidth?maxWidth/Math.max(w,h):1,Math.sqrt(maxPixels/(w*h))),W=Math.max(1,Math.round(w*ratio)),H=Math.max(1,Math.round(h*ratio)),rgb=new Float32Array(W*H*3),den=2**bits-1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const xx=Math.min(w-1,Math.floor((x+.5)*w/W)),yy=Math.min(h-1,Math.floor((y+.5)*h/H)),at=yy*c.stride+xx*6;for(let k=0;k<3;k++)rgb[(y*W+x)*3+k]=dv.getUint16(at+2*k,true)/den;}
  return {rgb,width:W,height:H,originalWidth:w,originalHeight:h,bits};
 }finally{lib.heif_image_release(img.image);}
}
export function appleHeadroom(maker33,maker48){if(!Number.isFinite(maker33)||!Number.isFinite(maker48))throw Error('Apple gain-map maker-note headroom is missing');const stops=maker33<1?(maker48<=.01?-20*maker48+1.8:-.101*maker48+1.601):(maker48<=.01?-70*maker48+3:-.303*maker48+2.303);return 2**Math.max(stops,0);}
function appleMakerNotes(exif){
 if(!exif||exif.length<14)return null;const view=new DataView(exif.buffer,exif.byteOffset,exif.byteLength),offset=view.getUint32(0,false),tiff=4+offset;if(tiff+8>exif.length)return null;const le=view.getUint16(tiff,false)===0x4949,u16=p=>view.getUint16(tiff+p,le),u32=p=>view.getUint32(tiff+p,le);let maker=null;
 function walk(off,depth=0){if(depth>2||off<8||tiff+off+2>exif.length)return;const n=u16(off);if(n>512)return;for(let i=0;i<n;i++){const p=off+2+12*i;if(tiff+p+12>exif.length)return;const tag=u16(p),len=u32(p+4),at=u32(p+8);if(tag===34665)walk(at,depth+1);if(tag===37500&&tiff+at+len<=exif.length)maker=exif.subarray(tiff+at,tiff+at+len);}}
 try{walk(u32(4));if(!maker||txt(maker.subarray(0,10))!=='Apple iOS\0')return null;const mv=new DataView(maker.buffer,maker.byteOffset,maker.byteLength),little=mv.getUint16(12,false)===0x4949,n=mv.getUint16(14,little),out={};for(let i=0;i<n;i++){const p=16+i*12;if(p+12>maker.length)break;const tag=mv.getUint16(p,little),type=mv.getUint16(p+2,little),count=mv.getUint32(p+4,little);if(![33,48].includes(tag)||count!==1)continue;const pos=mv.getUint32(p+8,little);if(type===10&&pos+8<=maker.length){const den=mv.getInt32(pos+4,little);if(den)out[tag]=mv.getInt32(pos,little)/den;}if(type===9)out[tag]=mv.getInt32(p+8,little);}return out;}catch{return null;}
}
export async function decodeHEIF(buffer,options={}){
 const container=heifContainer(buffer),sdr=options.mode==='sdr',props=container.primaryProps,colr=props.find(p=>p.profileType==='prof'||p.profileType==='rICC'),nclx=props.find(p=>p.nclx)?.nclx,icc=colr?readICC(colr.bytes.subarray(4)):null;
 if(container.adaptiveHDR&&!sdr)throw Error('ISO Adaptive HDR HEIF (tmap) is not supported by this adapter. Export an Ultra HDR JPEG, or explicitly select SDR base only.');
 const primaries=icc?.primaries||({1:SRGB,9:BT2020,12:P3})[nclx?.primaries||1];if(!primaries)throw Error('Unsupported HEIF color primaries');const transfer=nclx?.transfer||13;
 const lib=await codec(options),dec=new lib.HeifDecoder();let images=[],baseHandle=null,gainHandle=null;
 try{
  images=dec.decode(new Uint8Array(buffer));baseHandle=lib.heif_js_context_get_image_handle(dec.decoder,container.primary);if(!baseHandle||baseHandle.code)throw Error('HEIF primary handle unavailable');
  if(lib.heif_image_handle_has_alpha_channel?.(baseHandle))throw Error('Transparent HEIF images are not supported for quantitative import');
  const base=await decodeHandle(lib,baseHandle,4096,4000000);const curves=icc?.curves||[0,1,2].map(()=>z=>transferDecode(z,transfer));let linearRGB=Float32Array.from(base.rgb,(z,i)=>curves[i%3](z));
  let kind=[16,18].includes(transfer)?'HEIF high-bit-depth HDR':'HEIF SDR photograph',decodedHDR=[16,18].includes(transfer),detail=null;
  if(container.gain&&!sdr){
   if(container.gain.type!=='urn:com:apple:photo:2020:aux:hdrgainmap')throw Error('Unsupported HEIF auxiliary gain-map convention; choose explicit SDR base only');
   const note=appleMakerNotes(container.metadata.find(m=>m.type==='Exif')?.data),headroom=appleHeadroom(note?.[33],note?.[48]);
   gainHandle=lib.heif_js_context_get_image_handle(dec.decoder,container.gain.id);if(!gainHandle||gainHandle.code)throw Error('HEIF gain-map handle unavailable');const g=await decodeHandle(lib,gainHandle,0,25000000);
   if(Math.abs(base.originalWidth/base.originalHeight/(g.originalWidth/g.originalHeight)-1)>.025)throw Error('HEIF base and gain map aspect mismatch');
   const sample=(x,y)=>{x=Math.max(0,Math.min(g.width-1,x));y=Math.max(0,Math.min(g.height-1,y));const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(g.width-1,x0+1),y1=Math.min(g.height-1,y0+1),fx=x-x0,fy=y-y0;return (1-fy)*((1-fx)*g.rgb[3*(y0*g.width+x0)]+fx*g.rgb[3*(y0*g.width+x1)])+fy*((1-fx)*g.rgb[3*(y1*g.width+x0)]+fx*g.rgb[3*(y1*g.width+x1)]);};
   for(let y=0;y<base.height;y++)for(let x=0;x<base.width;x++){const gain=transferDecode(sample((x+.5)*g.width/base.width-.5,(y+.5)*g.height/base.height-.5),1),boost=1+(headroom-1)*gain;for(let c=0;c<3;c++)linearRGB[3*(y*base.width+x)+c]*=boost;}
   kind='Apple legacy gain-map HEIF';decodedHDR=true;detail={headroom,gainBitDepth:g.bits,method:'Apple documented Rec.709 gain linearization and linear boost; maker-note headroom'};
  }
  if(sdr&&decodedHDR){for(let i=0;i<linearRGB.length;i++)linearRGB[i]=linearRGB[i]/(1+linearRGB[i]);decodedHDR=false;kind='Explicit tone-mapped HDR HEIF fallback';}
  if(sdr&&container.gain){decodedHDR=false;kind='Explicit HEIF SDR base (gain map omitted)';}
  return {rgb:linearRGB,width:base.width,height:base.height,originalWidth:base.originalWidth,originalHeight:base.originalHeight,format:decodedHDR?'phone-hdr':'ldr',primaries,matrixOverride:icc?.matrix,header:{phone:{kind,decodedHDR,codec:'libheif-js '+HEIF_CODEC_VERSION,bitDepth:base.bits,transfer,nclx,detail,scope:'Camera-rendered image, not calibrated scene photometry'},heif:{brand:container.brand,primary:container.primary,auxiliaryTypes:container.auxiliary.map(x=>x.type)},cameraMetadata:{}},sampling:'HEIF transforms applied by codec; source-pixel subsampling',phoneNotes:['HEIF color/transfer interpreted explicitly. '+(transfer===16?'PQ normalized to 203-nit reference white; these are display values, not scene cd/m2.':transfer===18?'HLG inverse OETF only; no display OOTF assumed.':'No absolute scene luminance scale inferred.')]};
 }finally{if(gainHandle&&!gainHandle.code)lib.heif_image_handle_release(gainHandle);if(baseHandle&&!baseHandle.code)lib.heif_image_handle_release(baseHandle);for(const i of images)i.free();if(dec.decoder){lib.heif_context_free(dec.decoder);dec.decoder=null;}}
}
