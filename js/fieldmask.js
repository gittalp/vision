import {GUTH_BOUNDARY_SAMPLES} from './guthdata.js';
import {viewBasis,localRay,angle3} from './spherical.js';
const D=Math.PI/180;
export function guthRadius(meridian,kind='guth-total'){
 const t=Math.max(0,Math.min(180,meridian)),i=Math.min(179,Math.floor(t)),f=t-i,col=kind==='guth-both'?2:1;
 const radius=GUTH_BOUNDARY_SAMPLES[i][col]*(1-f)+GUTH_BOUNDARY_SAMPLES[i+1][col]*f;
 return kind==='guth-both'?Math.min(radius,guthRadius(t,'guth-total')):radius;
}
export function fieldParameters(p={}){
 const out={type:'band',bandHeight:40,coneDiameter:60,upper:50,lower:70,yaw:0,pitch:0,roll:0,style:'shade',opacity:.75,...p};
 if(!['none','band','cone','guth-total','guth-both','custom'].includes(out.type)||!['shade','outline','binary'].includes(out.style))throw Error('Unknown visual-field mask or display style');
 for(const key of ['bandHeight','coneDiameter'])if(!Number.isFinite(out[key])||out[key]<=0||out[key]>180)throw Error('Band height and cone diameter must be >0 and <=180 degrees');
 for(const key of ['upper','lower'])if(!Number.isFinite(out[key])||out[key]<0||out[key]>90)throw Error('Upper and lower limits must be between 0 and 90 degrees');
 if(!Number.isFinite(out.opacity)||out.opacity<0||out.opacity>1)throw Error('Mask opacity must be in [0,1]');viewBasis(out.yaw,out.pitch,out.roll);return out;
}
export function withinField(ray,input={}){
 const p=fieldParameters(input),r=localRay(ray,viewBasis(p.yaw,p.pitch,p.roll));return member(r,p);
}
function member(r,p){
 if(r[2]<-1e-12)return false;if(p.type==='none')return true;
 const elevation=Math.asin(Math.max(-1,Math.min(1,-r[1])))/D,theta=Math.atan2(Math.hypot(r[0],r[1]),r[2])/D;
 if(p.type==='band')return Math.abs(elevation)<=p.bandHeight/2+1e-10;
 if(p.type==='cone')return theta<=p.coneDiameter/2+1e-10;
 if(p.type==='custom')return elevation<=p.upper+1e-10&&elevation>=-p.lower-1e-10;
 const meridian=Math.atan2(Math.abs(r[0]),-r[1])/D;return theta<=guthRadius(meridian,p.type)+1e-10;
}
export function makeFieldMask(view,input={}){
 const p=fieldParameters(input),basis=viewBasis(p.yaw,p.pitch,p.roll),selected=new Uint8Array(view.width*view.height);let count=0,omega=0,weightedY=0,pixelY=0;
 for(let i=0;i<selected.length;i++){if(!view.valid[i])continue;if(member(localRay(view.rays.subarray(i*3,i*3+3),basis),p)){selected[i]=1;count++;omega+=view.omega[i];weightedY+=view.Y[i]*view.omega[i];pixelY+=view.Y[i];}}
 return {selected,details:{...p,count,solidAngleSteradians:omega,solidAngleWeightedMean:omega?weightedY/omega:null,pixelMean:count?pixelY/count:null,bandConvention:'Full vertical elevation height: 40 degrees means -20 to +20 degrees; spans captured horizontal field.',guthReference:p.type.startsWith('guth')?'1-degree meridian lookup of documented Guth reference envelopes, linearly interpolated; binocular reference intersected with total-field envelope; clipped to captured field. Not the glare position index.':null,sourceUnchanged:true}};
}
export function paintField(base,view,selection,input={}){
 const p=fieldParameters(input),out=new Uint8ClampedArray(base),w=view.width,h=view.height;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,at=4*i;if(!view.valid[i])continue;const on=selection[i];
  if(p.style==='binary'){out[at]=out[at+1]=out[at+2]=on?255:0;continue;}
  if(p.style==='shade'&&!on)for(let c=0;c<3;c++)out[at+c]=Math.round(out[at+c]*(1-p.opacity));
  const neighbors=[];if(x>0)neighbors.push(i-1);if(x<w-1)neighbors.push(i+1);if(y>0)neighbors.push(i-w);if(y<h-1)neighbors.push(i+w);const boundary=on&&neighbors.some(j=>view.valid[j]&&!selection[j]);
  if(boundary){out[at]=255;out[at+1]=211;out[at+2]=70;}
 }
 return out;
}
