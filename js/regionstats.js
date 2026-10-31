import {validateRegion,regionPredicate,regionBounds,containsRegion} from './selections.js';
import {inCircle,pairContrast} from './math.js';
import {pixelToRay} from './geometry.js';
import {makeAngularField,solidAnglePerPixel} from './angles.js';
export function measureRegion(frame,region,{mask=null,scale=1,geometry=null,field=null}={}){
 const w=frame.width,h=frame.height,r=region?validateRegion(region,w,h):null,b=regionBounds(r,w,h),inside=regionPredicate(r),inField=field?makeAngularField(field):null;
 if(field&&!geometry?.confirmed)throw Error('Confirm geometry before measuring a viewing field');
 const values=new Float32Array(b.w*b.h);let count=0,excluded=0,sum=0,mean=0,m2=0,omega=0,weighted=0,negative=0;
 for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++){
  if(!inside(x+.5,y+.5))continue;const i=y*w+x;if(!inCircle(x,y,w,h,mask)||(frame.valid&&!frame.valid[i])){excluded++;continue;}
  if(inField&&!inField(pixelToRay(geometry,w,h,x,y))){excluded++;continue;}const v=frame.Y[i]*scale;if(!Number.isFinite(v)){excluded++;continue;}
  values[count++]=v;sum+=v;const delta=v-mean;mean+=delta/count;m2+=delta*(v-mean);if(v<0)negative++;
  if(geometry?.confirmed){const wt=solidAnglePerPixel(geometry,w,h,x,y);if(Number.isFinite(wt)&&wt>0){omega+=wt;weighted+=v*wt;}}
 }
 const base={count,excluded,roi:b,region:r,field:field?structuredClone(field):null,weighting:'equal source-pixel means; solid-angle mean reported separately',sampling:'native source pixels at pixel centers; no preview colors or annotation pixels used',solidAngleSteradians:geometry?.confirmed?omega:null,solidAngleWeightedMean:omega>0?weighted/omega:null};
 if(!count)return {...base,mean:null,median:null};const a=values.subarray(0,count);a.sort();const q=p=>{const z=(count-1)*p,k=Math.floor(z);return a[k]+(z-k)*(a[Math.min(k+1,count-1)]-a[k]);};
 return {...base,mean:sum/count,minimum:a[0],maximum:a[count-1],median:q(.5),p05:q(.05),p95:q(.95),sd:Math.sqrt(Math.max(0,m2/count)),negativeFraction:negative/count,quantiles:'linear interpolation of float32 samples'};
}
export function targetSurround(frame,outer,target,options={}){
 const a=validateRegion(target,frame.width,frame.height),b=validateRegion(outer,frame.width,frame.height),contained=containsRegion(b,a,frame.width,frame.height);
 const result=contained?{type:'difference',outer:b,inner:a}:b,A=measureRegion(frame,a,options),B=measureRegion(frame,result,options);
 return {A,B,contrast:pairContrast(A.mean,B.mean),subtracted:contained,definition:contained?'Background = enclosing selection minus target A (pixel set difference)':'Background = selected B; target A is not fully contained'};
}
