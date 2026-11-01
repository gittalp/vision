/* Minimal uncompressed ZIP writer for local job export. No network/dependency. */
export function zipStore(files){
 const enc=new TextEncoder(),chunks=[],directory=[];let offset=0;
 const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
 const crc=data=>{let c=0xffffffff;for(const v of data)c=table[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 for(const [name,input] of Object.entries(files)){
  if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Invalid job ZIP filename');const fn=enc.encode(name),data=typeof input==='string'?enc.encode(input):new Uint8Array(input),sum=crc(data),head=new Uint8Array(30+fn.length),d=new DataView(head.buffer);
  d.setUint32(0,0x04034b50,true);d.setUint16(4,20,true);d.setUint16(6,0x800,true);d.setUint16(12,0x21,true);d.setUint32(14,sum,true);d.setUint32(18,data.length,true);d.setUint32(22,data.length,true);d.setUint16(26,fn.length,true);head.set(fn,30);
  const central=new Uint8Array(46+fn.length),v=new DataView(central.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,0x21,true);v.setUint32(16,sum,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,fn.length,true);v.setUint32(42,offset,true);central.set(fn,46);chunks.push(head,data);directory.push(central);offset+=head.length+data.length;
 }
 const size=directory.reduce((s,a)=>s+a.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,directory.length,true);v.setUint16(10,directory.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);const out=new Uint8Array(offset+size+22);let at=0;for(const a of [...chunks,...directory,end]){out.set(a,at);at+=a.length;}return out;
}
