/* Image geometry uses pixel-edge coordinates, top-left origin. VIEW shifts/lifts
 * follow Radiance; crop equations checked against image.c:cropview().
 * Metadata editing never resamples pixels. Equisolid is NOT Radiance -vth.
 */
export const PROJECTIONS = ['perspective','equidistant','hemispherical','stereographic','equisolid'];
const codes={perspective:'v',equidistant:'a',hemispherical:'h',stereographic:'s'};
const DEG=Math.PI/180;
function radial(projection,fov){const a=fov*DEG/2;switch(projection){case 'perspective':return Math.tan(a);case 'equidistant':return a;case 'hemispherical':return Math.sin(a);case 'stereographic':return Math.tan(a/2);case 'equisolid':return Math.sin(a/2);default:throw Error('Choose a supported projection');}}
function inverseRadial(projection,r){if(!(r>0)||!Number.isFinite(r))throw Error('Invalid angular scale');switch(projection){case 'perspective':return 2*Math.atan(r)/DEG;case 'equidistant':return 2*r/DEG;case 'hemispherical':if(r>1+1e-10)throw Error('A hemispherical VIEW cannot include this much black padding. Crop to the image circle first.');return 2*Math.asin(Math.min(1,r))/DEG;case 'stereographic':return 4*Math.atan(r)/DEG;case 'equisolid':if(r>1+1e-10)throw Error('Equisolid angular span exceeds its domain. Crop to the image circle first.');return 4*Math.asin(Math.min(1,r))/DEG;default:throw Error('Unsupported projection');}}
export function validateGeometry(g){
 if(!g||!PROJECTIONS.includes(g.projection))throw Error('Choose the actual lens projection before confirming geometry');
 const out={projection:g.projection,hfov:Number(g.hfov),vfov:Number(g.vfov),shift:Number(g.shift??0),lift:Number(g.lift??0),vp:g.vp||[0,0,0],vd:g.vd||[0,1,0],vu:g.vu||[0,0,1],fore:Number(g.fore??0),aft:Number(g.aft??0),confirmed:g.confirmed===true};
 const max=g.projection==='perspective'?180:g.projection==='hemispherical'?180:360;
 for(const v of [out.hfov,out.vfov])if(!Number.isFinite(v)||v<=0||v>max||((g.projection==='perspective'||g.projection==='stereographic')&&v>=max))throw Error(`Invalid horizontal/vertical field for ${g.projection}`);
 if(![out.shift,out.lift,out.fore,out.aft].every(Number.isFinite)||out.fore<0||out.aft<0||(out.aft>0&&out.aft<=out.fore))throw Error('Invalid view offsets or clipping planes');
 for(const k of ['vp','vd','vu'])if(!Array.isArray(out[k])||out[k].length!==3||!out[k].every(Number.isFinite))throw Error(`Invalid ${k} vector`);
 const d=out.vd,u=out.vu,c=[d[1]*u[2]-d[2]*u[1],d[2]*u[0]-d[0]*u[2],d[0]*u[1]-d[1]*u[0]];
 if(Math.hypot(...d)<1e-12||Math.hypot(...u)<1e-12||Math.hypot(...c)<1e-12)throw Error('View direction and up must be nonzero and nonparallel');
 return out;
}
export function geometryFromCircle(projection,diameterFov,mask,w,h,base={}){
 if(!mask?.enabled||!(mask.radius>0))throw Error('Apply a circular image mask first');
 const r=mask.radius*Math.min(w,h),q=radial(projection,diameterFov);
 return validateGeometry({...base,projection,hfov:inverseRadial(projection,q*w/(2*r)),vfov:inverseRadial(projection,q*h/(2*r)),shift:.5-mask.cx,lift:mask.cy-.5,confirmed:false});
}
export function verticalFromHorizontal(projection,hfov,w,h){return inverseRadial(projection,radial(projection,hfov)*h/w);}
export function parseView(text){
 if(typeof text!=='string'||!text.trim())return null;
 const tokens=text.replace(/^\s*VIEW\s*=\s*/,'').trim().split(/\s+/),g={projection:'perspective',hfov:45,vfov:45,shift:0,lift:0,vp:[0,0,0],vd:[0,1,0],vu:[0,0,1],fore:0,aft:0,confirmed:false};let used=0;
 const scalars={'-vh':'hfov','-vv':'vfov','-vs':'shift','-vl':'lift','-vo':'fore','-va':'aft'},vectors={'-vp':'vp','-vd':'vd','-vu':'vu'};
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];if(t.startsWith('-vt')){g.projection=Object.keys(codes).find(k=>codes[k]===t.slice(3));if(!g.projection)throw Error('This VIEW projection is not supported by the analysis workspace');used++;}
  else if(scalars[t]){g[scalars[t]]=Number(tokens[++i]);used++;}
  else if(vectors[t]){g[vectors[t]]=[Number(tokens[++i]),Number(tokens[++i]),Number(tokens[++i])];used++;}
  else throw Error(`Unrecognized VIEW option: ${t}`);
 }
 return used?validateGeometry(g):null;
}
export function viewString(input){const g=validateGeometry(input);if(!codes[g.projection])return null;const f=n=>Number(n.toPrecision(12)).toString();return `-vt${codes[g.projection]} -vp ${g.vp.map(f).join(' ')} -vd ${g.vd.map(f).join(' ')} -vu ${g.vu.map(f).join(' ')} -vh ${f(g.hfov)} -vv ${f(g.vfov)} -vs ${f(g.shift)} -vl ${f(g.lift)} -vo ${f(g.fore)} -va ${f(g.aft)}`;}
export function validateCrop(r,w,h){if(!r||![r.x,r.y,r.w,r.h].every(Number.isInteger)||r.x<0||r.y<0||r.w<1||r.h<1||r.x+r.w>w||r.y+r.h>h)throw Error('Crop must use whole pixels and lie inside the current image');return {...r};}
export function cropGeometry(input,r,w,h){const g=validateGeometry(input);validateCrop(r,w,h);const dx=r.w/w,dy=r.h/h;return validateGeometry({...g,hfov:inverseRadial(g.projection,radial(g.projection,g.hfov)*dx),vfov:inverseRadial(g.projection,radial(g.projection,g.vfov)*dy),shift:(g.shift+(r.x+r.w/2)/w-.5)/dx,lift:(g.lift+.5-(r.y+r.h/2)/h)/dy});}
export function cropMask(mask,r,w,h){if(!mask?.enabled)return {enabled:false};return {...mask,cx:(mask.cx*w-r.x)/r.w,cy:(mask.cy*h-r.y)/r.h,radius:mask.radius*Math.min(w,h)/Math.min(r.w,r.h)};}
export function cropFrame(frame,r){validateCrop(r,frame.width,frame.height);const rgb=new Float32Array(r.w*r.h*3),Y=new Float32Array(r.w*r.h),valid=frame.valid?new Uint8Array(r.w*r.h):null;
 for(let y=0;y<r.h;y++){const at=(y+r.y)*frame.width+r.x;rgb.set(frame.rgb.subarray(at*3,(at+r.w)*3),y*r.w*3);Y.set(frame.Y.subarray(at,at+r.w),y*r.w);if(valid)valid.set(frame.valid.subarray(at,at+r.w),y*r.w);}
 return {...frame,width:r.w,height:r.h,rgb,Y,valid,origin:{x:(frame.origin?.x||0)+r.x,y:(frame.origin?.y||0)+r.y}};
}
// Project a local viewing ray (right, down, forward) into the confirmed raster.
export function rayToPixel(g,w,h,u,v,z){let a,b;if(g.projection==='perspective'){if(z<=0)return null;a=u/z;b=v/z;}else{const len=Math.hypot(u,v),theta=Math.atan2(len,z);if(g.projection==='hemispherical'&&theta>Math.PI/2+1e-12)return null;let rr;
 if(g.projection==='equidistant')rr=theta;else if(g.projection==='hemispherical')rr=Math.sin(theta);else if(g.projection==='stereographic'){if(theta>=Math.PI-1e-12)return null;rr=Math.tan(theta/2);}else if(g.projection==='equisolid')rr=Math.sin(theta/2);else return null;
 a=len?rr*u/len:0;b=len?rr*v/len:0;}
 return [w*(.5-g.shift+a/(2*radial(g.projection,g.hfov)))-.5,h*(.5+g.lift+b/(2*radial(g.projection,g.vfov)))-.5];
}
export function pixelToRay(g,w,h,x,y){const a=((x+.5)/w-.5+g.shift)*2*radial(g.projection,g.hfov),b=((y+.5)/h-.5-g.lift)*2*radial(g.projection,g.vfov);if(g.projection==='perspective'){const n=Math.hypot(a,b,1);return [a/n,b/n,1/n];}const r=Math.hypot(a,b);let theta;
 if(g.projection==='equidistant')theta=r;else if(g.projection==='hemispherical'){if(r>1)return null;theta=Math.asin(r);}else if(g.projection==='stereographic')theta=2*Math.atan(r);else if(g.projection==='equisolid'){if(r>1)return null;theta=2*Math.asin(r);}else return null;
 if(theta>Math.PI)return null;const s=r?Math.sin(theta)/r:1;return [a*s,b*s,Math.cos(theta)];
}
export function geometryHeader(g){const v=validateGeometry(g);if(!v.confirmed)throw Error('Confirm and apply geometry before exporting a corrected header');const view=viewString(v);return `${view?'VIEW= '+view+'\n':''}VISIONSIM_GEOMETRY=${JSON.stringify(v)}\n${view?'':'# Equisolid pixels: no standard Radiance VIEW is asserted. Use angular reprojection for -vta.\n'}`;}
