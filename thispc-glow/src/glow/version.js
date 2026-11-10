(() => {
 const app=window.YCGlow=window.YCGlow||{};
 const version=window.__YC_GLOW_MANIFEST_VERSION__||'1.6.0';
 const info={manifestVersion:version,displayVersion:'正式版 '+version,algorithm:'Spatial Scatter v2 + cooperative legacy',algorithmShort:'光学柔光 v2',iterationsMax:10,workLongEdge:1200,previewMode:'small preview / original-resolution strip rendering',stateSchema:'glow-state-v1',note:'Original source retained inside editable Smart Objects; cross-star removed.'};
 const copyText=Object.entries(info).map(([key,value])=>key+': '+value).join('\n');
 let logged=false;function log(){if(!logged){logged=true;console.log('[ThisPC Glow] '+copyText.replace(/\n/g,' | '));}}
 app.GlowVersion={info,summary:'算法：'+info.algorithmShort,copyText,consoleText:copyText.replace(/\n/g,' | '),log};
 log();
})();
