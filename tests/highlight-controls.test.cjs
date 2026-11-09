const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../thispc-glow');
const window={YCGlow:{Pixels:{makeImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)})}}};
const context=vm.createContext({window,performance});
for(const file of ['params.js','quickModes.js','algorithm.js','scattering.js','algorithmRouter.js']) vm.runInContext(fs.readFileSync(path.join(root,'src/glow',file),'utf8'),context);
const api=window.YCGlow, params=api.GlowQuickModes.paramsFor('soft_1_4');
function image(sample) {
  const result=api.Pixels.makeImageData(96,64);
  for(let y=0;y<64;y++) for(let x=0;x<96;x++) result.data.set([...sample(x,y),255],(y*96+x)*4);
  return result;
}
const lamp=image((x,y)=>Math.hypot(x-48,y-32)<7?[255,255,255]:[8,8,8]);
const ramp=image(x=>[x*255/95,x*255/95,x*255/95]);
const render=(source,overrides={},cache=null)=>api.GlowAlgorithm.renderPhaseOneCached(source,{...params,...overrides},cache);
function changed(a,b) { let count=0; for(let i=0;i<a.length;i+=4) if(a[i]!==b[i] || a[i+1]!==b[i+1] || a[i+2]!==b[i+2]) count++; return count; }
const dry=render(lamp,{drCompression:0}), compressed=render(lamp,{drCompression:160});
const narrow=render(ramp,{threshold:.24}), broad=render(ramp,{threshold:.35});
const changes={drBloomPixels:changed(dry.bloom.data,compressed.bloom.data),rangeMaskPixels:changed(narrow.xray.data,broad.xray.data)};
console.log('Highlight control response:',changes);
assert.ok(changes.drBloomPixels>0,'The high-light DR control must change a bright source halo, not only shift its cutoff');
assert.ok(changes.rangeMaskPixels>0,'Emission range must keep changing the highlight mask above 24');
function energy(data) { let sum=0; for(let i=0;i<data.length;i+=4) sum+=data[i]; return sum; }
assert.ok(energy(compressed.bloom.data)>energy(dry.bloom.data)*1.5,'Increasing haze density must visibly strengthen the white-source halo');
for(const key of ['threshold','drCompression']) {
  const values=key==='threshold'?[.01,.05,.15,.24,.30,.35]:[0,20,40,80,120,160];
  let previous=null;
  for(const value of values) {
    const result=render(ramp,{[key]:value},previous?.cache);
    const fresh=render(ramp,{[key]:value});
    assert.deepEqual(result.bloom.data,fresh.bloom.data,'Slider changes must invalidate stale cached output');
    if(previous) {
      assert.ok(changed(previous.xray.data,result.xray.data)>0,`${key} ${value}: highlight recognition must respond`);
      assert.ok(changed(previous.bloom.data,result.bloom.data)>0,`${key} ${value}: output must respond`);
      assert.ok(energy(result.xray.data)>energy(previous.xray.data),'Larger controls must broaden highlight recognition');
      assert.equal(result.sourceRebuilt,true);
    }
    previous=result;
  }
}
assert.equal(render(lamp,{}, {...dry.cache,version:'scatter-v1.1'}).sourceRebuilt,true,'Discard caches from before the control correction');
console.log('PASS: both highlight controls affect source recognition and bloom; full slider range, cached/fresh parity and white-source density.');
