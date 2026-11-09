const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../thispc-glow');
const store = new Map();
const starResult = {star: true};
const window = { localStorage: {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
}, YCGlow: {
  Pixels: {makeImageData: (width, height) => ({width, height, data: new Uint8ClampedArray(width * height * 4)})},
  StarAlgorithm: {renderPhaseOneCached: () => starResult},
} };
const context = vm.createContext({window, performance});
const load = file => vm.runInContext(fs.readFileSync(path.join(root, 'src/glow', file), 'utf8'), context);
load('params.js'); load('quickModes.js'); load('glowState.js'); load('algorithm.js');
const api = window.YCGlow;
const soft = api.GlowAlgorithm;
load('scattering.js');
load('algorithmRouter.js');
const whiteModes = ['white_1_8', 'white_1_4', 'white_1_2'];
for (const mode of whiteModes) assert.ok(api.GlowQuickModes.isQuickMode(mode), `${mode} is missing`);

function fixture(color = [255, 255, 255]) {
  const image = api.Pixels.makeImageData(96, 64);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const light = 0.02 + 0.98 * Math.exp(-((x - 64) ** 2 + (y - 32) ** 2) / 180);
    const offset = (y * image.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) image.data[offset + channel] = color[channel] * light;
    image.data[offset + 3] = 255;
  }
  return image;
}
const source = fixture();
const originalPixels = new Uint8ClampedArray(source.data);
let previousShadow = 0;
for (const mode of whiteModes) {
  const params = api.GlowQuickModes.paramsFor(mode);
  assert.equal(params.hue, 0);
  const result = api.GlowAlgorithm.renderPhaseOneCached(source, params);
  let shadow = 0;
  for (let i = 0; i < result.bloom.data.length; i += 4) {
    const data = result.bloom.data;
    assert.equal(data[i + 3], 255);
    assert.ok(Math.abs(data[i] - data[i + 1]) <= 1, 'White light must not acquire a red tint');
    assert.ok(Math.abs(data[i] - data[i + 2]) <= 1, 'White light must not acquire a yellow tint');
    if ((i / 4) % source.width < 20) shadow += data[i];
  }
  shadow /= 20 * source.height;
  assert.ok(shadow > previousShadow, `${mode}: shadow lift must increase with strength`);
  previousShadow = shadow;
  const state = api.GlowState.selectMode(api.GlowState.createState(), mode);
  const restored = api.GlowState.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.activeMode, mode);
  assert.equal(restored.currentParams.whiteMist, params.whiteMist);
  assert.equal(restored.currentParams.scatterModel, 1);
  api.GlowState.saveGlobalState(state);
  assert.equal(api.GlowState.stateForNewGlow().currentParams.whiteMist, params.whiteMist);
  const custom = api.GlowState.updateParams(state, {...params, radius: params.radius + 1}, {activeMode: 'custom'});
  assert.equal(custom.currentParams.whiteMist, params.whiteMist);
  const blackState = api.GlowState.selectMode(state, 'soft_1_4');
  assert.equal(blackState.currentParams.whiteMist, 0, 'Switching back to black must remove white haze');
  console.log(`${mode}: shadow lift=${shadow.toFixed(2)}, state/custom/save round-trip passed.`);
}
assert.deepEqual(source.data, originalPixels, 'Do not change the source image');
assert.equal(api.GlowParams.normalizeParams({}).whiteMist, 0, 'Older saved parameters default to black');
for (const mode of ['soft_1_8', 'soft_1_4', 'soft_1_2']) {
  const params = {...api.GlowQuickModes.paramsFor(mode), scatterModel: 0};
  const before = soft.renderPhaseOne(source, params);
  const after = api.GlowAlgorithm.renderPhaseOne(source, params);
  assert.deepEqual(after.bloom.data, before.bloom.data, `${mode}: black output changed`);
}
assert.equal(api.GlowAlgorithm.renderPhaseOneCached(source, {effectMode: 1, whiteMist: 50}), starResult);
const base = api.GlowQuickModes.paramsFor('white_1_4');
const first = api.GlowAlgorithm.renderPhaseOneCached(source, base);
const cached = api.GlowAlgorithm.renderPhaseOneCached(source, {...base, whiteMist: 50}, first.cache);
const fresh = api.GlowAlgorithm.renderPhaseOneCached(source, {...base, whiteMist: 50});
assert.deepEqual(cached.bloom.data, fresh.bloom.data, 'Cached preview must match final rendering');
const off = api.GlowAlgorithm.renderPhaseOneCached(source, {...base, mainOpacity: 0, coreOpacity: 0});
for (let i = 0; i < off.bloom.data.length; i += 4) assert.equal(off.bloom.data[i] + off.bloom.data[i + 1] + off.bloom.data[i + 2], 0);
const dark = fixture([0, 0, 0]);
const darkResult = api.GlowAlgorithm.renderPhaseOne(dark, base);
for (let i = 0; i < darkResult.bloom.data.length; i += 4) assert.equal(darkResult.bloom.data[i], 0, 'Do not add fog to an unlit black frame');
console.log('PASS: black compatibility, neutral color, progressive strength, cache parity, zero strength, star isolation.');
