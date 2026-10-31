/* Educational condition previews. These are illustrative effects, not diagnosis,
 * clinical disease stages, retinal-field measurements, or the DeVAS model.
 * Every input is copied; scientific source luminance is never mutated.
 */
import {CVD_MACHADO_2009} from './cvd.js';
export const CONDITION_NAMES={none:'Unaltered color view',cataract:'Cataract-like haze / yellowing',glaucoma:'Peripheral field restriction',amd:'Central field-loss illustration',diabetic:'Scattered field-loss illustration',color:'Color-vision deficiency',custom:'Custom blur / contrast / saturation'};
export function cvdMatrix(type,severity=1){const key=type.startsWith('protan')?'protan':type.startsWith('deutan')||type.startsWith('deuter')?'deutan':type.startsWith('tritan')?'tritan':null;if(!key)throw Error('Unknown color-vision type');const table=CVD_MACHADO_2009[key],q=Math.max(0,Math.min(1,severity))*10,i=Math.floor(q),j=Math.min(10,i+1),f=q-i;return table[i].flat().map((v,k)=>v*(1-f)+table[j].flat()[k]*f);}
function smooth(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
function random(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function ray(x,y,w,h,hfov){const focal=w/(2*Math.tan(hfov*Math.PI/360)),xx=(x+.5-w/2)/focal,yy=(h/2-y-.5)/focal,n=Math.hypot(xx,yy,1);return[xx/n,yy/n,1/n];}
function angular(a,b){return Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])))*180/Math.PI;}
export function gaussianRGB(rgb,w,h,sigma){if(!(sigma>0))return Float32Array.from(rgb);if(!Number.isFinite(sigma)||sigma>100)throw Error('Educational blur sigma is outside the supported range');const radius=Math.ceil(3*sigma),kernel=Array.from({length:2*radius+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2)),sum=kernel.reduce((a,b)=>a+b,0);for(let i=0;i<kernel.length;i++)kernel[i]/=sum;const tmp=new Float32Array(rgb.length),out=new Float32Array(rgb.length);const reflect=(x,n)=>{while(x<0||x>=n)x=x<0?-x-1:2*n-1-x;return x;};for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let v=0;for(let k=-radius;k<=radius;k++)v+=kernel[k+radius]*rgb[(y*w+reflect(x+k,w))*3+c];tmp[(y*w+x)*3+c]=v;}for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let v=0;for(let k=-radius;k<=radius;k++)v+=kernel[k+radius]*tmp[(reflect(y+k,h)*w+x)*3+c];out[(y*w+x)*3+c]=v;}return out;}
export function conditionPreview(rgb,w,h,parameters={}){
 const p={condition:'none',severity:.5,hfov:40,diameter:15,blurDegrees:.1,haze:.15,contrast:1,saturation:1,yellow:.15,seed:2026,cvd:'deuteranopia',focusX:.5,focusY:.5,...parameters};
 if(!CONDITION_NAMES[p.condition])throw Error('Unknown educational condition');for(const key of ['severity','haze','contrast','saturation','yellow','focusX','focusY'])if(!Number.isFinite(p[key])||p[key]<0||p[key]>1)throw Error(key+' must be between zero and one');if(!(p.hfov>0&&p.hfov<=60)||!(p.diameter>0&&p.diameter<=120)||!(p.blurDegrees>=0&&p.blurDegrees<=2)||!Number.isInteger(p.seed))throw Error('Invalid educational angular parameters or seed');
 const before=Float32Array.from(rgb),focal=w/(2*Math.tan(p.hfov*Math.PI/360)),ppd=focal*Math.PI/180;let after=Float32Array.from(rgb);const blend=p.condition==='none'?0:p.severity;
 if(p.condition==='cataract'||p.condition==='custom')after=gaussianRGB(after,w,h,p.blurDegrees*ppd*blend);
 let average=0;for(let i=0;i<before.length;i+=3)average+=.2126*before[i]+.7152*before[i+1]+.0722*before[i+2];average/=w*h;
 const center=ray(p.focusX*w-.5,p.focusY*h-.5,w,h,p.hfov),rng=random(p.seed),spots=Array.from({length:12},()=>({ray:ray(rng()*w-.5,rng()*h-.5,w,h,p.hfov),radius:(.35+.65*rng())*p.diameter/2}));
 let matrix=null;if(p.condition==='color'&&p.cvd!=='achromatopsia')matrix=cvdMatrix(p.cvd,blend);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=3*(y*w+x);let c=[after[at],after[at+1],after[at+2]],Y=.2126*c[0]+.7152*c[1]+.0722*c[2];
  if(p.condition==='color'){if(p.cvd==='achromatopsia')c=c.map(v=>v*(1-blend)+Y*blend);else c=[0,1,2].map(i=>matrix[i*3]*c[0]+matrix[i*3+1]*c[1]+matrix[i*3+2]*c[2]);}
  else if(p.condition!=='none'){
   const saturation=1-(1-p.saturation)*blend,contrast=1-(1-p.contrast)*blend;c=c.map(v=>(Y+(v-Y)*saturation)*contrast+average*(1-contrast));
   if(p.condition==='cataract'){const haze=p.haze*blend;c=c.map(v=>v*(1-haze)+average*haze);c[2]*=1-p.yellow*blend;}
   let loss=0;const r=ray(x,y,w,h,p.hfov);if(p.condition==='glaucoma')loss=smooth(p.diameter*.45,p.diameter*.55,angular(r,center));
   if(p.condition==='amd')loss=1-smooth(p.diameter*.40,p.diameter*.55,angular(r,center));
   if(p.condition==='diabetic'){for(const spot of spots)loss=Math.max(loss,1-smooth(spot.radius*.7,spot.radius,angular(r,spot.ray)));}
   c=c.map(v=>v*(1-loss*blend));
  }
  for(let k=0;k<3;k++)after[at+k]=Math.max(0,c[k]);
 }
 return {before,after,details:{...p,name:CONDITION_NAMES[p.condition],seed:p.condition==='diabetic'?p.seed:null,centralPixelsPerDegree:ppd,blurInterpretation:'Gaussian sigma in degrees at viewport center; illustrative only, not a clinical acuity conversion',fieldMaskInterpretation:'Angular separation of viewing rays; stationary observer-centered mask, not gaze tracking or cortical filling-in',scope:'Educational image effects. Not patient-specific appearance or quantitative disease severity. Source measurements are unchanged.',cvd:p.condition==='color'?'Machado 2009 matrix interpolation in linear sRGB; display gamut clipping applied':null}};
}
