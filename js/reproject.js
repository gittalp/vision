import {validateGeometry,rayToPixel,pixelToRay} from './geometry.js';
import {inCircle} from './math.js';
/* Explicit angular reprojection, separate from header editing. Bilinear samples
 * renormalize weights at the valid circle edge; missing interior support fails.
 * This changes sampling and must not replace the original measurement image.
 */
export function angularReproject(frame,source,mask,size=1024,diameterFov=180,progress=()=>{}){
 const src=validateGeometry(source);if(!src.confirmed)throw Error('Apply confirmed source geometry first');
 if(!Number.isInteger(size)||size<32||size>4096||!Number.isFinite(diameterFov)||diameterFov<=0||diameterFov>360)throw Error('Invalid angular export size or extent');
 const target=validateGeometry({...src,projection:'equidistant',hfov:diameterFov,vfov:diameterFov,shift:0,lift:0,confirmed:true});
 const rgb=new Float32Array(size*size*3),outmask={enabled:true,cx:.5,cy:.5,radius:.5};let missing=0;
 for(let y=0;y<size;y++){for(let x=0;x<size;x++){
  if(!inCircle(x,y,size,size,outmask))continue;const ray=pixelToRay(target,size,size,x,y),p=ray&&rayToPixel(src,frame.width,frame.height,...ray);
  if(!p||p[0]<-.5||p[1]<-.5||p[0]>frame.width-.5||p[1]>frame.height-.5){missing++;continue;}
  const [sx,sy]=p;if(mask?.enabled&&!inCircle(sx,sy,frame.width,frame.height,mask)){missing++;continue;}
  const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let weight=0,sum=[0,0,0],unsupported=false;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x0+i,yy=y0+j,wt=(i?fx:1-fx)*(j?fy:1-fy);if(wt<=1e-12||xx<0||yy<0||xx>=frame.width||yy>=frame.height||!inCircle(xx,yy,frame.width,frame.height,mask))continue;const at=yy*frame.width+xx;if(frame.valid&&!frame.valid[at]){unsupported=true;continue;}weight+=wt;for(let c=0;c<3;c++)sum[c]+=frame.rgb[at*3+c]*wt;}
  if(weight<=0||unsupported){missing++;continue;}for(let c=0;c<3;c++)rgb[(y*size+x)*3+c]=sum[c]/weight;
 }if(y%32===0)progress(y/size);}
 if(missing)throw Error(`Angular export has ${missing} pixels without valid source support. Reduce the requested diameter FOV or correct source geometry. No HDR was written.`);
 return {frame:{...frame,width:size,height:size,rgb},geometry:target,mask:outmask,method:'bilinear angular reprojection; valid-circle boundary weights renormalized; no invented interior pixels'};
}
