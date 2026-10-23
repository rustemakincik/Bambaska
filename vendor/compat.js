/* Eski Safari (iOS 10–12) için küçük eklemeler. Yeni tarayıcılarda hiçbir şey yapmaz. */
(function () {
  if (!Array.prototype.flat) {
    Object.defineProperty(Array.prototype, 'flat', { configurable: true, writable: true, value: function (d) {
      d = d === undefined ? 1 : Number(d) || 0;
      return d < 1 ? this.slice() : this.reduce(function (a, v) { return a.concat(Array.isArray(v) ? v.flat(d - 1) : v); }, []);
    } });
  }
  if (!Array.prototype.flatMap) {
    Object.defineProperty(Array.prototype, 'flatMap', { configurable: true, writable: true, value: function (fn, t) { return this.map(fn, t).flat(1); } });
  }
  if (!Object.fromEntries) Object.fromEntries = function (it) { var o = {}; Array.from(it).forEach(function (p) { o[p[0]] = p[1]; }); return o; };
  if (window.Promise && !Promise.prototype.finally) {
    Promise.prototype.finally = function (f) { return this.then(function (v) { return Promise.resolve(f()).then(function () { return v; }); }, function (e) { return Promise.resolve(f()).then(function () { throw e; }); }); };
  }
  if (window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = Array.prototype.forEach;
  // esnek kutularda 'gap' desteği (Safari 14.1+). Yoksa <html class="nfg"> → CSS yedek boşlukları
  function flexGap() {
    try {
      var d = document.createElement('div');
      d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
      d.appendChild(document.createElement('div')); d.appendChild(document.createElement('div'));
      document.documentElement.appendChild(d); var ok = d.scrollHeight === 1; d.parentNode.removeChild(d); return ok;
    } catch (e) { return true; }
  }
  if (!flexGap()) document.documentElement.className += ' nfg';
  // dinamik import desteği var mı? (Safari 11.1+). Yoksa bulut senkronu kapalı kalır, uygulama yine açılır.
  try { new Function('u', 'return import(u)'); window.__canImport = true; } catch (e) { window.__canImport = false; }
})();
