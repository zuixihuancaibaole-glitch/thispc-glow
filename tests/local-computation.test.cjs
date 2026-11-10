const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const app={Pixels:{makeImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)})},GlowAlgorithm:{}};
const context=vm.createContext({window:{YCGlow:app},performance,setTimeout,Float32Array,Float64Array,Uint8ClampedArray});
for(const name of ['params','quickModes','scattering','tiledScattering','algorithmRouter'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../thispc-glow/src/glow',name+'.js'),'utf8'),context);
(async()=>{
 const source=app.Pixels.makeImageData(400,300);for(let i=0;i<source.data.length;i+=4)source.data.set([120+(i%47),150+(i%31),170+(i%17),255],i);
 // A source outside the mask must still affect its edge.
 for(let y=140;y<145;y++)for(let x=187;x<192;x++)source.data.set([255,255,255,255],(y*400+x)*4);
 const bounds={left:195,top:140,right:215,bottom:160};
 for(const model of [1,2]){
  const params={...app.GlowQuickModes.paramsFor('soft_1_4'),radius:3,iterations:2,scatterModel:model};
  const full=await app.GlowAlgorithm.renderPhaseOneCachedAsync(source,params),local=await app.GlowAlgorithm.renderPhaseOneCachedAsync(source,params,null,{bounds});
  assert.ok(local.processedPixels<400*300/10);
  for(let y=140;y<160;y++)for(let x=195;x<215;x++)for(let c=0;c<3;c++){const i=(y*400+x)*4+c;assert.ok(Math.abs(local.bloom.data[i]-full.bloom.data[i])<=1);}
  const cached=await app.GlowAlgorithm.renderPhaseOneCachedAsync(source,{...params,saturation:10},local.cache,{bounds});
  const fresh=await app.GlowAlgorithm.renderPhaseOneCachedAsync(source,{...params,saturation:10},null,{bounds});
  assert.deepEqual(cached.bloom.data,fresh.bloom.data);assert.equal(cached.geometryRebuilt,false);
 }
 console.log('PASS: local/whole-frame pixel parity, outside-source influence, reduced work and cache parity in both scatter models.');
})().catch(e=>{console.error(e);process.exitCode=1;});
