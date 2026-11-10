(() => {
  const app = window.YCGlow = window.YCGlow || {};
  const softGlow = app.GlowAlgorithm;
  if (!softGlow) throw new Error('Soft glow algorithm must load before the effect router.');

  function renderPhaseOneCached(source, params = {}, cache = null) {
    const normalized = app.GlowParams.normalizeParams(params);
    if (normalized.effectMode === 1) {
      throw new Error('此版本已移除十字星光。旧效果像素保持不变，请选择黑柔或白柔预设后创建新光效。');
    }
    if (normalized.scatterModel >= 1) {
      if (!app.ScatterAlgorithm?.renderPhaseOneCached) throw new Error('Scattering algorithm is unavailable.');
      return app.ScatterAlgorithm.renderPhaseOneCached(source, normalized, cache);
    }
    const result = softGlow.renderPhaseOneCached(source, params, cache);
    return finishLegacy(source, normalized, result);
  }

  function finishLegacy(source, normalized, result) {
    if (normalized.whiteMist === 0) return result;

    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const amount = normalized.whiteMist / 100;
    const pixelCount = source.width * source.height;
    let luminance = 0;
    for (let i = 0; i < source.data.length; i += 4) {
      luminance += 0.2126 * source.data[i] + 0.7152 * source.data[i + 1] + 0.0722 * source.data[i + 2];
    }
    // Scene-dependent scatter lifts shadows without adding light to a black frame.
    const veil = 40 * amount * Math.sqrt(luminance / Math.max(1, pixelCount * 255)) * normalized.mainOpacity / 100;
    const data = result.bloom.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      for (let channel = 0; channel < 3; channel++) {
        const diffuse = data[i + channel] + (gray - data[i + channel]) * amount * 0.65;
        data[i + channel] = Math.min(255, Math.max(0, 255 - (255 - diffuse) * (1 - veil / 255)));
      }
    }
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
    if (result.timing) {
      result.timing.composeMs += elapsed;
      result.timing.totalAlgorithmMs += elapsed;
      result.timing.totalMs += elapsed;
    }
    return result;
  }

  app.GlowAlgorithm = Object.freeze({
    renderPhaseOneCached,
    async renderPhaseOneCachedAsync(source, params = {}, cache = null, options = {}) {
      const normalized = app.GlowParams.normalizeParams(params);
      if (normalized.effectMode !== 1 && normalized.scatterModel >= 1) {
        return app.ScatterAlgorithm.renderPhaseOneCachedAsync(source, normalized, cache, options);
      }
      if (options.isStale?.()) throw new Error('预览任务已过期，已停止计算。');
      if (normalized.effectMode === 1) throw new Error('此版本已移除十字星光，旧效果不会被改写。');
      const result = await softGlow.renderPhaseOneCachedAsync(source, normalized, cache, options);
      if (options.isStale?.()) throw new Error('预览任务已过期，已停止计算。');
      return finishLegacy(source, normalized, result);
    },
    renderPhaseOne(source, params = {}) {
      const {xray, bloom} = renderPhaseOneCached(source, params);
      return {xray, bloom};
    },
  });
})();
