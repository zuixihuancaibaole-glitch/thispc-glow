const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../thispc-glow');
let rasterizations=0,pngWrites=0,puts=0,disposals=0,failPut=false,history=[];
const layers=[{id:1,name:'YC_Impressionism',isGroup:true,kind:'group',childrenCount:3,parentId:null},
 {id:2,name:'YC_Renoir',kind:'smart',parentId:1,parentName:'YC_Impressionism'},
 {id:3,name:'YC_Claude_Monet',kind:'smart',parentId:1,parentName:'YC_Impressionism'},
 {id:4,name:'YC_Vincent',kind:'pixel',parentId:1,parentName:'YC_Impressionism'}];
const doc={id:22,width:32,height:16,layers,activeLayers:[layers[2]]};
const ps={app:{activeDocument:doc,documents:[doc]},constants:{LayerKind:{NORMAL:'pixel'}},imaging:{
 async createImageDataFromBuffer(data,options){return {...options,data,dispose(){disposals++;}};},
 async putPixels({documentID,layerID,imageData,replace,targetBounds}) {
   assert.equal(documentID,22);assert.equal(layerID,doc.activeLayers[0].id);assert.equal(doc.activeLayers[0].kind,'pixel');
   assert.equal(replace,true);assert.equal(targetBounds.left,0);assert.equal(imageData.width,32);assert.equal(imageData.height,16);
   puts++;if(failPut)throw new Error('simulated native write failure');
 }
}};
const app={Errors:{UserFacingError:Error},Logger:{info(){},warn(){},error(){}},GlowMetadata:{layerName:'YC_Glow_State_v1'},
 Batch:{requirePhotoshop:()=>ps,async runModal(name,fn){return fn({hostControl:{async suspendHistory(){history.push('suspend');return 7;},async resumeHistory(id,commit){assert.equal(id,7);history.push(commit?'commit':'rollback');}}});}},
 Documents:{async selectDocumentById(id){assert.equal(id,22);}},
 Layers:{async getFreshLayerTree(){return {documentId:22,flat:layers,tree:[]};},getAllLayerReferences:()=>layers,
  getAllLayerNames:()=>layers.map(v=>v.name),getLayerNamesInsideGroup:()=>layers.slice(1).map(v=>v.name),
  async selectLayerById(id){doc.activeLayers=[layers.find(v=>v.id===id)];},
  async rasterizeActiveLayer(){rasterizations++;doc.activeLayers[0].kind='pixel';return true;},
  async setLayerPropertiesById(id,props){Object.assign(layers.find(v=>v.id===id),props);return true;},async lockLayerById(){return true;},
  async deleteLayerByNameIfExists(){throw new Error('Preview must reuse layers');},
  async placeTokenAsLayer(){throw new Error('Preview must avoid smart-object placement');}},
 Files:{async writeImageDataPng(){pngWrites++;throw new Error('Preview must avoid PNG encoding');},async deleteTemporaryFile(){}},
 GlowAlgorithm:{renderPhaseOneCached(){throw new Error('Legacy renderer not used in this fixture');}}
};
const context=vm.createContext({window:{YCGlow:app},performance,setTimeout,Uint8Array,Uint8ClampedArray,Uint16Array,Int16Array,Float32Array,Float64Array,ArrayBuffer});
for(const file of ['photoshop/pixels','photoshop/glowLayerIds','glow/params','glow/quickModes','glow/glowState','glow/scattering','glow/algorithmRouter','photoshop/psbWorkflow']) {
 let code=fs.readFileSync(path.join(root,'src',file+'.js'),'utf8');
 if(file==='photoshop/psbWorkflow')code=code.replace("_0x354185['PsbWorkflow']={","_0x354185.__setSession=value=>_0x14f446=value;_0x354185['PsbWorkflow']={");
 vm.runInContext(code,context);
}
(async()=>{
 const source=app.Pixels.makeImageData(32,16);for(let i=0;i<source.data.length;i++)source.data[i]=(i*23)%256;
 const params=app.GlowQuickModes.paramsFor('soft_1_4');
 const state={mode:'new',work:{id:22,width:32,height:16},original:{id:10},sourceImageData:source,params,renderCaches:{},previewSources:{},glowState:app.GlowState.createState(params),layerRoles:Object.fromEntries(['group','xray','bloom','source'].map((role,i)=>[role,{layerId:layers[i].id,name:layers[i].name}]))};
 app.__setSession(state);
 await app.PsbWorkflow.updatePreview(null,params,{refreshXray:true});
 assert.equal(pngWrites,0);assert.equal(puts,2);assert.equal(rasterizations,2);assert.equal(disposals,2);assert.equal(state.xrayDirty,false);
 await app.PsbWorkflow.updatePreview(null,{...params,saturation:-10});
 assert.equal(puts,3);assert.equal(rasterizations,2,'Rasterize once, reuse pixel layers on later updates');
 assert.deepEqual(history,['suspend','commit','suspend','commit']);
 assert.equal(layers.length,4);assert.equal(state.layerRoles.bloom.layerId,3,'Stable layer IDs keep masks and saved role metadata valid');
 failPut=true;
 await assert.rejects(()=>app.PsbWorkflow.updatePreview(null,params),/simulated native/);
 assert.equal(history.at(-1),'rollback','Failed writes roll back the preview transaction');
 assert.equal(disposals,4,'Native buffers are released on success and failure');
 const before=puts;
 await assert.rejects(()=>app.PsbWorkflow.updatePreview(null,params,{isStale:()=>true}),/过期/);
 assert.equal(puts,before,'Stale work must not write into Photoshop');
 console.log('PASS: actual preview workflow uses stable pixel layers, no PNG/placement, one history state, rollback, disposal and stale guards.');
})().catch(error=>{console.error(error);process.exitCode=1;});
