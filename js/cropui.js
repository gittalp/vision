/* Visual crop geometry uses source pixel edges, not CSS or preview pixels.
 * All committed rectangles are integer subsets. Circles remain true circles
 * in the source raster; no resampling or luminance operations occur here.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function screenToSource(clientX,clientY,box,width,height){
 if(!(box.width>0&&box.height>0&&width>0&&height>0))throw Error('Invalid preview dimensions');
 return {x:clamp((clientX-box.left)/box.width*width,0,width),y:clamp((clientY-box.top)/box.height*height,0,height)};
}
export function rectFromDrag(a,b,shape,width,height){
 const x=clamp(Math.round(a.x),0,width),y=clamp(Math.round(a.y),0,height);
 const dx=clamp(Math.round(b.x),0,width)-x,dy=clamp(Math.round(b.y),0,height)-y;
 if(shape==='circle'){
  const sx=dx<0?-1:1,sy=dy<0?-1:1;
  const side=Math.min(Math.max(Math.abs(dx),Math.abs(dy)),sx<0?x:width-x,sy<0?y:height-y);
  return {x:sx<0?x-side:x,y:sy<0?y-side:y,w:side,h:side};
 }
 return {x:Math.min(x,x+dx),y:Math.min(y,y+dy),w:Math.abs(dx),h:Math.abs(dy)};
}
export function circleFromRect(rect,width,height){
 if(!rect||rect.w!==rect.h||rect.w<1)throw Error('A circle requires a positive square bounding box');
 return {enabled:true,cx:(rect.x+rect.w/2)/width,cy:(rect.y+rect.h/2)/height,radius:rect.w/(2*Math.min(width,height))};
}
export function moveSelection(rect,dx,dy,width,height){return {...rect,x:clamp(Math.round(rect.x+dx),0,width-rect.w),y:clamp(Math.round(rect.y+dy),0,height-rect.h)};}
export function resizeSelection(r,handle,p,shape,W,H){
 const left=r.x,top=r.y,right=r.x+r.w,bottom=r.y+r.h,cx=r.x+r.w/2,cy=r.y+r.h/2;
 if(shape==='circle'){
  if(handle.length===2){const anchor={x:handle.includes('w')?right:left,y:handle.includes('n')?bottom:top};return rectFromDrag(anchor,p,'circle',W,H);}
  const vertical=handle==='n'||handle==='s',negative=handle==='n'||handle==='w';
  const anchor=vertical?(negative?bottom:top):(negative?right:left),target=vertical?p.y:p.x;
  const sign=target<anchor?-1:1,center=vertical?cx:cy,perpMax=vertical?W:H,axisMax=vertical?H:W;
  const side=Math.floor(Math.min(Math.abs(target-anchor),sign<0?anchor:axisMax-anchor,2*Math.min(center,perpMax-center)));
  const along=sign<0?anchor-side:anchor;
  return vertical?{x:Math.round(cx-side/2),y:Math.round(along),w:side,h:side}:{x:Math.round(along),y:Math.round(cy-side/2),w:side,h:side};
 }
 const x0=handle.includes('w')?p.x:left,x1=handle.includes('e')?p.x:right;
 const y0=handle.includes('n')?p.y:top,y1=handle.includes('s')?p.y:bottom;
 return rectFromDrag({x:x0,y:y0},{x:x1,y:y1},'rectangle',W,H);
}
function handles(r){const x=r.x,y=r.y,w=r.w,h=r.h;return {nw:[x,y],n:[x+w/2,y],ne:[x+w,y],e:[x+w,y+h/2],se:[x+w,y+h],s:[x+w/2,y+h],sw:[x,y+h],w:[x,y+h/2]};}
function inside(p,r,shape){return shape==='circle'?Math.hypot(p.x-r.x-r.w/2,p.y-r.y-r.h/2)<=r.w/2:p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;}
export function createCropEditor(canvas,{dimensions,onChange,onPaint,onApply,onExit}){
 const state={active:false,shape:'rectangle',selection:null,pointer:null,gesture:null,disabled:false,guides:true};
 function changed(){onChange(state.selection,state);onPaint();}
 function point(e){const d=dimensions();return screenToSource(e.clientX,e.clientY,canvas.getBoundingClientRect(),d.width,d.height);}
 function hit(p){if(!state.selection)return null;const d=dimensions(),b=canvas.getBoundingClientRect();for(const [name,xy] of Object.entries(handles(state.selection))){if(Math.hypot((p.x-xy[0])*b.width/d.width,(p.y-xy[1])*b.height/d.height)<=11)return name;}return inside(p,state.selection,state.shape)?'move':null;}
 function stop(e){e.preventDefault();e.stopImmediatePropagation();}
 function release(){if(state.gesture){try{canvas.releasePointerCapture(state.gesture.id);}catch{}state.gesture=null;}}
 canvas.addEventListener('pointerdown',e=>{
  if(!state.active)return;stop(e);if(state.disabled||e.button!==0||state.gesture)return;
  const p=point(e),kind=hit(p)||'draw';state.pointer=p;state.gesture={id:e.pointerId,start:p,kind,original:state.selection?{...state.selection}:null};
  if(kind==='draw')state.selection=null;canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});changed();
 },true);
 canvas.addEventListener('pointermove',e=>{
  if(!state.active)return;stop(e);if(state.disabled)return;const p=point(e),g=state.gesture;state.pointer=p;
  if(g&&g.id===e.pointerId){const d=dimensions();state.selection=g.kind==='draw'?rectFromDrag(g.start,p,state.shape,d.width,d.height):g.kind==='move'?moveSelection(g.original,p.x-g.start.x,p.y-g.start.y,d.width,d.height):resizeSelection(g.original,g.kind,p,state.shape,d.width,d.height);}
  const h=hit(p);canvas.style.cursor=h==='move'?'move':h?({n:'ns',s:'ns',e:'ew',w:'ew',ne:'nesw',sw:'nesw',nw:'nwse',se:'nwse'}[h]+'-resize'):'crosshair';changed();
 },true);
 canvas.addEventListener('pointerup',e=>{
  if(!state.active)return;stop(e);if(state.gesture&&state.gesture.id===e.pointerId){release();if(!state.selection||state.selection.w<2||state.selection.h<2)state.selection=null;changed();}
 },true);
 canvas.addEventListener('pointercancel',e=>{if(!state.active)return;stop(e);if(state.gesture)state.selection=state.gesture.original;release();changed();},true);
 canvas.addEventListener('pointerleave',()=>{if(state.active&&!state.gesture){state.pointer=null;onPaint();}});
 canvas.addEventListener('keydown',e=>{
  if(!state.active||state.disabled)return;
  if(e.key==='Escape'){stop(e);onExit();return;}if(e.key==='Enter'){stop(e);if(state.selection)onApply();return;}
  if(e.key==='Delete'||e.key==='Backspace'){stop(e);state.selection=null;changed();return;}
  const vectors={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(vectors[e.key]&&state.selection){stop(e);const d=dimensions(),v=vectors[e.key],s=e.shiftKey?10:1;state.selection=moveSelection(state.selection,v[0]*s,v[1]*s,d.width,d.height);changed();}
 });
 function paint(ctx){
  if(!state.active)return false;const d=dimensions(),W=canvas.width,H=canvas.height,sx=W/d.width,sy=H/d.height,ui=W/Math.max(canvas.getBoundingClientRect().width,1),r=state.selection;
  ctx.save();
  if(r){const x=r.x*sx,y=r.y*sy,w=r.w*sx,h=r.h*sy;
   ctx.beginPath();ctx.rect(0,0,W,H);if(state.shape==='circle'){ctx.moveTo(x+w,y+h/2);ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);}else ctx.rect(x,y,w,h);
   ctx.fillStyle='rgba(0,0,0,.60)';ctx.fill('evenodd');
   function boundary(){ctx.beginPath();if(state.shape==='circle')ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);else ctx.rect(x,y,w,h);}
   boundary();ctx.strokeStyle='#111';ctx.lineWidth=4*ui;ctx.stroke();boundary();ctx.strokeStyle='#fff';ctx.lineWidth=2*ui;ctx.stroke();
   ctx.setLineDash([4*ui,4*ui]);ctx.lineWidth=ui;ctx.strokeStyle='rgba(255,255,255,.75)';ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);
   if(state.shape==='rectangle'){ctx.strokeStyle='rgba(255,255,255,.35)';for(const f of [1/3,2/3]){ctx.beginPath();ctx.moveTo(x+w*f,y);ctx.lineTo(x+w*f,y+h);ctx.moveTo(x,y+h*f);ctx.lineTo(x+w,y+h*f);ctx.stroke();}}
   else{ctx.beginPath();ctx.moveTo(x+w/2-8*ui,y+h/2);ctx.lineTo(x+w/2+8*ui,y+h/2);ctx.moveTo(x+w/2,y+h/2-8*ui);ctx.lineTo(x+w/2,y+h/2+8*ui);ctx.stroke();}
   for(const pos of Object.values(handles(r))){ctx.fillStyle='#fff';ctx.fillRect(pos[0]*sx-4*ui,pos[1]*sy-4*ui,8*ui,8*ui);ctx.strokeStyle='#106e69';ctx.lineWidth=1.5*ui;ctx.strokeRect(pos[0]*sx-4*ui,pos[1]*sy-4*ui,8*ui,8*ui);}
  }
  if(state.pointer&&state.guides){const p=state.pointer,x=p.x*sx,y=p.y*sy;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.strokeStyle='rgba(0,0,0,.8)';ctx.lineWidth=3*ui;ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=ui;ctx.stroke();
   const text=`X ${Math.round(p.x)}  Y ${Math.round(p.y)}`;ctx.font=`${12*ui}px system-ui`;const tw=ctx.measureText(text).width+14*ui,bx=clamp(x+12*ui,0,Math.max(0,W-tw)),by=clamp(y+16*ui,20*ui,H-8*ui);ctx.fillStyle='rgba(0,0,0,.85)';ctx.fillRect(bx,by-15*ui,tw,22*ui);ctx.fillStyle='#fff';ctx.fillText(text,bx+7*ui,by);}
  ctx.restore();return true;
 }
 return {state,paint,setActive(active){release();state.active=active;state.pointer=null;canvas.style.cursor=active?'crosshair':'crosshair';canvas.setAttribute('aria-label',active?'Visual crop editor. Drag to draw, drag inside to move, use handles to resize. Arrow keys nudge; Enter applies; Escape exits.':'Drag to select a measurement region');changed();},setShape(shape){if(!['rectangle','circle'].includes(shape))throw Error('Unknown crop shape');state.shape=shape;state.selection=null;release();changed();},clear(){release();state.selection=null;state.pointer=null;changed();},setDisabled(value){state.disabled=value;},setGuides(value){state.guides=value;onPaint();}};
}
