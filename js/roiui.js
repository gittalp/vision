import {screenToSource,rectFromDrag} from './cropui.js';
import {regionBounds,regionPredicate,validateRegion,paintRegion} from './selections.js';
export function createRegionEditor(canvas,{dimensions,blocked,onChange,onFinish,onPaint}){
 const state={shape:'rectangle',region:null,points:[],drawing:false,gesture:null,hover:null};
 const point=e=>{const d=dimensions();return screenToSource(e.clientX,e.clientY,canvas.getBoundingClientRect(),d.width,d.height);};
 const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
 function notify(){onChange(state.region,state);onPaint();}
 function finish(){if(!state.drawing)return;const d=dimensions(),r=validateRegion({type:'polygon',points:state.points},d.width,d.height);state.region=r;state.drawing=false;state.points=[];notify();onFinish(r);}
 function hitVertex(p){if(state.region?.type!=='polygon')return -1;const b=canvas.getBoundingClientRect(),d=dimensions();return state.region.points.findIndex(q=>Math.hypot((p.x-q.x)*b.width/d.width,(p.y-q.y)*b.height/d.height)<10);}
 canvas.addEventListener('pointerdown',e=>{
  if(blocked()||e.button!==0)return;stop(e);canvas.focus({preventScroll:true});const p=point(e);state.hover=p;
  if(state.shape==='polygon'&&state.drawing){
   const d=dimensions(),box=canvas.getBoundingClientRect(),a=state.points[0];if(a&&state.points.length>=3&&Math.hypot((p.x-a.x)*box.width/d.width,(p.y-a.y)*box.height/d.height)<10){try{finish();}catch(err){onFinish(null,err);}return;}
   if(e.detail>=2){try{finish();}catch(err){onFinish(null,err);}return;}state.points.push(p);notify();return;
  }
  const vertex=hitVertex(p),inside=state.region&&regionPredicate(state.region)(p.x,p.y);
  if(vertex>=0||inside){state.gesture={id:e.pointerId,mode:vertex>=0?'vertex':'move',vertex,start:p,original:structuredClone(state.region)};canvas.setPointerCapture(e.pointerId);return;}
  state.region=null;
  if(state.shape==='polygon'){state.drawing=true;state.points=[p];notify();return;}
  state.gesture={id:e.pointerId,mode:'draw',start:p};canvas.setPointerCapture(e.pointerId);notify();
 });
 canvas.addEventListener('pointermove',e=>{
  if(blocked())return;const p=point(e),g=state.gesture;state.hover=p;
  if(state.drawing){stop(e);onPaint();return;}if(!g)return;stop(e);const d=dimensions();
  if(g.mode==='draw'){const b=rectFromDrag(g.start,p,state.shape,d.width,d.height);state.region=state.shape==='circle'?{type:'circle',cx:b.x+b.w/2,cy:b.y+b.h/2,radius:b.w/2}:{type:'rectangle',...b};}
  else if(g.mode==='vertex'){state.region=structuredClone(g.original);state.region.points[g.vertex]=p;}
  else{const b=regionBounds(g.original,d.width,d.height),dx=Math.max(-b.x,Math.min(d.width-b.x-b.w,p.x-g.start.x)),dy=Math.max(-b.y,Math.min(d.height-b.y-b.h,p.y-g.start.y));state.region=structuredClone(g.original);if(state.region.type==='polygon')state.region.points=state.region.points.map(a=>({x:a.x+dx,y:a.y+dy}));else if(state.region.type==='circle'){state.region.cx+=dx;state.region.cy+=dy;}else{state.region.x+=dx;state.region.y+=dy;}}
  notify();
 });
 canvas.addEventListener('pointerup',e=>{if(blocked()||!state.gesture)return;stop(e);const g=state.gesture;state.gesture=null;try{canvas.releasePointerCapture(e.pointerId);}catch{}const d=dimensions();try{state.region=validateRegion(state.region,d.width,d.height);notify();onFinish(state.region);}catch(err){state.region=g.original||null;notify();if(g.mode!=='draw')onFinish(null,err);}});
 canvas.addEventListener('pointercancel',()=>{if(state.gesture){state.region=state.gesture.original||null;state.gesture=null;notify();}});
 canvas.addEventListener('keydown',e=>{
  if(blocked())return;
  if(e.key==='Escape'){stop(e);state.drawing=false;state.points=[];state.gesture=null;notify();}
  if(e.key==='Enter'&&state.drawing){stop(e);try{finish();}catch(err){onFinish(null,err);}}
  if((e.key==='Backspace'||e.key==='Delete')&&state.drawing){stop(e);state.points.pop();notify();}
 });
 function paint(ctx){const d=dimensions(),sx=canvas.width/d.width,sy=canvas.height/d.height;
  if(state.region)paintRegion(ctx,state.region,d.width,d.height,{fill:true,label:'Selection'});
  if(state.region?.type==='polygon'){ctx.save();ctx.fillStyle='#ffffff';ctx.strokeStyle='#116e69';for(const p of state.region.points){ctx.beginPath();ctx.arc(p.x*sx,p.y*sy,4,0,Math.PI*2);ctx.fill();ctx.stroke();}ctx.restore();}
  if(state.drawing&&state.points.length){ctx.save();ctx.strokeStyle='#fff4a9';ctx.lineWidth=2;ctx.beginPath();state.points.forEach((p,i)=>i?ctx.lineTo(p.x*sx,p.y*sy):ctx.moveTo(p.x*sx,p.y*sy));if(state.hover)ctx.lineTo(state.hover.x*sx,state.hover.y*sy);ctx.stroke();for(const p of state.points){ctx.beginPath();ctx.arc(p.x*sx,p.y*sy,4,0,Math.PI*2);ctx.fillStyle='#fff4a9';ctx.fill();}ctx.restore();}
 }
 return {state,paint,finish,clear(){state.region=null;state.points=[];state.drawing=false;state.gesture=null;notify();},setShape(shape){if(!['rectangle','circle','polygon'].includes(shape))throw Error('Unknown selection shape');state.shape=shape;this.clear();},setRegion(r){state.region=r;state.drawing=false;state.points=[];notify();}};
}
