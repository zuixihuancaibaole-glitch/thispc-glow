const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const nodes=new Map(),storage=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,{disabled:false,events:{},addEventListener(k,fn){this.events[k]=fn;},setAttribute(){}});return nodes.get(id);}
const visibility=new Map([[1,true],[2,true],[3,false]]);let state=null,saves=0;
const flow={getState:()=>state,async createNewGlow(status,params){state={params,work:{id:4},original:{name:'test.png'},glowState:{activeMode:'custom'},layerRoles:{source:{layerId:1},bloom:{layerId:2},xray:{layerId:3}}};return {created:true};},async beginEditGlow(){return {};},async updatePreview(status,params){assert.equal(visibility.get(2),true,'Restore compare before rendering');state.params=params;return {params};},setPendingParams(params){state.params=params;},async saveGlowToOriginal(){assert.equal(visibility.get(2),true,'Never save while the effect is temporarily hidden');saves++;state=null;return {saved:true};},async returnToOriginal(){state=null;return {};}};
const app={PsbWorkflow:flow,GlowParams:{normalizeParams:p=>({...p})},Logger:{warn(){}},Status:{fromError(e){throw e;}},Batch:{runModal:async(name,fn)=>fn(),run:async commands=>commands.map(c=>({visible:visibility.get(c._target[0]._id)}))},Documents:{selectDocumentById:async()=>{},isDocumentOpen:()=>true},Layers:{setLayerPropertiesById:async(id,props)=>visibility.set(id,props.visible)},Panel:{async applyState(value){return flow.updatePreview(null,value.currentParams);},async createNewGlow(value){return flow.createNewGlow(null,value.currentParams);}}};
const window={YCGlow:app,addEventListener(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../thispc-glow/src/ui/workTools.js'),'utf8'),vm.createContext({window,document:{readyState:'complete',getElementById:node}}));
(async()=>{
 await flow.createNewGlow(null,{radius:10});
 await app.WorkTools.compare(true);assert.equal(visibility.get(2),false);assert.equal(visibility.get(1),true);
 await flow.updatePreview(null,{radius:20});assert.equal(visibility.get(2),true);
 await app.WorkTools.restore();assert.equal(state.params.radius,10);
 await app.WorkTools.restore();assert.equal(state.params.radius,20,'Restore can switch back to the previous successful setting');
 flow.setPendingParams({radius:37});assert.equal(app.WorkTools.readDraft().state.currentParams.radius,37,'Persist pending parameters before a crash');
 state=null;await app.WorkTools.recover();assert.equal(state.params.radius,37,'Recover on a freshly created session');
 await app.WorkTools.compare(true);await flow.saveGlowToOriginal();assert.equal(saves,1);assert.equal(app.WorkTools.readDraft(),null);
 storage.set('thispc-glow-recovery-v1','{broken');assert.equal(app.WorkTools.readDraft(),null);
 console.log('PASS: press-to-compare visibility restoration, save guard, previous parameters, crash draft recovery and malformed-storage safety.');
})().catch(e=>{console.error(e);process.exitCode=1;});
