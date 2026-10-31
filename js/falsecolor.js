/* Presentation only: Y and calibration are never modified by this module. */
export const FALSE_PALETTES={
 photosphere:[[.35,0,.48],[.05,0,.85],[0,.55,1],[0,.72,.30],[.88,.12,.05],[1,1,0]],
 thermal:[[.02,.01,.10],[.22,.04,.36],[.57,.10,.35],[.91,.30,.14],[1,.70,.18],[1,1,.83]],
 grayscale:[[0,0,0],[1,1,1]],
 legacy:[[.03,.07,.25],[.08,.30,.55],[.07,.55,.54],[.55,.77,.32],[.98,.88,.28],[.97,.43,.22]]
};
export function falseRange(options={},summary={},scale=1){
 const log=options.log!==false,automaticMin=log?Math.max(summary.p05>0?summary.p05*scale:(summary.maximum||1)*scale*1e-4,1e-20):Math.max(0,(summary.minimum||0)*scale);
 const explicitMin=options.min!==null&&options.min!==undefined&&options.min!=='';
 const explicitMax=options.max!==null&&options.max!==undefined&&options.max!=='';
 const minimum=explicitMin?Number(options.min):automaticMin;
 const maximum=explicitMax?Number(options.max):Math.max((summary.p95||summary.maximum||1)*scale,minimum+(log?minimum*.001:1e-10));
 if(!Number.isFinite(minimum)||!Number.isFinite(maximum)||minimum<0||maximum<=minimum)throw Error('False-color range requires finite 0 <= minimum < maximum');
 if(log&&minimum<=0)throw Error('Logarithmic false color needs a minimum greater than zero. Choose Linear for a zero minimum.');
 const palette=options.palette||'photosphere',bands=Number(options.bands||0),divisions=Number(options.divisions||8);
 if(!FALSE_PALETTES[palette])throw Error('Unknown false-color palette');
 if(!Number.isInteger(bands)||bands<0||bands>32||bands===1)throw Error('Choose continuous color or 2 to 32 bands');
 if(!Number.isInteger(divisions)||divisions<2||divisions>16)throw Error('Legend divisions must be 2 to 16');
 return {minimum,maximum,log,palette,bands,divisions,clip:options.clip!==false,units:options.units||'relative Y'};
}
export function colorAt(t,palette='photosphere'){
 const points=FALSE_PALETTES[palette]||FALSE_PALETTES.photosphere,q=Math.max(0,Math.min(1,t))*(points.length-1),i=Math.floor(q),j=Math.min(i+1,points.length-1),a=q-i;
 return points[i].map((v,k)=>255*(v*(1-a)+points[j][k]*a));
}
export function falseValue(value,range){
 if(!Number.isFinite(value)||value<0)return [230,0,220];
 if(range.clip&&value<range.minimum)return [0,0,0];
 if(range.clip&&value>range.maximum)return [255,255,255];
 let t=range.log?(Math.log(Math.max(value,Number.MIN_VALUE))-Math.log(range.minimum))/(Math.log(range.maximum)-Math.log(range.minimum)):(value-range.minimum)/(range.maximum-range.minimum);
 t=Math.max(0,Math.min(1,t));if(range.bands)t=Math.min(range.bands-1,Math.floor(t*range.bands))/(range.bands-1);
 return colorAt(t,range.palette);
}
export function legendTicks(range){return Array.from({length:range.divisions+1},(_,i)=>{const fraction=i/range.divisions;return {fraction,value:range.log?Math.exp(Math.log(range.minimum)+fraction*(Math.log(range.maximum)-Math.log(range.minimum))):range.minimum+fraction*(range.maximum-range.minimum)};});}
