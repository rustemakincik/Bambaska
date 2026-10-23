/* KafeStok — ekranlar */
(() => {
  const $app = document.getElementById('app');
  const S = Store;
  const UKEY = S.isDemo ? 'kafestok.demo.user' : 'kafestok.user', LKEY = S.isDemo ? 'kafestok.demo.lastUser' : 'kafestok.lastUser';
  const ui = {
    stokDept: 'all', stokQ: '', onlyCrit: false,
    sayimDept: null, sayimDraft: {},
    sipTab: 'hazir', orderDraft: {}, orderNotes: {}, lineNotes: {}, lnOpen: {},
  };
  let user = null;

  // ---------- yardımcılar
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
  const stepOf = it => (['kg', 'lt'].includes(it.unit) ? 0.5 : 1);
  const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr');
  const ST_LABEL = { yeni: 'Sayılmadı', bitti: 'Bitti', kritik: 'Kritik', azaliyor: 'Azalıyor', iyi: 'Yeterli' };
  const MV_LABEL = { sayim: 'saydı', giris: 'giriş yaptı', cikis: 'çıkış yaptı' };
  const isAdmin = () => user?.role === 'yonetici';
  // ---- roller ve yetkiler: yönetici her şeyi yapar; müdür/personel için kişi bazında işaretlenir
  const ROLES = [['yonetici', 'Yönetici'], ['mudur', 'Müdür'], ['personel', 'Personel'], ['gelistirici', 'Geliştirici']];
  const roleName = r => (ROLES.find(x => x[0] === r) || ROLES[2])[1];
  const PERMS = [
    ['Sayım ve sipariş', [
      ['sayim_tum', 'Tüm bölümlerde sayım', 'Kapalıysa sadece aşağıda seçili bölümleri sayar'],
      ['siparis_hazirla', 'Sipariş hazırlayıp onaya gönderme'],
      ['siparis_direkt', 'Onaysız sipariş verme', 'Yöneticiye sormadan WhatsApp ile gönderir'],
      ['siparis_onay', 'Siparişleri onaylama / reddetme'],
      ['teslim', 'Gelen siparişi teslim alma', 'Gelen ürünü stoğa ekler'],
    ]],
    ['Kayıtlar', [
      ['malzeme', 'Malzeme ekleme / düzenleme', 'Ad, birim, minimum ve hedef miktarlar'],
      ['tedarikci', 'Tedarikçi ekleme / düzenleme'],
      ['bolum', 'Bölüm ekleme / düzenleme'],
    ]],
    ['Demirbaş', [
      ['demirbas_durum', 'Demirbaş durumunu değiştirme', 'Arızalı, tamirde, kayıp, aktif…'],
      ['demirbas_yonet', 'Demirbaş ekleme / düzenleme / etiket yazdırma'],
    ]],
    ['Diğer', [
      ['cihaz', 'Yeni telefon ekleme', '“Cihaz ekle” karekodunu gösterebilir'],
    ]],
  ];
  const PRESET = {
    gelistirici: {}, // her şeyi görür, hiçbir şeyi değiştiremez; yönetici isterse açar
    mudur: { sayim_tum: 1, siparis_hazirla: 1, teslim: 1, malzeme: 1, tedarikci: 1, bolum: 1, demirbas_durum: 1, demirbas_yonet: 1 },
    personel: { siparis_hazirla: 1, teslim: 1, demirbas_durum: 1 },
  };
  const permsOf = u => u.perms || PRESET[u.role] || PRESET.personel;
  const can = p => !!user && (user.role === 'yonetici' || !!permsOf(user)[p]);
  const isDev = () => user?.role === 'gelistirici';
  const viewAll = () => isAdmin() || isDev();
  const readOnly = () => isDev() && !Object.keys(permsOf(user)).length;
  const canCountDept = deptId => isDev() ? can('sayim_tum') : myDepts().some(d => d.id === deptId);
  const RO_MSG = 'Salt okunur: bu işlem için yetkin kapalı. Yönetici açabilir.';
  const canAnyRecords = () => can('malzeme') || can('tedarikci') || can('bolum');
  const myDepts = () => (isAdmin() || isDev() || can('sayim_tum') || !user.deptIds?.length) ? S.get().depts : S.get().depts.filter(d => user.deptIds.includes(d.id));

  function ago(t) {
    const d = (Date.now() - t) / 1000;
    if (d < 60) return 'az önce';
    if (d < 3600) return Math.floor(d / 60) + ' dk önce';
    const dt = new Date(t), today = new Date();
    const hm = dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (dt.toDateString() === today.toDateString()) return 'bugün ' + hm;
    const y = new Date(today); y.setDate(y.getDate() - 1);
    if (dt.toDateString() === y.toDateString()) return 'dün ' + hm;
    return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' ' + hm;
  }
  // ilerleme çubuğu: düz = elde, taralı = siparişte (yolda / onayda), kesik çizgili = hazırlanan taslak
  function bar(it, big = false, draft = 0) {
    const onay = S.pendingQtyFor(it.id, ['onay']), yol = S.pendingQtyFor(it.id, ['verildi']);
    const max = Math.max(it.target, it.qty + onay + yol + draft, 1);
    const st = S.status(it), w = x => Math.min(100, x / max * 100);
    return `<div class="bar ${big ? 'bar-big' : ''}"><span class="st-${st}" style="width:${w(it.qty)}%"></span>${yol ? `<span class="seg-yol" style="width:${w(yol)}%"></span>` : ''}${onay ? `<span class="seg-onay" style="width:${w(onay)}%"></span>` : ''}${draft ? `<span class="seg-draft" style="width:${w(draft)}%"></span>` : ''}<em style="left:${w(it.min)}%"></em>${big ? `<i class="tgt" style="left:calc(${w(it.target)}% - 2px)"></i>` : ''}</div>`;
  }
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    stok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
    sayim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/></svg>',
    siparis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12L22 7H6.2"/></svg>',
    demirbas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M17 17v4h4v-3"/></svg>',
    ayarlar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  };

  // ---------- temalar (cihaza kaydedilir)
  const SKINS = [
    { id: 'bambaska', name: 'Bambaşka', c: ['#121212', '#f2f4f1', '#65b13c'], d: 'Logo renkleri' },
    { id: 'auto', name: 'Otomatik', c: ['#2b1d15', '#f5efe6', '#c2662d'], d: 'Telefon ayarına göre açık/koyu' },
    { id: 'espresso', name: 'Espresso', c: ['#2b1d15', '#f5efe6', '#c2662d'] },
    { id: 'gece', name: 'Gece', c: ['#0f0a07', '#17110d', '#e08447'] },
    { id: 'nane', name: 'Nane', c: ['#1f3a2c', '#eef4ef', '#2f8f6a'] },
    { id: 'lacivert', name: 'Lacivert', c: ['#1b2a4a', '#eef1f6', '#b58b12'] },
    { id: 'bordo', name: 'Bordo', c: ['#4a1420', '#f6eeee', '#a3243b'] },
    { id: 'gecemavi', name: 'Gece Mavisi', c: ['#0a0f19', '#0f1522', '#4f8cff'] },
  ];
  const getSkin = () => { try { return localStorage.getItem('kafestok.skin') || 'bambaska'; } catch (e) { return 'bambaska'; } };
  function setSkin(id) {
    try { localStorage.setItem('kafestok.skin', id); } catch (e) {}
    applySkin();
  }
  function applySkin() {
    const id = getSkin();
    if (id === 'auto') document.documentElement.removeAttribute('data-skin'); else document.documentElement.setAttribute('data-skin', id);
    requestAnimationFrame(() => {
      const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', brand || '#2b1d15');
    });
  }
  applySkin();

  // ---------- kafe kimliği: logo + isim / sadece logo / sadece isim
  const CAFE_MODES = [['both', 'Logo + İsim'], ['logo', 'Sadece logo'], ['name', 'Sadece isim']];
  const cafeMode = () => { const c = S.get().cafe; return c.logo ? (c.mode || 'both') : 'name'; };
  function brandHTML(where) {
    const c = S.get().cafe;
    // etiket çok küçük: sadece logo seçilse bile yanına isim yazılır ki okunabilsin
    const m = where === 'label' && cafeMode() === 'logo' ? 'both' : cafeMode();
    return `<span class="brand b-${where} m-${m} bg-${c.logoBg || 'light'}">${m !== 'name' ? `<img class="b-logo" src="${c.logo}" alt="${esc(c.name)}">` : ''}${m !== 'logo' ? `<span class="b-name">${esc(c.name)}</span>` : ''}</span>`;
  }
  // yüklenen görseli küçült (en uzun kenar 512 px), şeffaflık korunur
  function readLogo(file) {
    return new Promise((ok, fail) => {
      if (!file || !file.type.startsWith('image/')) return fail(new Error('Görsel dosyası seç'));
      const fr = new FileReader();
      fr.onerror = () => fail(new Error('Dosya okunamadı'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => fail(new Error('Görsel açılamadı'));
        img.onload = () => {
          const k = Math.min(1, 512 / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k) || 512; c.height = Math.round(img.height * k) || 512;
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/png'));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function editCafe() {
    const c = S.get().cafe;
    let logo = c.logo || '', mode = c.mode || 'both', logoBg = c.logoBg || 'light';
    sheet(`
      <h3>Kafe kimliği</h3><div class="sub">Giriş ekranında, üst barda, sipariş formunda ve etiketlerde görünür</div>
      <div class="cafe-prev"><div class="cp-bar" id="cpBar"></div><div class="cp-paper" id="cpPaper"></div></div>
      <label class="field"><span>Kafe adı</span><input id="cfName" value="${esc(c.name)}" maxlength="40"></label>
      <div class="field"><span>Logo</span>
        <div class="logo-pick">
          <div class="lp-thumb" id="lpThumb"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:6px">
            <label class="btn sm" style="cursor:pointer">📷 Logo yükle<input type="file" id="cfLogo" accept="image/*" hidden></label>
            <button class="btn ghost sm" id="cfDel" type="button">Logoyu kaldır</button>
          </div>
        </div>
        <div class="small muted" style="margin-top:6px">PNG (şeffaf arka plan) en iyi sonucu verir. Kare veya yatay logo olabilir.</div>
      </div>
      <div class="field" id="cfBgF"><span>Logo zemini</span><div class="seg" id="cfBg" style="margin:0"><button type="button" data-b="light">Beyaz kutu içinde</button><button type="button" data-b="none">Zeminsiz</button></div>
        <div class="small muted" style="margin-top:6px">Koyu, yuvarlak logolar koyu barda zeminsiz daha iyi durur.</div></div>
      <div class="field"><span>Nasıl görünsün?</span><div class="seg" id="cfMode" style="margin:0">${CAFE_MODES.map(([k, l]) => `<button type="button" data-m="${k}">${l}</button>`).join('')}</div></div>
      <button class="btn primary block" id="cfSave">Kaydet</button>`,
      sh => {
        const nameIn = sh.querySelector('#cfName');
        const draw = () => {
          const m = logo ? mode : 'name', nm = esc(nameIn.value.trim() || 'Kafe');
          const html = `<span class="brand m-${m} bg-${logoBg}">${m !== 'name' ? `<img class="b-logo" src="${logo}">` : ''}${m !== 'logo' ? `<span class="b-name">${nm}</span>` : ''}</span>`;
          sh.querySelector('#cpBar').innerHTML = html.replace('class="brand', 'class="brand b-bar');
          sh.querySelector('#cpPaper').innerHTML = html.replace('class="brand', 'class="brand b-doc') + '<small>SİPARİŞ FORMU</small>';
          sh.querySelector('#lpThumb').innerHTML = logo ? `<img src="${logo}">` : '<span>Logo yok</span>';
          sh.querySelector('#cfDel').disabled = !logo;
          sh.querySelector('#cfBgF').style.display = logo ? '' : 'none';
          sh.querySelectorAll('#cfBg [data-b]').forEach(b => b.classList.toggle('on', b.dataset.b === logoBg));
          sh.querySelectorAll('#cfMode [data-m]').forEach(b => {
            b.classList.toggle('on', (logo ? mode : 'name') === b.dataset.m);
            b.disabled = !logo && b.dataset.m !== 'name';
          });
        };
        nameIn.oninput = draw;
        sh.querySelector('#cfLogo').onchange = async e => {
          try { logo = await readLogo(e.target.files[0]); if (!c.logo) mode = 'both'; draw(); }
          catch (err) { toast(err.message); }
        };
        sh.querySelector('#cfDel').onclick = () => { logo = ''; draw(); };
        sh.querySelectorAll('#cfMode [data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
        sh.querySelectorAll('#cfBg [data-b]').forEach(b => b.onclick = () => { logoBg = b.dataset.b; draw(); });
        sh.querySelector('#cfSave').onclick = () => {
          const name = nameIn.value.trim();
          if (!name) return toast('Kafe adı boş olamaz (sadece logo seçsen de PDF ve WhatsApp mesajında kullanılır)');
          S.setCafe({ name, logo, mode: logo ? mode : 'name', logoBg });
          closeSheet(); render(); toast('Kafe kimliği kaydedildi');
        };
        draw();
      });
  }

  // ---------- yönlendirme
  const route = () => (location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] || 'home');
  const routeArg = () => decodeURIComponent(location.hash.replace(/^#\/?/, '').split('/')[1] || '');
  let pendingDeep = null;

  function render() {
    document.body.classList.toggle('rail', !!user && !['etiket', 'belge', 'katil'].includes(route()));
    if (route() === 'katil') { if (S.isDemo) { S.setMode('real'); return; } return renderJoin(); }
    if (route() === 'n' && user) { const id = routeArg(), e = events().find(x => x.id === id); history.replaceState(null, '', '#/home'); if (e) { setTimeout(() => openEvent(e), 0); } }
    if (user) user = S.user(user.id) || user;
    if (!user) { if (route() === 'd') pendingDeep = location.hash; return renderLogin(); }
    const r = route();
    const db = S.get();
    const crit = myNeeds().length;
    if (r === 'etiket') return renderLabels();
    if (r === 'belge') return renderDoc();
    const onayN = db.orders.filter(o => o.status === 'onay').length;
    const titles = { home: db.cafe.name, stok: 'Stok', sayim: 'Sayım', siparis: 'Sipariş', demirbas: 'Demirbaş', d: 'Demirbaş', ayarlar: 'Ayarlar' };
    const view = { home: viewHome, stok: viewStok, sayim: viewSayim, siparis: viewSiparis, demirbas: viewDemirbas, d: viewDemirbas, ayarlar: viewAyarlar }[r] || viewHome;
    $app.innerHTML = `
      <header class="topbar">
        <div class="grow">
          <h1>${r === 'home' || !titles[r] ? brandHTML('bar') : esc(titles[r])}</h1>
          <div class="sub">${S.isDemo ? '<span class="demo-pill">DEMO</span>' : ''}${readOnly() ? '<span class="demo-pill ro-pill">SALT OKUNUR</span>' : ''}${syncLabel()}</div>
        </div>
        ${bellHTML()}
        <button class="scan-btn" data-act="scan" aria-label="Karekod okut"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg></button>
        <button class="avatar" data-act="profile" aria-label="Profil">${esc(initials(user.name))}</button>
      </header>
      <main class="r-${r === 'd' ? 'demirbas' : r}">${view()}</main>
      <nav class="nav">
        ${[['home', 'Özet'], ['stok', 'Stok'], ['sayim', 'Sayım'], ['siparis', 'Sipariş'], ['demirbas', 'Demirbaş']].map(([k, l]) =>
          `<a href="#/${k}" class="${r === k || (k === 'demirbas' && r === 'd') ? 'on' : ''}">${ICON[k]}${l}${k === 'siparis' && can('siparis_onay') && onayN ? `<span class="pip warn">${onayN}</span>` : k === 'siparis' && crit ? `<span class="pip">${crit}</span>` : ''}</a>`).join('')}
      </nav>`;
    afterRender(r);
  }

  // ---------- giriş
  let pin = '', loginUser = null, pinErr = '', fails = 0, lockUntil = 0, showDemo = S.isDemo, clockT = null;
  const DEMO_USER = { id: '__demo', name: 'Demo hesabı', role: 'demo' };
  const AV_COLORS = ['#c2662d', '#3f8f5a', '#4a6a85', '#8a4fa3', '#b4532a', '#2f7f86', '#a3243b'];
  const avColor = n => AV_COLORS[[...(n || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
  const lastUserId = () => { try { return localStorage.getItem(LKEY); } catch (e) { return null; } };
  function renderLogin() {
    const db = S.get();
    if (!S.isDemo && !db.users.length) return renderSetup();
    clearTimeout(clockT); clockT = setTimeout(() => { if (!user && !loginUser) renderLogin(); }, 30000);
    const now = new Date();
    const hour = now.getHours(), greet = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
    const last = lastUserId();
    const users = [...db.users].sort((a, b) => (b.id === last) - (a.id === last));
    const roleTxt = u => u.role === 'demo' ? 'Örnek verilerle deneme · PIN 0000' : u.role === 'yonetici' ? 'Yönetici' : roleName(u.role) + ((u.deptIds || []).length ? ' · ' + u.deptIds.map(d => S.dept(d)?.name).filter(Boolean).join(', ') : '');
    const u = loginUser === '__demo' ? DEMO_USER : loginUser && S.user(loginUser);
    const locked = Date.now() < lockUntil;
    $app.innerHTML = `
      <div class="login">
        <div class="login-glow"></div>
        <div class="login-top">${brandLoginTop(db)}</div>
        ${S.isDemo ? `<div class="demo-banner">🧪 <b>DEMO</b> · örnek veriler, sadece bu telefonda <button data-act="exit-demo">Gerçek kafeye dön ›</button></div>` : ''}
        ${!u ? `
        <div class="login-clock">${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="login-date">${now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${greet}</div>
        <div class="login-q">Kim giriş yapıyor?</div>
        <div class="user-list">${users.map(x => `
          <button class="user-row" data-act="pick-user" data-id="${x.id}">
            <span class="avatar" style="background:${avColor(x.name)}">${esc(initials(x.name))}</span>
            <span class="ur-main"><b>${esc(x.name)}</b><small>${esc(roleTxt(x))}</small></span>
            ${x.id === last ? '<span class="ur-last">Son giriş</span>' : ''}
            <span class="ur-arrow">›</span>
          </button>`).join('')}</div>
        ${S.isDemo ? `<button class="demo-link" data-act="demo-pins">${showDemo ? 'Demo PIN: ' + db.users.map(x => `${esc(x.name)} ${esc(x.pin)}`).join(' · ') : 'Demo PIN’lerini göster'}</button>`
          : `<button class="user-row demo-row" data-act="pick-user" data-id="__demo"><span class="avatar">🧪</span><span class="ur-main"><b>Demo hesabı</b><small>Örnek verilerle dene · gerçek kafeye karışmaz</small></span><span class="ur-arrow">›</span></button>
        ${!Sync.cloud ? `<button class="connect-link" data-act="scan">📷 Bu telefonu kafeye bağla</button>` : ''}`}`
        : `
        <button class="login-back" data-act="login-back">‹ Kullanıcı değiştir</button>
        <div class="pin-user">
          <span class="avatar big" style="background:${u.role === 'demo' ? '#444' : avColor(u.name)}">${u.role === 'demo' ? '🧪' : esc(initials(u.name))}</span>
          <div class="pin-hello">Merhaba, ${esc(u.name)}</div>
          <div class="pin-sub">${esc(roleTxt(u))}</div>
        </div>
        <div class="pin-dots ${pinErr ? 'err' : ''}">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>
        <div class="pin-msg ${pinErr || locked ? 'bad' : ''}">${locked ? `Çok fazla hatalı deneme. ${Math.ceil((lockUntil - Date.now()) / 1000)} sn bekle.` : pinErr || '4 haneli PIN kodunu gir'}</div>
        <div class="pad ${locked ? 'locked' : ''}">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-act="pin" data-k="${k}" ${locked ? 'disabled' : ''}>${k === '⌫' ? '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM17 9l-5 6M12 9l5 6"/></svg>' : k}</button>`).join('')}</div>`}
      </div>`;
    if (locked) { clearTimeout(clockT); clockT = setTimeout(renderLogin, 1000); }
  }
  function pressPin(k) {
    if (Date.now() < lockUntil) return;
    pinErr = '';
    if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
    if (pin.length === 4) {
      if (loginUser === '__demo') {
        if (pin === '0000') { S.setMode('demo'); return; }
        pin = ''; pinErr = 'Demo PIN’i 0000'; renderLogin(); return;
      }
      const u = S.user(loginUser);
      if (u && u.pin === pin) {
        user = u; pin = ''; loginUser = null; fails = 0; clearTimeout(clockT);
        try { localStorage.setItem(UKEY, u.id); localStorage.setItem(LKEY, u.id); } catch (e) {}
        location.hash = pendingDeep || '#/home'; pendingDeep = null; render(); checkNotify(); return;
      }
      fails++; pin = '';
      if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
      else pinErr = `PIN hatalı · ${5 - fails} deneme hakkın kaldı`;
      if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
    }
    renderLogin();
  }
  document.addEventListener('keydown', e => {
    if (user || !loginUser) return;
    if (/^\d$/.test(e.key)) pressPin(e.key); else if (e.key === 'Backspace') pressPin('⌫'); else if (e.key === 'Escape') { loginUser = null; pin = ''; renderLogin(); }
  });

  // ---------- İLK KURULUM (gerçek kafe, henüz kullanıcı yok)
  function renderSetup() {
    const db = S.get();
    if (Sync.cloud) { // buluta bağlı ama kullanıcılar henüz inmedi
      $app.innerHTML = `<div class="login"><div class="login-glow"></div><div class="login-top">${brandLoginTop(db)}</div>
        <div class="setup-box"><b>Kafenin verileri indiriliyor…</b><p>İnternet bağlantısını kontrol et. Uzun sürerse uygulamayı kapatıp aç.</p></div></div>`;
      return;
    }
    $app.innerHTML = `
      <div class="login">
        <div class="login-glow"></div>
        <div class="login-top">${brandLoginTop(db)}</div>
        <div class="setup-title">Hoş geldin 👋</div>
        <div class="setup-sub">Bu telefon için başlangıç yolunu seç.</div>
        <button class="setup-opt main" data-act="setup-new"><span>🏁</span><div><b>Yeni kafe kur</b><small>İlk telefon. Yönetici olarak sen başlarsın, liste boş gelir; malzemeleri kendin eklersin.</small></div></button>
        <button class="setup-opt" data-act="scan"><span>📷</span><div><b>Kurulu kafeye bağlan</b><small>Yöneticinin “Cihaz ekle” karekodunu okut.</small></div></button>
        <button class="setup-opt" data-act="go-demo"><span>🧪</span><div><b>Demo'yu incele</b><small>Örnek verilerle dene. Gerçek kafeye karışmaz. PIN: 0000</small></div></button>
      </div>`;
  }
  function brandLoginTop(db) {
    return `${cafeMode() === 'name' ? `<div class="brand-mark"><img src="icon.svg" alt=""></div>` : `<div class="brand-logo ${cafeMode() === 'logo' ? 'wide' : ''} bg-${db.cafe.logoBg || 'light'}"><img src="${db.cafe.logo}" alt="${esc(db.cafe.name)}"></div>`}
      <div>${cafeMode() !== 'logo' ? `<div class="login-cafe">${esc(db.cafe.name)}</div>` : ''}<div class="login-tag">Stok · Sipariş · Demirbaş</div></div>`;
  }
  function openSetupNew() {
    sheet(`
      <h3>Yeni kafe kur</h3><div class="sub">Yönetici hesabını oluştur. Diğer çalışanları sonra Ayarlar'dan eklersin.</div>
      <label class="field"><span>Kafe adı</span><input id="sCafe" value="${esc(S.get().cafe.name)}"></label>
      <label class="field"><span>Senin adın</span><input id="sName" placeholder="örn. Mahmut Şahin"></label>
      <div class="field-row" style="grid-template-columns:1fr 1fr">
        <label class="field"><span>PIN (4 rakam)</span><input id="sPin" inputmode="numeric" maxlength="4" type="password"></label>
        <label class="field"><span>PIN tekrar</span><input id="sPin2" inputmode="numeric" maxlength="4" type="password"></label>
      </div>
      <div class="small muted" id="sMsg" style="margin-bottom:10px">PIN’i unutma; giriş için her seferinde istenir.</div>
      <button class="btn primary block" id="sGo">Kafeyi kur</button>`,
      sh => {
        sh.querySelector('#sGo').onclick = () => {
          const cafe = sh.querySelector('#sCafe').value.trim(), name = sh.querySelector('#sName').value.trim();
          const p1 = sh.querySelector('#sPin').value.trim(), p2 = sh.querySelector('#sPin2').value.trim(), msg = sh.querySelector('#sMsg');
          if (!cafe || !name) return (msg.textContent = '⚠️ Kafe adı ve adın boş olamaz');
          if (!/^\d{4}$/.test(p1)) return (msg.textContent = '⚠️ PIN 4 rakam olmalı');
          if (p1 !== p2) return (msg.textContent = '⚠️ İki PIN aynı değil');
          if (p1 === '0000') return (msg.textContent = '⚠️ 0000 demo için ayrıldı, başka bir PIN seç');
          user = S.createFirstAdmin(name, p1, cafe);
          try { localStorage.setItem(UKEY, user.id); localStorage.setItem(LKEY, user.id); } catch (e) {}
          closeSheet(true); location.hash = '#/home'; render(); toast('Kafe kuruldu. Ana sayfadaki adımlarla devam et.');
        };
      });
  }

  // ---------- Ana sayfa: yapılacaklar listesi (gerçek kafe, yönetici)
  function onboardCard() {
    if (S.isDemo || !isAdmin()) return '';
    let hidden = false; try { hidden = localStorage.getItem('kafestok.onboardHide') === '1'; } catch (e) {}
    const db = S.get();
    const steps = [
      ['Bölümleri kontrol et', 'Nargile, Bar, Mutfak, Genel hazır; değiştir ya da ekle', db.depts.length > 0 && db.cafe.deptsOk, 'ob-depts'],
      ['Tedarikçileri ekle', 'Kimden mal alıyorsun? WhatsApp numaralarıyla', db.suppliers.length > 0, 'new-sup'],
      ['Malzemeleri ekle', 'Örnek listeden işaretleyerek hızlıca ekleyebilirsin', db.items.length > 0, 'tpl-import'],
      ['Malzemelere tedarikçi ata', 'Sipariş listesi tedarikçiye göre oluşur', db.items.length > 0 && db.items.every(i => i.supplierId), 'go-settings-items'],
      ['İlk sayımı yap', 'Elindeki miktarları gir', db.movements.some(m => m.type === 'sayim'), 'go-sayim'],
      ['Demirbaşları ekle', 'TV, uydu alıcısı, okey masaları… sonra etiket yazdır', db.assets.length > 0, 'new-asset'],
      ['Çalışanları ekle', 'Her biri için rol, PIN ve yetkiler', db.users.length > 1, 'new-user'],
      ['Telefonları bağla', 'Bulutu kur, diğer telefonlara karekod okut', !!Sync.cloud, 'go-cloud-setup'],
    ];
    const done = steps.filter(s => s[2]).length;
    if (hidden || done === steps.length) return '';
    const next = steps.findIndex(s => !s[2]);
    return `<div class="card onboard">
      <div class="ob-head"><div><b>Kurulum adımları</b><div class="small muted">${done} / ${steps.length} tamamlandı</div></div>
        <button class="btn ghost sm" data-act="ob-hide">Gizle</button></div>
      <div class="ob-bar"><span style="width:${done / steps.length * 100}%"></span></div>
      ${steps.map(([t, d, ok, act], i) => `<button class="ob-step ${ok ? 'ok' : ''} ${i === next ? 'next' : ''}" data-act="${act}">
        <span class="ob-n">${ok ? '✓' : i + 1}</span><div class="ob-t"><b>${t}</b><small>${d}</small></div>${ok ? '' : '<span class="ob-go">›</span>'}</button>`).join('')}
    </div>`;
  }

  // ---------- örnek listeden malzeme ekle
  function openTemplate() {
    const tpl = S.template(), db = S.get();
    const has = x => db.items.some(i => i.deptId === x.deptId && i.name.toLocaleLowerCase('tr') === x.name.toLocaleLowerCase('tr'));
    const sel = new Set();
    sheet(`
      <h3>Örnek listeden ekle</h3><div class="sub">Kafende olanları işaretle. Miktarlar 0 gelir, ilk sayımda girersin. Minimum ve hedefleri sonra değiştirebilirsin.</div>
      ${tpl.depts.map(d => {
        const its = tpl.items.filter(i => i.deptId === d.id);
        return `<div class="tpl-group"><div class="tpl-head"><b>${d.icon} ${esc(d.name)}</b><button class="btn ghost sm" data-tall="${d.id}">Tümü</button></div>
          ${its.map(i => `<label class="perm-row ${has(i) ? 'dis' : ''}"><input type="checkbox" data-tpl="${i.id}" ${has(i) ? 'disabled checked' : ''}>
            <div><b>${esc(i.name)}</b><small>${has(i) ? 'Zaten listende' : `${esc(i.unit)} · min ${fmt(i.min)} · hedef ${fmt(i.target)}`}</small></div></label>`).join('')}</div>`;
      }).join('')}
      <div class="sticky-sheet-btn"><button class="btn primary block" id="tplGo" disabled>Seçilenleri ekle</button></div>`,
      sh => {
        const btn = sh.querySelector('#tplGo');
        const upd = () => { btn.disabled = !sel.size; btn.textContent = sel.size ? `${sel.size} malzemeyi ekle` : 'Seçilenleri ekle'; };
        sh.querySelectorAll('[data-tpl]:not(:disabled)').forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.tpl) : sel.delete(c.dataset.tpl); upd(); });
        sh.querySelectorAll('[data-tall]').forEach(b => b.onclick = () => {
          const cs = [...sh.querySelectorAll('[data-tpl]:not(:disabled)')].filter(c => tpl.items.find(i => i.id === c.dataset.tpl).deptId === b.dataset.tall);
          const all = cs.every(c => c.checked);
          cs.forEach(c => { c.checked = !all; c.checked ? sel.add(c.dataset.tpl) : sel.delete(c.dataset.tpl); }); upd();
        });
        btn.onclick = () => {
          S.importItems(tpl.items.filter(i => sel.has(i.id)), user.name);
          closeSheet(); render(); toast(`${sel.size} malzeme eklendi. Şimdi tedarikçi ata ve sayım yap.`);
        };
      });
  }

  // ---------- gerçek kafeyi sıfırla
  function openResetCafe() {
    sheet(`
      <h3>Kafeyi sıfırla</h3>
      <div class="card small" style="box-shadow:none;background:var(--bad-soft);margin-bottom:12px">⚠️ Malzemeler, tedarikçiler, siparişler, sayım geçmişi, demirbaşlar ve <b>senin dışındaki tüm kullanıcılar</b> silinir.${Sync.cloud ? ' Buluta bağlı <b>tüm telefonlardan</b> da silinir.' : ''} Kafe adı, logo ve bölümler kalır. Geri alınamaz.</div>
      <div class="small muted" style="margin-bottom:8px">Önce yedek almak istersen: Ayarlar → Yedek indir.</div>
      <label class="field"><span>Onaylamak için <b>SIFIRLA</b> yaz</span><input id="rsTxt" autocapitalize="characters" autocomplete="off"></label>
      <button class="btn danger block" id="rsGo" disabled>Kafeyi sıfırla</button>`,
      sh => {
        const inp = sh.querySelector('#rsTxt'), go = sh.querySelector('#rsGo');
        inp.oninput = () => { go.disabled = inp.value.trim().replace(/[iİıI]/g, 'I').toUpperCase() !== 'SIFIRLA'; };
        go.onclick = () => {
          S.resetCafe(user.id);
          try { localStorage.removeItem('kafestok.onboardHide'); } catch (e) {}
          closeSheet(); location.hash = '#/home'; render(); toast('Kafe sıfırlandı. Kurulum adımlarıyla baştan doldurabilirsin.');
        };
      });
  }

  // ---------- ÖZET
  function viewHome() {
    const db = S.get();
    const crit = myNeeds();
    const enRoute = db.orders.filter(o => o.status === 'verildi');
    const greet = new Date().getHours() < 12 ? 'Günaydın' : new Date().getHours() < 18 ? 'İyi günler' : 'İyi akşamlar';
    return `
      ${onboardCard()}
      <div class="muted small" style="margin:2px 2px 10px">${greet}, <b style="color:var(--ink)">${esc(user.name)}</b> · ${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      ${crit.length ? `
        <div class="alert">
          <div class="big">${crit.length}</div>
          <div style="flex:1"><b>malzeme sipariş seviyesinde</b><div class="small muted">${esc(crit.slice(0, 3).map(i => i.name).join(', '))}${crit.length > 3 ? '…' : ''}</div></div>
          <a class="btn primary sm" href="#/siparis">Liste</a>
        </div>` : `<div class="alert ok"><div class="big">✓</div><div><b>Tüm stoklar yeterli</b><div class="small muted">Sipariş gerekmiyor</div></div></div>`}
      ${(() => {
        if (can('siparis_onay')) {
          const w = db.orders.filter(o => o.status === 'onay');
          return w.length ? `<a href="#/siparis" data-act="go-onay" class="card approve-card">
            <span style="font-size:22px">⏳</span><div style="flex:1"><b>${w.length} sipariş onayını bekliyor</b><div class="small muted">${esc(w.map(o => `${o.createdBy} · ${S.supplier(o.supplierId)?.name || ''}`).join(', '))}</div></div><span class="btn primary sm">İncele</span></a>` : '';
        }
        const mine = db.orders.filter(o => isMine(o) && ['onay', 'red'].includes(o.status) || (isMine(o) && o.status === 'verildi' && o.approvedBy !== user.name && Date.now() - (o.approvedAt || 0) < 864e5)).slice(0, 3);
        return mine.map(o => { const st = OST[o.status]; return `<a href="#/siparis" data-act="go-${o.status === 'onay' ? 'onay' : o.status === 'red' ? 'gecmis' : 'yolda'}" class="card" style="display:flex;align-items:center;gap:10px;margin-top:10px;text-decoration:none;color:inherit">
          <span style="font-size:22px">${st.icon}</span><div style="flex:1;min-width:0"><b>${esc(o.no)} · ${esc(S.supplier(o.supplierId)?.name || '')}</b><div class="small muted">${o.adminNote ? '🛡️ ' + esc(o.adminNote) : `${o.lines.length} kalem`}</div></div><span class="badge st-${st.tone}">${st.name}</span></a>`; }).join('');
      })()}
      ${enRoute.length ? `<a href="#/siparis" data-act="go-yolda" class="card" style="display:flex;align-items:center;gap:10px;margin-top:10px;text-decoration:none;color:inherit">
          <span style="font-size:22px">🚚</span><div style="flex:1"><b>${enRoute.length} sipariş yolda</b><div class="small muted">${esc(enRoute.map(o => S.supplier(o.supplierId)?.name).join(', '))}</div></div><span class="muted">›</span></a>` : ''}

      ${(() => {
        const as = db.assets || [], bad = as.filter(a => ['arizali', 'kayip', 'tamirde'].includes(a.status));
        if (!as.length) return '';
        const c = st => as.filter(a => a.status === st).length;
        return `<a href="#/demirbas" class="card" style="display:flex;align-items:center;gap:10px;margin-top:10px;text-decoration:none;color:inherit">
          <span style="font-size:22px">🏷️</span><div style="flex:1"><b>${as.length} demirbaş</b>
          <div class="small muted">${bad.length ? [['arizali', 'arızalı'], ['tamirde', 'tamirde'], ['kayip', 'kayıp']].filter(([k]) => c(k)).map(([k, l]) => `<span style="color:var(--${k === 'tamirde' ? 'warn' : 'bad'});font-weight:700">${c(k)} ${l}</span>`).join(' · ') : 'Hepsi aktif'}</div></div><span class="muted">›</span></a>`;
      })()}
      <h2 class="section">Bölümler</h2>
      <div class="grid2">${db.depts.map(d => {
        const its = db.items.filter(i => i.deptId === d.id);
        const c = its.filter(S.needsOrder).length;
        const okPct = its.length ? Math.round(its.filter(i => !S.needsOrder(i)).length / its.length * 100) : 100;
        return `<button class="card dept-card" data-act="open-dept" data-id="${d.id}">
          <div class="ic">${d.icon}</div><div class="nm">${esc(d.name)}</div>
          <div class="meta">${its.length} malzeme${c ? ` · <b>${c} kritik</b>` : ''}</div>
          <div class="bar"><span class="${okPct < 60 ? 'st-kritik' : okPct < 85 ? 'st-azaliyor' : 'st-iyi'}" style="width:${okPct}%"></span></div>
        </button>`;
      }).join('')}</div>

      <h2 class="section">Son hareketler</h2>
      <div class="list">${db.movements.slice(0, 8).map(m => {
        const it = S.item(m.itemId); if (!it) return '';
        const up = m.after > m.before;
        return `<button class="row" data-act="open-item" data-id="${it.id}">
          <div class="avatar" style="width:32px;height:32px;font-size:12px;background:${S.dept(it.deptId)?.color || 'var(--accent)'}">${esc(initials(m.user))}</div>
          <div class="main"><div class="t">${esc(it.name)}</div><div class="s">${esc(m.user)} ${MV_LABEL[m.type]} · ${ago(m.at)}</div></div>
          <div class="qty small"><span class="muted">${fmt(m.before)} → </span><b style="color:${up ? 'var(--ok)' : 'var(--ink)'}">${fmt(m.after)}</b> <span class="muted">${esc(it.unit)}</span></div>
        </button>`;
      }).join('') || '<div class="empty">Henüz hareket yok</div>'}</div>`;
  }

  // ---------- STOK
  function viewStok() {
    const db = S.get();
    const q = ui.stokQ.toLocaleLowerCase('tr');
    let its = db.items.filter(i => (ui.stokDept === 'all' || i.deptId === ui.stokDept)
      && (!q || i.name.toLocaleLowerCase('tr').includes(q))
      && (!ui.onlyCrit || S.needsOrder(i)));
    const rank = { yeni: -1, bitti: 0, kritik: 1, azaliyor: 2, iyi: 3 };
    its.sort((a, b) => rank[S.status(a)] - rank[S.status(b)] || a.name.localeCompare(b.name, 'tr'));
    const critIn = id => db.items.filter(i => (id === 'all' || i.deptId === id) && S.needsOrder(i)).length;
    return `
      <div class="chips">${[{ id: 'all', name: 'Tümü', icon: '' }, ...db.depts].map(d => {
        const c = critIn(d.id);
        return `<button class="chip ${ui.stokDept === d.id ? 'on' : ''}" data-act="stok-dept" data-id="${d.id}">${d.icon ? d.icon + ' ' : ''}${esc(d.name)}${c ? `<span class="cnt">${c}</span>` : ''}</button>`;
      }).join('')}</div>
      <div class="toolbar">
        <input class="search" id="stokQ" type="search" placeholder="Malzeme ara…" value="${esc(ui.stokQ)}">
        <label class="toggle"><input type="checkbox" id="onlyCrit" ${ui.onlyCrit ? 'checked' : ''}> Kritik</label>
      </div>
      <div class="list">${its.map(it => {
        const st = S.status(it), sup = S.supplier(it.supplierId), pend = S.pendingQtyFor(it.id);
        return `<button class="row" data-act="open-item" data-id="${it.id}">
          <span class="dot st-${st}"></span>
          <div class="main">
            <div class="t">${esc(it.name)}</div>
            <div class="s">${ui.stokDept === 'all' ? esc(S.dept(it.deptId)?.name) + ' · ' : ''}min ${fmt(it.min)} · ${esc(sup?.name || 'tedarikçi yok')}${pend ? pendLabel(it.id) : ''}</div>
            ${bar(it)}
          </div>
          <div class="qty"><span class="n" style="color:${st === 'iyi' ? 'var(--ink)' : st === 'yeni' ? 'var(--muted)' : `var(--${st === 'azaliyor' ? 'warn' : 'bad'})`}">${st === 'yeni' ? '–' : fmt(it.qty)}</span><span class="u">${esc(it.unit)}</span>
            <div><span class="badge st-${st}">${ST_LABEL[st]}</span></div></div>
        </button>`;
      }).join('') || (db.items.length ? '<div class="empty"><div class="e">🔍</div>Eşleşen malzeme yok</div>'
        : `<div class="empty"><div class="e">📦</div><b>Henüz malzeme yok</b><br>${can('malzeme') ? `<button class="btn primary" style="margin-top:12px" data-act="tpl-import">📋 Örnek listeden ekle</button>` : 'Yetkili kişi malzemeleri ekleyince burada görünür.'}</div>`)}</div>
      ${can('malzeme') ? `<button class="btn block" style="margin-top:12px" data-act="new-item">+ Malzeme ekle</button>` : ''}`;
  }

  // ---------- SAYIM
  function viewSayim() {
    const db = S.get();
    const depts = myDepts();
    if (!ui.sayimDept || !depts.find(d => d.id === ui.sayimDept)) ui.sayimDept = depts[0]?.id;
    const its = db.items.filter(i => i.deptId === ui.sayimDept).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const changed = Object.keys(ui.sayimDraft).length;
    if (isDev() && !can('sayim_tum')) return `
      <div class="chips">${depts.map(d => `<button class="chip ${ui.sayimDept === d.id ? 'on' : ''}" data-act="sayim-dept" data-id="${d.id}">${d.icon} ${esc(d.name)}</button>`).join('')}</div>
      <div class="card small ro-card">👁️ <b>Salt okunur.</b> Sayımları görebilirsin; değiştirmek için yöneticinin yetki açması gerekir.</div>
      <div class="list">${its.map(it => `<div class="row"><div class="main"><div class="t">${esc(it.name)}</div>
        <div class="s">${it.uncounted ? 'Henüz sayılmadı' : `${esc(it.updatedBy || '')} · ${ago(it.updatedAt)}`}</div></div>
        <div class="qty"><span class="n">${it.uncounted ? '–' : fmt(it.qty)}</span><span class="u">${esc(it.unit)}</span></div></div>`).join('') || '<div class="empty"><div class="e">📦</div>Bu bölümde malzeme yok</div>'}</div>`;
    return `
      <div class="chips">${depts.map(d => `<button class="chip ${ui.sayimDept === d.id ? 'on' : ''}" data-act="sayim-dept" data-id="${d.id}">${d.icon} ${esc(d.name)}</button>`).join('')}</div>
      <div class="card small" style="margin-bottom:12px;display:flex;gap:10px;align-items:center">
        <span style="font-size:20px">✍️</span><div>Elinde <b>şu an ne kadar varsa</b> onu yaz. Değiştirdiklerin turuncu görünür, en altta kaydet.</div>
      </div>
      <div class="list">${its.map(it => {
        const d = ui.sayimDraft[it.id];
        const v = d ?? it.qty;
        return `<div class="row ${d !== undefined ? 'changed' : ''}" data-row="${it.id}">
          <div class="main">
            <div class="t">${esc(it.name)}</div>
            <div class="s">${it.uncounted ? '<b style="color:var(--warn)">Henüz sayılmadı</b> · elindekini yaz' : `Son: <span class="was">${fmt(it.qty)}</span> ${esc(it.unit)} · ${ago(it.updatedAt)}`}</div>
          </div>
          <div class="stepper">
            <button data-act="cnt" data-id="${it.id}" data-d="-1">−</button>
            <input inputmode="decimal" data-cnt="${it.id}" value="${fmt(v)}">
            <button data-act="cnt" data-id="${it.id}" data-d="1">+</button>
          </div>
        </div>`;
      }).join('') || '<div class="empty"><div class="e">📦</div>Bu bölümde malzeme yok</div>'}</div>
      <div style="height:70px"></div>
      <div class="sticky-action"><button class="btn primary block" id="saveCount" data-act="save-count" ${changed ? '' : 'disabled'}>${changed ? `Sayımı kaydet (${changed} değişiklik)` : 'Değişiklik yok'}</button></div>`;
  }
  function setDraft(id, v) {
    const it = S.item(id);
    v = Math.max(0, Math.round(v * 100) / 100);
    if (v === it.qty && !it.uncounted) delete ui.sayimDraft[id]; else ui.sayimDraft[id] = v;
    const row = document.querySelector(`[data-row="${id}"]`);
    row?.classList.toggle('changed', ui.sayimDraft[id] !== undefined);
    const inp = document.querySelector(`[data-cnt="${id}"]`);
    if (inp && document.activeElement !== inp) inp.value = fmt(v);
    const n = Object.keys(ui.sayimDraft).length, b = document.getElementById('saveCount');
    if (b) { b.disabled = !n; b.textContent = n ? `Sayımı kaydet (${n} değişiklik)` : 'Değişiklik yok'; }
  }
  function saveCount() {
    const entries = Object.entries(ui.sayimDraft).map(([itemId, qty]) => ({ itemId, qty }));
    const before = new Set(S.get().items.filter(S.needsOrder).map(i => i.id));
    const n = S.saveCount(entries, user.name);
    ui.sayimDraft = {};
    const newly = S.get().items.filter(i => S.needsOrder(i) && !before.has(i.id)).length;
    render();
    toast(`${n} malzeme kaydedildi${newly ? ` · ${newly} tanesi sipariş listesine eklendi` : ''}`);
  }

  // ---------- SİPARİŞ
  // durum: onay (yönetici onayı bekliyor) → verildi (onaylandı, yolda) → teslim | red
  const OST = {
    onay: { name: 'Onay bekliyor', tone: 'azaliyor', icon: '⏳' },
    verildi: { name: 'Onaylandı · yolda', tone: 'iyi', icon: '🚚' },
    teslim: { name: 'Teslim alındı', tone: 'pasif', icon: '✅' },
    red: { name: 'Reddedildi', tone: 'kritik', icon: '✖️' },
  };
  const lineBy = (o, l) => [...new Set(S.partsOf(o, l).map(p => p.by))];
  const contributors = o => [...new Set(o.lines.flatMap(l => lineBy(o, l)).concat(o.createdBy))];
  const noteList = o => S.notesOf(o);
  const isMine = o => contributors(o).includes(user.name);
  const lineMeta = (o, l) => {
    const notes = S.partsOf(o, l).filter(p => p.note);
    return `<div class="by">👤 ${esc(byTxt(o, l))}</div>${notes.map(p => `<div class="ln-note">💬 ${esc(p.note)}${lineBy(o, l).length > 1 ? ` <i>— ${esc(p.by)}</i>` : ''}</div>`).join('')}`;
  };
  const supNoteHTML = o => o.supplierNote ? `<div class="o-note sup"><span>📦 Tedarikçiye:</span> ${esc(o.supplierNote)}</div>` : '';
  const byTxt = (o, l) => {
    const m = new Map(); S.partsOf(o, l).forEach(p => m.set(p.by, (m.get(p.by) || 0) + p.qty));
    return m.size > 1 ? [...m].map(([n, q]) => `${n} ${fmt(q)}`).join(' · ') : [...m.keys()][0];
  };
  const LOG_TXT = { ekledi: 'listeye ekledi', geri_cekti: 'kalemlerini geri çekti', olusturdu: 'siparişi verdi', onaya_gonderdi: 'onaya gönderdi', duzenledi: 'listeyi düzenledi', onayladi: 'onayladı', reddetti: 'reddetti', teslim_aldi: 'teslim aldı', kismi_teslim: 'kısmen teslim aldı' };
  const visibleOrders = () => S.get().orders.filter(o => viewAll() || can('siparis_onay') || can('siparis_direkt') || isMine(o)
    || (can('teslim') && ['verildi', 'teslim'].includes(o.status)));
  const myNeeds = () => {
    const ds = myDepts().map(d => d.id);
    return S.get().items.filter(i => S.needsOrder(i) && ds.includes(i.deptId));
  };

  function draftFor(it) {
    const pend = S.pendingQtyFor(it.id);
    if (!ui.orderDraft[it.id]) ui.orderDraft[it.id] = { on: !pend, qty: Math.max(S.suggested(it) - pend, 0) || S.suggested(it) };
    return ui.orderDraft[it.id];
  }
  function pendLabel(itId) {
    const onay = S.pendingQtyFor(itId, ['onay']), yol = S.pendingQtyFor(itId, ['verildi']);
    return (onay ? ` · <span class="pending p-onay">onayda ${fmt(onay)}</span>` : '') + (yol ? ` · <span class="pending p-yol">yolda ${fmt(yol)}</span>` : '');
  }

  function viewSiparis() {
    const os = visibleOrders();
    const need = myNeeds();
    const by = st => os.filter(o => st.includes(o.status));
    const tabs = [['hazir', 'Hazırla', need.length], ['onay', 'Onay', by(['onay']).length], ['yolda', 'Yolda', by(['verildi']).length], ['gecmis', 'Geçmiş', 0]];
    const seg = `<div class="seg">${tabs.map(([k, l, n]) => `<button class="${ui.sipTab === k ? 'on' : ''}" data-act="sip-tab" data-id="${k}">${l}${n ? ` <span class="seg-n ${k === 'onay' ? 'warn' : ''}">${n}</span>` : ''}</button>`).join('')}</div>`;

    if (ui.sipTab !== 'hazir') {
      const list = ui.sipTab === 'onay' ? by(['onay']) : ui.sipTab === 'yolda' ? by(['verildi']) : by(['teslim', 'red']);
      const empty = { onay: ['✔️', can('siparis_onay') ? 'Onay bekleyen sipariş yok' : 'Onayda bekleyen talebin yok'], yolda: ['🚚', 'Yolda sipariş yok'], gecmis: ['🗂️', 'Geçmiş sipariş yok'] }[ui.sipTab];
      return seg + (list.map(orderCard).join('') || `<div class="empty"><div class="e">${empty[0]}</div>${empty[1]}</div>`);
    }

    if (!need.length) return seg + `<div class="empty"><div class="e">🎉</div>Sipariş gereken malzeme yok</div>`;
    const groups = {};
    need.forEach(it => (groups[it.supplierId || '_'] ||= []).push(it));
    const anySel = need.some(it => draftFor(it).on && draftFor(it).qty > 0);
    return seg + `
      ${can('siparis_direkt') ? '' : can('siparis_hazirla') ? `<div class="card small" style="margin-bottom:12px;display:flex;gap:10px;align-items:center"><span style="font-size:20px">📝</span><div>Listeyi kontrol et, gerekirse miktarları değiştir ve <b>yöneticiye onaya gönder</b>.</div></div>`
        : `<div class="card small" style="margin-bottom:12px;display:flex;gap:10px;align-items:center"><span style="font-size:20px">👀</span><div>Eksikleri görebilirsin; sipariş hazırlama yetkin yok.</div></div>`}
      ${Object.entries(groups).map(([sid, its]) => {
      const sup = S.supplier(sid);
      const sel = its.filter(it => draftFor(it).on && draftFor(it).qty > 0).length;
      return `<div class="card" style="padding:0;margin-bottom:14px">
        <div class="sup-head">
          <div class="avatar" style="background:var(--brand);color:var(--brand-ink)">${esc(initials(sup?.name || '?'))}</div>
          <div style="flex:1"><div class="t">${esc(sup?.name || 'Tedarikçi atanmamış')}</div><div class="s">${esc(sup ? `${sup.contact || ''} ${sup.phone ? '· +' + sup.phone : ''}` : 'Ayarlar’dan malzemeye tedarikçi seç')}</div></div>
        </div>
        ${its.map(it => {
          const d = draftFor(it);
          return `<div class="order-line ${d.on ? '' : 'off'}">
            <input type="checkbox" data-act="ol-on" data-id="${it.id}" ${d.on ? 'checked' : ''}>
            <div class="main"><div class="t" style="font-weight:600">${esc(it.name)}</div>
              <div class="s small muted">Elde <b style="color:var(--bad)">${fmt(it.qty)}</b> · min ${fmt(it.min)} · hedef ${fmt(it.target)}${pendLabel(it.id)}</div></div>
            <input class="num" inputmode="decimal" data-olq="${it.id}" value="${fmt(d.qty)}"><span class="small muted" style="width:38px">${esc(it.unit)}</span>
            ${can('siparis_direkt') ? '' : `<button class="ln-btn ${ui.lineNotes[it.id] ? 'has' : ''}" data-act="ln-note" data-id="${it.id}" aria-label="Not">💬</button>`}
          </div>
          ${!can('siparis_direkt') && (ui.lnOpen[it.id] || ui.lineNotes[it.id]) ? `<div class="ln-in"><input class="note-in" data-lnote="${it.id}" placeholder="${esc(it.name)} için yöneticiye not" value="${esc(ui.lineNotes[it.id] || '')}"></div>` : ''}`;
        }).join('')}
        <div class="sup-foot">
          ${can('siparis_direkt') ? `<input class="note-in" data-onote="${sid}" placeholder="Tedarikçiye not (WhatsApp ve PDF'te görünür)" value="${esc(ui.orderNotes?.[sid] || '')}">` : ''}
          ${can('siparis_direkt') ? `
          <div class="btn-row">
            <button class="btn sm" data-act="copy-order" data-id="${sid}">Kopyala</button>
            ${sup?.phone ? `<button class="btn wa" data-act="wa-order" data-id="${sid}" ${sel ? '' : 'disabled'}>WhatsApp ile gönder</button>`
              : `<button class="btn dark" data-act="mark-order" data-id="${sid}" ${sel ? '' : 'disabled'}>Sipariş verildi</button>`}
          </div>
          ${sup?.phone ? `<button class="btn ghost sm block" style="margin-top:6px" data-act="mark-order" data-id="${sid}">Telefonla verdim, sadece işaretle</button>` : ''}`
          : can('siparis_hazirla') ? `<button class="btn primary block" data-act="request-order" data-id="${sid}" ${sel ? '' : 'disabled'}>Onaya gönder (${sel} kalem)</button>` : ''}
        </div>
      </div>`;
    }).join('')}
      <button class="btn block" data-act="pdf-draft" ${anySel ? '' : 'disabled'}>📄 Seçili listeyi PDF al</button>
      <div class="small muted" style="text-align:center;margin-top:8px">Önerilen miktar = hedef − eldeki. İstersen değiştir.</div>`;
  }

  function lineQtyHTML(o, l, it) {
    const u = esc(it?.unit || ''), iss = l.issues || [];
    if (l.received == null && !iss.length) return `<b>${fmt(l.qty)} ${u}</b>`;
    const got = l.received || 0, left = o.status === 'verildi' ? S.lineLeft(l) : 0;
    if (!iss.length && !left && got === l.qty) return `<b>${fmt(got)} ${u}</b>`;
    return `<div class="lq"><b>${fmt(got)} / ${fmt(l.qty)} ${u}</b>
      ${iss.map(x => `<span class="iss iss-${x.reason}">${fmt(x.qty)} ${RSN[x.reason] || x.reason}${x.note ? ' · ' + esc(x.note) : ''}</span>`).join('')}
      ${left ? `<span class="iss iss-wait">${fmt(left)} bekleniyor</span>` : ''}</div>`;
  }
  function orderCard(o) {
    const sup = S.supplier(o.supplierId);
    const st = o.status === 'verildi' && o.partial ? { name: 'Kısmen geldi · kalan yolda', tone: 'azaliyor', icon: '🚚' }
      : o.status === 'teslim' && o.short ? { name: 'Eksik / iadeli teslim', tone: 'azaliyor', icon: '⚠️' }
      : OST[o.status] || OST.verildi;
    const total = o.lines.length;
    const meta = o.status === 'teslim' ? `Teslim: ${ago(o.receivedAt)} · ${esc(o.receivedBy)}`
      : o.status === 'red' ? `Reddeden: ${esc(o.rejectedBy)} · ${ago(o.rejectedAt)}`
      : o.status === 'verildi' ? `Onaylayan: ${esc(o.approvedBy || o.createdBy)} · ${ago(o.approvedAt || o.createdAt)}`
      : `${contributors(o).length > 1 ? 'Ekleyenler' : 'Hazırlayan'}: ${esc(contributors(o).join(', '))} · ${ago(o.createdAt)}`;
    return `<div class="card order-card" style="padding:0;margin-bottom:12px">
      <div class="sup-head">
        <span style="font-size:22px">${st.icon}</span>
        <div style="flex:1;min-width:0"><div class="t">${esc(sup?.name || 'Tedarikçi')} <span class="code" style="font-size:12px">${esc(o.no || '')}</span></div>
          <div class="s">${meta}</div></div>
        <span class="badge st-${st.tone}">${st.name}</span>
      </div>
      ${o.lines.slice(0, 10).map(l => { const it = S.item(l.itemId); return `<div class="order-line"><div class="main">${esc(it?.name || 'silinmiş malzeme')}${o.status === 'onay' || contributors(o).length > 1 ? lineMeta(o, l) : ''}</div>${lineQtyHTML(o, l, it)}</div>`; }).join('')}
      ${total > 10 ? `<div class="order-line small muted">+ ${total - 10} kalem daha</div>` : ''}
      ${noteList(o).map(n => `<div class="o-note"><span>💬 ${esc(n.by)}:</span> ${esc(n.text)}</div>`).join('')}
      ${o.adminNote ? `<div class="o-note admin"><span>🛡️ Yöneticiden personele:</span> ${esc(o.adminNote)}</div>` : ''}
      ${supNoteHTML(o)}
      <div class="sup-foot btn-row">
        <button class="btn sm" data-act="pdf-order" data-id="${o.id}">📄 PDF</button>
        ${o.status === 'onay' && can('siparis_onay') ? `<button class="btn primary" data-act="review-order" data-id="${o.id}">İncele ve onayla</button>` : ''}
        ${o.status === 'onay' && !can('siparis_onay') && isMine(o) ? `<button class="btn ghost sm" data-act="cancel-order" data-id="${o.id}">Geri çek</button>` : ''}
        ${o.status === 'verildi' ? `${can('siparis_onay') ? `<button class="btn ghost sm" data-act="cancel-order" data-id="${o.id}">İptal</button>` : ''}${o.partial && can('teslim') ? `<button class="btn ghost sm" data-act="close-rest" data-id="${o.id}">Kalanı bekleme</button>` : ''}${can('teslim') ? `<button class="btn primary" data-act="receive" data-id="${o.id}">${o.partial ? 'Kalanı teslim al' : 'Teslim aldım'}</button>` : ''}` : ''}
      </div>
      ${hasIssues(o) && sup?.phone && (can('teslim') || can('siparis_onay')) && !readOnly() ? `<div class="sup-foot2"><button class="btn wa block" data-act="wa-issue" data-id="${o.id}">Eksik / iadeyi tedarikçiye WhatsApp'la bildir</button></div>` : ''}
    </div>`;
  }

  // yönetici onay ekranı: miktar değiştir, kalem ekle/çıkar, not yaz, onayla/reddet
  function reviewOrder(oid) {
    const o = S.order(oid); if (!o) return;
    const sup = S.supplier(o.supplierId);
    let lines = o.lines.map(l => ({ ...l }));
    const draw = sh => {
      sh.querySelector('#rvLines').innerHTML = lines.map((l, i) => {
        const it = S.item(l.itemId);
        return `<div class="order-line">
          <div class="main"><div class="t" style="font-weight:600">${esc(it?.name || '?')}</div><div class="small muted">Elde ${fmt(it?.qty)} · hedef ${fmt(it?.target)}</div>${lineMeta(o, l)}</div>
          <div class="stepper"><button data-rv="${i}" data-d="-1">−</button><input data-rvq="${i}" inputmode="decimal" value="${fmt(l.qty)}"><button data-rv="${i}" data-d="1">+</button></div>
          <span class="small muted" style="width:34px">${esc(it?.unit || '')}</span>
          <button class="x-btn" data-rvx="${i}" aria-label="Çıkar">✕</button>
        </div>`;
      }).join('') || '<div class="empty small">Listede kalem kalmadı</div>';
      const used = new Set(lines.map(l => l.itemId));
      const its = S.get().items.filter(i => !used.has(i.id));
      const mine = its.filter(i => i.supplierId === o.supplierId), other = its.filter(i => i.supplierId !== o.supplierId);
      sh.querySelector('#rvAdd').innerHTML = `<option value="">+ Malzeme ekle…</option>`
        + (mine.length ? `<optgroup label="${esc(sup?.name || 'Bu tedarikçi')}">${mine.map(i => `<option value="${i.id}">${esc(i.name)} (elde ${fmt(i.qty)} ${esc(i.unit)})</option>`).join('')}</optgroup>` : '')
        + (other.length ? `<optgroup label="Diğer malzemeler">${other.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</optgroup>` : '');
      sh.querySelector('#rvCount').textContent = `${lines.length} kalem`;
      sh.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => {
        const i = +b.dataset.rv, it = S.item(lines[i].itemId);
        lines[i].qty = Math.max(0, lines[i].qty + stepOf(it) * b.dataset.d); draw(sh);
      });
      sh.querySelectorAll('[data-rvq]').forEach(inp => { inp.onfocus = () => inp.select(); inp.onchange = () => { lines[+inp.dataset.rvq].qty = num(inp.value); }; });
      sh.querySelectorAll('[data-rvx]').forEach(b => b.onclick = () => { lines.splice(+b.dataset.rvx, 1); draw(sh); });
    };
    sheet(`
      <div class="code">${esc(o.no)}</div>
      <h3>${esc(sup?.name || 'Tedarikçi')}</h3>
      <div class="sub">${contributors(o).length > 1 ? 'Ekleyenler' : 'Hazırlayan'} <b>${esc(contributors(o).join(', '))}</b> · ${ago(o.createdAt)} · <span id="rvCount"></span></div>
      ${noteList(o).map(n => `<div class="o-note" style="border-radius:12px;margin-bottom:8px"><span>💬 ${esc(n.by)}:</span> ${esc(n.text)}</div>`).join('')}
      <div class="list" id="rvLines"></div>
      <select class="add-sel" id="rvAdd"></select>
      <label class="field" style="margin-top:14px"><span>📦 Tedarikçiye not <em class="fhint">PDF ve WhatsApp'ta görünür</em></span><textarea id="rvSup" rows="2" placeholder="örn. Cuma öğlene kadar teslim edin">${esc(o.supplierNote || '')}</textarea></label>
      <label class="field"><span>🛡️ Personele not <em class="fhint">sadece programda</em></span><textarea id="rvNote" rows="2" placeholder="örn. Karpuz nane yerine elma aldık · red sebebi">${esc(o.adminNote || '')}</textarea></label>
      <div class="btn-row">
        <button class="btn danger" id="rvRej">Reddet</button>
        <button class="btn dark" id="rvOk">Onayla</button>
      </div>
      ${sup?.phone ? `<button class="btn wa block" style="margin-top:8px" id="rvWa">Onayla ve WhatsApp ile gönder</button>` : ''}
      <button class="btn ghost block" style="margin-top:6px" id="rvPdf">📄 PDF önizle</button>
      <div class="small muted" style="margin-top:10px">${(o.log || []).map(l => `${esc(l.user)} ${LOG_TXT[l.action] || l.action} · ${ago(l.at)}`).join('<br>')}</div>`,
      sh => {
        draw(sh);
        sh.querySelector('#rvAdd').onchange = e => {
          const it = S.item(e.target.value); if (!it) return;
          const q = S.suggested(it) || stepOf(it);
          lines.push({ itemId: it.id, qty: q, parts: [{ by: user.name, qty: q, at: Date.now() }] }); draw(sh);
        };
        const save = () => {
          sh.querySelectorAll('[data-rvq]').forEach(inp => { lines[+inp.dataset.rvq].qty = num(inp.value); });
          lines = lines.filter(l => l.qty > 0);
          S.updateOrder(oid, { lines, adminNote: sh.querySelector('#rvNote').value.trim(), supplierNote: sh.querySelector('#rvSup').value.trim() }, user.name);
          return lines.length;
        };
        const approve = wa => {
          if (!save()) return toast('Listede kalem yok');
          S.approveOrder(oid, user.name);
          if (wa) window.open(`https://wa.me/${sup.phone}?text=${encodeURIComponent(textForOrder(S.order(oid)))}`, '_blank');
          closeSheet(); ui.sipTab = 'yolda'; render(); toast(`${o.no} onaylandı`);
        };
        sh.querySelector('#rvOk').onclick = () => approve(false);
        sh.querySelector('#rvWa')?.addEventListener('click', () => approve(true));
        sh.querySelector('#rvRej').onclick = () => {
          const note = sh.querySelector('#rvNote').value.trim();
          if (!note && !confirm('Personele not yazmadan reddedilsin mi? (Neden reddedildiğini göremez)')) return;
          S.rejectOrder(oid, user.name, note); closeSheet(); render(); toast(`${o.no} reddedildi`);
        };
        sh.querySelector('#rvPdf').onclick = () => { save(); openDoc({ type: 'order', ids: [oid] }); };
      });
  }

  function draftLines(sid) {
    return myNeeds().filter(i => (i.supplierId || '_') === sid)
      .map(it => ({ it, d: draftFor(it) })).filter(x => x.d.on && x.d.qty > 0);
  }
  const textLines = (lines) => lines.map(x => `• ${x.name}: ${fmt(x.qty)} ${x.unit}`).join('\n');
  function textForOrder(o) {
    return `Merhaba, ${S.get().cafe.name} için sipariş (${o.no}):\n` + textLines(o.lines.map(l => { const it = S.item(l.itemId); return { name: it?.name, qty: l.qty, unit: it?.unit }; })) + (o.supplierNote ? `\n\nNot: ${o.supplierNote}` : '') + `\nTeşekkürler.`;
  }
  function orderText(sid) {
    const n = ui.orderNotes?.[sid];
    return `Merhaba, ${S.get().cafe.name} için sipariş:\n` + textLines(draftLines(sid).map(x => ({ name: x.it.name, qty: x.d.qty, unit: x.it.unit }))) + (n ? `\n\nNot: ${n}` : '') + `\nTeşekkürler.`;
  }
  function placeOrder(sid, via) {
    const lines = draftLines(sid);
    if (!lines.length) return toast('Seçili malzeme yok');
    const note = ui.orderNotes?.[sid] || '';
    const mk = () => lines.map(x => ({ itemId: x.it.id, qty: x.d.qty, ...(via === 'request' && ui.lineNotes[x.it.id] ? { note: ui.lineNotes[x.it.id] } : {}) }));
    let o;
    if (via === 'request') {
      o = S.requestOrder(sid === '_' ? null : sid, mk(), user.name);
      toast(S.lastMerged ? `${o.no} listesine eklendi (onay bekliyor)` : `${o.no} yöneticiye onaya gönderildi`);
    } else {
      o = S.createOrder(sid === '_' ? null : sid, mk(), user.name, note);
      if (via === 'wa') window.open(`https://wa.me/${S.supplier(sid).phone}?text=${encodeURIComponent(textForOrder(o))}`, '_blank');
      toast(`${o.no} "Yolda" sekmesine eklendi`);
    }
    lines.forEach(x => { delete ui.orderDraft[x.it.id]; delete ui.lineNotes[x.it.id]; delete ui.lnOpen[x.it.id]; });
    if (ui.orderNotes) delete ui.orderNotes[sid];
    render();
  }

  // ---------- PDF / yazdırılabilir sipariş formu
  let docSpec = null;
  function openDoc(spec) { docSpec = spec; closeSheet(true); location.hash = '#/belge'; }
  function renderDoc() {
    const db = S.get();
    if (!docSpec) { location.hash = '#/siparis'; return; }
    let docs;
    if (docSpec.type === 'order') {
      docs = docSpec.ids.map(id => S.order(id)).filter(Boolean).map(o => ({
        no: o.no, status: OST[o.status]?.name, sup: S.supplier(o.supplierId), date: o.createdAt,
        lines: o.lines.map(l => ({ it: S.item(l.itemId), qty: l.qty })), notes: o.supplierNote ? [o.supplierNote] : [],
        approved: o.approvedBy ? [o.approvedBy, o.approvedAt] : null,
      }));
    } else { // hazırlanan (henüz gönderilmemiş) liste
      const groups = {};
      myNeeds().forEach(it => { const d = draftFor(it); if (d.on && d.qty > 0) (groups[it.supplierId || '_'] ||= []).push({ it, qty: d.qty }); });
      docs = Object.entries(groups).map(([sid, lines]) => ({
        no: 'TASLAK', status: 'Hazırlanıyor', sup: S.supplier(sid), date: Date.now(), lines,
        notes: ui.orderNotes?.[sid] ? [ui.orderNotes[sid]] : [], approved: null,
      }));
    }
    const d2 = t => new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    $app.innerHTML = `
      <div class="label-bar no-print">
        <div class="lb-top">
          <button class="btn sm" data-act="doc-back">‹ Geri</button>
          <div style="flex:1;min-width:0"><b>Sipariş formu</b><div class="small muted">${docs.length} sayfa · A4</div></div>
          <button class="btn primary sm" data-act="print">PDF / Yazdır</button>
        </div>
        <div class="small muted" style="margin-top:6px">Yazdır ekranında yazıcı yerine <b>“PDF olarak kaydet”</b> seç. iPhone’da: Paylaş → Yazdır → Kaydet.</div>
      </div>
      <div class="docs">${docs.map(d => `
        <article class="paper">
          <header class="p-head">
            <div><div class="p-cafe">${brandHTML('doc')}</div><div class="p-title">SİPARİŞ FORMU</div></div>
            <table class="p-meta"><tr><td>No</td><th>${esc(d.no)}</th></tr><tr><td>Tarih</td><th>${d2(d.date)}</th></tr><tr><td>Durum</td><th>${esc(d.status || '')}</th></tr></table>
          </header>
          <section class="p-sup">
            <div><span>Tedarikçi</span><b>${esc(d.sup?.name || '—')}</b></div>
            <div><span>Yetkili</span><b>${esc(d.sup?.contact || '—')}</b></div>
            <div><span>Telefon</span><b>${d.sup?.phone ? '+' + esc(d.sup.phone) : '—'}</b></div>
          </section>
          <table class="p-table">
            <thead><tr><th style="width:8%">#</th><th>Malzeme</th><th style="width:16%">Bölüm</th><th style="width:13%" class="r">Miktar</th><th style="width:11%">Birim</th><th style="width:10%" class="c">Teslim ✓</th></tr></thead>
            <tbody>${d.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.it?.name || '?')}</td><td>${esc(S.dept(l.it?.deptId)?.name || '')}</td><td class="r"><b>${fmt(l.qty)}</b></td><td>${esc(l.it?.unit || '')}</td><td class="c"><span class="box"></span></td></tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="6">Toplam ${d.lines.length} kalem</td></tr></tfoot>
          </table>
          ${d.notes.length ? `<section class="p-notes">
            <div><span>Not</span>${d.notes.map(t => `<p>${esc(t)}</p>`).join('')}</div>
          </section>` : ''}
          <footer class="p-sign">
            <div><span>Hazırlayan</span><b>&nbsp;</b><small>İmza</small></div>
            <div><span>Onaylayan</span><b>${d.approved ? esc(d.approved[0]) : '&nbsp;'}</b><small>${d.approved ? d2(d.approved[1]) : 'İmza'}</small></div>
            <div><span>Teslim alan</span><b>&nbsp;</b><small>İmza / tarih</small></div>
          </footer>
        </article>`).join('') || '<div class="empty">Seçili kalem yok</div>'}</div>`;
    window.scrollTo(0, 0);
  }

  // ---------- DEMİRBAŞ
  const AST = id => S.ASSET_STATUS.find(s => s.id === id) || S.ASSET_STATUS[0];
  const ACAT = id => S.ASSET_CATS.find(c => c.id === id) || S.ASSET_CATS[S.ASSET_CATS.length - 1];
  const assetUrl = a => location.origin + location.pathname + '#/d/' + encodeURIComponent(a.code);
  const LOCS = () => [...new Set(['Salon', 'Bahçe', 'Okey bölümü', 'Bar', 'Mutfak', 'Nargile', 'Depo', ...S.get().assets.map(a => a.location).filter(Boolean)])];
  Object.assign(ui, { aCat: 'all', aStatus: 'all', aQ: '' });

  function viewDemirbas() {
    const db = S.get();
    const q = ui.aQ.toLocaleLowerCase('tr');
    const cnt = st => db.assets.filter(a => (ui.aCat === 'all' || a.cat === ui.aCat) && a.status === st).length;
    const list = db.assets.filter(a => (ui.aCat === 'all' || a.cat === ui.aCat) && (ui.aStatus === 'all' || a.status === ui.aStatus)
      && (!q || (a.name + ' ' + a.code + ' ' + (a.location || '') + ' ' + (a.serial || '')).toLocaleLowerCase('tr').includes(q)));
    const rank = { arizali: 0, kayip: 1, tamirde: 2, aktif: 3, hurda: 4 };
    list.sort((a, b) => rank[a.status] - rank[b.status] || a.code.localeCompare(b.code));
    return `
      <button class="btn dark block scan-cta" data-act="scan">📷 Karekod okut</button>
      <div class="stat-grid">${S.ASSET_STATUS.map(s => `
        <button class="stat st-${s.tone} ${ui.aStatus === s.id ? 'on' : ''}" data-act="a-status" data-id="${s.id}"><b>${cnt(s.id)}</b><span>${s.name}</span></button>`).join('')}
      </div>
      <div class="chips">${[{ id: 'all', name: 'Tümü', icon: '' }, ...S.ASSET_CATS].map(c => {
        const n = db.assets.filter(a => c.id === 'all' || a.cat === c.id).length;
        return n || c.id === ui.aCat ? `<button class="chip ${ui.aCat === c.id ? 'on' : ''}" data-act="a-cat" data-id="${c.id}">${c.icon ? c.icon + ' ' : ''}${esc(c.name)}</button>` : '';
      }).join('')}</div>
      <div class="toolbar">
        <input class="search" id="aQ" type="search" placeholder="Ad, kod, yer, seri no…" value="${esc(ui.aQ)}">
        ${ui.aStatus !== 'all' ? `<button class="btn sm" data-act="a-status" data-id="all">Filtreyi kaldır</button>` : ''}
      </div>
      <div class="list">${list.map(a => {
        const st = AST(a.status);
        return `<button class="row" data-act="open-asset" data-id="${a.id}">
          <span class="a-ic">${ACAT(a.cat).icon}</span>
          <div class="main"><div class="t">${esc(a.name)}</div>
            <div class="s"><span class="code">${esc(a.code)}</span> · ${esc(a.location || 'yer yok')}${a.note && a.status !== 'aktif' ? ' · ' + esc(a.note) : ''}</div></div>
          <span class="badge st-${st.tone}">${st.name}</span>
        </button>`;
      }).join('') || '<div class="empty"><div class="e">🔍</div>Eşleşen demirbaş yok</div>'}</div>
      <div class="btn-row" style="margin-top:12px">
        ${can('demirbas_yonet') ? `<button class="btn" data-act="labels">🖨️ Etiket yazdır</button><button class="btn primary" data-act="new-asset">+ Demirbaş ekle</button>` : ''}
      </div>
      <div class="small muted" style="text-align:center;margin-top:10px">Etiketi okutunca eşyanın sayfası açılır: arızalı, tamirde, aktif, hurda olarak güncelleyebilirsin.</div>`;
  }

  // duruma göre hızlı işlemler: [hedef durum, buton yazısı, otomatik not]
  const QUICK = {
    aktif: [['arizali', '⚠️ Bozuldu / arızalı', 'Arıza bildirildi'], ['kayip', '❓ Kayıp', 'Bulunamıyor']],
    arizali: [['tamirde', '🔧 Tamire gönder', 'Tamire gönderildi'], ['aktif', '✅ Çalışıyor', 'Arıza giderildi'], ['hurda', '🗑️ Hurdaya ayır', 'Hurdaya ayrıldı']],
    tamirde: [['aktif', '✅ Tamirden geldi', 'Tamirden geldi'], ['hurda', '🗑️ Tamir edilemedi', 'Tamir edilemedi, hurda']],
    kayip: [['aktif', '✅ Bulundu', 'Bulundu'], ['hurda', '🗑️ Kayıttan düş', 'Kayıp, kayıttan düşüldü']],
    hurda: [['aktif', '♻️ Tekrar kullanımda', 'Tekrar kullanıma alındı']],
  };

  function openAsset(id) {
    const a = S.asset(id); if (!a) return toast(`"${id}" kodlu demirbaş bulunamadı`);
    const st = AST(a.status), cat = ACAT(a.cat);
    const log = S.get().assetLog.filter(l => l.assetId === a.id).slice(0, 8);
    const info = [['Marka/Model', a.brand], ['Seri no', a.serial], ['Eklenme', a.createdAt ? new Date(a.createdAt).toLocaleDateString('tr-TR') : '']].filter(x => x[1]);
    sheet(`
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div class="qr-mini" data-act="show-qr" data-id="${a.id}">${window.makeQR ? makeQR(assetUrl(a)) : ''}</div>
        <div style="flex:1;min-width:0">
          <div class="code" style="font-size:13px">${esc(a.code)}</div>
          <h3 style="margin-top:2px">${esc(a.name)}</h3>
          <div class="sub" style="margin:0">${cat.icon} ${esc(cat.name)} · 📍 ${esc(a.location || '—')}</div>
          <div style="margin-top:8px"><span class="badge st-${st.tone}" style="font-size:13px;padding:4px 12px">${st.name}</span></div>
        </div>
      </div>
      ${info.length ? `<div class="info-grid">${info.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      ${a.note ? `<div class="card small" style="margin-top:10px;box-shadow:none;background:var(--bg)">📝 ${esc(a.note)}</div>` : ''}
      ${can('demirbas_durum') ? `<h2 class="section">Hızlı işlem</h2>
      <div class="quick">${(QUICK[a.status] || []).map(([to, label, note]) => `<button class="st-${AST(to).tone}" data-q="${to}" data-note="${esc(note)}">${label}<small>→ ${AST(to).name}</small></button>`).join('')}</div>
      <label class="field" style="margin-top:12px"><span>Not ekle (isteğe bağlı)</span><input id="stNote" placeholder="örn. ekranda çizgi var, X servisine verildi"></label>
      <details class="more"><summary>Başka bir duruma al</summary>
        <div class="status-pick" style="margin-top:10px">${S.ASSET_STATUS.map(s => `<button class="st-${s.tone} ${a.status === s.id ? 'on' : ''}" data-st="${s.id}">${s.name}</button>`).join('')}</div>
      </details>` : `<div class="card small" style="margin-top:12px;box-shadow:none;background:var(--bg)">Durumu değiştirme yetkin yok. Arızayı yöneticiye ya da müdüre bildir.</div>`}
      <h2 class="section">Geçmiş</h2>
      <div class="list">${log.map(l => `<div class="row"><div class="main"><div class="t" style="font-weight:500">${l.from ? `${AST(l.from).name} → <b>${AST(l.to).name}</b>` : esc(l.note)}</div><div class="s">${esc(l.user)} · ${ago(l.at)}${l.from && l.note ? ' · ' + esc(l.note) : ''}</div></div></div>`).join('') || '<div class="empty small">Kayıt yok</div>'}</div>
      <div class="btn-row" style="margin-top:12px">
        ${can('demirbas_yonet') ? `<button class="btn sm" data-act="labels-one" data-id="${a.id}">🖨️ Etiket yazdır</button><button class="btn sm" id="editA">✏️ Bilgileri düzenle</button>` : ''}
      </div>`,
      sh => {
        const apply = (to, autoNote) => {
          const typed = sh.querySelector('#stNote').value.trim();
          S.setAssetStatus(a.id, to, user.name, typed || autoNote);
          closeSheet(); toast(`${a.code} · ${a.name} → ${AST(to).name}`);
        };
        sh.querySelectorAll('[data-q]').forEach(b => b.onclick = () => apply(b.dataset.q, b.dataset.note));
        sh.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { if (b.dataset.st !== a.status) apply(b.dataset.st, ''); });
        sh.querySelector('#editA')?.addEventListener('click', () => editAsset(a.id));
      });
  }

  // ---------- karekod okuyucu (uygulama içi)
  let scanStream = null, scanTimer = null;
  const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = JSQR_URL; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  }
  function codeFromText(txt) {
    const m = String(txt).match(/#\/d\/([^?&#\s]+)/) || String(txt).match(/\b(DB-\d{1,6})\b/i);
    return m ? decodeURIComponent(m[1]).toUpperCase() : null;
  }
  function stopScan() {
    clearTimeout(scanTimer); scanTimer = null;
    scanStream?.getTracks().forEach(t => t.stop()); scanStream = null;
  }
  function found(raw) {
    const jm = String(raw).match(/#\/katil\/([A-Za-z0-9_-]+)/);
    if (jm) { stopScan(); closeSheet(true); location.hash = '#/katil/' + jm[1]; return true; }
    const code = codeFromText(raw);
    if (!code) { toast('Bu karekod bir demirbaş etiketi değil'); return false; }
    stopScan(); closeSheet(true);
    if (navigator.vibrate) navigator.vibrate(60);
    if (route() !== 'demirbas') location.hash = '#/demirbas';
    setTimeout(() => openAsset(code), 80);
    return true;
  }
  function openScanner() {
    sheet(`
      <h3>Karekod okut</h3><div class="sub">Kamerayı demirbaş etiketine tut</div>
      <div class="scan-box"><video id="scanV" playsinline muted></video><div class="scan-frame"></div>
        <div class="scan-msg" id="scanMsg">Kamera açılıyor…</div></div>
      <div class="manual"><input id="manualCode" placeholder="DB-0003 ya da katılım bağlantısı" autocapitalize="characters"><button class="btn primary" id="manualGo">Aç</button></div>`,
      async sh => {
        const msg = sh.querySelector('#scanMsg'), v = sh.querySelector('#scanV');
        const go = () => { const c = sh.querySelector('#manualCode').value.trim(); if (!c) return; found(/^\d+$/.test(c) ? 'DB-' + c.padStart(4, '0') : c); };
        sh.querySelector('#manualGo').onclick = go;
        sh.querySelector('#manualCode').onkeydown = e => { if (e.key === 'Enter') go(); };
        // kapatılınca kamerayı durdur
        const obs = new MutationObserver(() => { if (!document.body.contains(sh)) { stopScan(); obs.disconnect(); } });
        obs.observe(document.body, { childList: true });
        if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = 'Bu tarayıcı kameraya izin vermiyor. Kodu elle yazabilirsin.'; return; }
        try {
          scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          v.srcObject = scanStream; await v.play();
        } catch (e) { msg.textContent = 'Kamera izni verilmedi. Ayarlardan izin ver ya da kodu elle yaz.'; return; }
        let detect;
        if ('BarcodeDetector' in window) {
          const bd = new BarcodeDetector({ formats: ['qr_code'] });
          detect = async () => (await bd.detect(v))[0]?.rawValue;
        } else {
          try { await loadJsQR(); } catch (e) { msg.textContent = 'Okuyucu yüklenemedi (internet yok). Kodu elle yaz.'; return; }
          const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
          detect = async () => {
            const w = v.videoWidth, h = v.videoHeight; if (!w) return null;
            const s = Math.min(1, 640 / Math.max(w, h)); c.width = w * s; c.height = h * s;
            ctx.drawImage(v, 0, 0, c.width, c.height);
            return jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' })?.data;
          };
        }
        msg.textContent = 'Etiketi çerçevenin içine getir';
        const loop = async () => {
          if (!scanStream) return;
          try { const r = await detect(); if (r && found(r)) return; } catch (e) {}
          scanTimer = setTimeout(loop, 180);
        };
        loop();
      });
  }

  function showQR(id) {
    const a = S.asset(id);
    sheet(`<div style="text-align:center"><div class="qr-big">${makeQR(assetUrl(a))}</div>
      <div class="code" style="font-size:18px;margin-top:10px">${esc(a.code)}</div><h3>${esc(a.name)}</h3>
      <div class="small muted" style="word-break:break-all;margin:8px 0 14px">${esc(assetUrl(a))}</div>
      <button class="btn block" data-act="labels-one" data-id="${a.id}">🖨️ Bu etiketi yazdır</button></div>`);
  }

  function editAsset(id) {
    const a = id ? S.asset(id) : { cat: ui.aCat !== 'all' ? ui.aCat : 'yayin', status: 'aktif' };
    form(id ? `Düzenle · ${a.code}` : 'Yeni demirbaş', [
      { k: 'name', label: 'Adı', req: true, ph: 'örn. Okey masası #7' },
      [{ k: 'cat', label: 'Kategori', type: 'select', options: S.ASSET_CATS.map(c => [c.id, c.icon + ' ' + c.name]) },
       { k: 'status', label: 'Durum', type: 'select', options: S.ASSET_STATUS.map(s => [s.id, s.name]) }],
      { k: 'location', label: 'Bulunduğu yer', list: LOCS(), ph: 'Salon, Bahçe, Okey bölümü…' },
      [{ k: 'brand', label: 'Marka/Model' }, { k: 'serial', label: 'Seri no' }],
      { k: 'note', label: 'Not' },
      ...(id ? [] : [{ k: 'count', label: 'Adet (aynı üründen birden fazla ekle)', type: 'number' }]),
    ], { count: 1, ...a }, v => {
      const n = Math.max(1, Math.min(50, Math.round(v.count || 1))); delete v.count;
      if (id) { S.saveAsset({ ...v, id }, user.name); toast('Kaydedildi'); return; }
      for (let i = 1; i <= n; i++) S.saveAsset({ ...v, name: n > 1 ? `${v.name} #${i}` : v.name }, user.name);
      toast(n > 1 ? `${n} demirbaş eklendi` : 'Demirbaş eklendi');
    }, id ? () => S.removeAsset(id) : null);
  }

  // ---------- yazdırılabilir etiket sayfası (seçimli)
  // Etiket ölçüsü sabit: A4 üzerinde 3 x 8 = 24'lü etiket (63,5 x 38,1 mm), karekod her zaman 28 mm.
  const labelSel = new Set();
  let labelCat = 'all';
  function renderLabels() {
    const db = S.get();
    const list = db.assets.filter(a => labelCat === 'all' || a.cat === labelCat).sort((a, b) => a.code.localeCompare(b.code));
    const nSel = db.assets.filter(a => labelSel.has(a.id)).length;
    const allInView = list.length && list.every(a => labelSel.has(a.id));
    const y = window.scrollY;
    $app.innerHTML = `
      <div class="label-bar no-print">
        <div class="lb-top">
          <button class="btn sm" data-act="labels-back">‹ Geri</button>
          <div style="flex:1;min-width:0"><b>Etiket yazdır</b><div class="small muted">${nSel ? `${nSel} etiket seçili` : 'Yazdırılacakları seç'}</div></div>
          <button class="btn primary sm" data-act="print" ${nSel ? '' : 'disabled'}>Yazdır (${nSel})</button>
        </div>
        <div class="chips" style="margin:10px -16px 6px">${[{ id: 'all', name: 'Tümü', icon: '' }, ...S.ASSET_CATS].filter(c => c.id === 'all' || db.assets.some(a => a.cat === c.id)).map(c =>
          `<button class="chip ${labelCat === c.id ? 'on' : ''}" data-act="l-cat" data-id="${c.id}">${c.icon ? c.icon + ' ' : ''}${esc(c.name)}</button>`).join('')}</div>
        <div class="btn-row">
          <button class="btn sm" data-act="l-all">${allInView ? 'Seçimi kaldır' : `Tümünü seç (${list.length})`}</button>
          ${nSel ? `<button class="btn ghost sm" data-act="l-none">Hepsini temizle</button>` : ''}
        </div>
        <div class="small muted" style="margin-top:6px">A4 24'lü etiket kağıdı (63,5 × 38,1 mm) · Karekod 28 mm sabit</div>
      </div>
      <div class="labels">${list.map(a => `
        <div class="label ${labelSel.has(a.id) ? 'sel' : 'unsel'}" data-act="l-toggle" data-id="${a.id}">
          <span class="lchk no-print">${labelSel.has(a.id) ? '✓' : ''}</span>
          ${labelHTML(a, db.cafe.name)}
        </div>`).join('')}</div>`;
    window.scrollTo(0, y);
  }
  function labelHTML(a, cafe) {
    const meta = [a.brand, a.serial ? 'SN: ' + a.serial : '', a.location].filter(Boolean).join(' · ');
    return `<div class="lq">${makeQR(assetUrl(a))}</div>
      <div class="lt">
        <div class="lk">${brandHTML('label')}</div>
        <div class="lc">${esc(a.code)}</div>
        <div class="ln">${esc(a.name)}</div>
        ${meta ? `<div class="lm">${esc(meta)}</div>` : ''}
      </div>`;
  }

  // ---------- BULUT (senkron) arayüzü
  const SYNC_TXT = {
    demo: ['Örnek veriler · sadece bu telefonda', 'off'], local: ['Bu cihazda kayıtlı', 'warn'], connecting: ['Buluta bağlanıyor…', 'warn'], online: ['Bulutla eşit', 'ok'],
    syncing: ['Gönderiliyor…', 'warn'], offline: ['Çevrimdışı · sonra gönderilecek', 'off'], error: ['Bağlantı sorunu', 'bad'],
  };
  const syncLabel = () => { const [t, c] = SYNC_TXT[Sync.state.status] || SYNC_TXT.local; return `<span class="sync s-${c}" data-act="go-cloud"><i></i> ${t}</span>`; };
  Sync.onState(() => { document.querySelectorAll('.topbar .sub').forEach(el => { el.innerHTML = (S.isDemo ? '<span class="demo-pill">DEMO</span>' : '') + syncLabel(); }); if (route() === 'ayarlar' && !document.querySelector('.sheet')) render(); });

  function cloudSection() {
    if (S.isDemo) return `<h2 class="section">Demo</h2>
      <div class="card stack">
        <div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:26px">🧪</span><div><b>Demo hesabındasın.</b>
        <div class="small muted">Buradaki veriler örnektir, sadece bu telefonda durur ve buluta gitmez. İstediğin gibi dene, bozarsan sıfırla.</div></div></div>
        <div class="btn-row"><button class="btn sm" data-act="reset">Demo verilerini sıfırla</button><button class="btn primary sm" data-act="exit-demo">Gerçek kafeye dön</button></div>
      </div>`;
    const st = Sync.state, c = Sync.cloud;
    const [t, cls] = SYNC_TXT[st.status] || SYNC_TXT.local;
    if (!c) {
      return `<h2 class="section">Bulut senkronu</h2>
        <div class="card stack">
          <div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:26px">☁️</span><div><b>Veriler şu an sadece bu telefonda.</b>
          <div class="small muted">Bulutu kurunca garsonun, nargilecinin ve senin telefonun aynı verileri anında görür. İnternet giderse telefon kaydetmeye devam eder, gelince gönderir.</div></div></div>
          ${isAdmin() ? `<button class="btn primary block" data-act="cloud-setup">Bulutu kur</button>` : `<div class="small muted">Bu telefonu bağlamak için yöneticiden <b>“Cihaz ekle”</b> karekodunu iste ve telefonun kamerasıyla okut.</div>`}
        </div>`;
    }
    return `<h2 class="section">Bulut senkronu</h2>
      <div class="card stack">
        <div style="display:flex;gap:10px;align-items:center"><span class="sync-dot s-${cls}"></span><div style="flex:1"><b>${t}</b>
          <div class="small muted">${st.msg ? esc(st.msg) : st.last ? 'Son eşitleme: ' + ago(st.last) : 'Kafe kodu: ' + esc(c.cafeId)}</div></div></div>
        ${can('cihaz') ? `<button class="btn primary block" data-act="cloud-add">📱 Cihaz ekle (karekod / bağlantı)</button>` : ''}
        <div class="btn-row"><button class="btn sm" data-act="cloud-push">Şimdi eşitle</button><button class="btn ghost sm" data-act="cloud-leave">Bu cihazı ayır</button></div>
      </div>`;
  }

  function openCloudSetup() {
    const pre = window.KAFE_FIREBASE && window.KAFE_FIREBASE.apiKey ? window.KAFE_FIREBASE : null;
    sheet(`
      <h3>Bulutu kur</h3><div class="sub">Bu işlemi bir kez, yönetici telefonundan yaparsın. Sonra diğer telefonlar karekodla katılır.</div>
      ${pre ? `<div class="card small" style="box-shadow:none;background:var(--ok-soft)">✅ Firebase projesi hazır: <b>${esc(pre.projectId)}</b></div>`
        : `<label class="field"><span>Firebase ayarları (firebaseConfig)</span><textarea id="cfgTxt" rows="6" placeholder="const firebaseConfig = {&#10;  apiKey: &quot;...&quot;,&#10;  projectId: &quot;...&quot;,&#10;  appId: &quot;...&quot;&#10;};"></textarea></label>`}
      <div class="field"><span>Hangi verilerle başlasın?</span>
        <label class="radio-row"><input type="radio" name="start" value="keep" checked><div><b>Bu telefondaki verilerle</b><small>Şu an ekranda gördüğün her şey buluta yüklenir</small></div></label>
        <label class="radio-row"><input type="radio" name="start" value="wipe"><div><b>Örnek verileri sil, boş başla</b><small>Bölümler ve kafe kimliği kalır; malzeme, demirbaş, sipariş ve örnek kullanıcılar silinir</small></div></label>
      </div>
      <label class="field hidden" id="pinF"><span>Yeni yönetici PIN'i (4 rakam)</span><input id="newPin" inputmode="numeric" maxlength="4" placeholder="örn. 4826"></label>
      <div class="small muted" id="setupMsg" style="margin-bottom:10px"></div>
      <button class="btn primary block" id="doSetup">Kur ve buluta yükle</button>`,
      sh => {
        sh.querySelectorAll('[name=start]').forEach(r => r.onchange = () => sh.querySelector('#pinF').classList.toggle('hidden', r.value !== 'wipe' || !r.checked));
        sh.querySelector('#doSetup').onclick = async () => {
          const msg = sh.querySelector('#setupMsg'), btn = sh.querySelector('#doSetup');
          let config;
          try { config = pre || Sync.parseConfig(sh.querySelector('#cfgTxt').value); } catch (e) { msg.textContent = '⚠️ ' + e.message; return; }
          const wipe = sh.querySelector('[name=start]:checked').value === 'wipe';
          const pin = sh.querySelector('#newPin').value.trim();
          if (wipe && !/^\d{4}$/.test(pin)) { msg.textContent = '⚠️ Yönetici için 4 haneli yeni bir PIN yaz'; return; }
          if (wipe && !confirm('Örnek veriler silinecek. Devam edilsin mi?')) return;
          btn.disabled = true; btn.textContent = 'Kuruluyor…'; msg.textContent = 'Buluta bağlanılıyor…';
          try {
            if (wipe) { S.wipeDemo(pin); user = S.get().users[0]; try { localStorage.setItem(UKEY, user.id); } catch (e) {} }
            await Sync.setup({ type: window.__cloudType || 'firebase', config });
            closeSheet(); render(); toast('Bulut kuruldu. Şimdi diğer telefonları ekleyebilirsin.');
            setTimeout(openAddDevice, 400);
          } catch (e) {
            btn.disabled = false; btn.textContent = 'Tekrar dene';
            msg.textContent = '⚠️ Kurulamadı: ' + (e.code || e.message || e) + '. Firebase adımlarını (Anonymous giriş, Firestore, kurallar) kontrol et.';
          }
        };
      });
  }

  function openAddDevice() {
    const link = Sync.joinLink();
    sheet(`
      <h3>Cihaz ekle</h3><div class="sub">Garsonun ya da nargilecinin telefonunda kamerayı aç, bu karekodu okut. Açılan sayfada <b>“Katıl”</b> desin, sonra kendi adını ve PIN'ini seçsin.</div>
      <div class="qr-big join-qr">${makeQR(link)}</div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn" id="cpLink">Bağlantıyı kopyala</button>
        ${navigator.share ? `<button class="btn wa" id="shLink">Paylaş</button>` : ''}
      </div>
      <div class="card small" style="margin-top:12px;box-shadow:none;background:var(--warn-soft)">🔐 Bu karekod/bağlantı kafenin anahtarıdır. Sadece çalışanlarla paylaş; sosyal medyaya koyma.</div>
      <div class="small muted" style="margin-top:10px">iPhone'da: bağlantı Safari'de açılınca <b>Paylaş → Ana Ekrana Ekle</b> ile uygulama gibi kurulur.</div>`,
      sh => {
        sh.querySelector('#cpLink').onclick = () => navigator.clipboard?.writeText(link).then(() => toast('Bağlantı kopyalandı'), () => toast('Kopyalanamadı'));
        sh.querySelector('#shLink')?.addEventListener('click', () => navigator.share({ title: S.get().cafe.name, text: `${S.get().cafe.name} uygulamasına katılmak için aç:`, url: link }).catch(() => {}));
      });
  }

  // #/katil/<kod> : başka telefondan gelen katılım bağlantısı (giriş yapmadan da açılır)
  function renderJoin() {
    let p = null;
    try { p = Sync.decodeJoin(routeArg()); } catch (e) {}
    const db = S.get(), same = Sync.cloud && p && Sync.cloud.cafeId === p.id;
    $app.innerHTML = `
      <div class="login join">
        <div class="login-glow"></div>
        <div class="login-top">${cafeMode() === 'name' ? `<div class="brand-mark"><img src="icon.svg" alt=""></div>` : `<div class="brand-logo bg-${db.cafe.logoBg || 'light'}"><img src="${db.cafe.logo}" alt=""></div>`}
          <div><div class="login-cafe">Kafeye katıl</div><div class="login-tag">Bu telefon kafenin ortak verilerine bağlanacak</div></div></div>
        ${!p ? `<div class="join-box"><b>Bağlantı bozuk.</b><p>Yöneticiden “Cihaz ekle” karekodunu yeniden okutmasını iste.</p><button class="btn block" data-act="join-cancel">Geri</button></div>`
          : same ? `<div class="join-box"><b>Bu telefon zaten bağlı ✓</b><p>Kafe kodu: ${esc(p.id)}</p><button class="btn primary block" data-act="join-cancel">Uygulamaya geç</button></div>`
          : `<div class="join-box">
              <div class="jb-row"><span>Kafe kodu</span><b>${esc(p.id)}</b></div>
              <div class="jb-row"><span>Bulut projesi</span><b>${esc(p.c?.projectId || window.KAFE_FIREBASE?.projectId || '—')}</b></div>
              <p>${Sync.cloud ? '⚠️ Bu telefon başka bir kafeye bağlı; o bağlantı kapanacak.' : 'Bu telefondaki deneme verileri silinip yerine kafenin gerçek verileri gelecek.'}</p>
              <div class="join-msg" id="joinMsg"></div>
              <button class="btn primary block big-btn" data-act="join-go">Katıl</button>
              <button class="btn ghost block" data-act="join-cancel" style="margin-top:6px;color:inherit">Vazgeç</button>
            </div>`}
      </div>`;
    return p;
  }
  async function doJoin() {
    const p = Sync.decodeJoin(routeArg());
    const btn = document.querySelector('[data-act=join-go]'), msg = document.getElementById('joinMsg');
    btn.disabled = true; btn.textContent = 'Bağlanıyor…'; msg.textContent = '';
    try {
      await Sync.join(p);
      user = null; try { localStorage.removeItem(UKEY); } catch (e) {}
      msg.textContent = 'Veriler indiriliyor…';
      // kullanıcı listesi gelene kadar kısa bekle
      for (let i = 0; i < 40 && !S.get().users.length; i++) await new Promise(r => setTimeout(r, 150));
      history.replaceState(null, '', '#/home'); render(); toast('Kafeye bağlandın. Adını seç ve PIN\'ini gir.');
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Tekrar dene';
      const m = String(e.code || e.message || e);
      msg.textContent = '⚠️ ' + (/eski-tarayici/.test(m) ? 'Bu cihaz çok eski: bulut bağlantısı için iOS 11.3 veya üstü gerekiyor. Uygulama bu cihazda sadece demo olarak açılır.'
        : 'Katılamadı: ' + (/permission/i.test(m) ? 'kod geçersiz ya da kafe silinmiş'
          : /Failed to fetch|NetworkError|Load failed|network/i.test(m) ? 'internete bağlanılamadı. Bağlantıyı kontrol edip tekrar dene.' : m));
    }
  }

  // ---------- BİLDİRİMLER
  // Ayrı veri tutulmaz: sipariş/demirbaş/sayım geçmişinden, giriş yapan kişiyi ilgilendirenler türetilir.
  const nKey = k => `kafestok.${S.isDemo ? 'demo.' : ''}${k}.${user?.id}`;
  const nGet = k => { try { return JSON.parse(localStorage.getItem(nKey(k))); } catch (e) { return null; } };
  const nSet = (k, v) => { try { localStorage.setItem(nKey(k), JSON.stringify(v)); } catch (e) {} };
  const notifyOn = () => { try { return localStorage.getItem('kafestok.notify') === '1'; } catch (e) { return false; } };

  function events() {
    if (!user) return [];
    const db = S.get(), me = user.name, since = Date.now() - 7 * 864e5, out = [];
    const supName = o => S.supplier(o.supplierId)?.name || 'Tedarikçi';
    db.orders.forEach(o => (o.log || []).forEach((l, i) => {
      if (!l.at || l.at < since || l.user === me) return;
      const id = `o:${o.id}:${i}`;
      if (['onaya_gonderdi', 'ekledi'].includes(l.action) && (can('siparis_onay') || isDev()) && o.status === 'onay')
        out.push({ id, at: l.at, icon: '⏳', title: `${l.user} onaya sipariş gönderdi`, body: `${o.no} · ${supName(o)}`, hash: '#/siparis', tab: 'onay' });
      else if (l.action === 'onayladi' && isMine(o))
        out.push({ id, at: l.at, icon: '✅', title: `${o.no} onaylandı`, body: `${supName(o)}${o.adminNote ? ' · ' + o.adminNote : ''}`, hash: '#/siparis', tab: 'yolda' });
      else if (l.action === 'reddetti' && isMine(o))
        out.push({ id, at: l.at, icon: '✖️', title: `${o.no} reddedildi`, body: o.adminNote || supName(o), hash: '#/siparis', tab: 'gecmis' });
      else if (l.action === 'teslim_aldi' && (isMine(o) || can('siparis_onay') || isDev()))
        out.push({ id, at: l.at, icon: l.short ? '⚠️' : '📦', title: `${o.no} ${l.short ? 'eksik/iadeli teslim alındı' : 'teslim alındı'}`, body: `${supName(o)} · ${l.user}`, hash: '#/siparis', tab: 'gecmis' });
      else if (l.action === 'kismi_teslim' && (isMine(o) || can('siparis_onay') || isDev()))
        out.push({ id, at: l.at, icon: '⚠️', title: `${o.no} kısmen geldi`, body: `${supName(o)} · ${l.user} · kalan bekleniyor`, hash: '#/siparis', tab: 'yolda' });
    }));
    if (viewAll() || can('demirbas_yonet') || can('demirbas_durum')) db.assetLog.forEach(l => {
      if (!l.at || l.at < since || l.user === me || !l.from) return;
      const a = db.assets.find(x => x.id === l.assetId); if (!a) return;
      if (['arizali', 'kayip'].includes(l.to))
        out.push({ id: `a:${l.id}`, at: l.at, icon: l.to === 'kayip' ? '❓' : '⚠️', title: `${a.name} ${l.to === 'kayip' ? 'kayıp' : 'arızalı'}`, body: `${a.code} · ${l.user}${l.note ? ' · ' + l.note : ''}`, hash: '#/demirbas', asset: a.id });
      else if (l.to === 'aktif' && ['arizali', 'tamirde', 'kayip'].includes(l.from))
        out.push({ id: `a:${l.id}`, at: l.at, icon: '🔧', title: `${a.name} tekrar aktif`, body: `${a.code} · ${l.user}${l.note ? ' · ' + l.note : ''}`, hash: '#/demirbas', asset: a.id });
    });
    if (can('siparis_hazirla') || can('siparis_direkt') || isDev()) {
      const ds = new Set(myDepts().map(d => d.id));
      db.movements.forEach(m => {
        if (!m.at || m.at < since || m.user === me) return;
        const it = S.item(m.itemId); if (!it || !ds.has(it.deptId)) return;
        if (m.before > it.min && m.after <= it.min)
          out.push({ id: `m:${m.id}`, at: m.at, icon: '🔴', title: `${it.name} kritik seviyede`, body: `${fmt(m.after)} ${it.unit} kaldı · ${m.user}`, hash: '#/stok', item: it.id });
      });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 40);
  }
  function unreadCount() { const read = new Set(nGet('nread') || []); return events().filter(e => !read.has(e.id)).length; }
  function bellHTML() { const n = user ? unreadCount() : 0; return `<button class="bell" data-act="notif" aria-label="Bildirimler"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>${n ? `<span class="pip">${n > 9 ? '9+' : n}</span>` : ''}</button>`; }
  function openEvent(e) {
    closeSheet(true);
    if (e.tab) ui.sipTab = e.tab;
    if (location.hash !== e.hash) location.hash = e.hash; else render();
    if (e.asset) setTimeout(() => openAsset(e.asset), 80);
    if (e.item) setTimeout(() => openItem(e.item), 80);
  }
  function openNotifs() {
    const evs = events(), read = new Set(nGet('nread') || []);
    nSet('nread', [...new Set([...evs.map(e => e.id), ...read])].slice(-400));
    sheet(`
      <h3>Bildirimler</h3><div class="sub">Son 7 gün · sana ait olanlar</div>
      ${!notifyOn() ? `<button class="card small notif-cta" data-act="go-notif-settings">🔔 Telefona da bildirim gelsin mi? <b>Aç ›</b></button>` : ''}
      <div class="list">${evs.map(e => `<button class="row notif ${read.has(e.id) ? '' : 'new'}" data-ev="${esc(e.id)}">
        <span class="n-ic">${e.icon}</span><div class="main"><div class="t">${esc(e.title)}</div><div class="s">${esc(e.body)} · ${ago(e.at)}</div></div>${read.has(e.id) ? '' : '<span class="n-dot"></span>'}</button>`).join('')
        || '<div class="empty"><div class="e">🔕</div>Henüz bildirim yok</div>'}</div>`,
      sh => sh.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => openEvent(evs.find(e => e.id === b.dataset.ev))));
    document.querySelectorAll('.bell .pip').forEach(p => p.remove());
  }
  // yeni olayları yakala: uygulama açıkken bildirim kutusu, arka plandayken telefon bildirimi
  function checkNotify() {
    if (!user) return;
    const evs = events(), seenArr = nGet('nseen');
    if (!seenArr) { nSet('nseen', evs.map(e => e.id)); if (!nGet('nread')) nSet('nread', evs.map(e => e.id)); return; }
    const seen = new Set(seenArr), fresh = evs.filter(e => !seen.has(e.id)).reverse();
    if (!fresh.length) return;
    nSet('nseen', [...seenArr, ...fresh.map(e => e.id)].slice(-400));
    document.querySelectorAll('.topbar .bell').forEach(b => { b.outerHTML = bellHTML(); });
    const last = fresh[fresh.length - 1];
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    if (document.visibilityState === 'visible') toast(`${last.icon} ${last.title}`);
    else if (notifyOn() && 'Notification' in window && Notification.permission === 'granted') fresh.slice(-3).forEach(sysNotify);
  }
  function sysNotify(e) {
    const opts = { body: e.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: e.id, data: { url: location.pathname + '#/n/' + encodeURIComponent(e.id) } };
    const title = `${e.icon} ${e.title}`;
    (navigator.serviceWorker?.getRegistration?.() || Promise.resolve(null))
      .then(reg => reg ? reg.showNotification(title, opts) : new Notification(title, opts)).catch(() => { try { new Notification(title, opts); } catch (x) {} });
  }
  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function notifySection() {
    const sup = 'Notification' in window, perm = sup ? Notification.permission : 'yok', on = notifyOn() && perm === 'granted';
    let state;
    if (!sup) state = isIOS() && !isStandalone() ? 'iPhone/iPad’de bildirim için uygulamayı <b>Paylaş → Ana Ekrana Ekle</b> ile kurup <b>ana ekrandaki simgeden</b> aç.' : 'Bu tarayıcı telefon bildirimini desteklemiyor.';
    else if (perm === 'denied') state = 'Bildirim izni kapalı. Telefon ayarlarından bu uygulamaya bildirim izni ver.';
    else state = on ? 'Açık. Yeni bir şey olunca telefonuna bildirim düşer.' : 'Kapalı. Sadece uygulama içindeki 🔔 listesinde görünür.';
    return `<h2 class="section">Bildirimler</h2>
      <div class="card stack small">
        <div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:24px">${on ? '🔔' : '🔕'}</span><div>${state}</div></div>
        ${sup && perm !== 'denied' ? `<div class="btn-row">${on ? `<button class="btn sm" data-act="notif-off">Kapat</button><button class="btn primary sm" data-act="notif-test">Deneme bildirimi</button>` : `<button class="btn primary sm" data-act="notif-on">Telefon bildirimlerini aç</button>`}</div>` : ''}
        <div class="muted">Uygulama açıkken veya arka plandayken gelir. Telefon kilitliyken ve uygulama tamamen kapalıyken gelmesi için sunucu kurulumu gerekir.</div>
      </div>`;
  }
  async function enableNotify() {
    try {
      const p = await Notification.requestPermission();
      if (p === 'granted') { try { localStorage.setItem('kafestok.notify', '1'); } catch (e) {} toast('Bildirimler açıldı'); sysNotify({ id: 'test', icon: '🔔', title: 'Bildirimler açık', body: `${S.get().cafe.name} · böyle görünecek` }); }
      else toast('İzin verilmedi');
    } catch (e) { toast('Bildirim izni alınamadı'); }
    render();
  }

  // ---------- AYARLAR
  function viewAyarlar() {
    const db = S.get();
    const profile = `<div class="card" style="display:flex;align-items:center;gap:12px">
        <div class="avatar" style="width:46px;height:46px">${esc(initials(user.name))}</div>
        <div style="flex:1"><b>${esc(user.name)}</b><div class="small muted">${roleName(user.role)}${isAdmin() ? '' : ' · ' + esc(myDepts().map(d => d.name).join(', '))}</div></div>
        <button class="btn sm" data-act="logout">Çıkış</button></div>
      <div class="list" style="margin-top:10px"><button class="row" data-act="my-pin"><span style="font-size:20px">🔑</span><div class="main"><div class="t">PIN'imi değiştir</div><div class="s">Giriş şifren · 4 rakam</div></div><span class="muted">›</span></button></div>`;
    const cur = getSkin();
    const themes = `<h2 class="section">Tema</h2>
      <div class="skins">${SKINS.map(t => `<button class="skin ${cur === t.id ? 'on' : ''}" data-act="skin" data-id="${t.id}">
        <span class="sw"><i style="background:${t.c[0]}"></i><i style="background:${t.c[1]}"></i><i style="background:${t.c[2]}"></i></span>
        <b>${t.name}</b>${t.d ? `<small>${t.d}</small>` : ''}</button>`).join('')}</div>`;
    const sec = (title, act, rows, ok = true) => `<h2 class="section">${title}${ok ? '' : ' <span class="ro-tag">salt okunur</span>'}</h2><div class="list">${ok ? rows : rows.replace(/data-act="(edit-[a-z]+|manage-items|tpl-import)"/g, 'data-act="ro"')}${ok ? `<button class="row" data-act="${act}" style="color:var(--accent);font-weight:700">+ Ekle</button>` : ''}</div>`;
    let out = profile + cloudSection() + notifySection();
    if (isAdmin()) out += `
      <h2 class="section">Kafe</h2>
      <div class="list"><button class="row" data-act="edit-cafe">
        <div class="cafe-thumb">${db.cafe.logo ? `<img src="${db.cafe.logo}" alt="">` : '☕'}</div>
        <div class="main"><div class="t">${esc(db.cafe.name)}</div><div class="s">Logo ve isim · ${CAFE_MODES.find(x => x[0] === cafeMode())[1]}</div></div><span class="muted">›</span></button></div>
      ${sec('Kullanıcılar ve yetkiler', 'new-user', `<button class="row pin-toggle" data-act="show-pins"><span style="font-size:18px">${ui.showPins ? '🙈' : '👁️'}</span><div class="main"><div class="t">${ui.showPins ? "PIN'leri gizle" : "PIN'leri göster"}</div><div class="s">Sadece yönetici görebilir</div></div></button>` + db.users.map(u => `<button class="row" data-act="edit-user" data-id="${u.id}"><div class="avatar" style="width:32px;height:32px;font-size:12px">${esc(initials(u.name))}</div><div class="main"><div class="t">${esc(u.name)} <span class="role-tag r-${u.role}">${roleName(u.role)}</span></div><div class="s">${u.role === 'yonetici' ? 'Tüm yetkiler' : esc(permSummary(u))}</div></div><span class="pin-chip ${ui.showPins ? 'on' : ''}">${ui.showPins ? esc(u.pin) : '••••'}</span><span class="muted">›</span></button>`).join(''))}`;
    if (can('malzeme') || isDev()) out += sec('Malzemeler', 'new-item', `<button class="row" data-act="tpl-import" style="color:var(--accent);font-weight:700">📋 Örnek listeden ekle</button>` + db.depts.map(d => {
      const n = db.items.filter(i => i.deptId === d.id).length;
      return `<button class="row" data-act="manage-items" data-id="${d.id}"><span style="font-size:20px">${d.icon}</span><div class="main"><div class="t">${esc(d.name)}</div><div class="s">${n} malzeme</div></div><span class="muted">›</span></button>`;
    }).join(''), can('malzeme'));
    if (can('tedarikci') || isDev()) out += sec('Tedarikçiler', 'new-sup', db.suppliers.map(s => `<button class="row" data-act="edit-sup" data-id="${s.id}"><div class="main"><div class="t">${esc(s.name)}</div><div class="s">${esc(s.contact || '')} ${s.phone ? '· +' + esc(s.phone) : ''}</div></div><span class="muted">›</span></button>`).join(''), can('tedarikci'));
    if (can('bolum') || isDev()) out += sec('Bölümler', 'new-dept', db.depts.map(d => `<button class="row" data-act="edit-dept" data-id="${d.id}"><span style="font-size:20px">${d.icon}</span><div class="main"><div class="t">${esc(d.name)}</div></div><span class="muted">›</span></button>`).join(''), can('bolum'));
    if (isDev()) out += sec('Kullanıcılar', 'new-user', db.users.map(u => `<div class="row"><div class="avatar" style="width:32px;height:32px;font-size:12px">${esc(initials(u.name))}</div><div class="main"><div class="t">${esc(u.name)} <span class="role-tag r-${u.role}">${roleName(u.role)}</span></div><div class="s">${u.role === 'yonetici' ? 'Tüm yetkiler' : esc(permSummary(u))}</div></div></div>`).join(''), false);
    out += themes;
    if (!S.isDemo) out += `<h2 class="section">Demo</h2><div class="list"><button class="row" data-act="go-demo"><span style="font-size:20px">🧪</span><div class="main"><div class="t">Demo'yu aç</div><div class="s">Örnek verilerle dene · PIN 0000 · gerçek kafeye karışmaz</div></div><span class="muted">›</span></button></div>`;
    if (isAdmin()) out += `
      <h2 class="section">Veri</h2>
      <div class="card stack small">
        <div>Tüm verileri (malzeme, sipariş, demirbaş, geçmiş) tek dosya olarak telefona indirir.</div>
        <div class="btn-row"><button class="btn sm" data-act="export">Yedek indir</button>${S.isDemo ? '' : `<button class="btn danger sm" data-act="reset-cafe">Kafeyi sıfırla</button>`}</div>
      </div>`;
    if (!isAdmin() && !isDev() && !canAnyRecords()) out += `<div class="empty small">Malzeme, tedarikçi ve kullanıcı ayarlarını yetkili kişiler değiştirebilir.</div>`;
    return out;
  }
  function permSummary(u) {
    const p = permsOf(u), on = PERMS.flatMap(g => g[1]).filter(x => p[x[0]]);
    const depts = (u.deptIds || []).map(d => S.dept(d)?.name).filter(Boolean);
    return [depts.length && !p.sayim_tum ? 'Sayım: ' + depts.join(', ') : p.sayim_tum ? 'Tüm bölümler' : '', `${on.length} yetki`].filter(Boolean).join(' · ');
  }

  function openMyPin() {
    sheet(`
      <h3>PIN'imi değiştir</h3><div class="sub">${esc(user.name)} · yeni PIN bir sonraki girişte geçerli</div>
      <label class="field"><span>Şu anki PIN</span><input id="pOld" inputmode="numeric" maxlength="4" type="password" autocomplete="off"></label>
      <div class="field-row" style="grid-template-columns:1fr 1fr">
        <label class="field"><span>Yeni PIN</span><input id="pNew" inputmode="numeric" maxlength="4" type="password" autocomplete="off"></label>
        <label class="field"><span>Yeni PIN tekrar</span><input id="pNew2" inputmode="numeric" maxlength="4" type="password" autocomplete="off"></label>
      </div>
      <div class="small muted" id="pMsg" style="margin-bottom:10px">${isAdmin() ? '' : 'Unutursan yönetici PIN’ini görüp sana söyleyebilir.'}</div>
      <button class="btn primary block" id="pGo">PIN'i değiştir</button>`,
      sh => {
        sh.querySelector('#pGo').onclick = () => {
          const v = id => sh.querySelector(id).value.trim(), msg = sh.querySelector('#pMsg');
          const me = S.user(user.id);
          if (v('#pOld') !== me.pin) return (msg.textContent = '⚠️ Şu anki PIN yanlış');
          if (!/^\d{4}$/.test(v('#pNew'))) return (msg.textContent = '⚠️ Yeni PIN 4 rakam olmalı');
          if (v('#pNew') !== v('#pNew2')) return (msg.textContent = '⚠️ Yeni PIN’ler aynı değil');
          if (v('#pNew') === me.pin) return (msg.textContent = '⚠️ Yeni PIN eskisiyle aynı');
          if (!S.isDemo && v('#pNew') === '0000') return (msg.textContent = '⚠️ 0000 demo için ayrıldı');
          S.upsert('users', { ...me, pin: v('#pNew') }); user = S.user(user.id);
          closeSheet(); render(); toast('PIN değiştirildi');
        };
      });
  }

  // ---------- alt sayfa (sheet)
  function sheet(html, onMount) {
    closeSheet(true);
    const scrim = document.createElement('div'); scrim.className = 'scrim';
    const sh = document.createElement('div'); sh.className = 'sheet';
    sh.innerHTML = `<div class="grab"></div>${html}`;
    document.body.append(scrim, sh);
    scrim.onclick = () => closeSheet();
    requestAnimationFrame(() => { scrim.classList.add('show'); sh.classList.add('show'); });
    onMount?.(sh);
    return sh;
  }
  function closeSheet(instant) {
    document.querySelectorAll('.scrim,.sheet').forEach(el => {
      if (instant) return el.remove();
      el.classList.remove('show'); setTimeout(() => el.remove(), 250);
    });
  }

  function openItem(id) {
    const it = S.item(id); if (!it) return;
    const st = S.status(it), dept = S.dept(it.deptId), sup = S.supplier(it.supplierId);
    const hist = S.get().movements.filter(m => m.itemId === id).slice(0, 5);
    const canCount = canCountDept(it.deptId);
    const onay = S.pendingQtyFor(id, ['onay']), yol = S.pendingQtyFor(id, ['verildi']);
    const open = S.get().orders.filter(o => ['onay', 'verildi'].includes(o.status) && o.lines.some(l => l.itemId === id && (o.status === 'onay' || S.lineLeft(l) > 0)));
    const canOrder = (can('siparis_hazirla') || can('siparis_direkt')) && sup;
    const gap = Math.max(it.target - it.qty - onay - yol, 0);
    let v = it.qty, oq = gap > 0 ? Math.ceil(gap * 2) / 2 : 0;
    const legend = d => `<div class="legend">
        <span><i class="lg st-${st}"></i>Elde <b>${fmt(it.qty)}</b></span>
        ${yol ? `<span><i class="lg seg-yol"></i>Yolda <b>${fmt(yol)}</b></span>` : ''}
        ${onay ? `<span><i class="lg seg-onay"></i>Onayda <b>${fmt(onay)}</b></span>` : ''}
        ${d ? `<span><i class="lg seg-draft"></i>Yeni <b>${fmt(d)}</b></span>` : ''}
        <span class="lg-tot"><b>${fmt(it.qty + yol + onay + d)}</b> / ${fmt(it.target)} ${esc(it.unit)}</span></div>`;
    sheet(`
      <h3>${esc(it.name)}</h3>
      <div class="sub">${dept?.icon || ''} ${esc(dept?.name)} · ${esc(sup?.name || 'tedarikçi yok')} · <span class="badge st-${st}">${ST_LABEL[st]}</span></div>
      <div class="big-bar-wrap"><div id="bigBar">${bar(it, true, 0)}</div><div id="legend">${legend(0)}</div>
        <div class="bar-marks small muted"><span>min ${fmt(it.min)}</span><span>hedef ${fmt(it.target)}</span></div></div>

      <h2 class="section">Sayım</h2>
      ${canCount ? `
      <div class="big-stepper"><button data-s="-1">−</button><div><input id="bigQ" inputmode="decimal" value="${fmt(v)}"><div class="u">${esc(it.unit)} · elde</div></div><button data-s="1">+</button></div>
      <button class="btn primary block" id="saveItem">Sayımı kaydet</button>` : `<div class="card small muted">${isDev() ? '👁️ Salt okunur: sayım yetkin kapalı.' : 'Bu bölümün sayımını sadece ilgili personel yapabilir.'}</div>`}

      <h2 class="section">Sipariş</h2>
      ${open.length ? `<div class="list" style="margin-bottom:10px">${open.map(o => {
        const l = o.lines.find(x => x.itemId === id), os = OST[o.status];
        return `<div class="row"><span class="lg-dot ${o.status === 'onay' ? 'seg-onay' : 'seg-yol'}"></span>
          <div class="main"><div class="t">${esc(o.no)} · ${fmt(o.status === 'verildi' ? S.lineLeft(l) : l.qty)} ${esc(it.unit)}${o.status === 'verildi' && l.received ? ` <span class="small muted">(${fmt(l.received)} geldi)</span>` : ''}</div><div class="s">${esc(S.supplier(o.supplierId)?.name || '')} · ${esc(o.createdBy)} · ${ago(o.createdAt)}</div></div>
          ${o.status === 'verildi' && can('teslim') ? `<button class="btn primary sm" data-recv="${o.id}">Teslim al</button>`
            : o.status === 'onay' && can('siparis_onay') ? `<button class="btn sm" data-rev="${o.id}">İncele</button>` : `<span class="badge st-${os.tone}">${os.name}</span>`}
        </div>`; }).join('')}</div>` : ''}
      ${!sup ? `<div class="card small muted">Bu malzemeye tedarikçi atanmamış; sipariş için önce tedarikçi seçilmeli.</div>`
        : canOrder ? `
      <div class="order-box">
        <div class="ob-row"><div><b>Yeni sipariş</b><div class="small muted">${gap > 0 ? `Hedefe ${fmt(gap)} ${esc(it.unit)} eksik` : 'Elde + siparişte olan hedefi karşılıyor'}</div></div>
          <div class="stepper"><button data-o="-1">−</button><input id="ordQ" inputmode="decimal" value="${fmt(oq)}"><button data-o="1">+</button></div></div>
        <input class="note-in" id="ordNote" placeholder="${can('siparis_direkt') ? 'Tedarikçiye not (WhatsApp ve PDF\'te görünür)' : 'Bu malzeme için yöneticiye not'}">
        ${can('siparis_direkt')
          ? `<div class="btn-row">${sup.phone ? `<button class="btn wa" id="ordWa">WhatsApp ile gönder</button>` : ''}<button class="btn dark" id="ordMark">Sipariş verildi</button></div>`
          : `<button class="btn primary block" id="ordReq">Onaya gönder</button>`}
      </div>` : `<div class="card small muted">Sipariş hazırlama yetkin yok.</div>`}

      <h2 class="section">Geçmiş</h2>
      <div class="list">${hist.map(m => `<div class="row"><div class="main"><div class="t" style="font-weight:500">${esc(m.user)} ${MV_LABEL[m.type]}</div><div class="s">${ago(m.at)}${m.note ? ' · ' + esc(m.note) : ''}</div></div><div class="qty small"><span class="muted">${fmt(m.before)} →</span> <b>${fmt(m.after)}</b></div></div>`).join('') || '<div class="empty small">Kayıt yok</div>'}</div>
      ${can('malzeme') ? `<button class="btn ghost block" style="margin-top:10px" id="editItem">Malzemeyi düzenle</button>` : ''}`,
      sh => {
        const inp = sh.querySelector('#bigQ'), oin = sh.querySelector('#ordQ');
        let touched = false;
        const redraw = () => { const d = oin && touched ? Math.max(0, num(oin.value)) : 0; sh.querySelector('#bigBar').innerHTML = bar(it, true, d); sh.querySelector('#legend').innerHTML = legend(d); };
        sh.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { v = Math.max(0, num(inp.value) + stepOf(it) * b.dataset.s); inp.value = fmt(v); });
        sh.querySelector('#saveItem')?.addEventListener('click', () => {
          const nv = num(inp.value);
          if (nv !== it.qty) { S.setQty(id, nv, user.name, 'sayim'); S.saveCount([], user.name); toast(`${it.name}: ${fmt(nv)} ${it.unit} kaydedildi`); }
          closeSheet(); render();
        });
        sh.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { touched = true; oin.value = fmt(Math.max(0, num(oin.value) + stepOf(it) * b.dataset.o)); redraw(); });
        oin?.addEventListener('input', () => { touched = true; redraw(); }); oin?.addEventListener('focus', () => oin.select());
        const place = via => {
          const q = num(oin.value); if (q <= 0) return toast('Sipariş miktarı gir');
          const note = sh.querySelector('#ordNote').value.trim(), lines = [{ itemId: id, qty: q, ...(via === 'req' && note ? { note } : {}) }];
          let o;
          if (via === 'req') { o = S.requestOrder(it.supplierId, lines, user.name); toast(S.lastMerged ? `${o.no} listesine eklendi` : `${o.no} onaya gönderildi`); }
          else {
            o = S.createOrder(it.supplierId, lines, user.name, note);
            if (via === 'wa') window.open(`https://wa.me/${sup.phone}?text=${encodeURIComponent(textForOrder(o))}`, '_blank');
            toast(`${o.no} yolda`);
          }
          delete ui.orderDraft[id];
          render(); openItem(id);
        };
        sh.querySelector('#ordReq')?.addEventListener('click', () => place('req'));
        sh.querySelector('#ordWa')?.addEventListener('click', () => place('wa'));
        sh.querySelector('#ordMark')?.addEventListener('click', () => place('mark'));
        sh.querySelectorAll('[data-recv]').forEach(b => b.onclick = () => receiveSheet(b.dataset.recv, () => openItem(id)));
        sh.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => reviewOrder(b.dataset.rev));
        sh.querySelector('#editItem')?.addEventListener('click', () => editItem(id));
        redraw();
      });
  }

  // genel form
  function form(title, fields, values, onSave, onDelete) {
    const f = fld => {
      const v = values[fld.k] ?? '';
      if (fld.type === 'select') return `<label class="field"><span>${fld.label}</span><select name="${fld.k}">${fld.options.map(o => `<option value="${esc(o[0])}" ${String(v) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
      if (fld.type === 'checks') return `<div class="field"><span>${fld.label}</span><div class="checks">${fld.options.map(o => `<label><input type="checkbox" name="${fld.k}" value="${esc(o[0])}" ${(v || []).includes(o[0]) ? 'checked' : ''}> ${esc(o[1])}</label>`).join('')}</div></div>`;
      if (fld.list) return `<label class="field"><span>${fld.label}</span><input name="${fld.k}" list="dl-${fld.k}" placeholder="${esc(fld.ph || '')}" value="${esc(v)}"><datalist id="dl-${fld.k}">${fld.list.map(o => `<option value="${esc(o)}">`).join('')}</datalist></label>`;
      return `<label class="field"><span>${fld.label}</span><input name="${fld.k}" ${fld.type === 'number' ? 'inputmode="decimal"' : ''} ${fld.type === 'tel' ? 'inputmode="tel"' : ''} placeholder="${esc(fld.ph || '')}" value="${esc(fld.type === 'number' && v !== '' ? fmt(v) : v)}"></label>`;
    };
    const rows = fields.map(x => Array.isArray(x) ? `<div class="field-row">${x.map(f).join('')}</div>` : f(x)).join('');
    sheet(`<h3>${title}</h3><div style="height:10px"></div><form id="frm">${rows}
      <button class="btn primary block" type="submit">Kaydet</button>
      ${onDelete ? '<button class="btn ghost block" type="button" id="del" style="margin-top:6px;color:var(--bad)">Sil</button>' : ''}</form>`, sh => {
      sh.querySelector('#frm').onsubmit = e => {
        e.preventDefault();
        const out = {};
        fields.flat().forEach(fl => {
          if (fl.type === 'checks') out[fl.k] = [...sh.querySelectorAll(`[name="${fl.k}"]:checked`)].map(x => x.value);
          else { const raw = sh.querySelector(`[name="${fl.k}"]`).value.trim(); out[fl.k] = fl.type === 'number' ? num(raw) : raw; }
        });
        const req = fields.flat().find(fl => fl.req && !out[fl.k]);
        if (req) return toast(`${req.label} boş olamaz`);
        onSave(out); closeSheet(); render();
      };
      sh.querySelector('#del')?.addEventListener('click', () => { if (confirm('Silinsin mi?')) { onDelete(); closeSheet(); render(); } });
    });
  }
  const UNITS = ['adet', 'paket', 'kutu', 'koli', 'rulo', 'kg', 'gr', 'lt', 'şişe', 'bidon'].map(u => [u, u]);
  function editItem(id, deptId) {
    const db = S.get(), it = id ? S.item(id) : { deptId: deptId || (ui.stokDept !== 'all' ? ui.stokDept : db.depts[0]?.id), unit: 'adet', qty: 0, min: 1, target: 5 };
    form(id ? 'Malzemeyi düzenle' : 'Yeni malzeme', [
      { k: 'name', label: 'Adı', req: true, ph: 'örn. Tütün – Çift Elma' },
      { k: 'deptId', label: 'Bölüm', type: 'select', options: db.depts.map(d => [d.id, d.icon + ' ' + d.name]) },
      [{ k: 'unit', label: 'Birim', type: 'select', options: UNITS }, { k: 'min', label: 'Minimum', type: 'number' }, { k: 'target', label: 'Hedef', type: 'number' }],
      ...(id ? [] : [{ k: 'qty', label: 'Şu an elde', type: 'number' }]),
      { k: 'supplierId', label: 'Tedarikçi', type: 'select', options: [['', '— yok —'], ...db.suppliers.map(s => [s.id, s.name])] },
    ], it, v => {
      if (v.target < v.min) v.target = v.min;
      if (id) S.upsert('items', { ...v, id });
      else S.upsert('items', { ...v, updatedAt: Date.now(), updatedBy: user.name });
      toast('Malzeme kaydedildi');
    }, id ? () => S.remove('items', id) : null);
  }
  function manageItems(deptId) {
    const d = S.dept(deptId), its = S.get().items.filter(i => i.deptId === deptId).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    sheet(`<h3>${d.icon} ${esc(d.name)}</h3><div class="sub">${its.length} malzeme · min / hedef</div>
      <div class="list">${its.map(it => `<button class="row" data-ei="${it.id}"><div class="main"><div class="t">${esc(it.name)}</div><div class="s">${esc(S.supplier(it.supplierId)?.name || 'tedarikçi yok')}</div></div><div class="small muted">${fmt(it.min)} / ${fmt(it.target)} ${esc(it.unit)}</div></button>`).join('')}</div>
      <button class="btn block" style="margin-top:12px" id="addI">+ Bu bölüme malzeme ekle</button>`, sh => {
      sh.querySelectorAll('[data-ei]').forEach(b => b.onclick = () => editItem(b.dataset.ei));
      sh.querySelector('#addI').onclick = () => editItem(null, deptId);
    });
  }
  const editDept = id => form(id ? 'Bölümü düzenle' : 'Yeni bölüm', [{ k: 'name', label: 'Adı', req: true, ph: 'örn. Nargile' }, { k: 'icon', label: 'Simge (emoji)', ph: '💨' }],
    id ? S.dept(id) : { icon: '📦' }, v => S.upsert('depts', { ...v, id: id || undefined, color: S.dept(id)?.color || '#7a4b2a' }),
    id ? () => { if (S.get().items.some(i => i.deptId === id)) return toast('Önce bölümdeki malzemeleri taşı/sil'); S.remove('depts', id); } : null);
  const editSup = id => form(id ? 'Tedarikçiyi düzenle' : 'Yeni tedarikçi', [{ k: 'name', label: 'Firma adı', req: true }, { k: 'contact', label: 'Yetkili' }, { k: 'phone', label: 'WhatsApp numarası', type: 'tel', ph: '905xxxxxxxxx' }],
    id ? S.supplier(id) : {}, v => { v.phone = v.phone.replace(/\D/g, '').replace(/^0/, '90'); S.upsert('suppliers', { ...v, id: id || undefined }); },
    id ? () => S.remove('suppliers', id) : null);
  function editUser(id) {
    const db = S.get(), u = id ? { ...S.user(id) } : { role: 'personel', deptIds: [], pin: '' };
    let role = u.role, perms = { ...permsOf(u) };
    const admins = db.users.filter(x => x.role === 'yonetici');
    const lastAdmin = id && u.role === 'yonetici' && admins.length === 1;
    sheet(`
      <h3>${id ? esc(u.name) : 'Yeni kullanıcı'}</h3><div class="sub">Rolü seç, sonra bu kişinin neler yapabileceğini işaretle</div>
      <div class="field-row" style="grid-template-columns:2fr 1fr">
        <label class="field"><span>Adı</span><input id="uName" value="${esc(u.name || '')}" placeholder="örn. Mahmut Şahin"></label>
        <label class="field"><span>PIN (4 rakam)</span><input id="uPin" inputmode="numeric" maxlength="4" value="${esc(u.pin || '')}"></label>
      </div>
      <div class="field"><span>Rol</span><div class="seg" id="uRole" style="margin:0">${ROLES.map(([k, l]) => `<button type="button" data-r="${k}">${l}</button>`).join('')}</div>
        <div class="small muted" id="uRoleHint" style="margin-top:6px"></div></div>
      <div id="uPermBox"></div>
      <div class="field"><span>Sayım yapabileceği bölümler</span><div class="checks" id="uDepts">${db.depts.map(d => `<label><input type="checkbox" value="${d.id}" ${(u.deptIds || []).includes(d.id) ? 'checked' : ''}> ${d.icon} ${esc(d.name)}</label>`).join('')}</div></div>
      <div class="small muted" id="uMsg" style="margin-bottom:8px"></div>
      <button class="btn primary block" id="uSave">Kaydet</button>
      ${id && id !== user.id && !lastAdmin ? `<button class="btn ghost block" id="uDel" style="margin-top:6px;color:var(--bad)">Kullanıcıyı sil</button>` : ''}`,
      sh => {
        const draw = () => {
          sh.querySelectorAll('#uRole [data-r]').forEach(b => { b.classList.toggle('on', b.dataset.r === role); b.disabled = lastAdmin && b.dataset.r !== 'yonetici'; });
          sh.querySelector('#uRoleHint').textContent = role === 'yonetici' ? 'Yönetici her şeyi yapabilir: onaylar, kullanıcılar, kafe ve bulut ayarları.'
            : lastAdmin ? '' : role === 'gelistirici' ? 'Geliştirici her şeyi görür ama varsayılan olarak hiçbir şeyi değiştiremez. Açmak istediğin yetkileri işaretle.'
            : role === 'mudur' ? 'Müdür için önerilen yetkiler işaretlendi; istediğini değiştir.' : 'Personel için önerilen yetkiler işaretlendi; istediğini değiştir.';
          if (lastAdmin) sh.querySelector('#uRoleHint').textContent = 'Tek yönetici bu kişi; rolü değiştirilemez.';
          sh.querySelector('#uPermBox').innerHTML = role === 'yonetici' ? '' : PERMS.map(([g, list]) => `
            <div class="perm-group"><div class="pg-title">${g}</div>${list.map(([k, l, d]) => `
              <label class="perm-row"><input type="checkbox" data-p="${k}" ${perms[k] ? 'checked' : ''}><div><b>${l}</b>${d ? `<small>${d}</small>` : ''}</div></label>`).join('')}</div>`).join('');
          sh.querySelectorAll('[data-p]').forEach(c => c.onchange = () => { if (c.checked) perms[c.dataset.p] = 1; else delete perms[c.dataset.p]; });
        };
        sh.querySelectorAll('#uRole [data-r]').forEach(b => b.onclick = () => {
          if (b.dataset.r === role) return;
          role = b.dataset.r; perms = { ...(PRESET[role] || {}) }; draw();
        });
        sh.querySelector('#uSave').onclick = () => {
          const name = sh.querySelector('#uName').value.trim(), pin = sh.querySelector('#uPin').value.trim(), msg = sh.querySelector('#uMsg');
          if (!name) return (msg.textContent = '⚠️ Ad boş olamaz');
          if (!/^\d{4}$/.test(pin)) return (msg.textContent = '⚠️ PIN 4 rakam olmalı');
          if (db.users.some(x => x.id !== id && x.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) return (msg.textContent = '⚠️ Bu isimde bir kullanıcı zaten var');
          const deptIds = [...sh.querySelectorAll('#uDepts input:checked')].map(c => c.value);
          const rec = { name, pin, role, deptIds, perms: role === 'yonetici' ? {} : perms };
          if (id) rec.id = id;
          S.upsert('users', rec);
          closeSheet(); render(); toast(`${name} kaydedildi · ${roleName(role)}`);
        };
        sh.querySelector('#uDel')?.addEventListener('click', () => { if (confirm(`${u.name} silinsin mi?`)) { S.remove('users', id); closeSheet(); render(); } });
        draw();
      });
  }

  const RSN = { eksik: 'Eksik geldi', begenmedim: 'Beğenmedim · iade', hasarli: 'Hasarlı · iade', gelmedi: 'Gelmedi' };
  function receiveSheet(oid, after) {
    const o = S.order(oid), sup = S.supplier(o.supplierId);
    const lines = o.lines.filter(l => S.lineLeft(l) > 0);
    const st = {}; lines.forEach(l => st[l.itemId] = { qty: S.lineLeft(l), reason: 'eksik', note: '' });
    const lineHTML = l => {
      const it = S.item(l.itemId), left = S.lineLeft(l), v = st[l.itemId], miss = left - v.qty;
      return `<div class="rcv-line ${miss > 0 ? 'short' : ''}" data-line="${l.itemId}">
        <div class="rcv-top"><div class="main"><div class="t" style="font-weight:600">${esc(it?.name || 'silinmiş malzeme')}</div>
          <div class="small muted">${l.received ? `Sipariş ${fmt(l.qty)} · önce gelen ${fmt(l.received)} · bekleyen <b>${fmt(left)}</b>` : `Sipariş: <b>${fmt(left)}</b>`} ${esc(it?.unit || '')}</div></div>
          <div class="stepper"><button data-rs="-1">−</button><input class="num" inputmode="decimal" data-rq value="${fmt(v.qty)}"><button data-rs="1">+</button></div></div>
        <div class="rcv-q">
          <button class="chip ${miss <= 0 ? 'on' : ''}" data-all>✓ Tamam geldi</button>
          <button class="chip ${v.qty === 0 ? 'on' : ''}" data-none>Hiç gelmedi / almadım</button>
        </div>
        ${miss > 0 ? `<div class="rcv-why"><div class="small"><b>${fmt(miss)} ${esc(it?.unit || '')}</b> teslim alınmıyor. Neden?</div>
          <div class="chips">${['eksik', 'begenmedim', 'hasarli'].map(r => `<button class="chip ${v.reason === r ? 'on' : ''}" data-why="${r}">${RSN[r]}</button>`).join('')}</div>
          <input class="note-in" data-rn placeholder="Kısa not (isteğe bağlı) · örn. tütün nemliydi" value="${esc(v.note)}"></div>` : ''}
      </div>`;
    };
    const draw = sh => {
      const anyShort = lines.some(l => st[l.itemId].qty < S.lineLeft(l));
      const anyEksik = lines.some(l => st[l.itemId].qty < S.lineLeft(l) && st[l.itemId].reason === 'eksik');
      if (ui.rcvOpen == null) ui.rcvOpen = true;
      sh.querySelector('#rcvLines').innerHTML = lines.map(lineHTML).join('');
      sh.querySelector('#rcvOpt').innerHTML = anyEksik ? `<div class="card rcv-opt"><div class="small" style="font-weight:700;margin-bottom:6px">Eksik kalanlar ne olacak?</div>
          <label class="radio-row"><input type="radio" name="ro" value="1" ${ui.rcvOpen ? 'checked' : ''}><span><b>Sonra gelecek</b><small>Sipariş "yolda" kalır, sadece eksik miktar beklenir</small></span></label>
          <label class="radio-row"><input type="radio" name="ro" value="0" ${!ui.rcvOpen ? 'checked' : ''}><span><b>Gelmeyecek, siparişi kapat</b><small>Eksik miktar, stok azsa tekrar sipariş listesine düşer</small></span></label></div>`
        : anyShort ? `<div class="card small muted rcv-opt">İade edilen miktar stoğa eklenmez; stok azsa malzeme tekrar sipariş listesine düşer.</div>` : '';
      sh.querySelector('#rcv').textContent = anyShort ? 'Gelenleri stoğa ekle' : 'Hepsi tamam · stoğa ekle';
    };
    ui.rcvOpen = true;
    sheet(`<h3>Teslim al</h3><div class="sub">${esc(sup?.name || '')} · ${esc(o.no || '')} · gelen miktarı kontrol et. Eksik ya da beğenmediğin ürünü azalt.</div>
      <div id="rcvLines"></div><div id="rcvOpt"></div>
      <button class="btn primary block" style="margin-top:14px" id="rcv"></button>`, sh => {
      draw(sh);
      const lineOf = e => { const el = e.target.closest('[data-line]'); return el && [el, lines.find(l => l.itemId === el.dataset.line)]; };
      sh.addEventListener('click', e => {
        const r = lineOf(e); if (!r) return; const [el, l] = r, v = st[l.itemId], left = S.lineLeft(l);
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.rs) v.qty = Math.min(left, Math.max(0, v.qty + Number(b.dataset.rs)));
        else if ('all' in b.dataset) v.qty = left;
        else if ('none' in b.dataset) v.qty = 0;
        else if (b.dataset.why) v.reason = b.dataset.why;
        else return;
        draw(sh);
      });
      sh.addEventListener('change', e => {
        if (e.target.name === 'ro') { ui.rcvOpen = e.target.value === '1'; return; }
        const r = lineOf(e); if (!r) return; const [, l] = r, v = st[l.itemId];
        if ('rq' in e.target.dataset) { v.qty = Math.min(S.lineLeft(l), Math.max(0, num(e.target.value))); setTimeout(() => draw(sh), 0); }
      });
      sh.addEventListener('input', e => {
        const r = lineOf(e); if (!r) return;
        if ('rn' in e.target.dataset) st[r[1].itemId].note = e.target.value;
        if ('rq' in e.target.dataset) st[r[1].itemId].qty = Math.min(S.lineLeft(r[1]), Math.max(0, num(e.target.value)));
      });
      sh.querySelector('#rcv').onclick = () => {
        const res = S.receiveOrder(oid, st, user.name, ui.rcvOpen);
        closeSheet(); render();
        toast(res.status === 'teslim' ? (res.short ? 'Teslim alındı · eksik/iade kaydedildi' : 'Teslim alındı, stok güncellendi') : 'Gelenler stoğa eklendi · kalan bekleniyor');
        if (after) setTimeout(after, 280);
      };
    });
  }
  // tedarikçiye eksik / iade bildirimi
  function issueText(o) {
    const L = [];
    o.lines.forEach(l => (l.issues || []).forEach(x => { const it = S.item(l.itemId); L.push(`• ${it?.name || '?'}: ${fmt(x.qty)} ${it?.unit || ''} — ${RSN[x.reason] || x.reason}${x.note ? ' (' + x.note + ')' : ''}`); }));
    return `Merhaba, ${S.get().cafe.name} — ${o.no} siparişi hakkında:\n${L.join('\n')}\n` +
      (o.status === 'verildi' && o.lines.some(l => S.lineLeft(l) > 0) ? 'Eksikleri bekliyoruz.\n' : '') + 'Teşekkürler.';
  }
  const hasIssues = o => o.lines.some(l => l.issues && l.issues.length);

  // ---------- olaylar
  function afterRender(r) {
    if (r === 'stok') {
      const q = document.getElementById('stokQ');
      q.oninput = () => { ui.stokQ = q.value; const pos = q.selectionStart; render(); const n = document.getElementById('stokQ'); n.focus(); n.setSelectionRange(pos, pos); };
      document.getElementById('onlyCrit').onchange = e => { ui.onlyCrit = e.target.checked; render(); };
    }
    if (r === 'demirbas' || r === 'd') {
      const q = document.getElementById('aQ');
      q.oninput = () => { ui.aQ = q.value; const pos = q.selectionStart; render(); const n = document.getElementById('aQ'); n.focus(); n.setSelectionRange(pos, pos); };
      if (r === 'd' && routeArg() && !document.querySelector('.sheet')) { const code = routeArg(); setTimeout(() => openAsset(code), 50); history.replaceState(null, '', '#/demirbas'); }
    }
    if (r === 'sayim') document.querySelectorAll('[data-cnt]').forEach(i => {
      i.oninput = () => setDraft(i.dataset.cnt, num(i.value));
      i.onfocus = () => i.select();
      i.onblur = () => { i.value = fmt(ui.sayimDraft[i.dataset.cnt] ?? S.item(i.dataset.cnt).qty); };
    });
    if (r === 'siparis' && !window.__merging) { window.__merging = true; setTimeout(() => { S.mergeOpenOrders(); window.__merging = false; }, 0); }
    if (r === 'siparis') document.querySelectorAll('[data-onote]').forEach(i => { i.oninput = () => { ui.orderNotes[i.dataset.onote] = i.value; }; });
    if (r === 'siparis') document.querySelectorAll('[data-lnote]').forEach(i => { i.oninput = () => { ui.lineNotes[i.dataset.lnote] = i.value.trim(); document.querySelector(`[data-act=ln-note][data-id="${i.dataset.lnote}"]`)?.classList.toggle('has', !!i.value.trim()); }; });
    if (r === 'siparis') document.querySelectorAll('[data-olq]').forEach(i => {
      i.onfocus = () => i.select();
      i.onchange = () => { ui.orderDraft[i.dataset.olq].qty = num(i.value); render(); };
    });
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act, id = el.dataset.id;
    const acts = {
      'pick-user': () => { loginUser = id; pin = ''; pinErr = ''; renderLogin(); },
      'login-back': () => { loginUser = null; pin = ''; pinErr = ''; renderLogin(); },
      'demo-pins': () => { showDemo = !showDemo; renderLogin(); },
      'go-demo': () => S.setMode('demo'),
      'my-pin': () => openMyPin(),
      ro: () => toast(RO_MSG),
      notif: () => openNotifs(),
      'notif-on': () => enableNotify(),
      'notif-off': () => { try { localStorage.setItem('kafestok.notify', '0'); } catch (e) {} render(); toast('Telefon bildirimleri kapatıldı'); },
      'notif-test': () => { sysNotify({ id: 'test' + Date.now(), icon: '🔔', title: 'Deneme bildirimi', body: `${S.get().cafe.name} · bildirimler çalışıyor` }); toast('Deneme bildirimi gönderildi'); },
      'go-notif-settings': () => { closeSheet(true); location.hash = '#/ayarlar'; setTimeout(() => document.querySelector('[data-act=notif-on]')?.scrollIntoView({ block: 'center' }), 120); },
      'show-pins': () => { ui.showPins = !ui.showPins; render(); },
      'exit-demo': () => S.setMode('real'),
      'setup-new': () => openSetupNew(),
      'tpl-import': () => openTemplate(),
      'reset-cafe': () => openResetCafe(),
      'ob-hide': () => { try { localStorage.setItem('kafestok.onboardHide', '1'); } catch (e) {} render(); toast('Kurulum adımları gizlendi'); },
      'ob-depts': () => { S.setCafe({ deptsOk: true }); location.hash = '#/ayarlar'; setTimeout(() => document.querySelector('[data-act=new-dept]')?.scrollIntoView({ block: 'center' }), 120); },
      'go-sayim': () => { location.hash = '#/sayim'; },
      'go-settings-items': () => { location.hash = '#/ayarlar'; },
      'go-cloud-setup': () => { location.hash = '#/ayarlar'; setTimeout(() => openCloudSetup(), 150); },
      skin: () => { setSkin(id); render(); },
      pin: () => pressPin(el.dataset.k),
      profile: () => { location.hash = '#/ayarlar'; },
      logout: () => { user = null; closeSheet(true); try { localStorage.removeItem(UKEY); } catch (e) {} render(); },
      'open-dept': () => { ui.stokDept = id; location.hash = '#/stok'; },
      'go-yolda': () => { ui.sipTab = 'yolda'; },
      'go-gecmis': () => { ui.sipTab = 'gecmis'; },
      'open-item': () => openItem(id),
      'stok-dept': () => { ui.stokDept = id; render(); },
      'sayim-dept': () => {
        if (Object.keys(ui.sayimDraft).length && !confirm('Kaydedilmemiş sayım var. Yine de bölüm değiştirilsin mi?')) return;
        ui.sayimDraft = {}; ui.sayimDept = id; render();
      },
      cnt: () => { const it = S.item(id); setDraft(id, (ui.sayimDraft[id] ?? it.qty) + stepOf(it) * el.dataset.d); document.querySelector(`[data-cnt="${id}"]`).value = fmt(ui.sayimDraft[id] ?? it.qty); },
      'save-count': saveCount,
      'sip-tab': () => { ui.sipTab = id; render(); },
      'ol-on': () => { ui.orderDraft[id].on = el.checked; render(); },
      'copy-order': () => { navigator.clipboard?.writeText(orderText(id)).then(() => toast('Sipariş metni kopyalandı'), () => toast('Kopyalanamadı')); },
      'wa-order': () => placeOrder(id, 'wa'),
      'mark-order': () => placeOrder(id, 'manual'),
      'request-order': () => placeOrder(id, 'request'),
      'ln-note': () => { ui.lnOpen[id] = !ui.lnOpen[id] || !!ui.lineNotes[id]; render(); setTimeout(() => document.querySelector(`[data-lnote="${id}"]`)?.focus(), 30); },
      'review-order': () => reviewOrder(id),
      'pdf-order': () => openDoc({ type: 'order', ids: [id] }),
      'pdf-draft': () => openDoc({ type: 'draft' }),
      'doc-back': () => { location.hash = '#/siparis'; },
      'go-onay': () => { ui.sipTab = 'onay'; },
      receive: () => receiveSheet(id),
      'close-rest': () => { if (confirm('Kalan miktarlar gelmeyecek olarak kapatılsın mı?')) { S.closeRest(id, user.name); render(); toast('Sipariş kapatıldı · eksikler kaydedildi'); } },
      'wa-issue': () => { const o = S.order(id); window.open(`https://wa.me/${S.supplier(o.supplierId).phone}?text=${encodeURIComponent(issueText(o))}`, '_blank'); },
      'cancel-order': () => {
        const o = S.order(id); if (!o) return;
        if (o.status === 'onay' && !can('siparis_onay')) {
          if (confirm('Senin eklediğin kalemler bu listeden çıkarılsın mı? Başkalarının eklediği kalemler kalır.')) { S.withdrawFromOrder(id, user.name); toast('Kalemlerin geri çekildi'); }
        } else if (confirm(o.status === 'onay' ? 'Bu liste tamamen silinsin mi?' : 'Sipariş iptal edilsin mi?')) { S.cancelOrder(id); toast('Sipariş iptal edildi'); }
      },
      'a-status': () => { ui.aStatus = ui.aStatus === id ? 'all' : id; render(); },
      'a-cat': () => { ui.aCat = id; render(); },
      'open-asset': () => openAsset(id),
      'show-qr': () => showQR(id),
      'new-asset': () => editAsset(null),
      labels: () => { labelCat = ui.aCat; location.hash = '#/etiket'; },
      'labels-one': () => { labelSel.clear(); labelSel.add(S.asset(id).id); labelCat = 'all'; closeSheet(true); location.hash = '#/etiket'; },
      'l-toggle': () => { labelSel.has(id) ? labelSel.delete(id) : labelSel.add(id); renderLabels(); },
      'l-all': () => {
        const list = S.get().assets.filter(a => labelCat === 'all' || a.cat === labelCat);
        const all = list.every(a => labelSel.has(a.id));
        list.forEach(a => all ? labelSel.delete(a.id) : labelSel.add(a.id)); renderLabels();
      },
      'l-none': () => { labelSel.clear(); renderLabels(); },
      'l-cat': () => { labelCat = id; renderLabels(); },
      scan: () => openScanner(),
      'labels-back': () => { history.length > 1 ? history.back() : (location.hash = '#/demirbas'); },
      print: () => window.print(),
      'new-item': () => editItem(null), 'manage-items': () => manageItems(id),
      'new-dept': () => editDept(null), 'edit-dept': () => editDept(id),
      'new-sup': () => editSup(null), 'edit-sup': () => editSup(id),
      'new-user': () => editUser(null), 'edit-user': () => editUser(id),
      'edit-cafe': () => editCafe(),
      'go-cloud': () => { if (user) location.hash = '#/ayarlar'; },
      'cloud-setup': () => openCloudSetup(),
      'cloud-add': () => openAddDevice(),
      'cloud-push': () => { Sync.pushNow(); toast('Eşitleniyor…'); },
      'cloud-leave': () => { if (confirm('Bu telefon buluttan ayrılacak. Veriler telefonda kalır ama artık diğer cihazlarla eşitlenmez. Devam?')) { Sync.leave(); render(); toast('Buluttan ayrıldı'); } },
      'join-go': () => doJoin(),
      'join-cancel': () => { history.replaceState(null, '', '#/home'); render(); },
      export: () => {
        const a2 = document.createElement('a');
        a2.href = URL.createObjectURL(new Blob([S.exportJSON()], { type: 'application/json' }));
        a2.download = `kafestok-yedek-${new Date().toISOString().slice(0, 10)}.json`; a2.click();
      },
      reset: () => { if (S.isDemo && confirm('Demo verileri ilk haline dönsün mü?')) { S.reset(); toast('Demo sıfırlandı'); } },
    };
    acts[a]?.();
  });

  // ---------- başlat
  S.init();
  try { user = S.user(localStorage.getItem(UKEY)) || null; } catch (e) {}
  // başka cihazdan veri gelince ekranı yenile; yazı yazılırken bekle ki klavye kapanmasın
  let deferred = false;
  function renderSafe() {
    const a = document.activeElement;
    if (a && $app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) {
      if (!deferred) { deferred = true; a.addEventListener('blur', () => { deferred = false; setTimeout(render, 0); }, { once: true }); }
      return;
    }
    render();
  }
  S.subscribe(renderSafe);
  S.subscribe(() => setTimeout(checkNotify, 0));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(checkNotify, 300); });
  Sync.start();
  window.addEventListener('hashchange', () => { stopScan(); closeSheet(true); render(); window.scrollTo(0, 0); });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__app = { ui, openItem, receiveSheet, editItem, found, codeFromText, setUser: id => { user = S.user(id); render(); } }; // test için
})();
