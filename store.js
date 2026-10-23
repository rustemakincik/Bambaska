/* KafeStok — veri katmanı
 * Şimdilik cihazda (localStorage) tutuluyor. Aynı API ileride Firebase
 * Firestore'a bağlanacak; ekranlar sadece bu dosyadaki fonksiyonları çağırır.
 */
const Store = (() => {
  const KEY = 'kafestok.v1';
  const subs = new Set();
  let db = null;

  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5);
  const now = () => Date.now();
  const H = 3600e3, D = 24 * H;

  function seed() {
    const t = now();
    const depts = [
      { id: 'nargile', name: 'Nargile', icon: '💨', color: '#b4532a' },
      { id: 'bar', name: 'Bar', icon: '☕', color: '#7a4b2a' },
      { id: 'mutfak', name: 'Mutfak', icon: '🍳', color: '#5b7a3a' },
      { id: 'genel', name: 'Genel', icon: '🧻', color: '#4a6a85' },
    ];
    const suppliers = [
      { id: 's1', name: 'Tütün Toptancısı', contact: 'Ahmet Bey', phone: '905321112233' },
      { id: 's2', name: 'Kömür Bayii', contact: 'Hasan', phone: '905334445566' },
      { id: 's3', name: 'Toptan Market', contact: 'Sipariş hattı', phone: '905057778899' },
      { id: 's4', name: 'Süt & Fırın', contact: 'Kemal', phone: '905441234567' },
    ];
    const I = (deptId, name, unit, qty, min, target, supplierId) =>
      ({ id: uid(), deptId, name, unit, qty, min, target, supplierId, updatedAt: t - Math.random() * 2 * D, updatedBy: 'Mehmet' });
    const items = [
      I('nargile', 'Tütün – Çift Elma', 'paket', 3, 4, 12, 's1'),
      I('nargile', 'Tütün – Nane', 'paket', 6, 4, 12, 's1'),
      I('nargile', 'Tütün – Karpuz Nane', 'paket', 1, 3, 10, 's1'),
      I('nargile', 'Tütün – Limon Nane', 'paket', 5, 3, 10, 's1'),
      I('nargile', 'Lüle', 'adet', 14, 10, 30, 's1'),
      I('nargile', 'Kömür (hindistan cevizi)', 'kutu', 2, 4, 15, 's2'),
      I('nargile', 'Sipsi / ağızlık', 'paket', 8, 5, 20, 's1'),
      I('nargile', 'Marpuç hortumu', 'adet', 4, 3, 10, 's1'),
      I('nargile', 'Folyo', 'rulo', 2, 2, 6, 's3'),
      I('nargile', 'Maşa', 'adet', 6, 2, 6, 's1'),
      I('bar', 'Çay', 'kg', 4, 5, 15, 's3'),
      I('bar', 'Türk kahvesi', 'kg', 2.5, 2, 6, 's3'),
      I('bar', 'Espresso çekirdeği', 'kg', 1, 2, 6, 's3'),
      I('bar', 'Süt', 'lt', 12, 10, 30, 's4'),
      I('bar', 'Küp şeker', 'kutu', 7, 4, 12, 's3'),
      I('bar', 'Karton bardak', 'koli', 1, 1, 4, 's3'),
      I('bar', 'Limon', 'kg', 3, 2, 5, 's3'),
      I('mutfak', 'Tost ekmeği', 'paket', 3, 4, 12, 's4'),
      I('mutfak', 'Kaşar peyniri', 'kg', 4, 2, 6, 's3'),
      I('mutfak', 'Sucuk', 'kg', 2, 1.5, 4, 's3'),
      I('mutfak', 'Dondurulmuş patates', 'kg', 10, 5, 20, 's3'),
      I('mutfak', 'Sıvı yağ', 'lt', 6, 5, 15, 's3'),
      I('genel', 'Peçete', 'koli', 2, 1, 4, 's3'),
      I('genel', 'Çöp poşeti', 'paket', 3, 2, 6, 's3'),
      I('genel', 'Bulaşık deterjanı', 'lt', 4, 2, 6, 's3'),
    ];
    const byName = n => items.find(i => i.name.startsWith(n));
    const mv = (n, before, after, user, ago, type = 'sayim') => {
      const it = byName(n);
      return { id: uid(), itemId: it.id, type, before, after, user, at: t - ago };
    };
    const movements = [
      mv('Kömür', 4, 2, 'Mehmet', 0.6 * H),
      mv('Tütün – Karpuz', 3, 1, 'Mehmet', 0.7 * H),
      mv('Tütün – Çift', 5, 3, 'Mehmet', 0.75 * H),
      mv('Espresso', 2, 1, 'Ayşe', 3 * H),
      mv('Çay', 6, 4, 'Ayşe', 3.2 * H),
      mv('Süt', 4, 12, 'Ayşe', 26 * H, 'giris'),
      mv('Tost', 6, 3, 'Yönetici', 27 * H),
    ];
    const orders = [{
      id: uid(), no: 'SP-0001', supplierId: 's4', status: 'verildi', createdAt: t - 5 * H, createdBy: 'Yönetici',
      approvedBy: 'Yönetici', approvedAt: t - 5 * H, note: '', adminNote: '',
      lines: [{ itemId: byName('Tost').id, qty: 9 }],
      log: [{ at: t - 5 * H, user: 'Yönetici', action: 'olusturdu' }],
    }, {
      id: uid(), no: 'SP-0002', supplierId: 's1', status: 'onay', createdAt: t - 0.5 * H, createdBy: 'Mehmet',
      note: 'Hafta sonu derbi var, tütün çok gidecek', adminNote: '',
      lines: [{ itemId: byName('Tütün – Çift').id, qty: 9 }, { itemId: byName('Tütün – Karpuz').id, qty: 9 }, { itemId: byName('Lüle').id, qty: 10 }],
      log: [{ at: t - 0.5 * H, user: 'Mehmet', action: 'onaya_gonderdi', note: 'Hafta sonu derbi var, tütün çok gidecek' }],
    }];
    const users = [
      { id: 'u1', name: 'Yönetici', role: 'yonetici', pin: '1234', deptIds: [] },
      { id: 'u2', name: 'Mehmet', role: 'personel', pin: '1111', deptIds: ['nargile'] },
      { id: 'u3', name: 'Ayşe', role: 'personel', pin: '2222', deptIds: ['bar', 'mutfak'] },
    ];
    return { version: 1, cafe: { name: 'Bambaşka Kafe Restoran', logo: 'logo.png', mode: 'logo', logoBg: 'none' }, depts, suppliers, items, movements, orders, users, ...seedAssets() };
  }

  // ---- demirbaş
  const ASSET_CATS = [
    { id: 'yayin', name: 'Yayın / TV', icon: '📺' },
    { id: 'okey', name: 'Okey', icon: '🀄' },
    { id: 'nargile', name: 'Nargile takımı', icon: '💨' },
    { id: 'mobilya', name: 'Masa / Sandalye', icon: '🪑' },
    { id: 'cihaz', name: 'Bar / Mutfak cihazı', icon: '🔌' },
    { id: 'diger', name: 'Diğer', icon: '📦' },
  ];
  const ASSET_STATUS = [
    { id: 'aktif', name: 'Aktif', tone: 'iyi' },
    { id: 'arizali', name: 'Arızalı', tone: 'kritik' },
    { id: 'tamirde', name: 'Tamirde', tone: 'azaliyor' },
    { id: 'kayip', name: 'Kayıp', tone: 'bitti' },
    { id: 'hurda', name: 'Hurda', tone: 'pasif' },
  ];
  function seedAssets() {
    const t = now(); let n = 0;
    const A = (cat, name, location, status = 'aktif', extra = {}) =>
      ({ id: uid(), code: 'DB-' + String(++n).padStart(4, '0'), cat, name, location, status, serial: '', note: '', createdAt: t - 90 * D, updatedAt: t - Math.random() * 20 * D, ...extra });
    const assets = [
      A('yayin', 'Salon TV 65"', 'Salon', 'aktif', { serial: 'SN65-88213', brand: 'Samsung' }),
      A('yayin', 'Salon TV 55" (sol duvar)', 'Salon'),
      A('yayin', 'Bahçe TV 50"', 'Bahçe', 'arizali', { note: 'HDMI girişi görüntü vermiyor' }),
      A('yayin', 'Projeksiyon cihazı', 'Salon', 'aktif', { note: 'Derbi maçlarında kullanılıyor' }),
      A('yayin', 'Uydu alıcısı (maç yayını) #1', 'Salon'),
      A('yayin', 'Uydu alıcısı (maç yayını) #2', 'Bahçe', 'tamirde', { note: 'Servise gönderildi' }),
      A('yayin', 'Kumanda – Salon TV', 'Bar', 'kayip'),
      ...[1, 2, 3, 4, 5, 6].map(i => A('okey', `Okey masası #${i}`, 'Okey bölümü')),
      ...[1, 2, 3, 4, 5, 6].map(i => A('okey', `Okey takımı #${i}`, 'Bar', i === 4 ? 'kayip' : 'aktif', i === 4 ? { note: '2 taş eksik' } : {})),
      ...[1, 2, 3, 4].map(i => A('nargile', `Nargile gövdesi #${i}`, 'Nargile', i === 3 ? 'arizali' : 'aktif', i === 3 ? { note: 'Gövde çatlak' } : {})),
      A('cihaz', 'Espresso makinesi', 'Bar', 'aktif', { serial: 'ESP-2291' }),
      A('cihaz', 'Çay ocağı (3 demlik)', 'Bar'),
      A('cihaz', 'Tost makinesi', 'Mutfak'),
      A('mobilya', 'Bahçe şemsiyesi #1', 'Bahçe'),
      A('mobilya', 'Bahçe ısıtıcısı', 'Bahçe', 'hurda'),
    ];
    const byCode = c => assets.find(a => a.code === c).id;
    const assetLog = [
      { id: uid(), assetId: byCode('DB-0003'), from: 'aktif', to: 'arizali', user: 'Ayşe', at: t - 2 * D, note: 'HDMI girişi görüntü vermiyor' },
      { id: uid(), assetId: byCode('DB-0006'), from: 'arizali', to: 'tamirde', user: 'Yönetici', at: t - 3 * D, note: 'Servise gönderildi' },
      { id: uid(), assetId: byCode('DB-0007'), from: 'aktif', to: 'kayip', user: 'Mehmet', at: t - 1 * D },
    ];
    return { assets, assetLog };
  }

  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || db.version !== 1) { db = seed(); persist(); }
    if (!db.assets) { Object.assign(db, seedAssets()); persist(); } // eski kayıtlara demirbaş ekle
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  const commitHooks = new Set();
  function commit() { persist(); commitHooks.forEach(f => f(db)); subs.forEach(f => f()); }
  const SORT = { movements: (a, b) => b.at - a.at, assetLog: (a, b) => b.at - a.at, orders: (a, b) => b.createdAt - a.createdAt };

  // ---- sipariş kalemi yardımcıları
  const partsOf = (o, l) => l.parts && l.parts.length ? l.parts : [{ by: o.createdBy, qty: l.qty, at: o.createdAt }];
  const notesOf = o => o.notes ? [...o.notes] : (o.note ? [{ by: o.createdBy, text: o.note, at: o.createdAt }] : []);
  function addLine(o, l, user, t) {
    const ex = o.lines.find(x => x.itemId === l.itemId);
    if (ex) { ex.parts = [...partsOf(o, ex), { by: user, qty: l.qty, at: t }]; ex.qty = Math.round((ex.qty + l.qty) * 100) / 100; }
    else o.lines.push({ itemId: l.itemId, qty: l.qty, parts: [{ by: user, qty: l.qty, at: t }] });
  }

  // ---- yardımcılar
  const status = it => {
    if (it.qty <= 0) return 'bitti';
    if (it.qty <= it.min) return 'kritik';
    if (it.qty <= it.min * 1.5) return 'azaliyor';
    return 'iyi';
  };
  const needsOrder = it => it.qty <= it.min;
  const suggested = it => {
    const q = Math.max(it.target - it.qty, 0);
    return Math.ceil(q * 2) / 2; // yarım birime yuvarla
  };

  return {
    init: load,
    // ---- bulut senkronu için (sync.js kullanır)
    onCommit: f => (commitHooks.add(f), () => commitHooks.delete(f)),
    COLLS: ['depts', 'suppliers', 'items', 'movements', 'orders', 'users', 'assets', 'assetLog'],
    applyRemote(coll, id, data) { // buluttan gelen tek kayıt; push tetiklemez
      if (coll === 'meta') { if (id === 'cafe' && data) db.cafe = data; return; }
      const list = db[coll] || (db[coll] = []);
      const i = list.findIndex(x => x.id === id);
      if (data) { if (i >= 0) list[i] = data; else list.push(data); } else if (i >= 0) list.splice(i, 1);
    },
    finishRemote() { Object.entries(SORT).forEach(([c, f]) => db[c]?.sort(f)); persist(); subs.forEach(f => f()); },
    emptyForJoin() { // katılan cihaz: yerel veriyi boşalt, buluttan doldurulacak
      db = { version: 1, cafe: { name: db.cafe?.name || 'Kafe' }, depts: [], suppliers: [], items: [], movements: [], orders: [], users: [], assets: [], assetLog: [] };
      persist(); subs.forEach(f => f());
    },
    wipeDemo(adminPin) { // bulutu boş kurarken: bölümler, kafe kimliği ve yönetici kalır
      const admin = db.users.find(u => u.role === 'yonetici') || { id: uid(), name: 'Yönetici', role: 'yonetici', deptIds: [] };
      admin.pin = adminPin || admin.pin;
      Object.assign(db, { suppliers: [], items: [], movements: [], orders: [], assets: [], assetLog: [], users: [admin] });
      persist(); subs.forEach(f => f());
    },
    subscribe: f => (subs.add(f), () => subs.delete(f)),
    get: () => db,
    status, needsOrder, suggested,
    dept: id => db.depts.find(d => d.id === id),
    supplier: id => db.suppliers.find(s => s.id === id),
    item: id => db.items.find(i => i.id === id),
    user: id => db.users.find(u => u.id === id),

    // stok hareketi: sayım (mutlak değer) / giriş / çıkış (fark)
    setQty(itemId, newQty, user, type = 'sayim', note) {
      const it = this.item(itemId); if (!it) return;
      const before = it.qty;
      const after = Math.max(0, Math.round(newQty * 100) / 100);
      if (before === after) return false;
      it.qty = after; it.updatedAt = now(); it.updatedBy = user;
      db.movements.unshift({ id: uid(), itemId, type, before, after, user, at: now(), note });
      db.movements = db.movements.slice(0, 500);
      return true;
    },
    saveCount(entries, user) { // entries: [{itemId, qty}]
      let n = 0;
      entries.forEach(e => { if (this.setQty(e.itemId, e.qty, user, 'sayim')) n++; });
      commit(); return n;
    },
    adjust(itemId, delta, user) {
      const it = this.item(itemId);
      this.setQty(itemId, it.qty + delta, user, delta > 0 ? 'giris' : 'cikis'); commit();
    },

    // sipariş
    pendingQtyFor(itemId, statuses = ['onay', 'verildi']) {
      return db.orders.filter(o => statuses.includes(o.status))
        .reduce((s, o) => s + (o.lines.find(l => l.itemId === itemId)?.qty || 0), 0);
    },
    nextOrderNo() {
      const max = db.orders.reduce((m, o) => Math.max(m, parseInt(String(o.no || '').replace(/\D/g, '')) || 0), 0);
      return 'SP-' + String(max + 1).padStart(4, '0');
    },
    order: id => db.orders.find(o => o.id === id),
    partsOf, notesOf,
    // yönetici doğrudan verir (onay gerekmez)
    createOrder(supplierId, lines, user, note = '') {
      const o = { id: uid(), no: this.nextOrderNo(), supplierId, lines, status: 'verildi', createdAt: now(), createdBy: user,
        approvedBy: user, approvedAt: now(), note, adminNote: '', log: [{ at: now(), user, action: 'olusturdu', note }] };
      db.orders.unshift(o); commit(); return o;
    },
    // personel yöneticiye onaya gönderir
    // personel yöneticiye onaya gönderir. Aynı tedarikçiye ait onay bekleyen sipariş varsa
    // yeni kalemler ona eklenir (tek liste); kimin ne eklediği kalem bazında tutulur.
    requestOrder(supplierId, lines, user, note = '') {
      const t = now();
      const open = this.openOrderFor(supplierId);
      if (open) {
        lines.forEach(l => addLine(open, l, user, t));
        if (note) (open.notes = notesOf(open)).push({ by: user, text: note, at: t });
        (open.log ||= []).push({ at: t, user, action: 'ekledi', note });
        this.lastMerged = true; commit(); return open;
      }
      const o = { id: uid(), no: this.nextOrderNo(), supplierId: supplierId || null, lines: [], status: 'onay', createdAt: t, createdBy: user,
        note: '', notes: note ? [{ by: user, text: note, at: t }] : [], adminNote: '', log: [{ at: t, user, action: 'onaya_gonderdi', note }] };
      lines.forEach(l => addLine(o, l, user, t));
      db.orders.unshift(o); this.lastMerged = false; commit(); return o;
    },
    openOrderFor(supplierId) {
      return db.orders.filter(o => o.status === 'onay' && (o.supplierId || null) === (supplierId || null))
        .sort((a, b) => a.createdAt - b.createdAt)[0] || null;
    },
    // eski kayıtlar: aynı tedarikçiye ait birden fazla onay bekleyen siparişi tek listede topla
    mergeOpenOrders() {
      const groups = {};
      db.orders.filter(o => o.status === 'onay').forEach(o => (groups[o.supplierId || '_'] ||= []).push(o));
      let changed = false;
      Object.values(groups).filter(g => g.length > 1).forEach(g => {
        g.sort((a, b) => a.createdAt - b.createdAt);
        const base = g[0];
        base.notes = notesOf(base);
        g.slice(1).forEach(o => {
          o.lines.forEach(l => partsOf(o, l).forEach(pt => addLine(base, { itemId: l.itemId, qty: pt.qty }, pt.by, pt.at || o.createdAt)));
          base.notes.push(...notesOf(o));
          (base.log ||= []).push(...(o.log || []).map(x => x.action === 'onaya_gonderdi' ? { ...x, action: 'ekledi' } : x));
          db.orders = db.orders.filter(x => x.id !== o.id);
        });
        base.log.sort((a, b) => a.at - b.at);
        changed = true;
      });
      if (changed) commit();
      return changed;
    },
    // personel kendi eklediği kalemleri geri çeker; başkalarınınki kalır
    withdrawFromOrder(orderId, user) {
      const o = this.order(orderId); if (!o) return;
      o.lines = o.lines.map(l => {
        const keep = partsOf(o, l).filter(pt => pt.by !== user);
        return { ...l, parts: keep, qty: keep.reduce((a, pt) => a + pt.qty, 0) };
      }).filter(l => l.qty > 0);
      o.notes = notesOf(o).filter(n => n.by !== user);
      if (!o.lines.length) db.orders = db.orders.filter(x => x.id !== orderId);
      else (o.log ||= []).push({ at: now(), user, action: 'geri_cekti' });
      commit();
    },
    updateOrder(id, patch, user) {
      const o = this.order(id); if (!o) return;
      const before = JSON.stringify(o.lines);
      Object.assign(o, patch);
      if (patch.lines && JSON.stringify(patch.lines) !== before) o.log.push({ at: now(), user, action: 'duzenledi' });
      commit(); return o;
    },
    approveOrder(id, user, adminNote) {
      const o = this.order(id); if (!o) return;
      if (adminNote !== undefined) o.adminNote = adminNote;
      Object.assign(o, { status: 'verildi', approvedBy: user, approvedAt: now() });
      o.log.push({ at: now(), user, action: 'onayladi', note: o.adminNote }); commit(); return o;
    },
    rejectOrder(id, user, adminNote) {
      const o = this.order(id); if (!o) return;
      Object.assign(o, { status: 'red', adminNote: adminNote || o.adminNote, rejectedBy: user, rejectedAt: now() });
      o.log.push({ at: now(), user, action: 'reddetti', note: o.adminNote }); commit(); return o;
    },
    receiveOrder(orderId, received, user) { // received: {itemId: qty}
      const o = db.orders.find(x => x.id === orderId); if (!o) return;
      o.lines.forEach(l => {
        const q = Number(received[l.itemId] ?? l.qty) || 0;
        l.received = q;
        const it = this.item(l.itemId);
        if (it && q > 0) this.setQty(it.id, it.qty + q, user, 'giris', 'Sipariş teslim');
      });
      o.status = 'teslim'; o.receivedAt = now(); o.receivedBy = user;
      (o.log ||= []).push({ at: now(), user, action: 'teslim_aldi' }); commit();
    },
    cancelOrder(orderId) {
      db.orders = db.orders.filter(o => o.id !== orderId); commit();
    },

    // kayıt düzenleme (ayarlar)
    upsert(coll, obj) {
      const list = db[coll];
      if (!obj.id) { obj.id = uid(); list.push(obj); }
      else { const i = list.findIndex(x => x.id === obj.id); i >= 0 ? (list[i] = { ...list[i], ...obj }) : list.push(obj); }
      commit(); return obj;
    },
    remove(coll, id) { db[coll] = db[coll].filter(x => x.id !== id); commit(); },
    setCafeName(n) { db.cafe.name = n; commit(); },
    setCafe(patch) { Object.assign(db.cafe, patch); commit(); },

    // demirbaş
    ASSET_CATS, ASSET_STATUS,
    asset: id => db.assets.find(a => a.id === id || a.code === id),
    nextAssetCode() {
      const max = db.assets.reduce((m, a) => Math.max(m, parseInt(a.code.replace(/\D/g, '')) || 0), 0);
      return 'DB-' + String(max + 1).padStart(4, '0');
    },
    saveAsset(obj, user) {
      if (!obj.id) {
        Object.assign(obj, { id: uid(), code: this.nextAssetCode(), createdAt: now(), updatedAt: now() });
        db.assets.push(obj);
        db.assetLog.unshift({ id: uid(), assetId: obj.id, from: null, to: obj.status, user, at: now(), note: 'Kayıt açıldı' });
      } else {
        const a = this.asset(obj.id);
        if (obj.status && obj.status !== a.status) db.assetLog.unshift({ id: uid(), assetId: a.id, from: a.status, to: obj.status, user, at: now(), note: obj.statusNote || '' });
        delete obj.statusNote;
        Object.assign(a, obj, { updatedAt: now() });
      }
      commit(); return obj;
    },
    setAssetStatus(id, status, user, note) {
      const a = this.asset(id); if (!a || a.status === status) return;
      db.assetLog.unshift({ id: uid(), assetId: a.id, from: a.status, to: status, user, at: now(), note: note || '' });
      a.status = status; a.updatedAt = now(); if (note) a.note = note; commit();
    },
    removeAsset(id) { db.assets = db.assets.filter(a => a.id !== id); commit(); },
    exportJSON: () => JSON.stringify(db, null, 2),
    reset() { db = seed(); commit(); },
  };
})();
