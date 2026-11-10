(() => {
  const app=window.YCGlow, workflow=app.PsbWorkflow;
  const storageKey='thispc-glow-recovery-v1';
  let busy=0,last=null,previous=null;
  function snapshot(state) {
    if(!state?.params)return null;
    return {currentParams:{...state.params},activeMode:state.glowState?.activeMode||'custom',activePresetId:state.glowState?.activePresetId||null,lastCustomParams:{...(state.glowState?.lastCustomParams||state.params)}};
  }
  function persist(state) {
    const value=snapshot(state);if(!value)return;
    try {window.localStorage.setItem(storageKey,JSON.stringify({version:1,state:value,sourceName:state.original?.name||'',updatedAt:Date.now()}));}
    catch(error){app.Logger.warn('Could not persist recovery parameters',error);}
    sync();
  }
  function readDraft() {
    try {
      const draft=JSON.parse(window.localStorage.getItem(storageKey)||'null');
      if(draft?.version!==1||!draft.state?.currentParams||draft.state.currentParams.effectMode===1)return null;
      draft.state.currentParams=app.GlowParams.normalizeParams(draft.state.currentParams);
      return draft;
    } catch{return null;}
  }
  function sync() {
    const restore=document.getElementById('restorePreviousButton'),recover=document.getElementById('recoverParamsButton');
    if(restore)restore.disabled=!!busy||!previous||!workflow.getState();
    if(recover){const draft=readDraft();recover.disabled=!!busy||!!workflow.getState()||!draft;recover.title=draft?'恢复 '+draft.sourceName+' 的参数':'暂无未保存参数';}
  }
  for(const name of ['createNewGlow','beginEditGlow','updatePreview','saveGlowToOriginal','returnToOriginal']){
    const original=workflow[name];
    workflow[name]=async(...args)=>{
      busy++;sync();
      try{
        const result=await original(...args);
        if(name==='createNewGlow'||name==='beginEditGlow'){last=snapshot(workflow.getState());previous=null;persist(workflow.getState());}
        if(name==='updatePreview'){
          const next=snapshot(workflow.getState());
          if(last&&JSON.stringify(last.currentParams)!==JSON.stringify(next?.currentParams))previous=last;
          last=next;persist(workflow.getState());
        }
        if(name==='saveGlowToOriginal'||name==='returnToOriginal'){
          last=previous=null;
          try{window.localStorage.removeItem(storageKey);}catch(error){app.Logger.warn('Could not clear recovered parameters',error);}
        }
        return result;
      } finally{busy--;sync();}
    };
  }
  const pending=workflow.setPendingParams;
  workflow.setPendingParams=(...args)=>{const result=pending(...args);persist(workflow.getState());return result;};
  async function restore(){if(busy||!previous)return;const value=previous;return app.Panel.applyState(value);}
  async function recover(){if(busy||workflow.getState())return;const draft=readDraft();if(draft)await app.Panel.createNewGlow(draft.state);}
  const report=promise=>Promise.resolve(promise).catch(error=>app.Status.fromError(error));
  function bind(){
    document.getElementById('restorePreviousButton').addEventListener('click',()=>report(restore()));
    document.getElementById('recoverParamsButton').addEventListener('click',()=>report(recover()));
    sync();
  }
  app.WorkTools=Object.freeze({restore,recover,readDraft});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
