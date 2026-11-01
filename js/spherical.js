/* Full-field geometry and overlapping tangent-patch filtering.
 * Right/down/forward unit rays; angles in degrees at public interfaces.
 * Original measurement arrays and geometry are never modified.
 */
import {validateGeometry,pixelToRay,rayToPixel} from './geometry.js';
import {inCircle,devas,clinical} from './math.js';
import {gaussianRGB} from './conditions.js';
import {filterChroma} from './chroma.js';
const D=Math.PI/180;
export function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
export function unit3(a){const n=Math.hypot(...a);if(!(n>0))throw Error('Zero viewing direction');return a.map(v=>v/n);}
export function angle3(a,b){return Math.atan2(Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]),dot3(a,b))/D;}
export function viewBasis(yaw=0,pitch=0,roll=0){
 if(![yaw,pitch,roll].every(Number.isFinite)||Math.abs(yaw)>180||Math.abs(pitch)>90||Math.abs(roll)>180)throw Error('Invalid viewing direction');
 const a=yaw*D,b=pitch*D,c=roll*D,r=[Math.cos(a),0,-Math.sin(a)],down=[Math.sin(a)*Math.sin(b),Math.cos(b),Math.cos(a)*Math.sin(b)],f=[Math.sin(a)*Math.cos(b),-Math.sin(b),Math.cos(a)*Math.cos(b)];
 return {right:r.map((v,i)=>v*Math.cos(c)+down[i]*Math.sin(c)),down:down.map((v,i)=>v*Math.cos(c)-r[i]*Math.sin(c)),forward:f};
}
export function rotateRay(ray,basis){return [0,1,2].map(i=>basis.right[i]*ray[0]+basis.down[i]*ray[1]+basis.forward[i]*ray[2]);}
export function localRay(ray,basis){return [dot3(ray,basis.right),dot3(ray,basis.down),dot3(ray,basis.forward)];}
export function circleGeometry(frame,input,mask){
 const g=validateGeometry(input);if(!g.confirmed)throw Error('Confirm the source projection and FOV first');
 if(g.projection==='perspective')throw Error('Full-circle mode requires a circular fisheye projection. Use perspective detail for a rectilinear image.');
 if(!mask?.enabled)throw Error('Apply the valid image circle first (mask-only is sufficient).');
 const w=frame.width,h=frame.height,cx=mask.cx*w,cy=mask.cy*h,R=mask.radius*Math.min(w,h),axis=[w*(.5-g.shift),h*(.5+g.lift)];
 if(Math.hypot(cx-axis[0],cy-axis[1])>Math.max(1,R*.002))throw Error('The image circle and optical center disagree. Use geometry from the applied circle, then confirm.');
 if(cx-R<-.51||cy-R<-.51||cx+R>w+.51||cy+R>h+.51)throw Error('The circle extends outside the captured raster. Select the complete captured circle.');
 const rays=[[cx+R-.5,cy-.5],[cx-.5,cy+R-.5],[cx-R-.5,cy-.5],[cx-.5,cy-R-.5]].map(([x,y])=>pixelToRay(g,w,h,x,y));
 if(rays.some(v=>!v))throw Error('Image circle is outside the specified projection domain');
 const radii=rays.map(v=>angle3(v,[0,0,1]));if(Math.max(...radii)-Math.min(...radii)>.1)throw Error('Horizontal and vertical angular scales disagree. Reapply geometry from the circle.');
 const half=radii.reduce((a,b)=>a+b)/4;if(!(half>=10&&half<=90.00001))throw Error('Full-field processing supports complete circular fields from 20 to 180 degrees.');
 return {geometry:validateGeometry({...g,hfov:2*half,vfov:2*half,shift:0,lift:0,confirmed:true}),halfAngle:half,circle:{cx,cy,radius:R}};
}
// Bilinear sampling with support renormalization at the circle/raster boundary.
// Invalid interior samples are never treated as zero or silently interpolated away.
export function sampleRay(frame,g,mask,ray,channels=1,reflectHalfAngle=null){
 let r=ray;
 if(reflectHalfAngle!==null){const t=Math.atan2(Math.hypot(ray[0],ray[1]),ray[2]),limit=reflectHalfAngle*D;if(t>limit){let s=t;while(s>limit||s<-limit)s=s>limit?2*limit-s:-2*limit-s;const phi=Math.atan2(ray[1],ray[0]);r=[Math.sin(s)*Math.cos(phi),Math.sin(s)*Math.sin(phi),Math.cos(s)];}}
 const p=rayToPixel(g,frame.width,frame.height,...r);if(!p||p[0]<-.500001||p[1]<-.500001||p[0]>frame.width-.499999||p[1]>frame.height-.499999)return null;
 if(!inCircle(p[0],p[1],frame.width,frame.height,mask))return null;
 const x0=Math.floor(p[0]),y0=Math.floor(p[1]),fx=p[0]-x0,fy=p[1]-y0,sum=new Float64Array(channels);let weight=0;
 for(let j=0;j<2;j++)for(let i=0;i<2;i++){
  const x=x0+i,y=y0+j,wt=(i?fx:1-fx)*(j?fy:1-fy);if(wt<=1e-12||x<0||y<0||x>=frame.width||y>=frame.height||!inCircle(x,y,frame.width,frame.height,mask))continue;
  const at=y*frame.width+x;if(frame.valid&&!frame.valid[at])return null;weight+=wt;
  if(channels===1)sum[0]+=frame.Y[at]*wt;else for(let c=0;c<3;c++)sum[c]+=frame.rgb[3*at+c]*wt;
 }
 if(weight<=0)return null;for(let c=0;c<channels;c++)sum[c]/=weight;return sum;
}
export function angularPixelArea(g,n,x,y){
 // Jacobian dOmega/dA for centered, square circular radial projections.
 const R=n/2,T=g.hfov*D/2,r=Math.hypot(x+.5-R,y+.5-R);if(r>R)return 0;
 if(g.projection==='equisolid')return 4*Math.sin(T/2)**2/(R*R);
 if(g.projection==='equidistant'){const k=R/T,t=r/k;return (t<1e-9?1:Math.sin(t)/t)/(k*k);}
 if(g.projection==='stereographic'){const k=R/Math.tan(T/2);return 4/(k*k*(1+(r/k)**2)**2);}
 if(g.projection==='hemispherical'){const k=R/Math.sin(T),q=r/k;return 1/(k*k*Math.sqrt(Math.max(1e-12,1-q*q)));}
 throw Error('Unsupported circular solid-angle mapping');
}
export function circularView(frame,input,mask,size=800,supersample=2){
 if(!Number.isInteger(size)||size<64||size>1200||![1,2,3,4].includes(supersample))throw Error('Invalid full-field size or supersampling');
 const circle=circleGeometry(frame,input,mask),g=circle.geometry,n=size,Y=new Float32Array(n*n),rgb=new Float32Array(3*n*n),valid=new Uint8Array(n*n),rays=new Float64Array(3*n*n),omega=new Float64Array(n*n),outmask={enabled:true,cx:.5,cy:.5,radius:.5},m=frame.display||[1,0,0,0,1,0,0,0,1];let missing=0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const at=y*n+x;if(!inCircle(x,y,n,n,outmask))continue;const ray=pixelToRay(g,n,n,x,y);rays.set(ray,at*3);let wt=0,sy=0,srgb=[0,0,0],bad=false;
  for(let j=0;j<supersample;j++)for(let i=0;i<supersample;i++){
   const xx=x+(i+.5)/supersample-.5,yy=y+(j+.5)/supersample-.5;if(!inCircle(xx,yy,n,n,outmask))continue;
   const rr=pixelToRay(g,n,n,xx,yy),l=sampleRay(frame,input,mask,rr,1),c=sampleRay(frame,input,mask,rr,3);
   if(!l||!c){bad=true;continue;}sy+=l[0];for(let k=0;k<3;k++)srgb[k]+=c[k];wt++;
  }
  if(!wt||bad){missing++;continue;}valid[at]=1;Y[at]=sy/wt;for(let k=0;k<3;k++)rgb[at*3+k]=(m[k*3]*srgb[0]+m[k*3+1]*srgb[1]+m[k*3+2]*srgb[2])/wt;omega[at]=angularPixelArea(g,n,x,y);
 }
 if(missing)throw Error(`${missing} circular-view pixels lack captured support. Check circle/geometry; no missing scene pixels were invented.`);
 const minPPD=circularSampling(g,n).minimumPixelsPerDegree;
 return {Y,rgb,valid,rays,omega,width:n,height:n,geometry:g,mask:outmask,halfAngle:circle.halfAngle,details:{domain:'full circular fisheye',sourceProjection:input.projection,outputProjection:g.projection,diameterFov:g.hfov,outputSize:n,supersample,conservativeNyquistCPD:minPPD/2,sampling:'bilinear with subpixel area sampling; finite-resolution approximation'}};
}
export function circularSampling(g,n){
 const R=n/2,T=g.hfov*D/2;let low=Infinity,high=0;
 for(let i=0;i<=1000;i++){const t=T*i/1000;let r,dr;
  if(g.projection==='equidistant'){r=R*t/T;dr=R/T;}
  else if(g.projection==='equisolid'){r=R*Math.sin(t/2)/Math.sin(T/2);dr=R*Math.cos(t/2)/(2*Math.sin(T/2));}
  else if(g.projection==='stereographic'){r=R*Math.tan(t/2)/Math.tan(T/2);dr=R/(2*Math.tan(T/2)*Math.cos(t/2)**2);}
  else {r=R*Math.sin(t)/Math.sin(T);dr=R*Math.cos(t)/Math.sin(T);}
  const tang=t>1e-10?r/Math.sin(t):dr;low=Math.min(low,dr*D,tang*D);high=Math.max(high,dr*D,tang*D);
 }return {minimumPixelsPerDegree:Math.max(0,low),maximumPixelsPerDegree:high};
}
export function patchCenters(halfAngle=90,step=12){
 const centers=[{ray:[0,0,1],theta:0,azimuth:0}];const rings=Math.ceil(halfAngle/step),d=halfAngle/rings;
 for(let j=1;j<=rings;j++){const theta=j*d,count=Math.max(6,Math.ceil(360*Math.sin(theta*D)/step));for(let i=0;i<count;i++){const azimuth=(i+(j%2)*.5)*360/count;centers.push({ray:[Math.sin(theta*D)*Math.cos(azimuth*D),Math.sin(theta*D)*Math.sin(azimuth*D),Math.cos(theta*D)],theta,azimuth});}}
 return centers;
}
function tangentBasis(c){const right=Math.hypot(c[0],c[2])<1e-8?[1,0,0]:unit3([c[2],0,-c[0]]);const down=[c[1]*right[2]-c[2]*right[1],c[2]*right[0]-c[0]*right[2],c[0]*right[1]-c[1]*right[0]];return {right,down,forward:c};}
function sampleTile(a,n,u,v,channels){const x=Math.max(0,Math.min(n-1,u)),y=Math.max(0,Math.min(n-1,v)),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,n-1),y1=Math.min(y0+1,n-1),fx=x-x0,fy=y-y0,out=[];for(let c=0;c<channels;c++)out.push((1-fy)*((1-fx)*a[(y0*n+x0)*channels+c]+fx*a[(y0*n+x1)*channels+c])+fy*((1-fx)*a[(y1*n+x0)*channels+c]+fx*a[(y1*n+x1)*channels+c]));return out;}
export function tangentFilter(frame,source,mask,view,parameters={},progress=()=>{},mode='devas'){
 const channels=mode==='blur'||mode==='chroma'?3:1,N=parameters.tileSize||192,physicalFov=32,usableRadius=12,centers=patchCenters(view.halfAngle),focal=N/(2*Math.tan(physicalFov*D/2)),ppd=focal*D,effectiveFov=N/ppd;
 if(![96,192,384].includes(N))throw Error('Invalid tangent workspace size');
 const weights=new Float64Array(view.width*view.height),sum=new Float64Array(weights.length*channels),cut=Math.cos(usableRadius*D),scale=parameters.scale??1;
 let firstDetails=null,reflections=0;
 for(let k=0;k<centers.length;k++){
  const c=centers[k],basis=tangentBasis(c.ray),tile=new Float32Array(N*N*channels);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
   const r=unit3(rotateRay([(x+.5-N/2)/focal,(y+.5-N/2)/focal,1],basis));if(r[2]<Math.cos(view.halfAngle*D))reflections++;
   const val=sampleRay(frame,source,mask,r,channels,view.halfAngle);if(!val)throw Error('A tangent patch intersects unsupported source samples. Check image circle and geometry.');
   for(let ch=0;ch<channels;ch++){const m=frame.display;const value=mode==='chroma'&&m?m[ch*3]*val[0]+m[ch*3+1]*val[1]+m[ch*3+2]*val[2]:val[ch];tile[(y*N+x)*channels+ch]=Math.max(0,value)*scale;}
  }
  let processed;
  if(mode==='chroma')processed=filterChroma(tile,N,N,{...parameters,hfov:effectiveFov,pad:true});
  else if(mode==='blur')processed=gaussianRGB(tile,N,N,(parameters.sigmaDegrees||0)*ppd);
  else {const result=devas(tile,N,N,{...parameters,hfov:effectiveFov,absolute:!!parameters.absolute,pad:true});processed=result.Y;if(!firstDetails)firstDetails=result.details;}
  // A geodesic arc of length alpha maps within L*alpha pixels, where L is
  // the largest singular value of this radial projection over the captured cap.
  // The cap is geodesically convex for halfAngle <=90 degrees. This bound only
  // avoids testing distant output pixels; contribution weights are unchanged.
  const centerPixel=rayToPixel(view.geometry,view.width,view.height,...c.ray),bound=circularSampling(view.geometry,view.width).maximumPixelsPerDegree*usableRadius+2;
  const x0=Math.max(0,Math.floor(centerPixel[0]-bound)),x1=Math.min(view.width-1,Math.ceil(centerPixel[0]+bound)),y0=Math.max(0,Math.floor(centerPixel[1]-bound)),y1=Math.min(view.height-1,Math.ceil(centerPixel[1]+bound)),rr=view.rays;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const i=y*view.width+x;if(!view.valid[i])continue;const j=i*3,rx=rr[j],ry=rr[j+1],rz=rr[j+2],z=rx*c.ray[0]+ry*c.ray[1]+rz*c.ray[2];if(z<=cut)continue;
   const d=Math.acos(Math.max(-1,Math.min(1,z)))/D,q=d/usableRadius,wt=(1-q*q)**2;
   const u=focal*(rx*basis.right[0]+ry*basis.right[1]+rz*basis.right[2])/z+N/2-.5,v=focal*(rx*basis.down[0]+ry*basis.down[1]+rz*basis.down[2])/z+N/2-.5,values=sampleTile(processed,N,u,v,channels);
   weights[i]+=wt;for(let ch=0;ch<channels;ch++)sum[i*channels+ch]+=wt*values[ch];
  }
  progress((k+1)/centers.length,`${mode==='blur'?'Angular blur':mode==='chroma'?'Chromaticity':'Visibility'} patch ${k+1}/${centers.length}`);
 }
 const out=new Float32Array(sum.length);let gaps=0,minWeight=Infinity;
 for(let i=0;i<weights.length;i++){if(!view.valid[i])continue;if(weights[i]<=0){gaps++;continue;}minWeight=Math.min(minWeight,weights[i]);for(let ch=0;ch<channels;ch++)out[i*channels+ch]=sum[i*channels+ch]/weights[i];}
 if(gaps)throw Error(`Internal angular-patch coverage error (${gaps} pixels)`);
 return {values:out,details:{...firstDetails,...view.details,method:'overlapping local tangent-patch approximation',patches:centers.length,tileSize:N,tileHFOV:physicalFov,centerPixelsPerDegree:ppd,filterEquivalentHFOV:effectiveFov,retainedPatchRadius:usableRadius,maxLocalScaleVariationPercent:100*(1/Math.cos(usableRadius*D)**2-1),blend:'normalized compact angular weights (1-(theta/12deg)^2)^2',minimumBlendWeight:minWeight,reflectedSupportSamples:reflections,boundary:'angular reflection at captured rim; reflected FFT padding inside each patch',angularSampling:'local tangent-plane center scale, not global fisheye pixels/degree',conservativeNyquistCPD:Math.min(view.details.conservativeNyquistCPD,ppd/2),scope:'Uniform acuity/CSF applied locally over the captured field; no eccentricity-dependent retinal model. Patch blending and finite support are adaptations, not a validated spherical DeVAS model.'}};
}
