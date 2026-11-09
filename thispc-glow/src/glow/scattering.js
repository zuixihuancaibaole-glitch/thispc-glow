(() => {
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

  function boxBlur(input, output, width, height, radius, horizontal) {
    const length = horizontal ? width : height;
    const lines = horizontal ? height : width;
    const step = horizontal ? 3 : width * 3;
    const divisor = 2 * radius + 1;
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
    }
  }

  function prepare(source, params) {
    const count = source.width * source.height;
    const light = new Float32Array(count * 3);
    const xray = app.Pixels.makeImageData(source.width, source.height);
    const white = params.whiteMist / 100;
    const knee = clamp((0.48 - params.threshold * 2 - white * 0.12) / (1 + params.drCompression / 160), 0.02, 0.8);
    for (let pixel = 0; pixel < count; pixel++) {
      const index = pixel * 4;
      const red = linear[source.data[index]], green = linear[source.data[index + 1]], blue = linear[source.data[index + 2]];
      if (red === undefined || green === undefined || blue === undefined) throw new Error('Invalid RGBA image pixel values.');
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const t = clamp((luminance - knee) / 0.25, 0, 1);
      const weight = white * 0.15 + (1 - white * 0.15) * t * t * (3 - 2 * t);
      light[pixel * 3] = red * weight;
      light[pixel * 3 + 1] = green * weight;
      light[pixel * 3 + 2] = blue * weight;
      xray.data[index] = xray.data[index + 1] = xray.data[index + 2] = weight * 255;
      xray.data[index + 3] = 255;
    }
    return {light, xray};
  }

  function scatter(light, width, height, params) {
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
        boxBlur(current, first, width, height, radius, true);
        boxBlur(first, second, width, height, radius, false);
        current = second;
      }
      for (let i = 0; i < halo.length; i++) halo[i] += second[i] * weight;
      totalWeight += weight;
    }
    for (let i = 0; i < halo.length; i++) {
      const value = halo[i] / totalWeight - light[i] - 1e-7;
      halo[i] = value > 0 ? value : 0;
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

  function renderPhaseOneCached(source, rawParams = {}, previous = null) {
    if (!source || !Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 1 || source.height < 1 || source.width * source.height > 16000000 || source.data?.length !== source.width * source.height * 4) {
      throw new Error('Invalid RGBA image dimensions or pixel count.');
    }
    const started = now();
    const params = app.GlowParams.normalizeParams(rawParams);
    const sourceKey = `${params.threshold}|${params.drCompression}|${params.whiteMist}`;
    const geometryKey = `${sourceKey}|${params.radius}|${params.iterations}|${params.coreOpacity}`;
    const compatible = previous?.version === 'scatter-v1.1' && previous.sourceData === source.data && previous.width === source.width && previous.height === source.height;
    const sourceHit = compatible && previous.sourceKey === sourceKey;
    const geometryHit = sourceHit && previous.geometryKey === geometryKey;
    const prepared = sourceHit ? previous.prepared : prepare(source, params);
    const sourceDone = now();
    const halo = geometryHit ? previous.halo : scatter(prepared.light, source.width, source.height, params);
    const geometryDone = now();
    const bloom = app.Pixels.makeImageData(source.width, source.height);
    const gain = clamp(0.08 + params.threshold * 2 + params.whiteMist * 0.004, 0.02, 0.85) * 1.75 * params.mainOpacity / 100;
    const saturation = 1 + params.saturation / 100;
    for (let pixel = 0; pixel < source.width * source.height; pixel++) {
      let red = halo[pixel * 3], green = halo[pixel * 3 + 1], blue = halo[pixel * 3 + 2];
      if (params.hue !== 0) [red, green, blue] = rotateHue(red, green, blue, params.hue);
      const gray = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      for (let channel = 0; channel < 3; channel++) {
        const index = pixel * 4 + channel;
        const component = channel === 0 ? red : channel === 1 ? green : blue;
        const diffuseColor = gray + (component - gray) * saturation;
        const diffusion = diffuseColor > 0 ? diffuseColor : 0;
        const original = source.data[index] / 255;
        const target = encode(clamp(linear[source.data[index]] + diffusion * gain, 0, 1));
        // shortcut: Screen-only layers cannot attenuate source peaks; use full-image linear compositing for optical calibration.
        bloom.data[index] = original < 1 ? clamp((target - original) / (1 - original), 0, 1) * 255 : 0;
      }
      bloom.data[pixel * 4 + 3] = 255;
    }
    const finished = now();
    return {
      xray: prepared.xray, bloom,
      cache: {version:'scatter-v1.1', width:source.width, height:source.height, sourceData:source.data, sourceKey, geometryKey, prepared, halo},
      cacheMode: geometryHit ? 'compose' : sourceHit ? 'geometry' : 'full',
      sourceRebuilt: !sourceHit, geometryRebuilt: !geometryHit,
      timing: {sourceStageMs:sourceDone-started, blurStageMs:geometryDone-sourceDone, composeMs:finished-geometryDone, totalAlgorithmMs:finished-started, totalMs:finished-started},
    };
  }
  app.ScatterAlgorithm = Object.freeze({renderPhaseOneCached});
})();
