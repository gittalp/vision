/* Configurable visual-field shapes on unit rays, not circles in image pixels.
 * These reference envelopes and synthetic scotomata are not perimetry data.
 */
import {angularBasis,rayInBasis,guthAngularRadius,DEGREE} from './angles.js';
function smooth(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
export function fieldLossParameters(p={}){
 const q={peripheralShape:'guth-both',retainedField:30,irregularity:.25,elongation:1.35,spotOffset:0,growthDirection:0,directionalGrowth:.25,...p};
 if(!['guth-both','guth-total','circle'].includes(q.peripheralShape))throw Error('Unknown peripheral field shape');
 if(!Number.isFinite(q.retainedField)||q.retainedField<=0||q.retainedField>100)throw Error('Retained angular field must be >0 and <=100 percent');
 for(const key of ['irregularity','directionalGrowth'])if(!Number.isFinite(q[key])||q[key]<0||q[key]>1)throw Error(key+' must be in [0,1]');
 if(!Number.isFinite(q.elongation)||q.elongation<1||q.elongation>4||!Number.isFinite(q.spotOffset)||q.spotOffset<0||q.spotOffset>60||!Number.isFinite(q.growthDirection)||Math.abs(q.growthDirection)>360)throw Error('Invalid central-loss shape settings');return q;
}
export function makePeripheralLoss(center,parameters){const p=fieldLossParameters(parameters),b=angularBasis(center);
 return ray=>{const r=rayInBasis(ray,b),theta=Math.atan2(Math.hypot(r[0],r[1]),r[2])/DEGREE,meridian=Math.atan2(Math.abs(r[0]),-r[1])/DEGREE;
 const radius=p.peripheralShape==='circle'?p.diameter/2:guthAngularRadius(meridian,p.peripheralShape)*p.retainedField/100;
 return smooth(radius*.9,radius*1.1,theta);
 };
}
export function makeCentralLoss(center,parameters){const p=fieldLossParameters(parameters),initial=angularBasis(center),d=p.growthDirection*DEGREE,t=p.spotOffset*DEGREE;
 const shifted=[0,1,2].map(i=>Math.cos(t)*initial.forward[i]+Math.sin(t)*(Math.cos(d)*initial.right[i]-Math.sin(d)*initial.down[i])),b=angularBasis(shifted);
 return ray=>{const r=rayInBasis(ray,b),theta=Math.atan2(Math.hypot(r[0],r[1]),r[2])/DEGREE,phi=Math.atan2(-r[1],r[0]),a=phi-d;
  const R=p.diameter/2,ell=1/Math.sqrt(Math.cos(a)**2/(p.elongation**2)+Math.sin(a)**2),wav=1+p.irregularity*(.45*Math.sin(3*a+.2)+.3*Math.sin(5*a+1.1)+.2*Math.cos(7*a-.4)),grow=1+p.directionalGrowth*(1+Math.cos(a))/2,radius=R*ell*wav*grow;
  return 1-smooth(radius*.80,radius*1.08,theta);
 };
}
