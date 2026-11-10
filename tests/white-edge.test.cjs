const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app={Pixels:{makeImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)})}};
const ctx=vm.createContext({window:{YCGlow:app},performance,setTimeout,Uint16Array,Float32Array,Float64Array});
for(const name of ['params','quickModes','scattering','tiledScattering'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../thispc-glow/src/glow',name+'.js'),'utf8'),ctx);
const params={...app.GlowQuickModes.paramsFor('white_1_2'),scatterModel:2};
function step(bright,dark){const source=app.Pixels.makeImageData(160,8);for(let y=0;y<8;y++)for(let x=0;x<160;x++){const v=x<80?bright:dark;source.data.set([v,v,v,255],(y*160+x)*4);}return source;}
(async()=>{
 let worst=0;for(let bright=110;bright<=230;bright+=20)for(let dark=70;dark<bright;dark+=20){const source=step(bright,dark),result=app.ScatterAlgorithm.renderPhaseOneCached(source,params);for(let x=1;x<160;x++)worst=Math.max(worst,result.bloom.data[x*4]-result.bloom.data[(x-1)*4]);}
 assert.ok(worst<=1,'Strong white mist must not reverse a monotone landscape edge into a narrow bright outline; found '+worst);
 const source=step(190,150),expected=app.ScatterAlgorithm.renderPhaseOneCached(source,params).bloom.data,output=new Uint16Array(source.data.length);
 await app.TiledScattering.render({width:160,height:8,scale:1,params,createStore:async()=>{const chunks=new Map();return {get:async i=>chunks.get(i),set:async(i,data)=>chunks.set(i,new Float32Array(data)),close:async()=>chunks.clear()};},readRegion:async box=>{const data=new Uint16Array(box.width*box.height*4);for(let y=0;y<box.height;y++)for(let x=0;x<box.width;x++)for(let c=0;c<4;c++)data[(y*box.width+x)*4+c]=source.data[((y+box.top)*160+x+box.left)*4+c]*257;return data;},writeRegion:async box=>{for(let y=0;y<box.height;y++)output.set(box.data.subarray(y*box.width*4,(y+1)*box.width*4),((box.top+y)*160+box.left)*4);}});
 for(let i=0;i<expected.length;i++)assert.ok(Math.abs(output[i]/257-expected[i])<=1,'Native-depth output and preview use the same smooth edge response');
 console.log('PASS: strong-white landscape edges stay monotone across a luminance sweep; 16-bit strip/preview parity. Maximum reversal:',worst);
})().catch(e=>{console.error(e);process.exitCode=1;});
