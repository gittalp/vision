/* Optional task-reference adapter. The evalglare engine and the existing
 * fixed-threshold preparation are unchanged. The selected area sets a scalar
 * detection threshold; it does not crop the input or rotate the gaze.
 */
export function taskThreshold(record, measurement, multiplier=5) {
 if(!record?.id||!record.region)throw Error('Save a named region, then select it as the glare task.');
 if(!Number.isFinite(multiplier)||multiplier<=0||multiplier>100)throw Error('Use a positive task multiplier no greater than 100. Five is the published task-method starting value, not a universal optimum.');
 const m=measurement,mean=m?.solidAngleWeightedMean;
 if(!m?.count||!(m.solidAngleSteradians>0)||!Number.isFinite(mean)||mean<=0)throw Error('The task needs valid source pixels, confirmed angular geometry and a positive solid-angle-weighted luminance.');
 if(m.negativeFraction>0)throw Error('The task contains negative luminance; choose a valid task region.');
 const threshold=mean*multiplier;
 if(!Number.isFinite(threshold)||threshold>1e9)throw Error('Task-derived threshold is outside the supported engine-argument range.');
 if(threshold<=100)throw Error(`Task threshold is ${threshold.toPrecision(6)} cd/m2. This unmodified fixed-threshold adapter requires more than 100 cd/m2: evalglare interprets -b values of 100 or less as multipliers. Nothing was clamped or recalibrated. A lower threshold needs the original engine circular -t method, which this polygon adapter does not implement.`);
 return {kind:'named-region-task-threshold',regionId:record.id,name:String(record.name||record.id),region:structuredClone(record.region),field:record.field?structuredClone(record.field):null,multiplier,meanLuminance:mean,equalPixelMean:m.mean,solidAngleSteradians:m.solidAngleSteradians,validPixels:m.count,threshold,units:'cd/m2',weighting:'sum(L_i * solid_angle_i) / sum(solid_angle_i); no cosine weighting',sampling:m.sampling||'native source pixels at pixel centers',engineMethod:'Application-derived scalar threshold passed as -b > 100. Not native circular -t, not a detection mask, and not a claim of validated task-shape equivalence.',scope:'Saved shape and its saved viewing-field intersection; target/background subtraction is not applied. The complete prepared glare view is still evaluated.',gazeChanged:false};
}
export function taskRecordFingerprint(record,multiplier) {
 return JSON.stringify(record?[record.id,record.region,record.field,record.measurement?.solidAngleWeightedMean,record.measurement?.solidAngleSteradians,record.measurement?.count,multiplier]:null);
}
