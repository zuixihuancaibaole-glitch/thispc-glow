(() => {
  const app = window.YCGlow = window.YCGlow || {};
  function check() {
    return { allowed: true, reason: 'local', message: '本机副本 · 无到期日期' };
  }
  function refresh() {
    const label = document.getElementById('expiryDateLabel');
    if (label) label.textContent = check().message;
    const notice = document.getElementById('expiryNotice');
    if (notice) { notice.hidden = true; notice.textContent = ''; }
    return check();
  }
  app.Expiry = Object.freeze({
    check, refresh,
    assertAllowed: () => true,
    allowAction: () => true,
    withFinalSave: async callback => await callback(),
    install: refresh,
  });
})();
