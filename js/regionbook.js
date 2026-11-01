/* Named region records use immutable source-coordinate shapes and explicit scope.
 * No display pixels or annotation colors participate in any measurement.
 */
import {validateRegion,containsRegion} from './selections.js';
import {measureRegion,targetSurround} from './regionstats.js';
import {pairContrast} from './math.js';
export function emptyRegionBook(){return {items:[],nextId:1,A:null,B:null,autoSubtract:true};}
export function regionAppearance(name,color,fallback){
 const text=String(name||fallback).trim().slice(0,100)||fallback;
 if(!/^#[0-9a-f]{6}$/i.test(color||''))throw Error('Choose a six-digit region color');
 return {name:text,color:color.toLowerCase()};
}
export function fieldScopeKey(field){if(!field)return 'source';const keys=['type','bandHeight','coneDiameter','upper','lower','yaw','pitch','roll'];return JSON.stringify(keys.map(k=>[k,field[k]??null]));}
export function appendRegion(book,frame,shape,{name='',color='#17a88d',field=null,role=null,mask=null,scale=1,geometry=null}={}){
 const region=validateRegion(shape,frame.width,frame.height),id='R'+book.nextId,appearance=regionAppearance(name,color,`Region ${book.nextId}`),measurement=measureRegion(frame,region,{mask,scale,geometry,field});
 if(!measurement.count)throw Error('No valid source pixels in this region and scope');
 const record={id,...appearance,region,field:field?structuredClone(field):null,measurement,visible:true};
 const out={...book,nextId:book.nextId+1,items:[...book.items,record]};if(role==='A'||role==='B')out[role]=id;
 return {book:out,record};
}
export function compareRegionBook(book,frame,options={}){
 const A=book.items.find(r=>r.id===book.A),B=book.items.find(r=>r.id===book.B),out={AId:book.A,BId:book.B,autoSubtract:book.autoSubtract,A:A?{...A.measurement,name:A.name,id:A.id}:null,B:B?{...B.measurement,name:B.name,id:B.id}:null,subtracted:false,contrast:null,definition:'Choose target A and background B.'};
 if(!A||!B)return out;
 if(A.id===B.id){out.definition='A and B must be different saved regions.';return out;}
 if(fieldScopeKey(A.field)!==fieldScopeKey(B.field)){out.definition='A and B have different measurement scopes. Save both using the same viewing field, or both without field restriction.';return out;}
 if(book.autoSubtract&&containsRegion(B.region,A.region,frame.width,frame.height)){
  const p=targetSurround(frame,B.region,A.region,{...options,field:A.field});out.A={...p.A,name:A.name,id:A.id};out.B={...p.B,name:B.name,id:B.id};out.subtracted=true;out.definition=`B = ${B.name} minus ${A.name} (source-pixel set difference).`;
  if(!p.B.count){out.definition='The enclosing region leaves no background pixels after removing A.';return out;}
 }else out.definition=book.autoSubtract?'B is used as drawn; it does not enclose all of A.':'B is used as drawn; automatic target subtraction is off.';
 out.contrast=pairContrast(out.A.mean,out.B.mean);return out;
}
export function refreshRegionBook(book,frame,options={}){return {...book,items:book.items.map(r=>({...r,measurement:measureRegion(frame,r.region,{...options,field:r.field})}))};}
export function csvCell(value){const s=value===null||value===undefined?'':String(value),safe=typeof value==='string'&&/^[=+\-@\t\r]/.test(s)?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"';}
export function regionBookCSV(book,comparison,units){
 const rows=[['id','name','color','role','scope','region_type','unit','count','mean','median','minimum','maximum','p05','p95','sd','solid_angle_sr','solid_angle_weighted_mean','definition']];
 for(const r of book.items){const role=r.id===book.A?'A':r.id===book.B?'B':'',m=role==='B'&&comparison?.subtracted?comparison.B:r.measurement;rows.push([r.id,r.name,r.color,role,r.field?.type||'source',m.region?.type||r.region.type,units,m.count,m.mean,m.median,m.minimum,m.maximum,m.p05,m.p95,m.sd,m.solidAngleSteradians,m.solidAngleWeightedMean,role==='B'&&comparison?.subtracted?comparison.definition:'Selected source pixels']);}
 return rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
}
