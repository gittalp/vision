import {validateGeometry,rayToPixel} from './geometry.js';
/* Numerical engine. DeVAS-derived luminance thresholding is an explicit
 * adaptation, not the unmodified C executable or an individualized diagnosis.
 * Attribution and source references: ../METHODS.html and ../licenses/.
 */
export const NORMAL_CUTOFF=.914*10**(Math.sqrt(Math.log10(199))/1.28);
export function clinical(logmar,pr){if(!Number.isFinite(logmar)||logmar<0||logmar>2||!Number.isFinite(pr)||pr<0||pr>2)throw Error('Supported logMAR and Pelli-Robson ranges: 0 to 2');const peakSensitivity=2*10**pr-1,cutoff=NORMAL_CUTOFF*10**(-logmar),peakFrequency=cutoff/10**(Math.sqrt(Math.log10(peakSensitivity))/1.28);return {peakSensitivity,cutoff,peakFrequency};}
export function sensitivity(f,p){if(!(f>0))return 0;const k=f<p.peakFrequency?.68:1.28;return 10**(Math.log10(p.peakSensitivity)-k*k*Math.log10(f/p.peakFrequency)**2);}
export function pairContrast(a,b){if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0)return {weber:null,michelson:null,ratio:null};return {weber:b>0?(a-b)/b:null,michelson:a+b>0?Math.abs(a-b)/(a+b):null,ratio:Math.min(a,b)>0?Math.max(a,b)/Math.min(a,b):null};}
export function inCircle(x,y,w,h,mask){if(!mask?.enabled)return true;const cx=mask.cx*w,cy=mask.cy*h,r=mask.radius*Math.min(w,h);return ((x+.5-cx)**2+(y+.5-cy)**2)<=r*r;}
export function stats(Y,w,h,roi=null,mask=null,valid=null,scale=1){const b=roi||{x:0,y:0,w,h},x0=Math.max(0,Math.floor(b.x)),x1=Math.min(w,Math.ceil(b.x+b.w)),y0=Math.max(0,Math.floor(b.y)),y1=Math.min(h,Math.ceil(b.y+b.h));const values=new Float32Array(Math.max(0,(x1-x0)*(y1-y0)));let n=0,sum=0,mean=0,m2=0,negative=0,zero=0,excluded=0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=y*w+x;if(!inCircle(x,y,w,h,mask)||(valid&&!valid[i])){excluded++;continue;}const v=Y[i]*scale;if(!Number.isFinite(v)){excluded++;continue;}values[n++]=v;sum+=v;const d=v-mean;mean+=d/n;m2+=d*(v-mean);if(v<0)negative++;if(v===0)zero++;}
 if(!n)return {count:0,excluded,mean:null,roi:b};const v=values.subarray(0,n);v.sort();const q=p=>{const j=(n-1)*p,a=Math.floor(j);return v[a]+(j-a)*(v[Math.min(a+1,n-1)]-v[a]);};return {count:n,excluded,mean:sum/n,minimum:v[0],maximum:v[n-1],median:q(.5),p05:q(.05),p95:q(.95),sd:Math.sqrt(m2/n),negativeFraction:negative/n,zeroFraction:zero/n,roi:b,weighting:'equal image pixels, not equal solid angles',quantiles:'linear interpolation on float32 samples'};}
export function power2(n){let x=1;while(x<n)x*=2;return x;}
const plans=new Map();
function plan(n){if(plans.has(n))return plans.get(n);const rev=new Uint32Array(n),bits=Math.log2(n);for(let i=0;i<n;i++){let a=i,b=0;for(let k=0;k<bits;k++){b=(b<<1)|(a&1);a>>>=1;}rev[i]=b;}const cos=new Float64Array(n/2),sin=new Float64Array(n/2);for(let i=0;i<n/2;i++){cos[i]=Math.cos(2*Math.PI*i/n);sin[i]=Math.sin(2*Math.PI*i/n);}const p={rev,cos,sin};plans.set(n,p);return p;}
function fft1(re,im,n,inverse){const {rev,cos,sin}=plan(n);for(let i=0;i<n;i++){const j=rev[i];if(j>i){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let len=2;len<=n;len*=2){const half=len/2,step=n/len;for(let k=0;k<n;k+=len)for(let j=0;j<half;j++){const c=cos[j*step],s=sin[j*step]*(inverse?1:-1),u=k+j,v=u+half,tr=re[v]*c-im[v]*s,ti=re[v]*s+im[v]*c;re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;}}
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}}
export function fft2(re,im,w,h,inverse=false){if(power2(w)!==w||power2(h)!==h)throw Error('FFT dimensions must be powers of two');for(let y=0;y<h;y++)fft1(re.subarray(y*w,(y+1)*w),im.subarray(y*w,(y+1)*w),w,inverse);const r=new Float64Array(h),v=new Float64Array(h);for(let x=0;x<w;x++){for(let y=0;y<h;y++){r[y]=re[y*w+x];v[y]=im[y*w+x];}fft1(r,v,h,inverse);for(let y=0;y<h;y++){re[y*w+x]=r[y];im[y*w+x]=v[y];}}}
// Exact squared Euclidean distance transform on the image lattice.
function edt1(f,n,out,v,z){let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;for(let q=1;q<n;q++){let s;while(true){s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*(q-v[k]));if(s>z[k]||k===0)break;k--;}k++;v[k]=q;z[k]=s;z[k+1]=Infinity;}k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;out[q]=(q-v[k])**2+f[v[k]];}}
export function distanceSquared(mask,w,h){if(!mask.some(x=>x)){const r=new Float64Array(w*h);r.fill(Infinity);return r;}const m=Math.max(w,h),f=new Float64Array(m),out=new Float64Array(m),v=new Int32Array(m),z=new Float64Array(m+1),a=new Float64Array(w*h),big=4*(w*w+h*h);for(let y=0;y<h;y++){for(let x=0;x<w;x++)f[x]=mask[y*w+x]?0:big;edt1(f,w,out,v,z);a.set(out.subarray(0,w),y*w);}for(let x=0;x<w;x++){for(let y=0;y<h;y++)f[y]=a[y*w+x];edt1(f,h,out,v,z);for(let y=0;y<h;y++)a[y*w+x]=out[y];}return a;}
function reflect(i,n){if(n<=1)return 0;const period=2*(n-1);i=((i%period)+period)%period;return i<n?i:period-i;}
export function devas(Y,w,h,{hfov=60,logmar=1,pr=1,smoothing=true,absolute=false,pad=true}={},progress=()=>{}){
 if(!(hfov>0&&hfov<180)||Y.length!==w*h||Y.some(v=>!Number.isFinite(v)))throw Error('Invalid DeVAS input');const clinicalParams=clinical(logmar,pr),W=pad?power2(w+2*Math.ceil(Math.max(w,h)*.125)):w,H=pad?power2(h+2*Math.ceil(Math.max(w,h)*.125)):h;
 if(W*H>2097152)throw Error('Simulation workspace too large');if(power2(W)!==W||power2(H)!==H)throw Error('Unpadded reference mode needs power-of-two dimensions');const px=Math.floor((W-w)/2),py=Math.floor((H-h)/2),re=new Float64Array(W*H),im=new Float64Array(W*H);let mean=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=Math.max(0,Y[reflect(y-py,h)*w+reflect(x-px,w)]);re[y*W+x]=v;mean+=v;}mean/=W*H;
 const epsilon=absolute?.01:Math.max(Number.MIN_VALUE,mean*1e-6),M=Math.max(W,H),longFov=hfov*M/w,logr=new Float64Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++)logr[y*W+x]=Math.log2(Math.hypot(Math.min(x,W-x)*M/W,Math.min(y,H-y)*M/H));
 fft2(re,im,W,H);const local=new Float64Array(W*H),filtered=new Float64Array(W*H),br=new Float64Array(W*H),bi=new Float64Array(W*H);local.fill(mean);filtered.fill(mean);const bands=Math.ceil(Math.log2(M));let used=0;
 for(let band=0;band<bands;band++){const peak=2**band,f=peak/longFov,S=sensitivity(f,clinicalParams);if(f>clinicalParams.peakFrequency&&S<1)break;
  for(let i=0;i<br.length;i++){const d=logr[i]-band,weight=Math.abs(d)<1?.5*(1+Math.cos(Math.PI*d)):0;br[i]=re[i]*weight;bi[i]=im[i]*weight;}fft2(br,bi,W,H,true);
  if(S>=1){const pos=new Uint8Array(W*H),neg=new Uint8Array(W*H),threshold=1/S;for(let i=0;i<pos.length;i++){const c=br[i]/Math.max(local[i],epsilon);pos[i]=c>=threshold;neg[i]=c<=-threshold;}
   const radius=.35*M/peak;if(!smoothing||radius<1){for(let i=0;i<br.length;i++)if(pos[i]||neg[i])filtered[i]+=br[i];}
   else{const dp=distanceSquared(pos,W,H),dn=distanceSquared(neg,W,H),half=.5*radius;for(let i=0;i<br.length;i++){const d=Math.sqrt(br[i]>0?dp[i]:dn[i]);if(d<=radius)filtered[i]+=br[i]*(d<=half?1:Math.max(0,(radius-d)/(radius-half)));}}
  }
  for(let i=0;i<local.length;i++)local[i]+=br[i];used++;progress((band+1)/bands);
 }
 const out=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[y*w+x]=Math.max(0,filtered[(y+py)*W+x+px]);
 return {Y:out,width:w,height:h,details:{...clinicalParams,bands:used,boundary:pad?'reflected to power-of-two workspace':'periodic reference test',workspace:[W,H],marginPixels:[px,py],localFloor:epsilon,localFloorRule:absolute?'0.01 cd/m2':'1e-6 times padded-image mean; relative scale-invariant adaptation',angularSampling:'global width / HFOV, not spatially varying retinal filtering',model:'DeVAS-derived luminance-only adaptation',smoothing}};
}
function cholesky(A,b,n){const L=new Float64Array(n*n);for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let s=A[i*n+j];for(let k=0;k<j;k++)s-=L[i*n+k]*L[j*n+k];if(i===j){if(s<=0||!Number.isFinite(s))throw Error('Response fit is ill-conditioned; use a reusable profile or a better bracket');L[i*n+j]=Math.sqrt(s);}else L[i*n+j]=s/L[j*n+j];}const y=new Float64Array(n),x=new Float64Array(n);for(let i=0;i<n;i++){let s=b[i];for(let k=0;k<i;k++)s-=L[i*n+k]*y[k];y[i]=s/L[i*n+i];}for(let i=n-1;i>=0;i--){let s=y[i];for(let k=i+1;k<n;k++)s-=L[k*n+i]*x[k];x[i]=s/L[i*n+i];}return Array.from(x);}
const weight=z=>z<=4||z>=251?0:Math.min(z,255-z)/127;
export function estimateResponse(images,times,w,h,{samples=512,lambda=20,preSampled=false}={}){if(images.length<3||times.length!==images.length||times.some(t=>!Number.isFinite(t)||t<=0))throw Error('At least three positive-exposure bracket images required');const logt=times.map(Math.log),curves=[],diagnostics=[];
 for(let ch=0;ch<3;ch++){const A=new Float64Array(256*256),b=new Float64Array(256),seen=new Set();let used=0;const records=[];
  for(let k=0;k<samples;k++){// deterministic low-discrepancy spatial sample
   const x=Math.min(w-1,Math.floor(((k*.6180339887498949)%1)*w)),y=Math.min(h-1,Math.floor(((k*.4142135623730951+.217)%1)*h)),at=(preSampled?k:y*w+x)*3+ch,obs=[];let sum=0,tmean=0;
   for(let j=0;j<images.length;j++){const z=images[j][at],ww=weight(z)**2;if(ww>0){obs.push([z,ww,logt[j]]);sum+=ww;tmean+=ww*logt[j];seen.add(z);}}
   if(obs.length<2)continue;tmean/=sum;used++;records.push(obs);
   const byCode=new Map();for(const [z,ww,t] of obs){A[z*256+z]+=ww;b[z]+=ww*(t-tmean);byCode.set(z,(byCode.get(z)||0)+ww);}for(const [z,ww] of byCode)for(const [zz,vv] of byCode)A[z*256+zz]-=ww*vv/sum;
  }
  if(used<30||seen.size<40)throw Error('Insufficient useful response samples; use a known response or a bracket with more gradations');
  for(let z=1;z<255;z++){const q=lambda*lambda*(Math.min(z,255-z)/127)**2,ids=[z-1,z,z+1],v=[1,-2,1];for(let i=0;i<3;i++)for(let j=0;j<3;j++)A[ids[i]*256+ids[j]]+=q*v[i]*v[j];}
  A[128*256+128]+=100;for(let z=0;z<256;z++)A[z*256+z]+=1e-9;const g=cholesky(A,b,256),anchor=g[128];for(let z=0;z<256;z++)g[z]-=anchor;
  let decreases=0,rss=0,n=0;for(let z=5;z<250;z++)if(g[z+1]<g[z]-.005)decreases++;for(const obs of records){const total=obs.reduce((s,o)=>s+o[1],0),e=obs.reduce((s,[z,v,t])=>s+v*(g[z]-t),0)/total;for(const [z,v,t] of obs){rss+=v*((g[z]-t-e)/Math.LN2)**2;n+=v;}}
  if(decreases>12)throw Error('Estimated response has substantial nonmonotonic sections; do not use this fit for measurement');curves.push(g);diagnostics.push({usefulSamples:used,coveredBins:seen.size,nonmonotonicIntervals:decreases,fitRMSStops:Math.sqrt(rss/n)});
 }
 return {schema:'visionsim-log-response-v1',method:'Debevec-Malik weighted least-squares with irradiance eliminated; deterministic spatial samples',logResponse:curves,anchor:'g(128)=0 independently per channel; color scale not independently calibrated',lambda,diagnostics};}
export function mergeBracket(images,times,w,h,response,progress=()=>{}){
 if(images.length<3||times.length!==images.length||times.some(t=>!Number.isFinite(t)||t<=0)||images.some(a=>a.length!==w*h*3))throw Error('Invalid bracket dimensions or exposure times');
 if(response?.schema!=='visionsim-log-response-v1'||!Array.isArray(response.logResponse)||response.logResponse.length!==3||response.logResponse.some(g=>g.length!==256||g.some(v=>!Number.isFinite(v))))throw Error('Invalid response JSON');
 const rgb=new Float32Array(w*h*3),valid=new Uint8Array(w*h),logt=times.map(Math.log);let invalid=0,disagreement=0;for(let i=0;i<w*h;i++){let ok=true,bad=false;
  for(let ch=0;ch<3;ch++){let sw=0,s=0,s2=0;for(let j=0;j<images.length;j++){const z=images[j][i*3+ch],v=weight(z);if(v){const e=response.logResponse[ch][z]-logt[j];sw+=v;s+=v*e;s2+=v*e*e;}}
   if(sw){rgb[i*3+ch]=Math.exp(s/sw);if(Math.sqrt(Math.max(0,s2/sw-(s/sw)**2))/Math.LN2>.5)bad=true;}else{ok=false;rgb[i*3+ch]=0;}}
  valid[i]=ok?1:0;if(!ok)invalid++;if(ok&&bad)disagreement++;if(i%65536===0)progress(i/(w*h));}
 return {rgb,valid,width:w,height:h,format:'bracket',header:{exposureSeconds:times,responseMethod:response.method},quality:{invalidFraction:invalid/(w*h),disagreementFraction:disagreement/(w*h),disagreementRule:'weighted log-radiance SD >0.5 stop in any channel; descriptive, not validated motion classification',alignment:'none; static tripod-aligned input required',clippingRule:'all three channels require at least one contributing code in [5,250]'}};
}
function bilinear(frame,x,y,mask){const {width:w,height:h,Y,valid}=frame;if(x<0||y<0||x>w-1||y>h-1)return null;const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,w-1),y1=Math.min(y0+1,h-1),fx=x-x0,fy=y-y0,ids=[y0*w+x0,y0*w+x1,y1*w+x0,y1*w+x1];for(const i of ids)if((valid&&!valid[i])||!inCircle(i%w,Math.floor(i/w),w,h,mask))return null;return (1-fy)*((1-fx)*Y[ids[0]]+fx*Y[ids[1]])+fy*((1-fx)*Y[ids[2]]+fx*Y[ids[3]]);}
export function viewport(frame,g,{width=512,height=384,hfov=45,yaw=0,pitch=0,supersample=2}={}){
 // Legacy diameter/circle parameters remain readable for the retained regression fixtures.
 let geometry;if(g.vfov)geometry=validateGeometry(g);else if(g.projection==='perspective'){geometry=validateGeometry({...g,vfov:2*Math.atan(Math.tan(g.hfov*Math.PI/360)*frame.height/frame.width)*180/Math.PI});}else{
  const r=(g.mask?.radius||.5)*Math.min(frame.width,frame.height),q=g.hfov*Math.PI/360;
  const inv=t=>g.projection==='equidistant'?2*t*180/Math.PI:4*Math.asin(t)*180/Math.PI;const k=g.projection==='equidistant'?q:Math.sin(q/2);
  geometry=validateGeometry({...g,hfov:inv(k*frame.width/(2*r)),vfov:inv(k*frame.height/(2*r)),shift:.5-(g.mask?.cx??.5),lift:(g.mask?.cy??.5)-.5});
 }
 if(![width,height].every(Number.isInteger)||width<8||height<8||width*height>512*512||![hfov,yaw,pitch].every(Number.isFinite)||hfov>60||hfov<5||Math.abs(pitch)>90||Math.abs(yaw)>180||![1,2,3,4].includes(supersample))throw Error('Invalid viewport parameters');
 const out=new Float32Array(width*height),f=width/(2*Math.tan(hfov*Math.PI/360)),cy=Math.cos(yaw*Math.PI/180),sy=Math.sin(yaw*Math.PI/180),cp=Math.cos(pitch*Math.PI/180),sp=Math.sin(pitch*Math.PI/180),mask=g.mask||{enabled:false};let invalid=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){let sum=0,ok=true;for(let yy=0;yy<supersample;yy++)for(let xx=0;xx<supersample;xx++){let u=(x+(xx+.5)/supersample-width/2)/f,v=(y+(yy+.5)/supersample-height/2)/f,z=1;const vv=cp*v-sp*z,zz=sp*v+cp*z;v=vv;z=zz;const uu=cy*u+sy*z;z=-sy*u+cy*z;u=uu;const pixel=rayToPixel(geometry,frame.width,frame.height,u,v,z);
  const val=pixel?bilinear(frame,pixel[0],pixel[1],mask):null;if(val===null){ok=false;continue;}sum+=Math.max(0,val);}
  if(!ok)invalid++;out[y*width+x]=sum/(supersample*supersample);}
 if(invalid)throw Error(`Viewport includes ${invalid} pixels outside valid support. Reduce its FOV or change yaw/pitch; missing scene values are not invented.`);
 return {Y:out,width,height,details:{hfov,yaw,pitch,sourceProjection:geometry.projection,sourceGeometry:geometry,supersample,sampling:`bilinear with ${supersample}x${supersample} subpixel integration; approximate antialiasing`,globalNyquistCPD:width/(2*hfov),centralNyquistCPD:f*Math.PI/360}};
}
