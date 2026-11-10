(() => {
  const app=window.YCGlow, workflow=app.PsbWorkflow;
  const storageKey='thispc-glow-recovery-v1';
  let busy=0,last=null,previous=null,visible=null,desired=false,queue=Promise.resolve();
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
    const compare=document.getElementById('compareOriginalButton'),restore=document.getElementById('restorePreviousButton'),recover=document.getElementById('recoverParamsButton');
    if(compare)compare.disabled=!!busy||!workflow.getState();
    if(restore)restore.disabled=!!busy||!previous||!workflow.getState();
    if(recover){const draft=readDraft();recover.disabled=!!busy||!!workflow.getState()||!draft;recover.title=draft?'恢复 '+draft.sourceName+' 的参数；局部选区和蒙版需重新选择':'暂无未保存参数';}
  }
  function compare(on) {
    desired=!!on;
    document.getElementById('compareOriginalButton')?.setAttribute('aria-pressed',String(desired));
    queue=queue.catch(()=>{}).then(async()=>{
      const state=workflow.getState();
      if(desired&&busy)return;
      if(desired&&!visible&&state){
        const saved=[];
        await app.Batch.runModal('查看原图',async()=>{
          await app.Documents.selectDocumentById(state.work.id);
          try {
            for(const role of ['source','bloom','xray']){
              const id=state.layerRoles[role].layerId;
              const [descriptor]=await app.Batch.run([{_obj:'get',_target:[{_ref:'layer',_id:id}]}]);
              saved.push({id,visible:descriptor.visible!==false});
              await app.Layers.setLayerPropertiesById(id,{visible:role==='source'});
            }
          }catch(error){for(const entry of saved)await app.Layers.setLayerPropertiesById(entry.id,{visible:entry.visible});throw error;}
        });
        visible={documentId:state.work.id,layers:saved};
      }
      if(visible&&app.Documents.isDocumentOpen?.(visible.documentId)===false)visible=null;
      if(!desired&&visible){
        const saved=visible;
        await app.Batch.runModal('恢复柔光预览',async()=>{
          await app.Documents.selectDocumentById(saved.documentId);
          for(const entry of saved.layers)await app.Layers.setLayerPropertiesById(entry.id,{visible:entry.visible});
        });
        visible=null;
      }
    });
    return queue;
  }
  for(const name of ['createNewGlow','beginEditGlow','updatePreview','saveGlowToOriginal','returnToOriginal']){
    const original=workflow[name];
    workflow[name]=async(...args)=>{
      busy++;sync();
      try{
        await compare(false);
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
    const button=document.getElementById('compareOriginalButton');
    button.addEventListener('pointerdown',event=>{if(button.disabled)return;event.preventDefault();report(compare(true));});
    for(const name of ['pointerup','pointerleave','pointercancel'])button.addEventListener(name,()=>report(compare(false)));
    button.addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();if(!button.disabled)report(compare(true));}});
    button.addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key))report(compare(false));});
    window.addEventListener('blur',()=>report(compare(false)));
    document.getElementById('restorePreviousButton').addEventListener('click',()=>report(restore()));
    document.getElementById('recoverParamsButton').addEventListener('click',()=>report(recover()));
    sync();
  }
  app.WorkTools=Object.freeze({compare,restore,recover,readDraft});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
