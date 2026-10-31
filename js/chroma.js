/* Color reconstruction: nonlinearly filtered luminance + linearly filtered CIE
 * chromaticity, following Thompson 2017 section 4B / DeVAS color weighting.
 * CSF is normalized to 1, low-frequency rolloff suppressed. This does not infer
 * individual color deficits. sRGB gamut handling is a documented adaptation.
 */
import {fft2,power2,clinical,sensitivity} from './math.js';
const XYZ=[.4124564,.3575761,.1804375,.2126729,.7151522,.0721750,.0193339,.1191920,.9503041];
const RGB=[3.2404542,-1.5371385,-.4985314,-.9692660,1.8760108,.0415560,.0556434,-.2040259,1.0572252];
const reflect=(i,n)=>{if(n<=1)return 0;const period=2*(n-1);i=((i%period)+period)%period;return i<n?i:period-i;};
export function chromaWeight(f,p){return f<=p.peakFrequency?1:sensitivity(f,p)/p.peakSensitivity;}
export function chromaComponents(rgb,w,h){const out=new Float32Array(w*h*3);for(let i=0;i<w*h;i++){const c=[rgb[3*i],rgb[3*i+1],rgb[3*i+2]],v=[0,1,2].map(k=>XYZ[k*3]*c[0]+XYZ[k*3+1]*c[1]+XYZ[k*3+2]*c[2]),s=v[0]+v[1]+v[2];out[3*i]=s>1e-12?v[0]/s:.3127;out[3*i+1]=s>1e-12?v[1]/s:.3290;out[3*i+2]=0;}return out;}
export function filterChroma(rgb,w,h,{hfov=60,logmar=1,pr=1,pad=true}={}){
 if(rgb.length!==w*h*3||!(hfov>0&&hfov<180)||rgb.some(v=>!Number.isFinite(v)))throw Error('Invalid color-filter input');
 const W=pad?power2(w+2*Math.ceil(Math.max(w,h)*.125)):w,H=pad?power2(h+2*Math.ceil(Math.max(w,h)*.125)):h;if(W*H>2097152)throw Error('Chroma workspace too large');
 const px=Math.floor((W-w)/2),py=Math.floor((H-h)/2),p=clinical(logmar,pr),xy=chromaComponents(rgb,w,h),out=new Float32Array(rgb.length),weights=new Float64Array(W*H),ppd=w/hfov;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const f=Math.hypot(Math.min(x,W-x)/W,Math.min(y,H-y)/H)*ppd;weights[y*W+x]=chromaWeight(f,p);}
 for(let c=0;c<2;c++){const re=new Float64Array(W*H),im=new Float64Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++)re[y*W+x]=xy[(reflect(y-py,h)*w+reflect(x-px,w))*3+c];fft2(re,im,W,H);for(let i=0;i<re.length;i++){re[i]*=weights[i];im[i]*=weights[i];}fft2(re,im,W,H,true);for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[(y*w+x)*3+c]=re[(y+py)*W+x+px];}
 return out;
}
export function reconstructColor(xy,Y){if(xy.length!==Y.length*3)throw Error('Chroma/luminance shape mismatch');const out=new Float32Array(xy.length);
 for(let i=0;i<Y.length;i++){const L=Math.max(0,Y[i]);let x=Math.max(1e-6,Math.min(.999999,xy[3*i])),y=Math.max(1e-6,Math.min(.999999,xy[3*i+1]));if(x+y>.999999){const s=.999999/(x+y);x*=s;y*=s;}
  const X=x/y*L,Z=Math.max(0,1-x-y)/y*L,c=[0,1,2].map(k=>Math.max(0,RGB[k*3]*X+RGB[k*3+1]*L+RGB[k*3+2]*Z));
  const actual=XYZ[3]*c[0]+XYZ[4]*c[1]+XYZ[5]*c[2],factor=actual>1e-20?L/actual:0;for(let k=0;k<3;k++)out[i*3+k]=c[k]*factor;
 }return out;
}
export function logmarFromSnellen(denominator,numerator=20){if(!Number.isFinite(denominator)||!Number.isFinite(numerator)||denominator<=0||numerator<=0)throw Error('Snellen values must be positive');return Math.log10(denominator/numerator);}
export function snellenFromLogmar(logmar,numerator=20){if(!Number.isFinite(logmar)||!Number.isFinite(numerator)||numerator<=0)throw Error('Invalid acuity');return numerator*10**logmar;}
