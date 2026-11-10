const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app={Pixels:{makeImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)})}};
const context=vm.createContext({window:{YCGlow:app},performance,setTimeout,Uint16Array,Uint8Array,Float32Array,Float64Array});
for(const name of ['params','quickModes','scattering','tiledScattering'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../thispc-glow/src/glow',name+'.js'),'utf8'),context);
const width=96,height=72,source=new Uint16Array(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,v=Math.hypot(x-48,y-36)<5?56000:12000;source.set([v,v,v,65535],i);}
let opened=0,closed=0,peakBytes=0;
function createStore(){opened++;const map=new Map();return {async get(i){return new Float32Array(map.get(i));},async set(i,data){peakBytes=Math.max(peakBytes,data.byteLength);map.set(i,new Float32Array(data));},async close(){closed++;map.clear();}};}
function readRegion(box){const data=new Uint16Array(box.width*box.height*4);for(let y=0;y<box.height;y++)data.set(source.subarray(((box.top+y)*width+box.left)*4,((box.top+y)*width+box.left+box.width)*4),y*box.width*4);return data;}
async function render(model,bounds=null,isCancelled){const output=new Uint16Array(source.length);const stats=await app.TiledScattering.render({width,height,params:{...app.GlowQuickModes.paramsFor('soft_1_4'),scatterModel:model,radius:3,iterations:2},scale:1,bounds,readRegion,createStore,isCancelled,writeRegion:box=>{for(let y=0;y<box.height;y++)output.set(box.data.subarray(y*box.width*4,(y+1)*box.width*4),((box.top+y)*width+box.left)*4);}});return {output,stats};}
(async()=>{
 const all=await render(1),local=await render(1,{left:40,top:28,right:56,bottom:44});
 for(let y=28;y<44;y++)for(let x=40;x<56;x++)for(let c=0;c<3;c++){const i=(y*width+x)*4+c;assert.ok(Math.abs(all.output[i]-local.output[i])<=1,'ROI includes all influencing light and matches full-frame output');}
 assert.ok(local.stats.pixels<width*height,'Small masks must reduce processed area');
 const optical=await render(2),center=(36*width+48)*4,near=(36*width+55)*4;
 assert.ok(optical.output[center]<source[center],'Optical scattering lowers the source peak');
 assert.ok(optical.output[near]>source[near],'Optical scattering redistributes light into neighboring pixels');
 const decode=v=>{v/=65535;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
 let before=0,after=0;for(let i=0;i<source.length;i+=4){before+=decode(source[i]);after+=decode(optical.output[i]);}
 assert.ok(Math.abs(after-before)/before<.001,'Neutral unclipped fixture conserves linear-light energy');
 let checks=0;await assert.rejects(()=>render(1,null,()=>++checks>4),/取消/);
 assert.equal(opened,closed,'Release all intermediate stores on success and cancellation');
 assert.ok(peakBytes<=262144*3*4,'Strip buffers have a fixed upper bound');
 console.log('PASS: original-resolution strips, bounded buffers, ROI/whole-image parity, optical peak/halo/energy and cancellation cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
