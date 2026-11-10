const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app={Pixels:{makeImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)})}};
const context=vm.createContext({window:{YCGlow:app},performance,setTimeout,Float32Array,Float64Array,Uint8Array,Uint8ClampedArray});
const root=path.resolve(__dirname,'../thispc-glow/src/glow');
for(const name of ['params','quickModes','renderScheduler','algorithm','scattering','algorithmRouter'])vm.runInContext(fs.readFileSync(path.join(root,name+'.js'),'utf8'),context);
(async()=>{
 const source=app.Pixels.makeImageData(256,192);
 for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
  const i=(y*source.width+x)*4,v=Math.hypot(x-128,y-96)<8?255:20;
  source.data.set([v,v,v,255],i);
 }
 for(const params of [{scatterModel:0,effectMode:0},{scatterModel:0,effectMode:0,whiteMist:50}]){
  let delivered=false;const timer=setTimeout(()=>delivered=true,0);
  const result=await app.GlowAlgorithm.renderPhaseOneCachedAsync(source,params);
  clearTimeout(timer);assert.ok(delivered,'Old models must process UI events during computation');
  const sync=app.GlowAlgorithm.renderPhaseOneCached(source,params);
  assert.deepEqual(result.bloom.data,sync.bloom.data);assert.deepEqual(result.xray.data,sync.xray.data);
  let checks=0;
  await assert.rejects(()=>app.GlowAlgorithm.renderPhaseOneCachedAsync(source,params,null,{isStale:()=>++checks>3}),/过期/);
 }
 console.log('PASS: legacy UI events, exact synchronous output parity and cooperative cancellation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
