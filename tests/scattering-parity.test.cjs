const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../thispc-glow'),expected=require('./scattering-1.5.1-golden.json');
const app={Pixels:{makeImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)})}};
const context=vm.createContext({window:{YCGlow:app},performance,Float32Array,Float64Array});
for(const file of ['params','quickModes','scattering'])vm.runInContext(fs.readFileSync(path.join(root,'src/glow',file+'.js'),'utf8'),context);
const source=app.Pixels.makeImageData(257,97);
for(let i=0;i<source.data.length;i++)source.data[i]=(i*37+Math.floor(i/29)*13)%256;
for(const [mode,hash]of Object.entries(expected).filter(([mode])=>mode.startsWith('white_'))) {
 const result=app.ScatterAlgorithm.renderPhaseOneCached(source,{...app.GlowQuickModes.paramsFor(mode),mainOpacity:100});
 assert.equal(crypto.createHash('sha256').update(result.bloom.data).digest('hex'),hash,mode+' must retain 1.5.1 rendering quality');
}
console.log('PASS: saved white parameters exactly match the 1.5.1 reference pixels.');
