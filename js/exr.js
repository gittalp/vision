/* Single-part scanline EXR reader, lossless encodings only.
 * PIZ range/wavelet layout follows OpenEXR and the three.js/TinyEXR reader.
 * See ../licenses/EXR-NOTICES.txt. All arrays retain source channel values.
 * Deliberately rejects tiles, deep, multipart, subsampled and lossy data.
 */
const fail = s => { throw new Error('EXR: ' + s); };
export function halfFloat(v) {
  const sign = (v & 32768) ? -1 : 1, exp = (v >>> 10) & 31, mant = v & 1023;
  return sign * (exp === 0 ? mant * 2 ** -24 : exp === 31 ? (mant ? NaN : Infinity) : (1 + mant / 1024) * 2 ** (exp - 15));
}
class Cursor {
  constructor(bytes, pos=0, end=bytes.length) { this.b=bytes;this.d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.p=pos;this.end=end; }
  take(n) { if(!Number.isSafeInteger(n)||n<0||this.p+n>this.end)fail('truncated or oversized record');const p=this.p;this.p+=n;return p; }
  u8(){return this.b[this.take(1)];} u16(){return this.d.getUint16(this.take(2),true);} u32(){return this.d.getUint32(this.take(4),true);} i32(){return this.d.getInt32(this.take(4),true);}
  f32(){return this.d.getFloat32(this.take(4),true);} f64(){return this.d.getFloat64(this.take(8),true);}
  text(){const st=this.p;while(this.u8()!==0){if(this.p-st>255)fail('overlong string');}return new TextDecoder().decode(this.b.subarray(st,this.p-1));}
}
export function exrHeader(buffer) {
  const b=new Uint8Array(buffer),c=new Cursor(b);if(c.u32()!==20000630)fail('wrong magic');const v=c.u32();
  if((v&255)!==2 || (v&~(255|0x400)))fail('only single-part scanline EXR v2 is supported');
  const header=Object.assign(Object.create(null),{version:v});let count=0;
  while(true){if(++count>4096||c.p>16*1024*1024)fail('header exceeds safety bound');const name=c.text();if(!name)break;const type=c.text(),n=c.u32();if(n>4*1024*1024)fail('oversized attribute');const st=c.take(n),q=new Cursor(b,st,st+n);let value;
    if(['__proto__','constructor','prototype'].includes(name))fail('unsafe attribute name');if(Object.hasOwn(header,name))fail('duplicate attribute');
    if(type==='chlist'){value=[];while(q.p<q.end){const name=q.text();if(!name)break;const pixelType=q.i32(),pLinear=q.u8();q.take(3);value.push({name,pixelType,pLinear,xSampling:q.i32(),ySampling:q.i32()});}if(q.p!==q.end)fail('bad channel list');}
    else if(type==='box2i'){value={xMin:q.i32(),yMin:q.i32(),xMax:q.i32(),yMax:q.i32()};}
    else if(type==='compression'||type==='lineOrder')value=q.u8();
    else if(type==='chromaticities')value=Array.from({length:8},()=>q.f32());
    else if(type==='float')value=q.f32();else if(type==='double')value=q.f64();else if(type==='int')value=q.i32();
    else if(type==='string')value=new TextDecoder().decode(b.subarray(st,st+n));
    else value={attributeType:type,bytes:n};
    header[name]=value;
  }
  const w=header.dataWindow;if(!w)fail('missing data window');header.width=w.xMax-w.xMin+1;header.height=w.yMax-w.yMin+1;header.offsetTable=c.p;
  if(!header.channels||!header.width||!header.height||header.width<1||header.height<1||header.width>32768||header.height>32768||header.width*header.height>25000000)fail('image exceeds 25 million pixel safety limit');
  if(w.xMin!==0||w.yMin!==0)fail('offset data windows are not yet supported');
  if(header.displayWindow&&JSON.stringify(header.displayWindow)!==JSON.stringify(w))fail('cropped data/display windows are not yet supported');
  if(header.pixelAspectRatio!==undefined&&Math.abs(header.pixelAspectRatio-1)>1e-6)fail('non-square pixels not supported');
  const names=header.channels.map(x=>x.name);if(names.includes('Y')&&names.length!==1)fail('Y cannot accompany RGB channels in this release');if(new Set(names).size!==names.length)fail('duplicate channel');
  if(!(['R','G','B'].every(x=>names.includes(x))||names.length===1&&names[0]==='Y')||names.some(x=>!['R','G','B','A','Y'].includes(x)))fail('use full-resolution R/G/B or single Y channels');
  for(const x of header.channels)if(![1,2].includes(x.pixelType)||x.xSampling!==1||x.ySampling!==1)fail('only full-resolution HALF/FLOAT channels');
  if(![0,1,2,3,4].includes(header.compression))fail('lossy/unsupported compression; use NONE, RLE, ZIPS, ZIP or PIZ');
  return header;
}
// Bit reader uses arithmetic, not signed 32-bit shifts, for long codes.
class Bits {
  constructor(b,start,endBits){this.b=b;this.bit=start*8;this.end=endBits;}
  get(n){if(this.bit+n>this.end)fail('truncated Huffman bits');let v=0;for(let i=0;i<n;i++,this.bit++)v=v*2+((this.b[this.bit>>>3]>>>(7-(this.bit&7)))&1);return v;}
}
function huffman(bytes, start, length, nOut) {
  const c=new Cursor(bytes,start,start+length),lo=c.u32(),hi=c.u32(),tableBytes=c.u32(),nBits=c.u32();c.u32();
  if(lo>hi||hi>65536||tableBytes>length-20)fail('invalid Huffman table bounds');
  const lengths=new Uint8Array(hi+1),br=new Bits(bytes,c.p,(c.p+tableBytes)*8);
  for(let i=lo;i<=hi;){const n=br.get(6);if(n>=59){const run=n===63?br.get(8)+6:n-59+2;if(i+run>hi+1)fail('invalid zero-code run');i+=run;}else lengths[i++]=n;}
  // Canonical OpenEXR codes count down from the longest lengths. BigInt in
  // construction preserves valid code lengths through 58 bits.
  const counts=Array(59).fill(0n);for(let i=lo;i<=hi;i++)if(lengths[i])counts[lengths[i]]++;
  const next=Array(59).fill(0n);let code=0n;for(let l=58;l>0;l--){next[l]=code;code=(code+counts[l])>>1n;}
  const left=[-1],right=[-1],symbol=[-1];
  for(let i=lo;i<=hi;i++){const len=lengths[i];if(!len)continue;let cc=next[len]++;if(cc>=(1n<<BigInt(len)))fail('invalid canonical code');let node=0;
    for(let j=len-1;j>=0;j--){if(symbol[node]>=0)fail('prefix collision');const bit=Number((cc>>BigInt(j))&1n),arr=bit?right:left;if(arr[node]<0){arr[node]=left.length;left.push(-1);right.push(-1);symbol.push(-1);}node=arr[node];}
    if(symbol[node]>=0||left[node]>=0||right[node]>=0)fail('duplicate Huffman code');symbol[node]=i;
  }
  const begin=c.p+tableBytes;if(begin+Math.ceil(nBits/8)>start+length)fail('bit payload out of range');
  const data=new Bits(bytes,begin,begin*8+nBits),out=new Uint16Array(nOut);let oi=0;
  while(data.bit<data.end){let node=0;while(symbol[node]<0){node=data.get(1)?right[node]:left[node];if(node<0)fail('invalid Huffman symbol');}
    const s=symbol[node];if(s===hi){const n=data.get(8);if(oi===0||oi+n>nOut)fail('invalid Huffman repeat');out.fill(out[oi-1],oi,oi+n);oi+=n;}else{if(oi>=nOut)fail('too much Huffman output');out[oi++]=s;}
  }
  if(oi!==nOut)fail('incomplete Huffman output');return out;
}
function wavelet(buf,start,nx,ox,ny,oy,maxValue){
  const short=maxValue<16384;
  function pair(l,h){if(short){l=(l<<16)>>16;h=(h<<16)>>16;const a=l+(h&1)+(h>>1);return [a,a-h];}const b=(l-(h>>>1))&65535;return [(h+b-32768)&65535,b];}
  let p=1;while(p<=Math.min(nx,ny))p*=2;p/=2;let p2=p;p/=2;
  while(p>=1){let py=0;const oy1=oy*p,oy2=oy*p2,ox1=ox*p,ox2=ox*p2;
    for(;py<=oy*(ny-p2);py+=oy2){let px=py;for(;px<=py+ox*(nx-p2);px+=ox2){const i=start+px,a=i+ox1,b=i+oy1,d=b+ox1;const [q0,q2]=pair(buf[i],buf[b]),[q1,q3]=pair(buf[a],buf[d]);[buf[i],buf[a]]=pair(q0,q1);[buf[b],buf[d]]=pair(q2,q3);}
      if(nx&p){const i=start+px;[buf[i],buf[i+oy1]]=pair(buf[i],buf[i+oy1]);}}
    if(ny&p){for(let px=py;px<=py+ox*(nx-p2);px+=ox2){const i=start+px;[buf[i],buf[i+ox1]]=pair(buf[i],buf[i+ox1]);}}
    p2=p;p/=2;
  }
}
function piz(bytes,width,lines,channels){
  const c=new Cursor(bytes),min=c.u16(),max=c.u16(),bitmap=new Uint8Array(8192);if(max>=8192)fail('bad PIZ bitmap');
  if(min<=max){const p=c.take(max-min+1);bitmap.set(bytes.subarray(p,c.p),min);}
  const lut=new Uint16Array(65536);let n=0;for(let i=0;i<65536;i++)if(i===0||(bitmap[i>>>3]&(1<<(i&7))))lut[n++]=i;
  const length=c.u32(),words=channels.reduce((s,ch)=>s+ch.pixelType,0)*width*lines;
  if(c.p+length>bytes.length)fail('bad PIZ stream length');const out=huffman(bytes,c.p,length,words);
  let start=0;const starts=[];for(const ch of channels){starts.push(start);for(let j=0;j<ch.pixelType;j++)wavelet(out,start+j,width,ch.pixelType,lines,width*ch.pixelType,n-1);start+=width*lines*ch.pixelType;}
  for(let i=0;i<out.length;i++){if(out[i]>=n)fail('invalid PIZ lookup index');out[i]=lut[out[i]];}
  const raw=new Uint8Array(words*2);let pos=0;for(let y=0;y<lines;y++)for(let ci=0;ci<channels.length;ci++){const k=width*channels[ci].pixelType,offset=starts[ci]+y*k;raw.set(new Uint8Array(out.buffer,offset*2,k*2),pos);pos+=k*2;}
  return raw;
}
async function inflate(bytes,expected){
  if(typeof DecompressionStream==='undefined')fail('ZIP needs DecompressionStream support');
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(),out=new Uint8Array(expected);let pos=0;
  while(true){const {value,done}=await reader.read();if(done)break;if(pos+value.length>expected){await reader.cancel();fail('ZIP output exceeds declared size');}out.set(value,pos);pos+=value.length;}
  if(pos!==expected)fail('wrong ZIP output size');return out;
}
function undoPredictor(raw){for(let i=1;i<raw.length;i++)raw[i]=(raw[i-1]+raw[i]-128)&255;const out=new Uint8Array(raw.length);let a=0,b=Math.ceil(raw.length/2);for(let i=0;i<out.length;i++)out[i]=raw[(i&1)?b++:a++];return out;}
export async function decodeEXR(buffer,progress=()=>{}){
  const header=exrHeader(buffer),bytes=new Uint8Array(buffer),view=new DataView(buffer),{width:w,height:h,channels}=header;
  const perLine=channels.reduce((s,ch)=>s+ch.pixelType*2,0)*w,linesPer=[1,1,1,16,32][header.compression],blocks=Math.ceil(h/linesPer),rgb=new Float32Array(w*h*3),seen=new Uint8Array(h);
  if(header.offsetTable+blocks*8>bytes.length)fail('truncated chunk offsets');
  for(let bi=0;bi<blocks;bi++){const off64=view.getBigUint64(header.offsetTable+bi*8,true);if(off64>BigInt(bytes.length-8))fail('bad chunk offset');const off=Number(off64),y=view.getInt32(off,true),n=view.getUint32(off+4,true),lines=Math.min(linesPer,h-y);
    if(y<0||y>=h||y%linesPer||off+8+n>bytes.length)fail('invalid scanline chunk');const expected=lines*perLine;let raw=bytes.subarray(off+8,off+8+n);
    if(n<expected){if(header.compression===4)raw=piz(raw,w,lines,channels);else if(header.compression===2||header.compression===3)raw=undoPredictor(await inflate(raw,expected));else if(header.compression===1){const out=new Uint8Array(expected);let i=0,k=0;while(i<raw.length){const len=(raw[i++]<<24)>>24;if(len<0){const num=-len;if(i+num>raw.length||k+num>expected)fail('bad RLE literal');out.set(raw.subarray(i,i+num),k);i+=num;k+=num;}else{if(i>=raw.length||k+len+1>expected)fail('bad RLE run');out.fill(raw[i++],k,k+len+1);k+=len+1;}}if(k!==expected)fail('wrong RLE output');raw=undoPredictor(out);}else fail('compressed RAW chunk');}
    if(raw.length!==expected)fail('wrong chunk length');const d=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);let p=0;
    for(let row=0;row<lines;row++){if(seen[y+row])fail('duplicate scanline');seen[y+row]=1;for(const ch of channels){const ci='RGB'.indexOf(ch.name);for(let x=0;x<w;x++){const v=ch.pixelType===1?halfFloat(d.getUint16(p,true)):d.getFloat32(p,true);p+=ch.pixelType*2;if(!Number.isFinite(v))fail('nonfinite pixel');if(ch.name==='A'){if(v!==1)fail('nonopaque alpha requires explicit interpretation');}else if(ch.name==='Y'){const at=((y+row)*w+x)*3;rgb[at]=rgb[at+1]=rgb[at+2]=v;}else rgb[((y+row)*w+x)*3+ci]=v;}}}
    if(bi%8===0)progress((bi+1)/blocks);
  }
  if(seen.some(x=>x!==1))fail('missing scanlines');return {rgb,width:w,height:h,header,format:'exr'};
}
