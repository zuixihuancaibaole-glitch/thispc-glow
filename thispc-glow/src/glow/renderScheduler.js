(() => {
  const app = window.YCGlow = window.YCGlow || {};
  async function run(stages, {isStale} = {}) {
    let started = performance.now();
    try {
      while (true) {
        if (isStale?.()) throw new Error('预览任务已过期，已停止计算。');
        const step = stages.next();
        if (step.done) return step.value;
        if (performance.now() - started >= 12) {
          await new Promise(resolve => setTimeout(resolve,0));
          started = performance.now();
        }
      }
    } finally { stages.return(); }
  }
  app.RenderScheduler = Object.freeze({async:run});
})();
