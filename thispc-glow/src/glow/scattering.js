((Math) => {
  const app = window.YCGlow = window.YCGlow || {};
  const linear = Float32Array.from({length: 256}, (_, i) => {
    const value = i / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const encode = value => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  const clamp = (value, low, high) => value < low ? low : value > high ? high : value;
  const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  function mirror(index, length) {
    if (index >= 0 && index < length) return index;
    const period = length * 2;
    const wrapped = ((index % period) + period) % period;
    return wrapped < length ? wrapped : period - wrapped - 1;
  }

  function* boxBlur(input, output, width, height, radius, horizontal) {
    if (!horizontal) {
      const rowSize = width * 3, divisor = 2 * radius + 1;
      const sums = new Float64Array(rowSize);
      // Traverse rows contiguously, retaining the original per-column summation order.
      for (let k = -radius; k <= radius; k++) {
        const row = mirror(k, height) * rowSize;
        for (let i = 0; i < rowSize; i++) sums[i] += input[row + i];
        if ((k + radius + 1) % 16 === 0) yield;
      }
      for (let y = 0; y < height; y++) {
        const row = y * rowSize;
        const entering = mirror(y + radius + 1, height) * rowSize;
        const leaving = mirror(y - radius, height) * rowSize;
        for (let i = 0; i < rowSize; i++) {
          output[row + i] = sums[i] / divisor;
          sums[i] += input[entering + i] - input[leaving + i];
        }
        if ((y & 15) === 15) yield;
      }
      return;
    }
    const length = horizontal ? width : height;
    const lines = horizontal ? height : width;
    const step = horizontal ? 3 : width * 3;
    const divisor = 2 * radius + 1;
    const linesPerChunk = Math.max(1, Math.floor(32768 / length));
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * width * 3 : line * 3;
      let red = 0, green = 0, blue = 0;
      for (let k = -radius; k <= radius; k++) {
        const index = base + mirror(k, length) * step;
        red += input[index]; green += input[index + 1]; blue += input[index + 2];
      }
      for (let position = 0; position < length; position++) {
        const index = base + position * step;
        output[index] = red / divisor;
        output[index + 1] = green / divisor;
        output[index + 2] = blue / divisor;
        const entering = base + mirror(position + radius + 1, length) * step;
        const leaving = base + mirror(position - radius, length) * step;
        red += input[entering] - input[leaving];
        green += input[entering + 1] - input[leaving + 1];
        blue += input[entering + 2] - input[leaving + 2];
      }
      if ((line + 1) % linesPerChunk === 0) yield;
    }
  }

  function blackEmission(value,knee){
    const t=clamp((value-knee)/.25,0,1);
    // Bound the extraction slope to 1 so strong diffusion cannot reverse an edge.
    const highlight=value>knee+.25?value-knee-.125:.25*t*t*t*(1-.5*t);
    return .45*value+.55*highlight;
  }

  function* prepare(source, params) {
    const count = source.width * source.height;
    const light = new Float32Array(count * 3);
    const xray = app.Pixels.makeImageData(source.width, source.height);
    const white = params.whiteMist / 100;
    // Exponential mapping keeps the entire 1–35 emission-range slider responsive.
    const knee = 0.48 * Math.exp(-5 * params.threshold) * (1 - white * 0.25) / (1 + params.drCompression / 160);
    // A broader white-mist pedestal prevents nonlinear emission weights from reversing soft edges.
    const base = params.scatterModel === 2 ? Math.min(.9, white * (.15 + 2.7 * white)) : white * .15;
    for (let pixel = 0; pixel < count; pixel++) {
      const index = pixel * 4;
      const red = linear[source.data[index]], green = linear[source.data[index + 1]], blue = linear[source.data[index + 2]];
      if (red === undefined || green === undefined || blue === undefined) throw new Error('Invalid RGBA image pixel values.');
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const t = clamp((luminance - knee) / 0.25, 0, 1);
      const weight = base + (1 - base) * t * t * (3 - 2 * t);
      const smoothBlack=white===0;
      light[pixel * 3] = smoothBlack?blackEmission(red,knee):red*weight;
      light[pixel * 3 + 1] = smoothBlack?blackEmission(green,knee):green*weight;
      light[pixel * 3 + 2] = smoothBlack?blackEmission(blue,knee):blue*weight;
      xray.data[index] = xray.data[index + 1] = xray.data[index + 2] = (white===0?(luminance>0?(.2126*light[pixel*3]+.7152*light[pixel*3+1]+.0722*light[pixel*3+2])/luminance:0):weight)*255;
      xray.data[index + 3] = 255;
      if ((pixel & 16383) === 16383) yield;
    }
    return {light, xray};
  }

  function* scatter(light, width, height, params) {
    const halo = new Float32Array(light.length);
    const first = new Float32Array(light.length), second = new Float32Array(light.length);
    const layers = params.iterations;
    const white = params.whiteMist / 100;
    let totalWeight = 0;
    for (let layer = 0; layer < layers; layer++) {
      const t = layers === 1 ? 0 : layer / (layers - 1);
      const sigma = Math.max(0.5, params.radius * 0.06 * ((1.4 + 2 * white) / 0.06) ** t);
      const radius = clamp(Math.round((Math.sqrt(1 + 4 * sigma * sigma) - 1) / 2), 1, Math.max(width, height));
      const weight = Math.exp(-(2 - white) * t) * (1 + (params.coreOpacity / 100 - 0.5) * (1 - t));
      let current = light;
      // Three normalized box passes approximate a Gaussian without a large convolution kernel.
      for (let pass = 0; pass < 3; pass++) {
        yield* boxBlur(current, first, width, height, radius, true);
        yield* boxBlur(first, second, width, height, radius, false);
        current = second;
      }
      for (let i = 0; i < halo.length; i++) halo[i] += second[i] * weight;
      totalWeight += weight;
    }
    for (let i = 0; i < halo.length; i++) {
      const delta = halo[i] / totalWeight - light[i];
      const value = delta - 1e-7;
      halo[i] = params.scatterModel === 2 ? (Math.abs(delta)<1e-7?0:delta) : value > 0 ? value : 0;
    }
    return halo;
  }

  function rotateHue(red, green, blue, degrees) {
    const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
    const chroma = maximum - minimum;
    if (chroma < 1e-9) return [red, green, blue];
    let hue = maximum === red ? (green - blue) / chroma : maximum === green ? (blue - red) / chroma + 2 : (red - green) / chroma + 4;
    hue = ((hue + degrees / 60) % 6 + 6) % 6;
    const x = chroma * (1 - Math.abs(hue % 2 - 1));
    const rgb = hue < 1 ? [chroma,x,0] : hue < 2 ? [x,chroma,0] : hue < 3 ? [0,chroma,x] : hue < 4 ? [0,x,chroma] : hue < 5 ? [x,0,chroma] : [chroma,0,x];
    return rgb.map(value => value + minimum);
  }

  function* renderStages(source, rawParams = {}, previous = null) {
    if (!source || !Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 1 || source.height < 1 || source.width * source.height > 16000000 || source.data?.length !== source.width * source.height * 4) {
      throw new Error('Invalid RGBA image dimensions or pixel count.');
    }
    const started = now();
    const params = app.GlowParams.normalizeParams(rawParams);
    const sourceKey = `${params.threshold}|${params.drCompression}|${params.whiteMist}|${params.scatterModel}`;
    const geometryKey = `${sourceKey}|${params.radius}|${params.iterations}|${params.coreOpacity}|${params.scatterModel}`;
    const compatible = previous?.version === 'scatter-v1.4' && previous.sourceData === source.data && previous.width === source.width && previous.height === source.height;
    const sourceHit = compatible && previous.sourceKey === sourceKey;
    const geometryHit = sourceHit && previous.geometryKey === geometryKey;
    const prepared = sourceHit ? previous.prepared : yield* prepare(source, params);
    const sourceDone = now();
    const halo = geometryHit ? previous.halo : yield* scatter(prepared.light, source.width, source.height, params);
    const geometryDone = now();
    const bloom = app.Pixels.makeImageData(source.width, source.height);
    // This UI control is haze density; it must also affect already-selected white lights.
    const density = (1 + params.drCompression / 80) / 1.25;
    const strength = clamp(0.08 + params.threshold * 2 + params.whiteMist * 0.004, 0.02, 0.85) * density * 1.75;
    const gain = (params.whiteMist===0?Math.min(.99,strength*2.2):strength)*params.mainOpacity/100;
    const opticalGain=params.whiteMist===0?gain:Math.min(.95,gain);
    const saturation = 1 + params.saturation / 100;
    for (let pixel = 0; pixel < source.width * source.height; pixel++) {
      let red = halo[pixel * 3], green = halo[pixel * 3 + 1], blue = halo[pixel * 3 + 2];
      if (params.hue !== 0) [red, green, blue] = rotateHue(red, green, blue, params.hue);
      const gray = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      for (let channel = 0; channel < 3; channel++) {
        const index = pixel * 4 + channel;
        const component = channel === 0 ? red : channel === 1 ? green : blue;
        const diffuseColor = gray + (component - gray) * saturation;
        const optical = params.scatterModel === 2;
        const diffusion = optical ? diffuseColor : diffuseColor > 0 ? diffuseColor : 0;
        if (diffusion === 0) { bloom.data[index] = optical ? source.data[index] : 0; continue; }
        const original = source.data[index] / 255;
        const target = encode(clamp(linear[source.data[index]] + diffusion * (optical?opticalGain:gain), 0, 1));
        bloom.data[index] = optical ? target * 255 : original < 1 ? clamp((target - original) / (1 - original), 0, 1) * 255 : 0;
      }
      bloom.data[pixel * 4 + 3] = 255;
      if ((pixel & 8191) === 8191) yield;
    }
    const finished = now();
    return {
      xray: prepared.xray, bloom,
      cache: {version:'scatter-v1.4', width:source.width, height:source.height, sourceData:source.data, sourceKey, geometryKey, prepared, halo},
      cacheMode: geometryHit ? 'compose' : sourceHit ? 'geometry' : 'full',
      sourceRebuilt: !sourceHit, geometryRebuilt: !geometryHit,
      timing: {sourceStageMs:sourceDone-started, blurStageMs:geometryDone-sourceDone, composeMs:finished-geometryDone, totalAlgorithmMs:finished-started, totalMs:finished-started},
    };
  }
  function renderPhaseOneCached(...args) {
    const stages = renderStages(...args);
    let step;
    do { step = stages.next(); } while (!step.done);
    return step.value;
  }
  async function renderPhaseOneCachedAsync(source, params, previous, {isStale} = {}) {
    const stages = renderStages(source, params, previous);
    let sliceStarted = now();
    try {
      while (true) {
        if (isStale?.()) throw new Error('预览任务已过期，已停止计算。');
        const step = stages.next();
        if (step.done) return step.value;
        if (now() - sliceStarted >= 12) {
          await new Promise(resolve => setTimeout(resolve, 0));
          sliceStarted = now();
        }
      }
    } finally { stages.return(); }
  }
  app.ScatterAlgorithm = Object.freeze({renderPhaseOneCached, renderPhaseOneCachedAsync, rotateHue, blackEmission});
})(Math);
