const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../thispc-glow');
function runtime(dir) {
  const storage = new Map();
  const window = {YCGlow: {Pixels: {makeImageData: (width, height) => ({width, height, data: new Uint8ClampedArray(width * height * 4)})}, StarAlgorithm: {renderPhaseOneCached: () => ({star: true})}}};
  window.localStorage = {getItem:key=>storage.get(key)??null, setItem:(key,value)=>storage.set(key,value)};
  const context = vm.createContext({window, performance});
  let legacyRenderer;
  for (const file of ['params.js', 'quickModes.js', 'glowState.js', 'algorithm.js', 'scattering.js', 'algorithmRouter.js']) {
    const location = path.join(dir, 'src/glow', file);
    if (fs.existsSync(location)) vm.runInContext(fs.readFileSync(location, 'utf8'), context);
    if (file === 'algorithm.js') legacyRenderer = window.YCGlow.GlowAlgorithm;
  }
  return {...window.YCGlow, legacyRenderer};
}
const api = runtime(root);
function image(width, height, sample) {
  const result = api.Pixels.makeImageData(width, height);
  for(let y = 0; y < height; y++) for(let x = 0; x < width; x++) {
    result.data.set([...sample(x,y), 255], (y * width + x) * 4);
  }
  return result;
}
const modes = ['soft_1_8','soft_1_4','soft_1_2','white_1_8','white_1_4','white_1_2'];
const uniform = image(64,64,() => [128,128,128]);
const neutralParams = api.GlowQuickModes.paramsFor('white_1_2');
const flat = api.GlowAlgorithm.renderPhaseOne(uniform, neutralParams).bloom;
assert.equal(Math.max(...flat.data.filter((_,i) => i % 4 !== 3)), 0, 'Uniform gray must not receive a global white veil');
const lamp = image(128,96,(x,y) => Math.hypot(x-64,y-48) < 5 ? [255,255,255] : [8,8,8]);
const original = new Uint8ClampedArray(lamp.data);
function render(params, input = lamp, cache = null) { return api.GlowAlgorithm.renderPhaseOneCached(input, params, cache); }
function level(result,x,y) { return result.bloom.data[(y * result.bloom.width + x) * 4]; }
function energy(result) { let sum=0; for(let i=0;i<result.bloom.data.length;i+=4) sum+=result.bloom.data[i]; return sum; }
// Daylight texture has no clipped highlights; diffusion must still soften its contrast.
const daylight = image(160,96,(x,y) => (Math.floor(x/8)+Math.floor(y/8))%2 ? [155,155,155] : [195,195,195]);
function darkLift(result) {
  let sum=0,count=0;
  for(let pixel=0;pixel<160*96;pixel++) if(daylight.data[pixel*4]===155) {
    sum += (255-155)*result.bloom.data[pixel*4]/255; count++;
  }
  return sum/count;
}
const daylightLifts = modes.map(mode => darkLift(render(api.GlowQuickModes.paramsFor(mode),daylight)));
console.log('Daylight dark-side lift:', Object.fromEntries(modes.map((mode,i)=>[mode,+daylightLifts[i].toFixed(2)])));
assert.ok(daylightLifts[1] >= 3, 'Black 1/4 must visibly soften midtone texture, even without a bright lamp');
assert.ok(daylightLifts[4] >= 6, 'White 1/4 must visibly soften midtone texture, even without a bright lamp');
for(const base of [0,3]) {
  assert.ok(daylightLifts[base+1] >= daylightLifts[base]*1.3, '1/4 must be distinguishable from 1/8');
  assert.ok(daylightLifts[base+2] >= daylightLifts[base+1]*1.3, '1/2 must be distinguishable from 1/4');
}
for(const prefix of ['soft','white']) {
  let previous = 0;
  for(const suffix of ['1_8','1_4','1_2']) {
    const params = api.GlowQuickModes.paramsFor(`${prefix}_${suffix}`);
    assert.equal(params.scatterModel, 1);
    const result = render(params);
    assert.ok(level(result,76,48) > level(result,120,48), 'Halation must fall off with source distance');
    assert.ok(energy(result) > previous, `${prefix}_${suffix}: strength must increase`);
    previous = energy(result);
    for(let i=0;i<result.bloom.data.length;i+=4) {
      assert.ok(Math.abs(result.bloom.data[i]-result.bloom.data[i+1]) <= 1);
      assert.ok(Math.abs(result.bloom.data[i]-result.bloom.data[i+2]) <= 1);
      assert.equal(result.bloom.data[i+3],255);
    }
    console.log(`${prefix}_${suffix}: near=${level(result,76,48)}, far=${level(result,120,48)}, total=${previous}`);
  }
}
const p=api.GlowQuickModes.paramsFor('white_1_4');
const first=render(p), cached=render({...p,saturation:-15},lamp,first.cache), fresh=render({...p,saturation:-15});
assert.deepEqual(cached.bloom.data,fresh.bloom.data);
assert.equal(cached.geometryRebuilt,false);
assert.equal(render(p,lamp,{...first.cache,version:'scatter-v1'}).sourceRebuilt,true,'Reject caches from before the strength correction');
assert.equal(render({...p,radius:p.radius+10},lamp,first.cache).geometryRebuilt,true);
assert.deepEqual(render({...p,mainOpacity:0}).bloom.data.filter((_,i)=>i%4!==3),new Uint8ClampedArray(128*96*3));
assert.deepEqual(lamp.data,original);
assert.equal(api.GlowAlgorithm.renderPhaseOneCached(lamp,{...p,effectMode:1}).star,true);
// Older saved objects omit scatterModel and must keep their existing renderer.
for(const mode of ['soft_1_8','soft_1_4','soft_1_2']) {
  const legacy={...api.GlowQuickModes.paramsFor(mode),scatterModel:0};
  assert.deepEqual(api.GlowAlgorithm.renderPhaseOne(lamp,legacy).bloom.data,api.legacyRenderer.renderPhaseOne(lamp,legacy).bloom.data);
}
const blue=image(128,96,(x,y)=>Math.hypot(x-64,y-48)<5?[60,120,255]:[8,8,8]);
const legacyParams={...api.GlowQuickModes.paramsFor('soft_1_8'),scatterModel:0};
const legacyState=api.GlowState.createState(legacyParams,{activeMode:'soft_1_8'});
assert.equal(legacyState.currentParams.scatterModel,0);
api.GlowState.saveGlobalState(legacyState);
assert.equal(api.GlowState.stateForNewGlow().currentParams.scatterModel,1,'New factory creations must adopt the upgraded model');
api.GlowState.saveGlobalState(api.GlowState.createState(legacyParams,{activeMode:'custom'}));
assert.equal(api.GlowState.stateForNewGlow().currentParams.scatterModel,0,'Preserve saved custom parameters');
const blueHalo=render(p,blue).bloom.data;
const offset=(48*128+76)*4;
assert.ok(blueHalo[offset+2] > blueHalo[offset], 'Blue light must not acquire a red/yellow halo');
const black=image(64,64,()=>[0,0,0]);
assert.equal(energy(render(p,black)),0);
assert.equal(energy(render(p,image(1,1,()=>[128,128,128]))),0);
const edge=image(128,96,(x,y)=>x<5&&y<5?[255,255,255]:[8,8,8]);
const edgeResult=render(p,edge);
assert.ok(level(edgeResult,8,8)>level(edgeResult,120,90), 'Frame edges must not introduce uniform haze');
const invalid={width:2,height:2,data:new Uint8ClampedArray(3)};
assert.throws(()=>render(p,invalid),/image|pixel|图像|像素/i);
console.log('PASS: local falloff, flat fields, neutral color, grade progression, source immutability, legacy compatibility, cache, zero strength, validation.');
