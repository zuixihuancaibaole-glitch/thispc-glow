const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../thispc-glow/src/photoshop');
let depth=16,conversions=0,calls=[],disposed=0,failRead=false;
const doc={id:1,get bitsPerChannel(){return depth;},set bitsPerChannel(v){conversions++;depth=v;}};
const photoshop={app:{activeDocument:doc},constants:{BitsPerChannelType:{EIGHT:8,SIXTEEN:16}},imaging:{
 async getPixels(options){calls.push(options);if(failRead)throw new Error('read failure');return {imageData:{width:2,height:1,components:3,componentSize:8,getData:async()=>new Uint8Array([12,128,255,0,30,60]),dispose(){disposed++;}}};}
}};
const app={Errors:{UserFacingError:Error},Logger:{info(){},warn(){},error(){}},Batch:{requirePhotoshop:()=>photoshop,runModal:async(name,fn)=>fn(),run:async commands=>commands.map(()=>({depth}))}};
const context=vm.createContext({window:{YCGlow:app},Uint8Array,Uint8ClampedArray,Uint16Array,Int16Array,Float32Array,Float64Array,ArrayBuffer});
for(const file of ['documents.js','pixels.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
(async()=>{
 await app.Documents.withPreviewSource({id:1,bitDepth:16},async()=>{
   const result=await app.Pixels.readDocumentComposite({documentId:1,width:6000,height:4000,targetWidth:2,targetHeight:1});
   assert.deepEqual([...result.data],[12,128,255,255,0,30,60,255]);
 });
 assert.equal(conversions,0,'Reading a small preview must never convert the 16-bit source document');
 assert.equal(depth,16);assert.equal(disposed,1);
 assert.equal(calls[0].componentSize,8,'Request converted preview bytes from Imaging API');
 let writes=0;photoshop.imaging.createImageDataFromBuffer=async(data,options)=>{assert.equal(options.colorProfile,'sRGB IEC61966-2.1','Declare source profile for cross-depth writes');return {dispose(){data.fill(0);disposed++;}};};photoshop.imaging.putPixels=async()=>{writes++;};
 const cached=new Uint8Array([1,2,3,255]);await app.Pixels.writeLayerPixels(1,2,{width:1,height:1,data:cached});assert.deepEqual([...cached],[1,2,3,255],'Disposing native data must not invalidate cached pixels');assert.equal(writes,1);assert.equal(disposed,2);
 failRead=true;calls=[];
 await assert.rejects(()=>app.Pixels.readDocumentComposite({documentId:1,width:6000,height:4000,targetWidth:1200,targetHeight:800}));
 assert.ok(calls.every(options=>options.targetSize),'A failed bounded read must never fall back to full-resolution allocation');
 console.log('PASS: original bit depth untouched, bounded Imaging API requests and native image disposal.');
})().catch(error=>{console.error(error);process.exitCode=1;});
