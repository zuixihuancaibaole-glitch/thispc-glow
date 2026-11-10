(() => {
  const app = window.YCGlow = window.YCGlow || {};
  const presets = Object.freeze({
    soft_1_8: Object.freeze({scatterModel: 1, threshold: 0.04, drCompression: 60, mainOpacity: 65, coreOpacity: 50, iterations: 5, radius: 75, hue: 0, saturation: -30, whiteMist: 0}),
    soft_1_4: Object.freeze({scatterModel: 1, threshold: 0.06, drCompression: 60, mainOpacity: 80, coreOpacity: 50, iterations: 7, radius: 95, hue: 0, saturation: -30, whiteMist: 0}),
    soft_1_2: Object.freeze({scatterModel: 1, threshold: 0.10, drCompression: 110, mainOpacity: 100, coreOpacity: 50, iterations: 7, radius: 120, hue: 0, saturation: -30, whiteMist: 0}),
    white_1_8: Object.freeze({scatterModel: 1, threshold: 0.025, drCompression: 20, mainOpacity: 65, coreOpacity: 50, iterations: 5, radius: 76, hue: 0, saturation: -30, whiteMist: 12.5}),
    white_1_4: Object.freeze({scatterModel: 1, threshold: 0.04, drCompression: 24, mainOpacity: 80, coreOpacity: 50, iterations: 7, radius: 92, hue: 0, saturation: -30, whiteMist: 25}),
    white_1_2: Object.freeze({scatterModel: 1, threshold: 0.06, drCompression: 28, mainOpacity: 100, coreOpacity: 50, iterations: 8, radius: 120, hue: 0, saturation: -30, whiteMist: 50}),
  });
  const labels = Object.freeze({
    soft_1_8: '1/8 黑柔', soft_1_4: '1/4 黑柔', soft_1_2: '1/2 黑柔',
    white_1_8: '1/8 白柔', white_1_4: '1/4 白柔', white_1_2: '1/2 白柔', custom: '自定义',
  });
  const order = Object.freeze(['soft_1_8', 'soft_1_4', 'soft_1_2', 'white_1_8', 'white_1_4', 'white_1_2', 'custom']);
  const isSupported = mode => order.includes(mode);
  const isQuickMode = mode => Object.prototype.hasOwnProperty.call(presets, mode);
  app.GlowQuickModes = Object.freeze({
    presets, labels, order, defaultMode: 'soft_1_4', isSupported, isQuickMode,
    normalizeMode: (mode, fallback = 'custom') => isSupported(mode) ? mode : fallback,
    paramsFor: (mode, current = {}) => isQuickMode(mode)
      ? app.GlowParams.normalizeParams({...current, ...presets[mode], effectMode: 0}) : null,
  });
})();
