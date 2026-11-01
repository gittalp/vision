/* Explicit allocation estimates are safeguards, not measurements of free RAM. */
export function memoryPlan(meta,count=1,maxWidth=2048,budgetMiB=1024,largestFileBytes=0){
 if(!Number.isFinite(maxWidth)||maxWidth<0||!Number.isInteger(maxWidth))throw Error('Working width must be a positive whole number, or zero for native');
 if(!Number.isInteger(count)||count<1)throw Error('No input files');
 if(!Number.isFinite(budgetMiB)||budgetMiB<64||budgetMiB>8192)throw Error('Choose a working-memory budget between 64 and 8192 MiB');
 const w=meta.encodedWidth||meta.width,h=meta.encodedHeight||meta.height;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<=0||h<=0)throw Error('Cannot determine source dimensions for the memory preflight');
 const factor=maxWidth===0?1:Math.min(1,maxWidth/w),width=Math.max(1,Math.round(w*factor)),height=Math.max(1,Math.round(h*factor)),pixels=width*height;
 const bytes=Math.ceil((w*h*16 + pixels*96 + largestFileBytes*2 + count*(512*131+4096) + 64*1024*1024)*1.2);
 return {width,height,inputCount:count,estimatedMiB:bytes/1048576,budgetMiB,fits:bytes<=budgetMiB*1048576,algorithm:'sequential two-pass JPEG decoding; small response samples, then streaming log-radiance accumulation',caveat:'Allocation estimate with 20% margin. Browser/decoder overhead and free memory are not measured. Reduce working width if a device fails.'};
}
