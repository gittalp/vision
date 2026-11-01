/* Shapes use SOURCE pixel-edge coordinates. Membership uses pixel centers.
 * A difference is a set difference, not subtraction of two mean luminances.
 */
export function regionBounds(r,w=Infinity,h=Infinity){
 if(!r)return{x:0,y:0,w,h};let x,y,x1,y1;
 if(r.type==='difference')return regionBounds(r.outer,w,h);
 if(r.type==='polygon'){x=Math.min(...r.points.map(p=>p.x));y=Math.min(...r.points.map(p=>p.y));x1=Math.max(...r.points.map(p=>p.x));y1=Math.max(...r.points.map(p=>p.y));}
 else if(r.type==='circle'){x=r.cx-r.radius;y=r.cy-r.radius;x1=r.cx+r.radius;y1=r.cy+r.radius;}
 else{x=r.x;y=r.y;x1=x+r.w;y1=y+r.h;}
 const a=Math.max(0,Math.floor(x)),b=Math.max(0,Math.floor(y));return{x:a,y:b,w:Math.max(0,Math.min(w,Math.ceil(x1))-a),h:Math.max(0,Math.min(h,Math.ceil(y1))-b)};
}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function onSegment(a,b,p){return Math.abs(cross(a,b,p))<1e-8&&p.x>=Math.min(a.x,b.x)-1e-8&&p.x<=Math.max(a.x,b.x)+1e-8&&p.y>=Math.min(a.y,b.y)-1e-8&&p.y<=Math.max(a.y,b.y)+1e-8;}
function intersect(a,b,c,d){const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);return p*q<0&&r*s<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
export function validateRegion(region,w,h,depth=0){
 if(!region||depth>2)throw Error('Draw a measurement selection');const r=structuredClone(region),type=r.type||'rectangle';r.type=type;
 if(type==='difference'){r.outer=validateRegion(r.outer,w,h,depth+1);r.inner=validateRegion(r.inner,w,h,depth+1);return r;}
 if(type==='polygon'){
  if(!Array.isArray(r.points)||r.points.length<3||r.points.length>512)throw Error('Polygon needs 3 to 512 vertices');
  for(const p of r.points)if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>w||p.y>h)throw Error('Polygon vertices must lie inside the source image');
  let area=0;for(let i=0;i<r.points.length;i++){const a=r.points[i],b=r.points[(i+1)%r.points.length];if(Math.hypot(a.x-b.x,a.y-b.y)<1e-6)throw Error('Repeated polygon vertices');area+=a.x*b.y-b.x*a.y;for(let j=i+2;j<r.points.length;j++){if(i===0&&j===r.points.length-1)continue;if(intersect(a,b,r.points[j],r.points[(j+1)%r.points.length]))throw Error('Polygon edges cross. Move a vertex or redraw a simple polygon');}}
  if(Math.abs(area)<1e-6)throw Error('Polygon has no area');
 }else if(type==='circle'){if(![r.cx,r.cy,r.radius].every(Number.isFinite)||r.radius<=0||r.cx-r.radius<0||r.cy-r.radius<0||r.cx+r.radius>w||r.cy+r.radius>h)throw Error('Circle must lie inside the image');}
 else if(type==='rectangle'){if(![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>w||r.y+r.h>h)throw Error('Rectangle must lie inside the image');}
 else throw Error('Unknown measurement shape');return r;
}
export function regionPredicate(r){
 if(!r)return()=>true;
 if(r.type==='difference'){const a=regionPredicate(r.outer),b=regionPredicate(r.inner);return(x,y)=>a(x,y)&&!b(x,y);}
 if(r.type==='circle')return(x,y)=>(x-r.cx)**2+(y-r.cy)**2<=r.radius**2;
 if(r.type==='polygon'){const v=r.points;return(x,y)=>{let inside=false;for(let i=0,j=v.length-1;i<v.length;j=i++){const a=v[j],b=v[i];if(onSegment(a,b,{x,y}))return true;if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;};}
 return(x,y)=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;
}
export function containsRegion(outer,inner,w,h){
 const a=regionPredicate(outer),b=regionPredicate(inner),r=regionBounds(inner,w,h);let n=0;
 for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(b(x+.5,y+.5)){n++;if(!a(x+.5,y+.5))return false;}
 return n>0;
}
export function paintRegion(ctx,r,w,h,{color='#ffffff',fill=false,label=''}={}){
 if(!r)return;ctx.save();const sx=ctx.canvas.width/w,sy=ctx.canvas.height/h;
 function path(shape){if(shape.type==='difference'){path(shape.outer);path(shape.inner);}else if(shape.type==='polygon'){shape.points.forEach((p,i)=>i?ctx.lineTo(p.x*sx,p.y*sy):ctx.moveTo(p.x*sx,p.y*sy));ctx.closePath();}else if(shape.type==='circle'){ctx.moveTo((shape.cx+shape.radius)*sx,shape.cy*sy);ctx.ellipse(shape.cx*sx,shape.cy*sy,shape.radius*sx,shape.radius*sy,0,0,Math.PI*2);}else ctx.rect(shape.x*sx,shape.y*sy,shape.w*sx,shape.h*sy);}
 ctx.beginPath();path(r);if(fill){ctx.fillStyle=color;ctx.globalAlpha=.09;ctx.fill('evenodd');ctx.globalAlpha=1;}ctx.strokeStyle='#111111';ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.stroke();
 if(label){const b=regionBounds(r,w,h);ctx.font='bold 13px system-ui';ctx.fillStyle=color;ctx.fillText(label,b.x*sx+5,b.y*sy+16);}ctx.restore();
}
