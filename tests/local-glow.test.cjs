const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const pixels = new Uint8Array([255,255,0,0,255,255,0,0]);
const nodes = new Map();
function node(id) { if(!nodes.has(id)) nodes.set(id,{value:'',hidden:false,events:{},addEventListener(k,fn){this.events[k]=fn;},classList:{add(){},remove(){}},setAttribute(){},click(){return this.events.click?.();}}); return nodes.get(id); }
const document = {readyState:'complete',getElementById:node};
node('localMaskFeather').value='4';
let state=null, failWrite=false, rawSaves=0;
const masks = new Map([['1:5',{data:pixels,feather:3,density:60}]]);
function maskedLayer(doc,id) { return {id,visible:true,
 get layerMaskFeather(){return masks.get(`${doc}:${id}`)?.feather||0;},
 set layerMaskFeather(value){masks.get(`${doc}:${id}`).feather=value;},
 get layerMaskDensity(){return masks.get(`${doc}:${id}`)?.density??100;},
 set layerMaskDensity(value){masks.get(`${doc}:${id}`).density=value;}
}; }
const sourceLayer=maskedLayer(1,5),targetLayer=maskedLayer(1,42),workLayer=maskedLayer(2,11);
const docs={1:{id:1,width:4,height:2,selection:{bounds:{left:0,top:0,right:2,bottom:2}},activeLayers:[sourceLayer],layers:[sourceLayer,targetLayer]},2:{id:2,width:2,height:1,activeLayers:[workLayer],layers:[{id:99,layers:[workLayer]}]}};
const photoshop={app:{activeDocument:docs[1]},imaging:{
  async getLayerMask({documentID,layerID}) {
    const entry=masks.get(`${documentID}:${layerID}`);
    return {imageData:{width:4,height:2,components:1,colorProfile:'Gray Gamma 2.2',getData:async()=>entry.data,dispose(){}}};
  },
  async getSelection(){return {sourceBounds:{left:0,top:0,right:2,bottom:2},imageData:{width:2,height:2,components:1,getData:async()=>new Uint8Array([255,255,255,255]),dispose(){}}};},
  async createImageDataFromBuffer(data,options){return {...options,data,dispose(){}};},
  async putLayerMask({documentID,layerID,imageData}) {
    if(failWrite && documentID===1) throw new Error('Simulated mask write failure');
    masks.set(`${documentID}:${layerID}`,{data:new Uint8Array(imageData.data),feather:0,density:255});
  }
}};
function start(mode){state={mode,original:{id:1},work:{id:2,width:2,height:1},layerRoles:{bloom:{layerId:11}}};photoshop.app.activeDocument=docs[2];return {mode};}
const workflow={getState:()=>state,getMode:()=>state?.mode,
  async createNewGlow(){return start('new');},async beginEditGlow(){return start('edit');},
  async updatePreview(){masks.delete('2:11');return {preview:true};},
  async saveGlowToOriginal(){assert.equal(masks.has('2:11'),false,'Transient mask must be removed before exporting bloom; avoid double masking');rawSaves++;state=null;docs[1].activeLayers=[targetLayer];photoshop.app.activeDocument=docs[1];return {saved:true};},
  async returnToOriginal(){state=null;photoshop.app.activeDocument=docs[1];return {cancelled:true};}
};
const app={Panel:{async createNewGlow(){}},PsbWorkflow:workflow,Documents:{async selectDocumentById(id){photoshop.app.activeDocument=docs[id];}},Batch:{requirePhotoshop:()=>photoshop,runModal:async(name,fn)=>fn(),
  async run(commands){return commands.map(command=>{
    const layerId=command._target[0]._id;
    const docId=command._target[1]?._id||photoshop.app.activeDocument.id;
    const key=`${docId}:${layerId}`, current=masks.get(key);
    if(command._obj==='get') return {hasUserMask:!!current,userMaskDensity:current?.density??255,userMaskFeather:current?.feather??0};
    if(command._obj==='delete'){assert.equal(command.apply,false);masks.delete(`${photoshop.app.activeDocument.id}:${command._target[1]._id}`);return {};}
    if(command._obj==='set'){assert.ok(current,'Mask must exist before feathering'); current.feather=command.to.userMaskFeather._value;return {};}
    throw new Error('Unexpected command');
  });}
},Status:{showError(error){throw error;}}};
const context=vm.createContext({window:{YCGlow:app},document});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../thispc-glow/src/photoshop/localGlow.js'),'utf8'),context);
(async()=>{
  assert.equal(app.LocalGlow.featherValue(0),0); assert.equal(app.LocalGlow.featherValue(1000),1000);
  for(const value of [-1,1001,'invalid',Infinity]) assert.throws(()=>app.LocalGlow.featherValue(value));
  assert.deepEqual([...app.LocalGlow.resizeMask(pixels,4,2,2,1)],[255,0]);
  assert.throws(()=>app.LocalGlow.resizeMask(new Uint8Array(1),4,2,2,1));
  assert.deepEqual([...app.LocalGlow.expandMask(new Uint8Array([255,128]),2,1,{left:1,top:1},4,2)],[0,0,0,0,0,255,128,0]);
  assert.deepEqual([...app.LocalGlow.expandMask(new Uint8Array([255,128]),2,1,{left:-1,top:0},2,1)],[128,0]);
  await node('newLocalGlowButton').click(); await workflow.createNewGlow();
  assert.deepEqual([...masks.get('2:11').data],[255,0]);assert.equal(masks.get('2:11').feather,2);
  await workflow.updatePreview();assert.equal(masks.get('2:11').feather,2);
  await workflow.saveGlowToOriginal();
  assert.deepEqual([...masks.get('1:42').data],[...pixels]);assert.equal(masks.get('1:42').feather,4);assert.equal(masks.get('1:42').density,60,'Preserve source mask density in percent');
  assert.equal(masks.get('1:5').feather,3,'Do not feather or modify source mask');
  assert.deepEqual([...pixels],[255,255,0,0,255,255,0,0]);
  const savedMask=masks.get('1:42');
  await workflow.beginEditGlow();
  node('workMaskFeather').value='10';await node('workMaskFeather').events.change({target:node('workMaskFeather')});
  assert.equal(masks.get('2:11').feather,5);
  await workflow.saveGlowToOriginal();assert.equal(masks.get('1:42'),savedMask);assert.equal(savedMask.feather,10);
  await workflow.beginEditGlow();await workflow.returnToOriginal();assert.equal(savedMask.feather,10,'Cancel preserves original feather');
  docs[1].activeLayers=[sourceLayer];node('localFromSelectionButton').click();
  await node('newLocalGlowButton').click();await workflow.createNewGlow();await workflow.saveGlowToOriginal();
  await node('newLocalGlowButton').click();await workflow.createNewGlow();failWrite=true;
  await assert.rejects(()=>workflow.saveGlowToOriginal(),/蒙版设置失败/);assert.equal(targetLayer.visible,false,'Fail closed when attaching a new mask fails');
  assert.equal(rawSaves,4);
  const imaging=photoshop.imaging; photoshop.imaging=undefined;
  await workflow.beginEditGlow(); assert.equal(node('localMaskWork').hidden,true,'Older hosts can still edit global glow without local Imaging API'); await workflow.returnToOriginal();
  await node('newLocalGlowButton').click(); await assert.rejects(()=>workflow.createNewGlow(),/Imaging API/);
  assert.equal(state,null); photoshop.imaging=imaging;
  console.log('PASS: source mask/selection, scaled preview, feather updates, no double masking on save, edit/cancel preservation, validation, failed-mask safety.');
})().catch(error=>{console.error(error);process.exitCode=1;});
