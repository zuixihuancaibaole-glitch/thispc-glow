((Math) => {
  const app=window.YCGlow;
  const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
  const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
  const encode=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
  function mirror(i,n){const p=2*n;const j=((i%p)+p)%p;return j<n?j:p-j-1;}
  function plan(params,width,height,scale=1){
    const white=params.whiteMist/100;
    return Array.from({length:params.iterations},(_,i)=>{
      const t=params.iterations===1?0:i/(params.iterations-1);
      const sigma=Math.max(.5,params.radius*scale*.06*((1.4+2*white)/.06)**t);
      return {radius:clamp(Math.round((Math.sqrt(1+4*sigma*sigma)-1)/2),1,Math.max(width,height)),weight:Math.exp(-(2-white)*t)*(1+(params.coreOpacity/100-.5)*(1-t))};
    });
  }
  function region(width,height,bounds,padding){
    if(!bounds)return {left:0,top:0,right:width,bottom:height};
    for(const k of ['left','top','right','bottom'])if(!Number.isFinite(bounds[k]))throw new Error('局部输出范围无效。');
    return {left:clamp(Math.floor(bounds.left-padding),0,width),top:clamp(Math.floor(bounds.top-padding),0,height),right:clamp(Math.ceil(bounds.right+padding),0,width),bottom:clamp(Math.ceil(bounds.bottom+padding),0,height)};
  }
  const stripRows=width=>Math.max(1,Math.min(128,Math.floor(1048576/width)));
  async function render({width,height,params:raw,readRegion,writeRegion,createStore,bounds=null,scale=Math.max(width,height)/2000,isCancelled=()=>false,onProgress=()=>{}}){
    if(![width,height].every(n=>Number.isInteger(n)&&n>0)||width*height>250000000)throw new Error('原尺寸输出支持 1–25000 万像素。');
    const params=app.GlowParams.normalizeParams(raw);
    if(params.effectMode===1||![1,2].includes(params.scatterModel))throw new Error('原尺寸输出需要新版黑柔或白柔散射模型。');
    const kernels=plan(params,width,height,scale),total=kernels.reduce((s,k)=>s+k.weight,0);
    const support=3*Math.max(...kernels.map(k=>k.radius));
    const target=region(width,height,bounds,0),area=region(width,height,bounds,support);
    const w=area.right-area.left,h=area.bottom-area.top;
    if(w<=0||h<=0||target.right<=target.left||target.bottom<=target.top)return {pixels:0,support};
    const rows=stripRows(w),stride=w*3;
    let lastYield=performance.now();
    async function checkpoint(){
      if(isCancelled())throw new Error('原尺寸渲染已取消，原光效未被替换。');
      if(performance.now()-lastYield>=12){await new Promise(r=>setTimeout(r,0));lastYield=performance.now();}
    }
    const stores=[];
    async function store(name){const result=await createStore(name,w,h,rows);stores.push(result);return result;}
    try{
      const light=await store('light'),halo=await store('halo'),a=await store('horizontal'),b=await store('vertical');
      const white=params.whiteMist/100,base=params.scatterModel===2?Math.min(.9,white*(.15+2.7*white)):white*.15,knee=.48*Math.exp(-5*params.threshold)*(1-white*.25)/(1+params.drCompression/160);
      for(let y=0;y<h;y+=rows){
        await checkpoint();const count=Math.min(rows,h-y);
        const original=await readRegion({left:area.left,top:area.top+y,width:w,height:count});
        if(original.length!==w*count*4)throw new Error('原尺寸源像素数量不匹配。');
        const max=original instanceof Uint16Array?65535:255,output=new Float32Array(w*count*3);
        for(let p=0;p<w*count;p++){
          const r=linear(original[p*4]/max),g=linear(original[p*4+1]/max),blue=linear(original[p*4+2]/max);
          const t=clamp((.2126*r+.7152*g+.0722*blue-knee)/.25,0,1),weight=base+(1-base)*t*t*(3-2*t);
          const smoothBlack=white===0;
          output[p*3]=smoothBlack?app.ScatterAlgorithm.blackEmission(r,knee):r*weight;output[p*3+1]=smoothBlack?app.ScatterAlgorithm.blackEmission(g,knee):g*weight;output[p*3+2]=smoothBlack?app.ScatterAlgorithm.blackEmission(blue,knee):blue*weight;
        }
        await light.set(y/rows,output);
      }
      async function horizontal(input,output,radius){
        const divisor=2*radius+1;
        for(let y=0;y<h;y+=rows){
          await checkpoint();const data=await input.get(y/rows),result=new Float32Array(data.length);
          for(let row=0;row<data.length/stride;row++)for(let c=0;c<3;c++){
            const base=row*stride;let sum=0;
            for(let k=-radius;k<=radius;k++)sum+=data[base+mirror(k,w)*3+c];
            for(let x=0;x<w;x++){
              result[base+x*3+c]=sum/divisor;
              sum+=data[base+mirror(x+radius+1,w)*3+c]-data[base+mirror(x-radius,w)*3+c];
            }
          }
          await output.set(y/rows,result);
        }
      }
      async function vertical(input,output,radius){
        const sums=new Float64Array(stride),divisor=2*radius+1;
        async function row(y){const index=mirror(y,h),data=await input.get(Math.floor(index/rows));return data.subarray((index%rows)*stride,(index%rows+1)*stride);}
        for(let k=-radius;k<=radius;k++){await checkpoint();const values=await row(k);for(let i=0;i<stride;i++)sums[i]+=values[i];}
        let result;
        for(let y=0;y<h;y++){
          await checkpoint();if(y%rows===0)result=new Float32Array(Math.min(rows,h-y)*stride);
          const offset=(y%rows)*stride,enter=await row(y+radius+1),leave=await row(y-radius);
          for(let i=0;i<stride;i++){result[offset+i]=sums[i]/divisor;sums[i]+=enter[i]-leave[i];}
          if(y%rows===rows-1||y===h-1)await output.set(Math.floor(y/rows),result);
        }
      }
      for(let layer=0;layer<kernels.length;layer++){
        const {radius,weight}=kernels[layer];let current=light;
        for(let pass=0;pass<3;pass++){await horizontal(current,a,radius);await vertical(a,b,radius);current=b;}
        for(let y=0;y<h;y+=rows){
          await checkpoint();const blurred=await b.get(y/rows),accum=layer?await halo.get(y/rows):new Float32Array(blurred.length);
          for(let i=0;i<accum.length;i++)accum[i]+=blurred[i]*weight;
          await halo.set(y/rows,accum);
        }
        onProgress((layer+1)/(kernels.length+1));
      }
      const density=(1+params.drCompression/80)/1.25;
      const strength=clamp(.08+params.threshold*2+params.whiteMist*.004,.02,.85)*density*1.75;
      const gain=(params.whiteMist===0?Math.min(.99,strength*2.2):strength)*params.mainOpacity/100;
      const opticalGain=params.whiteMist===0?gain:Math.min(.95,gain);
      for(let y=0;y<h;y+=rows){
        await checkpoint();const count=Math.min(rows,h-y),globalY=area.top+y;
        if(globalY+count<=target.top||globalY>=target.bottom)continue;
        const original=await readRegion({left:area.left,top:globalY,width:w,height:count}),maximum=original instanceof Uint16Array?65535:255;
        const blurred=await halo.get(y/rows),emission=await light.get(y/rows),out=new Uint16Array(w*count*4);
        for(let p=0;p<w*count;p++){
          let rgb=[0,1,2].map(c=>{const d=blurred[p*3+c]/total-emission[p*3+c];return params.scatterModel===2?(Math.abs(d)<1e-7?0:d):Math.max(0,d-1e-7);});
          if(params.hue!==0)rgb=app.ScatterAlgorithm.rotateHue(...rgb,params.hue);
          const gray=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
          for(let c=0;c<3;c++){
            const source=original[p*4+c]/maximum,diffuse=gray+(rgb[c]-gray)*(1+params.saturation/100);
            const targetValue=encode(clamp(linear(source)+diffuse*(params.scatterModel===2?opticalGain:gain),0,1));
            const value=params.scatterModel===2?targetValue:source<1?clamp((targetValue-source)/(1-source),0,1):0;
            out[p*4+c]=Math.round(clamp(value,0,1)*65535);
          }
          out[p*4+3]=65535;
        }
        await writeRegion({left:area.left,top:globalY,width:w,height:count,data:out});
      }
      onProgress(1);return {pixels:w*h,support,target,area,stripRows:rows};
    }finally{for(const value of stores)await value.close();}
  }
  app.TiledScattering=Object.freeze({render,plan,region,stripRows});
})(Math);
