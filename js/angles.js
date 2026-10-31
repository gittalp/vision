/* Angular definitions shared by masks, measurement predicates and annotations.
 * Unit rays use right/down/forward. Angle labels are eccentricity (radius),
 * unless explicitly selected as cone diameter. Pixel annotations never change Y.
 */
import {pixelToRay,rayToPixel,validateGeometry} from './geometry.js';
import {GUTH_BOUNDARY_SAMPLES} from './guthdata.js';
export const DEGREE=Math.PI/180;
export function angularBasis(forward=[0,0,1]){
 const n=Math.hypot(...forward);if(!(n>0))throw Error('Invalid fixation ray');const f=forward.map(v=>v/n);
 const m=Math.hypot(f[0],f[2]),right=m>1e-10?[f[2]/m,0,-f[0]/m]:[1,0,0];
 return {forward:f,right,down:[f[1]*right[2]-f[2]*right[1],f[2]*right[0]-f[0]*right[2],f[0]*right[1]-f[1]*right[0]]};
}
export function gazeBasis(yaw=0,pitch=0,roll=0){
 if(![yaw,pitch,roll].every(Number.isFinite)||Math.abs(yaw)>180||Math.abs(pitch)>90||Math.abs(roll)>180)throw Error('Invalid gaze angles');
 const a=yaw*DEGREE,b=pitch*DEGREE,c=roll*DEGREE,r=[Math.cos(a),0,-Math.sin(a)],d=[Math.sin(a)*Math.sin(b),Math.cos(b),Math.cos(a)*Math.sin(b)],f=[Math.sin(a)*Math.cos(b),-Math.sin(b),Math.cos(a)*Math.cos(b)];
 return {right:r.map((v,i)=>v*Math.cos(c)+d[i]*Math.sin(c)),down:d.map((v,i)=>v*Math.cos(c)-r[i]*Math.sin(c)),forward:f};
}
export function rayInBasis(r,b){return [b.right,b.down,b.forward].map(a=>a[0]*r[0]+a[1]*r[1]+a[2]*r[2]);}
export function guthAngularRadius(meridian,kind='guth-total'){
 const t=Math.max(0,Math.min(180,meridian)),i=Math.min(179,Math.floor(t)),f=t-i,c=kind==='guth-both'?2:1;
 const result=GUTH_BOUNDARY_SAMPLES[i][c]*(1-f)+GUTH_BOUNDARY_SAMPLES[i+1][c]*f;
 return kind==='guth-both'?Math.min(result,guthAngularRadius(t)):result;
}
export function makeAngularField(p={}){
 const {type='none',yaw=0,pitch=0,roll=0,bandHeight=40,coneDiameter=60,upper=50,lower=70}=p,b=gazeBasis(yaw,pitch,roll);
 if(!['none','band','cone','guth-total','guth-both','custom'].includes(type))throw Error('Unknown viewing field');
 return ray=>{if(!ray)return false;const r=rayInBasis(ray,b);if(r[2]<-1e-12)return false;if(type==='none')return true;
  const elevation=Math.asin(Math.max(-1,Math.min(1,-r[1])))/DEGREE,theta=Math.atan2(Math.hypot(r[0],r[1]),r[2])/DEGREE;
  if(type==='band')return Math.abs(elevation)<=bandHeight/2+1e-10;if(type==='cone')return theta<=coneDiameter/2+1e-10;
  if(type==='custom')return elevation<=upper+1e-10&&elevation>=-lower-1e-10;
  return theta<=guthAngularRadius(Math.atan2(Math.abs(r[0]),-r[1])/DEGREE,type)+1e-10;
 };
}
export function radialScale(projection,extent){const t=extent*DEGREE/2;return projection==='perspective'?Math.tan(t):projection==='equidistant'?t:projection==='hemispherical'?Math.sin(t):projection==='equisolid'?Math.sin(t/2):Math.tan(t/2);}
export function solidAnglePerPixel(g,w,h,x,y){
 const A=2*radialScale(g.projection,g.hfov)/w,B=2*radialScale(g.projection,g.vfov)/h,a=(x+.5-w*(.5-g.shift))*A,b=(y+.5-h*(.5+g.lift))*B,r=Math.hypot(a,b);
 if(g.projection==='perspective')return A*B/(1+r*r)**1.5;
 if(g.projection==='equidistant')return r>Math.PI?0:A*B*(r<1e-10?1:Math.sin(r)/r);
 if(g.projection==='equisolid')return r>1?0:4*A*B;
 if(g.projection==='stereographic')return 4*A*B/(1+r*r)**2;
 return r>=1?0:A*B/Math.sqrt(1-r*r);
}
export function ringParameters(p={}){
 const q={enabled:false,step:10,maxAngle:80,convention:'radius',center:'optical',color:'#e1e9ed',opacity:.55,lineWidth:1.25,labels:true,...p};
 if(!Number.isFinite(q.step)||q.step<1||q.step>90||!Number.isFinite(q.maxAngle)||q.maxAngle<q.step||q.maxAngle>180)throw Error('Ring step/range must be valid degrees');
 if(!['radius','diameter'].includes(q.convention)||!['optical','gaze'].includes(q.center))throw Error('Unknown angle convention');
 if(!/^#[0-9a-f]{6}$/i.test(q.color)||!Number.isFinite(q.opacity)||q.opacity<0||q.opacity>1||!Number.isFinite(q.lineWidth)||q.lineWidth<.25||q.lineWidth>8)throw Error('Invalid angle ring style');return q;
}
export function angleRingPaths(geometry,w,h,p={},gaze={}){
 const g=validateGeometry(geometry),q=ringParameters(p);if(!q.enabled)return[];const basis=q.center==='gaze'?gazeBasis(gaze.yaw||0,gaze.pitch||0,gaze.roll||0):gazeBasis(),rings=[];
 for(let label=q.step;label<=q.maxAngle+1e-9;label+=q.step){const radius=q.convention==='diameter'?label/2:label;if(radius>=180)continue;const t=radius*DEGREE,paths=[];let path=[];
  for(let j=0;j<=1440;j++){const phi=j*Math.PI/720,r=[0,1,2].map(k=>Math.cos(t)*basis.forward[k]+Math.sin(t)*(Math.cos(phi)*basis.right[k]+Math.sin(phi)*basis.down[k])),pos=rayToPixel(g,w,h,...r);
   if(!pos||pos.some(v=>!Number.isFinite(v))||pos[0]<-.5||pos[0]>w-.5||pos[1]<-.5||pos[1]>h-.5){if(path.length>1)paths.push(path);path=[];continue;}
   if(path.length&&Math.hypot(pos[0]-path.at(-1)[0],pos[1]-path.at(-1)[1])>Math.max(w,h)/8){if(path.length>1)paths.push(path);path=[];}
   path.push([pos[0]+.5,pos[1]+.5]);
  }if(path.length>1)paths.push(path);rings.push({label,radius,paths});
 }return rings;
}
export function drawAngleRings(ctx,geometry,w,h,p={},gaze={},mask=null){
 const q=ringParameters(p);if(!q.enabled)return;const rings=angleRingPaths(geometry,w,h,q,gaze),sx=ctx.canvas.width/w,sy=ctx.canvas.height/h;
 ctx.save();if(mask?.enabled){ctx.beginPath();ctx.ellipse(mask.cx*ctx.canvas.width,mask.cy*ctx.canvas.height,mask.radius*Math.min(w,h)*sx,mask.radius*Math.min(w,h)*sy,0,0,2*Math.PI);ctx.clip();}
 ctx.strokeStyle=q.color;ctx.fillStyle=q.color;ctx.globalAlpha=q.opacity;ctx.lineWidth=q.lineWidth;ctx.font='12px system-ui';ctx.setLineDash([]);
 for(const ring of rings){for(const line of ring.paths){ctx.beginPath();line.forEach(([x,y],i)=>i?ctx.lineTo(x*sx,y*sy):ctx.moveTo(x*sx,y*sy));ctx.stroke();}if(q.labels&&ring.paths.length){const line=ring.paths.reduce((a,b)=>a.length>b.length?a:b),point=line[Math.floor(line.length*.13)];ctx.fillText(ring.label+'\u00b0'+(q.convention==='diameter'?' dia.':''),point[0]*sx+4,point[1]*sy-4);}}
 ctx.restore();
}
