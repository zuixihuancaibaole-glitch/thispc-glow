const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../thispc-glow/src/ui/panel.js'),'utf8');
function fn(name,next){return source.slice(source.indexOf('    function '+name+'('),source.indexOf('    function '+next+'('));}
let timerId=0;const timers=new Map(),renders=[];
const ctx=vm.createContext({setTimeout(fn,delay){assert.equal(delay,90);timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},_0x1633b6:false,_0x4ef9a2:'',_0x23e65f:0,_0x577b40:false,_0x17f02b:false,_0x591f29:false,_0x5c59c6:null,_0x16bbf4:0,_0x4940ef:()=>0,_0x2ceb89:()=>true,_0x374caf:()=>false,_0x2eeb6f:()=>{},_0x26608c:{Status:{set(){}}},_0x5acd4a:(id,options)=>renders.push({id,...options})});
vm.runInContext(fn('_0x198aae','_0x5b706f')+fn('_0x382b93','_0x534566'),ctx);
for(const reason of ['first','second','last'])ctx._0x382b93(reason);
assert.equal(timers.size,1,'Rapid input coalesces into one pending render');for(const tick of timers.values())tick();
assert.equal(renders.length,1);assert.equal(renders[0].reason,'last');assert.equal(renders[0].id,3);
ctx._0x577b40=true;ctx._0x382b93('newer');assert.equal(ctx._0x23e65f,4,'Invalidate an in-flight render immediately');assert.equal(ctx._0x591f29,true,'Queue only the latest request while busy');
console.log('PASS: rapid controls coalesce, latest input wins, and in-flight preview tokens are invalidated.');
