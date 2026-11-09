(() => {
  const app = window.YCGlow;
  const workflow = app.PsbWorkflow;
  const original = {...workflow};
  const LocalError = app.Errors?.UserFacingError || Error;
  let pending = null, mask = null;
  let maskSource = 'layer';
  let stage = '';
  const errorText = error => typeof error === 'string' ? error : error?.message || JSON.stringify(error) || String(error);
  let previewQueue = Promise.resolve();

  function featherValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1000) throw new LocalError('羽化范围为 0–1000 像素。');
    return number;
  }
  function resizeMask(data, width, height, targetWidth, targetHeight) {
    if (data.length !== width * height || ![width,height,targetWidth,targetHeight].every(v => Number.isInteger(v) && v > 0)) throw new LocalError('蒙版像素或尺寸无效。');
    const output = new data.constructor(targetWidth * targetHeight);
    for (let y=0; y<targetHeight; y++) for (let x=0; x<targetWidth; x++) {
      output[y*targetWidth+x] = data[Math.min(height-1,Math.floor((y+.5)*height/targetHeight))*width+Math.min(width-1,Math.floor((x+.5)*width/targetWidth))];
    }
    return output;
  }
  function expandMask(data, width, height, bounds, canvasWidth, canvasHeight) {
    if (data.length !== width * height) throw new LocalError('蒙版像素数量无效。');
    const left = bounds?.left ?? 0, top = bounds?.top ?? 0;
    if (![left,top,width,height,canvasWidth,canvasHeight].every(Number.isInteger) || Math.min(width,height,canvasWidth,canvasHeight) < 1) throw new LocalError('蒙版范围无效。');
    const output = new data.constructor(canvasWidth * canvasHeight);
    const start = Math.max(0,-left), end = Math.min(width,canvasWidth-left);
    if (end <= start) return output;
    for (let y=Math.max(0,-top); y<Math.min(height,canvasHeight-top); y++) {
      output.set(data.subarray(y*width+start,y*width+end),(top+y)*canvasWidth+left+start);
    }
    return output;
  }
  function ps() { return app.Batch.requirePhotoshop(); }
  function findLayer(layers, id) {
    for (const layer of layers) {
      if (layer.id === id) return layer;
      const found = layer.layers && findLayer(layer.layers,id);
      if (found) return found;
    }
    return null;
  }
  function clear() { mask = null; pending = null; syncUi(); }
  function syncUi() {
    const panel = document.getElementById('localMaskWork');
    if (panel) panel.hidden = !mask;
    const input = document.getElementById('workMaskFeather');
    if (input && mask) input.value = String(mask.feather);
  }
  async function capture(source, feather, optional = false) {
    return app.Batch.runModal('读取局部柔光蒙版', async () => {
      stage = '读取照片';
      const doc = ps().app.activeDocument;
      if (!doc) throw new LocalError('请先打开照片。');
      if (!doc.selection || !ps().imaging?.getLayerMask || !ps().imaging?.getSelection) {
        if (optional) return null;
        throw new LocalError('局部柔光需要支持 Imaging API 的新版 Photoshop；本机已按 Photoshop 2026 验证。');
      }
      const layer = doc.activeLayers[0];
      const width = Number(doc.width), height = Number(doc.height);
      const bounds = {left:0,top:0,right:width,bottom:height};
      let descriptor = null;
      if (source === 'layer') {
        if (!layer) throw new LocalError('请先选中带像素蒙版的图层。');
        [descriptor] = await app.Batch.run([{_obj:'get',_target:[{_ref:'layer',_id:layer.id}]}]);
        if (!descriptor.hasUserMask) {
          if (optional) return null;
          throw new LocalError('当前图层没有像素蒙版，请先添加蒙版，或改用当前选区。');
        }
        if (descriptor.userMaskEnabled === false) throw new LocalError('请先启用当前图层的蒙版。');
      } else if (!doc.selection.bounds) throw new LocalError('请先用套索或选框建立选区。');
      stage = source === 'layer' ? '读取图层蒙版' : '读取选区';
      const image = source === 'layer'
        ? await ps().imaging.getLayerMask({documentID:doc.id,layerID:layer.id,sourceBounds:bounds})
        : await ps().imaging.getSelection({documentID:doc.id,sourceBounds:bounds});
      try {
        if (image.imageData.components !== 1) throw new LocalError('需要单通道像素蒙版。');
        stage = '读取蒙版像素';
        const data = await image.imageData.getData({chunky:true});
        return {documentId:doc.id,width,height,data:expandMask(data,image.imageData.width,image.imageData.height,image.sourceBounds,width,height),profile:image.imageData.colorProfile,
          feather:feather === null ? featherValue(descriptor?.userMaskFeather?._value ?? descriptor?.userMaskFeather ?? layer.layerMaskFeather ?? 0) : featherValue(feather),
          density:source === 'layer' ? (layer.layerMaskDensity ?? 100) : 100};
      } finally { image.imageData.dispose(); }
    });
  }
  async function putMask(documentId, layerId, width, height, feather) {
    const data = resizeMask(mask.data,mask.width,mask.height,width,height);
    const imageData = await ps().imaging.createImageDataFromBuffer(data,{width,height,components:1,colorSpace:'Grayscale',colorProfile:mask.profile || 'Gray Gamma 2.2'});
    try {
      await ps().imaging.putLayerMask({documentID:documentId,layerID:layerId,imageData,replace:true});
      if (ps().app.activeDocument.id !== documentId) throw new LocalError('蒙版所在文档已改变。');
      const layer = findLayer(ps().app.activeDocument.layers,layerId);
      if (!layer) throw new LocalError('找不到局部柔光图层。');
      layer.layerMaskFeather = feather;
      layer.layerMaskDensity = mask.density;
    } finally { imageData.dispose(); }
  }
  function preview() {
    previewQueue = previewQueue.catch(() => {}).then(async () => {
      const state = workflow.getState();
      if (!mask || !state) return;
      await app.Batch.runModal('更新局部柔光预览', async () => {
        await app.Documents.selectDocumentById(state.work.id);
        const layer = state.layerRoles.bloom;
        await putMask(state.work.id,layer.layerId,state.work.width,state.work.height,mask.feather*state.work.width/mask.width);
      });
      syncUi();
    });
    return previewQueue;
  }
  async function removePreviewMask() {
    const state = workflow.getState();
    if (!mask || !state) return;
    await app.Batch.runModal('准备局部柔光保存', async () => {
      await app.Documents.selectDocumentById(state.work.id);
      const layerId = state.layerRoles.bloom.layerId;
      const [desc] = await app.Batch.run([{_obj:'get',_target:[{_ref:'layer',_id:layerId}]}]);
      if (desc.hasUserMask) {
        const [result] = await app.Batch.run([{_obj:'delete',_target:[{_ref:'channel',_enum:'channel',_value:'mask'},{_ref:'layer',_id:layerId}],apply:false}]);
        if (result?._obj === 'error') throw new LocalError(result.message || '无法移除临时预览蒙版。');
      }
    });
  }
  workflow.createNewGlow = async (...args) => {
    try {
      if (pending) { const options = pending; pending = null; mask = await capture(options.source,options.feather); }
      stage = '创建光效'; const result = await original.createNewGlow(...args); stage = '应用预览蒙版'; await preview(); return result;
    }
    catch (error) {
      if (workflow.getState() && mask) await original.returnToOriginal();
      clear(); throw new LocalError(stage+'：'+errorText(error),error);
    }
  };
  workflow.beginEditGlow = async (...args) => {
    try { mask = await capture('layer',null,true); const result = await original.beginEditGlow(...args); await preview(); return result; }
    catch (error) { if (workflow.getState() && mask) await original.returnToOriginal(); clear(); throw new LocalError('局部柔光编辑失败：'+errorText(error),error); }
  };
  workflow.updatePreview = async (...args) => {
    const result = await original.updatePreview(...args);
    await preview(); return result;
  };
  workflow.saveGlowToOriginal = async (...args) => {
    await previewQueue;
    const local = mask;
    const editing = workflow.getMode() === 'edit';
    await removePreviewMask();
    let result;
    try { result = await original.saveGlowToOriginal(...args); }
    catch (error) { await preview(); throw error; }
    if (local) {
      try {
        await app.Batch.runModal('保存局部柔光蒙版', async () => {
          if (ps().app.activeDocument.id !== local.documentId) throw new LocalError('保存目标照片已改变，请检查光效图层。');
          const target = ps().app.activeDocument.activeLayers[0];
          if (editing) {
            target.layerMaskFeather = local.feather;
          } else {
            try { await putMask(local.documentId,target.id,local.width,local.height,local.feather); }
            catch (error) { target.visible = false; throw error; }
          }
        });
      } catch (error) { clear(); throw new LocalError('光效已保存，但蒙版设置失败，请检查图层。'+(editing ? '' : '新建光效已隐藏以免影响全图。')+errorText(error)); }
    }
    clear(); return result;
  };
  workflow.returnToOriginal = async (...args) => {
    await previewQueue.catch(() => {});
    const result = await original.returnToOriginal(...args); clear(); return result;
  };
  function bind() {
    for (const [id,source] of [['localFromMaskButton','layer'],['localFromSelectionButton','selection']]) {
      document.getElementById(id).addEventListener('click', () => {
        maskSource = source;
        for (const [buttonId,value] of [['localFromMaskButton','layer'],['localFromSelectionButton','selection']]) {
          const button = document.getElementById(buttonId);
          if (value === source) button.classList.add('is-active'); else button.classList.remove('is-active');
          button.setAttribute('aria-pressed',String(value === source));
        }
      });
    }
    document.getElementById('newLocalGlowButton').addEventListener('click', async () => {
      try {
        pending = {source:maskSource,feather:featherValue(document.getElementById('localMaskFeather').value)};
        await app.Panel.createNewGlow();
      } catch (error) { app.Status.showError(new LocalError(errorText(error),error)); }
    });
    document.getElementById('workMaskFeather').addEventListener('change', async event => {
      if (!mask) return;
      try { mask.feather = featherValue(event.target.value); await preview(); }
      catch (error) { syncUi(); app.Status.showError(new LocalError(errorText(error),error)); }
    });
    syncUi();
  }
  app.LocalGlow = Object.freeze({resizeMask,expandMask,featherValue});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',bind); else bind();
})();
