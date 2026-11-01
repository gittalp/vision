/* Low-vision condition previews. These are illustrative effects, not diagnosis,
 * clinical disease stages, retinal-field measurements, or the DeVAS model.
 * Every input is copied; scientific source luminance is never mutated.
 */
import {pixelToRay} from './geometry.js';
import {CVD_MACHADO_2009} from './cvd.js';
import {makePeripheralLoss,makeCentralLoss,fieldLossParameters} from './fieldloss.js';
export const CONDITION_NAMES={none:'Unaltered color view',cataract:'Cataract-like haze / yellowing',glaucoma:'Peripheral field loss',amd:'Central field loss (AMD-like)',diabetic:'Diabetic retinopathy simulation',color:'Color-vision deficiency',custom:'Custom blur / contrast / saturation'};
export function cvdMatrix(type,severity=1){const key=type.startsWith('protan')?'protan':type.startsWith('deutan')||type.startsWith('deuter')?'deutan':type.startsWith('tritan')?'tritan':null;if(!key)throw Error('Unknown color-vision type');const table=CVD_MACHADO_2009[key],q=Math.max(0,Math.min(1,severity))*10,i=Math.floor(q),j=Math.min(10,i+1),f=q-i;return table[i].flat().map((v,k)=>v*(1-f)+table[j].flat()[k]*f);}
function smooth(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
function random(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function ray(x,y,w,h,hfov){const focal=w/(2*Math.tan(hfov*Math.PI/360)),xx=(x+.5-w/2)/focal,yy=(y+.5-h/2)/focal,n=Math.hypot(xx,yy,1);return[xx/n,yy/n,1/n];}
function angular(a,b){return Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])))*180/Math.PI;}
export function gaussianRGB(rgb,w,h,sigma){if(!(sigma>0))return Float32Array.from(rgb);if(!Number.isFinite(sigma)||sigma>100)throw Error('Low-vision blur sigma is outside the supported range');const radius=Math.ceil(3*sigma),kernel=Array.from({length:2*radius+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2)),sum=kernel.reduce((a,b)=>a+b,0);for(let i=0;i<kernel.length;i++)kernel[i]/=sum;const tmp=new Float32Array(rgb.length),out=new Float32Array(rgb.length);const reflect=(x,n)=>{while(x<0||x>=n)x=x<0?-x-1:2*n-1-x;return x;};for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let v=0;for(let k=-radius;k<=radius;k++)v+=kernel[k+radius]*rgb[(y*w+reflect(x+k,w))*3+c];tmp[(y*w+x)*3+c]=v;}for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let v=0;for(let k=-radius;k<=radius;k++)v+=kernel[k+radius]*tmp[(reflect(y+k,h)*w+x)*3+c];out[(y*w+x)*3+c]=v;}return out;}
export function conditionPreview(rgb,w,h,parameters={},domain={}){
 const p={condition:'none',severity:.5,hfov:40,diameter:15,blurDegrees:.1,haze:.15,contrast:1,saturation:1,yellow:.15,seed:2026,cvd:'deuteranopia',focusX:.5,focusY:.5,...fieldLossParameters(parameters),...parameters};
 if(!CONDITION_NAMES[p.condition])throw Error('Unknown low-vision condition');for(const key of ['severity','haze','contrast','saturation','yellow','focusX','focusY'])if(!Number.isFinite(p[key])||p[key]<0||p[key]>1)throw Error(key+' must be between zero and one');if((!domain.rays&&!(p.hfov>0&&p.hfov<=60))||!(p.diameter>0&&p.diameter<=120)||!(p.blurDegrees>=0&&p.blurDegrees<=2)||!Number.isInteger(p.seed))throw Error('Invalid condition angular parameters or seed');
 const before=Float32Array.from(rgb),focal=domain.rays?null:w/(2*Math.tan(p.hfov*Math.PI/360)),ppd=domain.rays?null:focal*Math.PI/180;let after=Float32Array.from(domain.blurred||rgb);const blend=p.condition==='none'?0:p.severity;
 if(!domain.rays&&(p.condition==='cataract'||p.condition==='custom'))after=gaussianRGB(after,w,h,p.blurDegrees*ppd*blend);
 let average=0,totalWeight=0;for(let i=0;i<before.length;i+=3){if(domain.valid&&!domain.valid[i/3])continue;const wt=domain.omega?domain.omega[i/3]:1;average+=(.2126*before[i]+.7152*before[i+1]+.0722*before[i+2])*wt;totalWeight+=wt;}average/=Math.max(1e-30,totalWeight);
 const rayAt=(x,y)=>{if(!domain.rays)return ray(x,y,w,h,p.hfov);const at=Math.max(0,Math.min(h-1,Math.round(y)))*w+Math.max(0,Math.min(w-1,Math.round(x)));if(!domain.valid[at])return null;if(domain.geometry&&(!Number.isInteger(x)||!Number.isInteger(y)))return pixelToRay(domain.geometry,w,h,x,y);return Array.from(domain.rays.subarray(at*3,at*3+3));};
 const center=rayAt(p.focusX*w-.5,p.focusY*h-.5);if(!center)throw Error('Fixation is outside the captured circular field. Choose a point inside the circle.');const peripheral=makePeripheralLoss(center,p),central=makeCentralLoss(center,p);const rng=random(p.seed),spots=Array.from({length:12},()=>{let r=null;for(let tries=0;tries<1000&&!r;tries++)r=rayAt(rng()*w-.5,rng()*h-.5);if(!r)throw Error('No valid field-loss spot location');return {ray:r,radius:(.35+.65*rng())*p.diameter/2};});
 let matrix=null;if(p.condition==='color'&&p.cvd!=='achromatopsia')matrix=cvdMatrix(p.cvd,blend);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=3*(y*w+x);if(domain.valid&&!domain.valid[y*w+x])continue;let c=[after[at],after[at+1],after[at+2]],Y=.2126*c[0]+.7152*c[1]+.0722*c[2];
  if(p.condition==='color'){if(p.cvd==='achromatopsia')c=c.map(v=>v*(1-blend)+Y*blend);else c=[0,1,2].map(i=>matrix[i*3]*c[0]+matrix[i*3+1]*c[1]+matrix[i*3+2]*c[2]);}
  else if(p.condition!=='none'){
   const saturation=1-(1-p.saturation)*blend,contrast=1-(1-p.contrast)*blend;c=c.map(v=>(Y+(v-Y)*saturation)*contrast+average*(1-contrast));
   if(p.condition==='cataract'){const haze=p.haze*blend;c=c.map(v=>v*(1-haze)+average*haze);c[2]*=1-p.yellow*blend;}
   let loss=0;const r=rayAt(x,y);if(p.condition==='glaucoma')loss=peripheral(r);
   if(p.condition==='amd')loss=central(r);
   if(p.condition==='diabetic'){for(const spot of spots)loss=Math.max(loss,1-smooth(spot.radius*.7,spot.radius,angular(r,spot.ray)));}
   c=c.map(v=>v*(1-loss*blend));
  }
  for(let k=0;k<3;k++)after[at+k]=Math.max(0,c[k]);
 }
 return {before,after,details:{...p,domain:domain.rays?'full circular fisheye':'perspective detail',name:CONDITION_NAMES[p.condition],seed:p.condition==='diabetic'?p.seed:null,centralPixelsPerDegree:ppd,blurInterpretation:domain.rays?'Local tangent-patch angular Gaussian; not a clinical acuity conversion':'Gaussian sigma in degrees at viewport center; illustrative only, not a clinical acuity conversion',fieldMaskInterpretation:'Projection-aware unit rays; peripheral Guth angular-envelope contraction or circular comparison; irregular directional central scotoma. Percent controls are shape/opacity settings, not clinical stage. Stationary, not gaze tracked.',scope:'Low-vision image effects. Not patient-specific appearance or quantitative disease severity. Source measurements are unchanged.',cvd:p.condition==='color'?'Machado 2009 matrix interpolation in linear sRGB; display gamut clipping applied':null}};
}
