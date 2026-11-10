(() => {
  const app=window.YCGlow,flow=app.PsbWorkflow,original={...flow};
  const marker='THISPC_FULL_RESOLUTION_V1',fastMarker='THISPC_FAST_OUTPUT_V1';
  const fastToggle=()=>typeof document==='undefined'?null:document.getElementById('fastMode');
  function syncFastMode(){
    const toggle=fastToggle();if(!toggle)return;
    const state=flow.getState(),fastSource=state?.work.fastSource;
    toggle.disabled=!!state&&(!state.work.masterFile||!!fastSource);
    if(fastSource)toggle.checked=true;
    const hint=document.getElementById('fastModeHint');
    if(hint)hint.textContent=fastSource?'此对象保留的是预览尺寸源图；需要完整细节请从原照片新建。':state&&!state.work.masterFile?'旧对象不支持此选项；请从原照片新建。':toggle.checked?'按已完成的预览保存（最长边 1200 px），铺满原图；柔光细节降低。':'按完整源图计算，保存较慢；保留原尺寸细节。';
  }
  fastToggle()?.addEventListener('change',syncFastMode);
  let stage='idle';
  const ps=()=>app.Batch.requirePhotoshop();
  function find(layers,name){for(const layer of layers){if(layer.name===name)return layer;const found=layer.layers&&find(layer.layers,name);if(found)return found;}return null;}
  async function capture(document){
    const file=await app.Files.temporaryFile('thispc-source-'+Date.now()+'.psb');
    let copy;
    try{
      copy=await document.duplicate('ThisPC full source',true);
      await app.Files.saveActiveDocumentAsPsb(file);
      return file;
    }catch(error){await app.Files.deleteTemporaryFile(file);throw error;}
    finally{if(copy)await app.Documents.closeDocumentByIdWithoutSaving(copy.id);await app.Documents.selectDocumentById(document.id);}
  }
  async function prepareEdit(work){
    const doc=ps().app.activeDocument;
    work.fastSource=!!find(doc.layers,fastMarker);
    if(!find(doc.layers,marker)&&!work.fastSource)return;
    work.masterFile=await app.Files.temporaryFile('thispc-edit-source-'+Date.now()+'.psb');
    try{
      await app.Files.saveActiveDocumentAsPsb(work.masterFile,{asCopy:true});
      work.fullWidth=work.width;work.fullHeight=work.height;
      const size=app.Documents.calculateWorkSize(work.width,work.height);
      await doc.resizeImage(size.width,size.height);
      // Only the disposable preview uses 8-bit pixels; masterFile retains native depth.
      doc.bitsPerChannel=ps().constants.BitsPerChannelType.EIGHT;
      work.width=size.width;work.height=size.height;
    }catch(error){await app.Files.deleteTemporaryFile(work.masterFile);delete work.masterFile;throw error;}
  }
  flow.createNewGlow=async(status,params={},options={})=>{
    let master;
    if(options.recovering&&params.scatterModel===0)return original.createNewGlow(status,params,options);
    const normalized=app.GlowParams.normalizeParams({...params,effectMode:0,scatterModel:options.recovering?params.scatterModel:document.getElementById('opticalScatter')?.checked===false?1:2});
    try{
      await app.Batch.runModal('保留原尺寸源图',async()=>{
        await app.Documents.validateActiveSourceDocument();
        master=await capture(ps().app.activeDocument);
      });
      const result=await original.createNewGlow(status,normalized,options),state=flow.getState();
      state.work.masterFile=master;state.work.fullWidth=state.original.width;state.work.fullHeight=state.original.height;
      syncFastMode();return result;
    }catch(error){if(master)await app.Files.deleteTemporaryFile(master);throw error;}
  };
  flow.beginEditGlow=async(...args)=>{
    const result=await original.beginEditGlow(...args);
    const toggle=fastToggle();if(toggle)toggle.checked=!!flow.getState()?.work.fastSource;
    syncFastMode();return result;
  };
  const pending=flow.setPendingParams;
  flow.setPendingParams=(params,...args)=>{
    const state=flow.getState();
    if(state?.work.masterFile)params={...params,scatterModel:state.params.scatterModel};
    return pending(params,...args);
  };
  flow.updatePreview=async(status,params={},...args)=>{
    const state=flow.getState();
    if(state?.work.masterFile)params={...params,scatterModel:state.params.scatterModel};
    return original.updatePreview(status,params,...args);
  };
  async function diskStores(){
    const uxp=app.Batch.requireUXP(),base=await uxp.storage.localFileSystem.getTemporaryFolder();
    const folder=await base.createFolder('thispc-render-'+Date.now()),files=new Map();
    return {
      async create(name,width,height,rows){
        const cache=new Map();
        return {
          async get(index){
            if(cache.has(index)){const value=cache.get(index);cache.delete(index);cache.set(index,value);return value;}
            const file=files.get(name+'-'+index);if(!file)throw new Error('缺少渲染临时数据。');
            const value=new Float32Array(await file.read({format:uxp.storage.formats.binary}));
            cache.set(index,value);if(cache.size>2)cache.delete(cache.keys().next().value);return value;
          },
          async set(index,data){
            const key=name+'-'+index;let file=files.get(key);
            if(!file){file=await folder.createFile(key+'.bin',{overwrite:true});files.set(key,file);}
            await file.write(data.buffer,{format:uxp.storage.formats.binary});cache.delete(index);
          },
          async close(){cache.clear();}
        };
      },
      async close(){for(const file of files.values())await app.Files.deleteTemporaryFile(file,'render strip');await app.Files.deleteTemporaryFile(folder,'render folder');}
    };
  }
  async function readSource(doc,layer,box){
    const image=await ps().imaging.getPixels({documentID:doc.id,layerID:layer.id,sourceBounds:{left:box.left,top:box.top,right:box.left+box.width,bottom:box.top+box.height},targetSize:{width:box.width,height:box.height},colorSpace:'RGB',colorProfile:'sRGB IEC61966-2.1',componentSize:16,applyAlpha:true});
    try{
      const data=await image.imageData.getData({chunky:true,fullRange:true}),components=image.imageData.components;
      if(data.length!==box.width*box.height*components)throw new Error('源图包含裁切或透明边界，无法安全按原尺寸读取。');
      const out=new Uint16Array(box.width*box.height*4);
      for(let i=0;i<box.width*box.height;i++){if(components===4&&data[i*components+3]!==65535)throw new Error('原尺寸柔光暂不支持透明源像素，请先在照片下方添加背景。');out[i*4]=data[i*components];out[i*4+1]=data[i*components+1];out[i*4+2]=data[i*components+2];out[i*4+3]=65535;}
      return out;
    }finally{image.imageData.dispose();}
  }
  async function prepareSourceLayer(doc,name){
    if(doc.activeLayers[0].isBackgroundLayer){
      await app.Batch.run([{_obj:'set',_target:[{_ref:'layer',_property:'background'}],to:{_obj:'layer',name}}]);
    }
    await app.Layers.setActiveLayerProperties({name,blendMode:'normal',visible:true});
    const source=doc.activeLayers[0];
    if(source.isBackgroundLayer||source.name!==name)throw new Error('无法将完整源图准备为普通像素图层。');
    return source;
  }
  async function groupOutputLayers(doc,source,bloom,names){
    const xray=await doc.createPixelLayer({name:names.xray});xray.visible=false;
    const tag=await doc.createPixelLayer({name:marker});tag.visible=false;
    const group=await doc.createLayerGroup({name:names.group,fromLayers:[tag,xray,bloom,source]});
    if(group.kind!==ps().constants.LayerKind.GROUP||!group.layers||group.layers.length<4)throw new Error('无法建立包含完整源图的可编辑图层组。');
    return group;
  }
  async function renderFastDocument(state,context,status){
    stage='duplicate preview for quick output';
    await app.Documents.selectDocumentById(state.work.id);
    const output=await ps().app.activeDocument.duplicate('ThisPC quick glow',false);
    context.hostControl.registerAutoCloseDocument?.(output.id);
    try{
      const names=app.GlowLayerIds.current,source=find(output.layers,names.source),bloom=find(output.layers,names.bloom),xray=find(output.layers,names.xray);
      if(!source||!bloom)throw new Error('快速输出缺少源图或柔光图层。');
      source.visible=state.params.scatterModel===2;
      bloom.visible=true;bloom.blendMode=state.params.scatterModel===2?ps().constants.BlendMode.NORMAL:ps().constants.BlendMode.SCREEN;
      if(xray)xray.visible=false;
      if(!find(output.layers,fastMarker)){const tag=await output.createPixelLayer({name:fastMarker});tag.visible=false;}
      const schema=await flow.prepareWorkDocumentLayerSchema({documentId:output.id,metadataRoles:null});
      await app.GlowMetadata.writeState({...state.glowState,currentParams:state.params,workLongEdge:Math.max(Number(output.width),Number(output.height))},{layerRoles:schema.layerRoles});
      const file=await app.Files.temporaryFile('thispc-quick-glow-'+Date.now()+'.psb');
      status?.('正在快速保存预览尺寸柔光…');
      try{await app.Files.saveActiveDocumentAsPsb(file);return {file,width:Number(output.width),height:Number(output.height)};}
      catch(error){await app.Files.deleteTemporaryFile(file);throw error;}
    }finally{await app.Documents.closeDocumentByIdWithoutSaving(output.id);}
  }
  async function renderDocument(state,context,status){
    stage='open full source';
    const master=await app.Documents.openFileAsDocument(state.work.masterFile);
    const names=app.GlowLayerIds.current;
    let output,outputHistory;
    try{
      const source=find(master.layers,names.source);
      if(source){source.visible=true;const bloom=find(master.layers,names.bloom),xray=find(master.layers,names.xray);if(bloom)bloom.visible=false;if(xray)xray.visible=false;}
      stage='duplicate full source';
      output=await master.duplicate('ThisPC full-resolution glow',true);context.hostControl.registerAutoCloseDocument?.(output.id);
    }finally{await app.Documents.closeDocumentByIdWithoutSaving(master.id);if(output)await app.Documents.selectDocumentById(output.id);}
    try{
      stage='suspend output history';
      outputHistory=await context.hostControl.suspendHistory({documentID:output.id,name:'原尺寸柔光计算'});
      stage='prepare output layers';
      const source=await prepareSourceLayer(output,names.source);
      const bloom=await output.createPixelLayer({name:names.bloom});
      // Screen output needs a full opaque black canvas so placement never trims a sparse halo.
      if(state.params.scatterModel!==2){
        await app.Layers.selectLayerById(bloom.id);
        await app.Batch.run([{_obj:'fill',using:{_enum:'fillContents',_value:'color'},color:{_obj:'RGBColor',red:0,grain:0,blue:0},opacity:{_unit:'percentUnit',_value:100},mode:{_enum:'blendMode',_value:'normal'}}]);
      }
      stage='create temporary strip store';
      const stores=await diskStores();
      try{

        stage='render original-resolution strips';
        await app.TiledScattering.render({width:Number(output.width),height:Number(output.height),params:state.params,
          createStore:stores.create,readRegion:box=>readSource(output,source,box),
          writeRegion:async box=>{
            const image=await ps().imaging.createImageDataFromBuffer(box.data,{width:box.width,height:box.height,components:4,colorSpace:'RGB',colorProfile:'sRGB IEC61966-2.1',fullRange:true});
            try{await ps().imaging.putPixels({documentID:output.id,layerID:bloom.id,imageData:image,replace:false,targetBounds:{left:box.left,top:box.top}});}finally{image.dispose();}
          },isCancelled:()=>context.isCancelled,onProgress:value=>{context.reportProgress?.({value});status?.('正在生成原尺寸柔光 '+Math.round(value*100)+'%…');}});
      }finally{await stores.close();}
      stage='prepare editable object metadata';
      source.visible=state.params.scatterModel===2;
      bloom.blendMode=state.params.scatterModel===2?ps().constants.BlendMode.NORMAL:ps().constants.BlendMode.SCREEN;
      await groupOutputLayers(output,source,bloom,names);
      const schema=await flow.prepareWorkDocumentLayerSchema({documentId:output.id,metadataRoles:null});
      await app.GlowMetadata.writeState({...state.glowState,currentParams:state.params,workLongEdge:Math.max(Number(output.width),Number(output.height))},{layerRoles:schema.layerRoles});
      await context.hostControl.resumeHistory(outputHistory,true);outputHistory=null;
      const file=await app.Files.temporaryFile('thispc-full-glow-'+Date.now()+'.psb');
      stage='save full-resolution PSB';
      try{await app.Files.saveActiveDocumentAsPsb(file);return {file,width:Number(output.width),height:Number(output.height)};}
      catch(error){await app.Files.deleteTemporaryFile(file);throw error;}
    }finally{if(outputHistory)await context.hostControl.resumeHistory(outputHistory,false).catch(()=>{});await app.Documents.closeDocumentByIdWithoutSaving(output.id);}
  }
  flow.saveGlowToOriginal=async(status)=>{
    const state=flow.getState();
    if(!state?.work.masterFile)return original.saveGlowToOriginal(status);
    let rendered;
    const fast=fastToggle()?.checked===true||!!state.work.fastSource;
    if(fastToggle())fastToggle().disabled=true;
    const edit=app.EditSession.get();
    try{
      return await app.Batch.runModal(fast?'快速保存可编辑柔光':'保存原尺寸可编辑柔光',async context=>{
        rendered=await (fast?renderFastDocument:renderDocument)(state,context,status);
        if(context.isCancelled)throw new Error('已取消原尺寸保存。');
        const token=await app.Files.createSessionToken(rendered.file);
        await app.Documents.selectDocumentById(state.original.id);
        const suspension=await context.hostControl.suspendHistory({documentID:state.original.id,name:'保存原尺寸柔光'});
        let commit=false,layerName;
        try{
          if(state.mode==='edit'){
            await app.Layers.selectLayerById(edit.targetLayerId);
            await app.Batch.run([{_obj:'placedLayerReplaceContents',null:{_path:token,_kind:'local'}}]);
            await app.Layers.restoreLayerSnapshot({layerId:edit.targetLayerId,name:edit.targetLayerName,blendMode:edit.targetBlendMode,opacity:edit.targetOpacity,visible:edit.targetVisible,bounds:edit.targetBounds});
            layerName=edit.targetLayerName;
          }else{
            layerName=app.Layers.nextGlowLayerName();
            await app.Layers.placeTokenAsLayer(token,{name:layerName,blendMode:state.params.scatterModel===2?'normal':'screen',opacity:100,visible:true});
            await app.Layers.scaleActiveLayerToCanvas({sourceWidth:rendered.width,sourceHeight:rendered.height,canvasWidth:state.original.width,canvasHeight:state.original.height});
          }
          commit=true;
        }finally{await context.hostControl.resumeHistory(suspension,commit);}
        app.Logger.info((fast?'Fast-mode saved ':'Full-resolution saved ')+JSON.stringify({width:rendered.width,height:rendered.height,mode:state.mode,scatterModel:state.params.scatterModel}));
        return {message:(fast?'已快速保存预览尺寸 ':'已保存原尺寸 ')+rendered.width+'×'+rendered.height+' 可编辑柔光。',layerName,updatedExistingLayer:state.mode==='edit'};
      }).then(async result=>{
        app.GlowState.saveGlobalState({...state.glowState,currentParams:state.params});
        await flow.completeSavedSession();
        await app.Files.deleteTemporaryFile(state.work.masterFile,'full source');
        return result;
      });
    }catch(error){app.Logger.error('Full-resolution failure '+JSON.stringify({stage,message:error?.message||String(error),stack:error?.stack||'',detail:error}));await app.Documents.selectDocumentById(state.work.id).catch(()=>{});throw new app.Errors.UserFacingError((fast?'快速保存失败（':'原尺寸保存失败（')+stage+'）：'+(error?.message||String(error)),error);}
    finally{if(rendered)await app.Files.deleteTemporaryFile(rendered.file,'rendered smart object');syncFastMode();}
  };
  flow.returnToOriginal=async(...args)=>{
    const master=flow.getState()?.work.masterFile;
    const result=await original.returnToOriginal(...args);
    if(master)await app.Files.deleteTemporaryFile(master,'full source');syncFastMode();return result;
  };
  app.HighResolution=Object.freeze({prepareEdit,diskStores,readSource});
})();
