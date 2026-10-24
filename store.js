"use strict";
/* KafeStok — veri katmanı
 * Şimdilik cihazda (localStorage) tutuluyor. Aynı API ileride Firebase
 * Firestore'a bağlanacak; ekranlar sadece bu dosyadaki fonksiyonları çağırır.
 */
const Store = (() => {
    // İki ayrı veri alanı: gerçek kafe (buluta bağlanır) ve demo (sadece bu telefonda, örnek verili)
    const IS_DEMO = (() => { try {
        return localStorage.getItem('kafestok.mode') === 'demo';
    }
    catch (e) {
        return false;
    } })();
    const KEY = IS_DEMO ? 'kafestok.demo' : 'kafestok.v1';
    const DEFAULT_CAFE = { name: 'Bambaşka Kafe Restoran', logo: 'logo.png', mode: 'logo', logoBg: 'none' };
    const DEFAULT_DEPTS = [
        { id: 'nargile', name: 'Nargile', icon: '💨', color: '#b4532a' },
        { id: 'bar', name: 'Bar', icon: '☕', color: '#7a4b2a' },
        { id: 'mutfak', name: 'Mutfak', icon: '🍳', color: '#5b7a3a' },
        { id: 'genel', name: 'Genel', icon: '🧻', color: '#4a6a85' },
    ];
    // senkronlanan koleksiyonlar (trash: 30 günlük çöp kutusu, audit: silinemez işlem geçmişi)
    const COLLS = ['depts', 'suppliers', 'items', 'movements', 'orders', 'users', 'assets', 'assetLog', 'services', 'tickets', 'trash', 'audit'];
    const blank = (keep = {}) => { const o = {}; COLLS.forEach(c => { o[c] = keep[c] || []; }); return o; };
    // gerçek kafe: boş başlar, ilk açılışta yönetici oluşturulur
    function emptyDb() {
        return Object.assign({ version: 1, cafe: Object.assign({}, DEFAULT_CAFE) }, blank({ depts: DEFAULT_DEPTS.map(d => (Object.assign({}, d))) }));
    }
    const subs = new Set();
    let db = null;
    const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5);
    const now = () => Date.now();
    const SHOP = '__shop', SHOP_SUP = { id: '__shop', name: 'Alışveriş listesi', mode: 'pickup', virtual: true };
    // siparişte bu kalem için hâlâ beklenen miktar (kısmi teslim / iade sonrası)
    const lineLeft = l => l.closed ? 0 : Math.max(0, (Number(l.qty) || 0) - (Number(l.received) || 0));
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
            { id: 's5', name: 'Metro Market', contact: 'Gidip alınır', phone: '', mode: 'pickup' },
            { id: 's6', name: 'Sebze Hali', contact: 'Gidip alınır', phone: '', mode: 'pickup' },
        ];
        const I = (deptId, name, unit, qty, min, target, supplierId) => ({ id: uid(), deptId, name, unit, qty, min, target, supplierId, updatedAt: t - Math.random() * 2 * D, updatedBy: 'Mehmet' });
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
            I('bar', 'Limon', 'kg', 1, 2, 5, 's6'),
            I('bar', 'Taze nane', 'demet', 1, 2, 6, 's6'),
            I('mutfak', 'Tost ekmeği', 'paket', 3, 4, 12, 's4'),
            I('mutfak', 'Kaşar peyniri', 'kg', 1.5, 2, 6, 's5'),
            I('mutfak', 'Sucuk', 'kg', 1, 1.5, 4, 's5'),
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
            }, {
                id: uid(), no: 'SP-0003', supplierId: 's3', status: 'tedarik', createdAt: t - 2 * H, createdBy: 'Ayşe',
                approvedBy: 'Yönetici', approvedAt: t - 1.5 * H, note: '', adminNote: '', supplierNote: '',
                lines: [{ itemId: byName('Espresso').id, qty: 2 }],
                log: [{ at: t - 2 * H, user: 'Ayşe', action: 'onaya_gonderdi' }, { at: t - 1.5 * H, user: 'Yönetici', action: 'onayladi' }],
            }];
        const users = [
            { id: 'u1', name: 'Yönetici', role: 'yonetici', pin: '1234', deptIds: [] },
            { id: 'u2', name: 'Mehmet', role: 'personel', pin: '1111', deptIds: ['nargile'] },
            { id: 'u3', name: 'Ayşe', role: 'personel', pin: '2222', deptIds: ['bar', 'mutfak'] },
            { id: 'u4', name: 'Serkan', role: 'mudur', pin: '3333', deptIds: [] },
        ];
        return Object.assign(Object.assign({ version: 1, cafe: Object.assign(Object.assign({}, DEFAULT_CAFE), { name: 'Bambaşka (Demo)' }) }, blank({ depts, suppliers, items, movements, orders, users })), seedAssets());
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
        const t = now();
        let n = 0;
        const A = (cat, name, location, status = 'aktif', extra = {}) => (Object.assign({ id: uid(), code: 'DB-' + String(++n).padStart(4, '0'), cat, name, location, status, serial: '', note: '', createdAt: t - 90 * D, updatedAt: t - Math.random() * 20 * D }, extra));
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
        return Object.assign({ assets, assetLog }, seedService(assets));
    }
    // ---- servis (arıza / bakım) demo verisi
    function seedService(assets) {
        const t = now(), byCode = c => (assets.find(a => a.code === c) || {}).id;
        const services = [
            { id: 'sv1', name: 'Samsung Yetkili Servis', contact: 'Çağrı merkezi', phone: '908502223344', topic: 'TV / ekran' },
            { id: 'sv2', name: 'Uydu Teknik', contact: 'Murat Usta', phone: '905321234567', topic: 'Uydu, yayın, anten' },
            { id: 'sv3', name: 'Kahve Makinesi Servisi', contact: 'Selin Hanım', phone: '905449876543', topic: 'Espresso, değirmen' },
        ];
        const tv = assets.find(a => a.code === 'DB-0001');
        if (tv)
            tv.serviceId = 'sv1';
        const tv3 = assets.find(a => a.code === 'DB-0003');
        if (tv3)
            tv3.serviceId = 'sv1';
        const uy = assets.find(a => a.code === 'DB-0006');
        if (uy)
            uy.serviceId = 'sv2';
        const esp = assets.find(a => a.name === 'Espresso makinesi');
        if (esp)
            Object.assign(esp, { serviceId: 'sv3', maintEvery: 3, lastMaint: t - 100 * D });
        const tickets = [{
                id: uid(), no: 'SR-0001', assetId: byCode('DB-0003'), type: 'ariza', priority: 'acil', status: 'talep', desc: 'HDMI girişi görüntü vermiyor, cumartesi derbi var',
                serviceId: 'sv1', createdBy: 'Ayşe', createdAt: t - 2 * D, log: [{ at: t - 2 * D, user: 'Ayşe', action: 'talep' }],
            }, {
                id: uid(), no: 'SR-0002', assetId: byCode('DB-0006'), type: 'ariza', priority: 'normal', status: 'islemde', desc: 'Kanal bulmuyor',
                serviceId: 'sv2', createdBy: 'Mehmet', createdAt: t - 4 * D, approvedBy: 'Yönetici', approvedAt: t - 3.9 * D,
                contacts: [{ at: t - 3.5 * D, by: 'Serkan', via: 'tel' }], serviceRef: 'UYD-44821', visitAt: t + 1 * D, taken: true, progressAt: t - 3 * D, progressBy: 'Serkan',
                log: [{ at: t - 4 * D, user: 'Mehmet', action: 'talep' }, { at: t - 3.9 * D, user: 'Yönetici', action: 'onayladi' }, { at: t - 3 * D, user: 'Serkan', action: 'islemde' }],
            }];
        return { services, tickets };
    }
    function load() {
        try {
            db = JSON.parse(localStorage.getItem(KEY));
        }
        catch (e) {
            db = null;
        }
        if (!db || db.version !== 1) {
            db = IS_DEMO ? seed() : emptyDb();
            persist();
        }
        if (!db.assets) {
            Object.assign(db, IS_DEMO ? seedAssets() : { assets: [], assetLog: [], services: [], tickets: [] });
            persist();
        }
        if (!db.tickets) {
            Object.assign(db, IS_DEMO ? seedService(db.assets) : { services: [], tickets: [] });
            persist();
        }
        COLLS.forEach(c => { if (!Array.isArray(db[c]))
            db[c] = []; });
    }
    function persist() { try {
        localStorage.setItem(KEY, JSON.stringify(db));
    }
    catch (e) { } }
    const commitHooks = new Set();
    function commit() { persist(); commitHooks.forEach(f => f(db)); subs.forEach(f => f()); }
    const SORT = { movements: (a, b) => b.at - a.at, assetLog: (a, b) => b.at - a.at, orders: (a, b) => b.createdAt - a.createdAt, tickets: (a, b) => b.createdAt - a.createdAt, trash: (a, b) => b.at - a.at, audit: (a, b) => b.at - a.at };
    // ---- işlemi yapan kişi (giriş yapan kullanıcı) ve işlem geçmişi
    let actor = '';
    const AUD = {
        items: { name: 'Ad', unit: 'Birim', min: 'Min', target: 'Hedef', deptId: 'Bölüm', supplierId: 'Tedarikçi' },
        suppliers: { name: 'Ad', contact: 'Yetkili', phone: 'Telefon', mode: 'Teslim şekli' },
        depts: { name: 'Ad', icon: 'Simge' },
        users: { name: 'Ad', role: 'Rol', deptIds: 'Bölümler' },
        assets: { name: 'Ad', cat: 'Kategori', location: 'Yer', brand: 'Marka', serial: 'Seri no', serviceId: 'Servis', maintEvery: 'Bakım (ay)', note: 'Not' },
        services: { name: 'Ad', topic: 'Konu', contact: 'Yetkili', phone: 'Telefon' },
    };
    const nameOf = o => (o && (o.name || o.no || o.code)) || '';
    function audit(action, coll, ref, name, detail) {
        (db.audit || (db.audit = [])).unshift(Object.assign({ id: uid(), at: now(), by: actor || '—', action, coll, ref: ref || '', name: name || '' }, (detail || {})));
    }
    function changes(coll, a, b) {
        const F = AUD[coll];
        if (!F || !a)
            return null;
        const ch = [];
        Object.keys(F).forEach(k => { var _a, _b, _c, _d; if (k in b && JSON.stringify((_a = a[k]) !== null && _a !== void 0 ? _a : '') !== JSON.stringify((_b = b[k]) !== null && _b !== void 0 ? _b : ''))
            ch.push([k, (_c = a[k]) !== null && _c !== void 0 ? _c : '', (_d = b[k]) !== null && _d !== void 0 ? _d : '']); });
        const d = {};
        if (ch.length)
            d.ch = ch;
        if (coll === 'users') {
            if ('pin' in b && a.pin !== b.pin)
                d.pin = true; // PIN değeri asla yazılmaz
            if ('perms' in b && JSON.stringify(a.perms || {}) !== JSON.stringify(b.perms || {})) {
                const on = [], off = [], pa = a.perms || {}, pb = b.perms || {};
                new Set([...Object.keys(pa), ...Object.keys(pb)]).forEach(k => { if (!!pa[k] !== !!pb[k])
                    (pb[k] ? on : off).push(k); });
                if (on.length || off.length)
                    d.perm = { on, off };
            }
        }
        return Object.keys(d).length ? d : null;
    }
    // çöp kutusu: silinen kayıt 30 gün bekler
    const TRASHABLE = ['items', 'suppliers', 'depts', 'users', 'assets', 'services', 'orders', 'tickets'];
    function toTrash(coll, rec) {
        if (!rec || !TRASHABLE.includes(coll))
            return;
        (db.trash || (db.trash = [])).unshift({ id: uid(), coll, ref: rec.id, name: nameOf(rec), data: JSON.parse(JSON.stringify(rec)), at: now(), by: actor || '—' });
    }
    // numaralar (DB- / SP- / SR-): bulutta sayaçtan; sync.js kaynak bağlar
    let numSrc = null;
    const NUMS = { DB: () => db.assets.map(a => a.code), SP: () => db.orders.map(o => o.no), SR: () => (db.tickets || []).map(t => t.no) };
    const maxNo = kind => (NUMS[kind]() || []).reduce((m, c) => Math.max(m, parseInt(String(c || '').replace(/\D/g, '')) || 0), 0);
    function nextNo(kind, strict) {
        const local = maxNo(kind);
        const n = numSrc ? numSrc(kind, local) : undefined;
        if (n === undefined)
            return local + 1; // bulut yok (tek cihaz / demo)
        if (n === null)
            return strict ? null : local + 1; // bulut var ama ayrılmış numara kalmadı
        return n;
    }
    // ---- sipariş kalemi yardımcıları
    const partsOf = (o, l) => l.parts && l.parts.length ? l.parts : [{ by: o.createdBy, qty: l.qty, at: o.createdAt }];
    const notesOf = o => o.notes ? [...o.notes] : (o.note ? [{ by: o.createdBy, text: o.note, at: o.createdAt }] : []);
    // not, kalemi ekleyen kişinin o kalem için yazdığı iç nottur (tedarikçiye gitmez)
    function addLine(o, l, user, t) {
        const part = { by: user, qty: l.qty, at: t };
        if (l.note)
            part.note = l.note;
        const ex = o.lines.find(x => x.itemId === l.itemId);
        if (ex) {
            ex.parts = [...partsOf(o, ex), part];
            ex.qty = Math.round((ex.qty + l.qty) * 100) / 100;
        }
        else
            o.lines.push({ itemId: l.itemId, qty: l.qty, parts: [part] });
    }
    // eski sipariş geneli notları, aynı anda eklenen kaleme taşı
    function attachNotes(o) {
        const rest = [];
        notesOf(o).forEach(n => {
            const l = o.lines.find(l => partsOf(o, l).some(p => p.by === n.by && p.at === n.at && !p.note));
            if (l) {
                l.parts = partsOf(o, l).map(p => p.by === n.by && p.at === n.at && !p.note ? Object.assign(Object.assign({}, p), { note: n.text }) : p);
            }
            else
                rest.push(n);
        });
        const changed = rest.length !== notesOf(o).length || (o.note && !o.notes);
        if (changed) {
            o.notes = rest;
            o.note = '';
        }
        return changed;
    }
    // ---- yardımcılar
    const status = it => {
        if (it.uncounted)
            return 'yeni';
        if (it.qty <= 0)
            return 'bitti';
        if (it.qty <= it.min)
            return 'kritik';
        if (it.qty <= it.min * 1.5)
            return 'azaliyor';
        return 'iyi';
    };
    const needsOrder = it => !it.uncounted && it.qty <= it.min;
    const suggested = it => {
        const q = Math.max(it.target - it.qty, 0);
        return Math.ceil(q * 2) / 2; // yarım birime yuvarla
    };
    return {
        init: load,
        isDemo: IS_DEMO,
        setMode(m) { try {
            localStorage.setItem('kafestok.mode', m);
        }
        catch (e) { } location.reload(); },
        // örnek liste (demo verisi): gerçek kafeye işaretleyerek malzeme eklemek için
        template() { const t = seed(); return { depts: t.depts, items: t.items.map(({ id, deptId, name, unit, min, target }) => ({ id, deptId, name, unit, min, target })) }; },
        importItems(list, user) {
            const tdepts = seed().depts;
            list.forEach(x => {
                if (!db.depts.some(d => d.id === x.deptId)) {
                    const td = tdepts.find(d => d.id === x.deptId);
                    if (td)
                        db.depts.push(Object.assign({}, td));
                }
                if (db.items.some(i => i.deptId === x.deptId && i.name.toLocaleLowerCase('tr') === x.name.toLocaleLowerCase('tr')))
                    return;
                db.items.push({ id: uid(), deptId: x.deptId, name: x.name, unit: x.unit, qty: 0, uncounted: true, min: x.min, target: x.target, supplierId: '', updatedAt: now(), updatedBy: user });
            });
            audit('toplu', 'items', '', `Örnek listeden ${list.length} malzeme`);
            commit();
        },
        createFirstAdmin(name, pin, cafeName) {
            const u = { id: uid(), name, pin, role: 'yonetici', deptIds: [], perms: {}, pinSet: true };
            db.users.push(u);
            if (cafeName)
                db.cafe.name = cafeName;
            commit();
            return u;
        },
        // gerçek kafeyi sıfırla: kafe kimliği, bölümler ve bu yönetici kalır; diğer her şey silinir (buluttan da)
        resetCafe(keepUserId) {
            const me = db.users.find(u => u.id === keepUserId);
            Object.assign(db, blank({ depts: db.depts, audit: db.audit, users: me ? [me] : [] }));
            audit('sifirla', 'cafe', 'cafe', 'Kafe sıfırlandı');
            commit();
        },
        // ---- bulut senkronu için (sync.js kullanır)
        onCommit: f => (commitHooks.add(f), () => commitHooks.delete(f)),
        COLLS,
        applyRemote(coll, id, data) {
            if (coll === 'meta') {
                if (id === 'cafe' && data)
                    db.cafe = data;
                return;
            }
            const list = db[coll] || (db[coll] = []);
            const i = list.findIndex(x => x.id === id);
            if (data) {
                if (i >= 0)
                    list[i] = data;
                else
                    list.push(data);
            }
            else if (i >= 0)
                list.splice(i, 1);
        },
        finishRemote() { Object.entries(SORT).forEach(([c, f]) => { var _a; return (_a = db[c]) === null || _a === void 0 ? void 0 : _a.sort(f); }); persist(); subs.forEach(f => f()); },
        emptyForJoin() {
            var _a;
            db = Object.assign({ version: 1, cafe: { name: ((_a = db.cafe) === null || _a === void 0 ? void 0 : _a.name) || 'Kafe' } }, blank());
            persist();
            subs.forEach(f => f());
        },
        wipeDemo(adminPin) {
            const admin = db.users.find(u => u.role === 'yonetici') || { id: uid(), name: 'Yönetici', role: 'yonetici', deptIds: [] };
            admin.pin = adminPin || admin.pin;
            Object.assign(db, blank({ depts: db.depts, users: [admin] }));
            persist();
            subs.forEach(f => f());
        },
        subscribe: f => (subs.add(f), () => subs.delete(f)),
        get: () => db,
        status, needsOrder, suggested,
        dept: id => db.depts.find(d => d.id === id),
        // '__shop': elden alınacak (market, hal…) tedarikçilerin kalemleri tek alışveriş listesinde toplanır
        SHOP,
        supplier: id => id === SHOP ? SHOP_SUP : db.suppliers.find(s => s.id === id),
        isPickup: id => id === SHOP || db.suppliers.some(s => s.id === id && s.mode === 'pickup'),
        item: id => db.items.find(i => i.id === id),
        user: id => db.users.find(u => u.id === id),
        // stok hareketi: sayım (mutlak değer) / giriş / çıkış (fark)
        setQty(itemId, newQty, user, type = 'sayim', note) {
            const it = this.item(itemId);
            if (!it)
                return;
            const before = it.qty;
            const after = Math.max(0, Math.round(newQty * 100) / 100);
            const first = it.uncounted && type === 'sayim';
            if (before === after && !first)
                return false;
            if (first)
                delete it.uncounted; // ilk sayım (0 da olsa) kaydedilir
            it.qty = after;
            it.updatedAt = now();
            it.updatedBy = user;
            db.movements.unshift({ id: uid(), itemId, type, before, after, user, at: now(), note });
            db.movements = db.movements.slice(0, 500);
            return true;
        },
        saveCount(entries, user) {
            let n = 0;
            entries.forEach(e => { if (this.setQty(e.itemId, e.qty, user, 'sayim'))
                n++; });
            commit();
            return n;
        },
        adjust(itemId, delta, user) {
            const it = this.item(itemId);
            this.setQty(itemId, it.qty + delta, user, delta > 0 ? 'giris' : 'cikis');
            commit();
        },
        // sipariş
        pendingQtyFor(itemId, statuses = ['onay', 'tedarik', 'verildi', 'alisveris']) {
            return db.orders.filter(o => statuses.includes(o.status))
                .reduce((s, o) => { const l = o.lines.find(x => x.itemId === itemId); return s + (l ? (o.status === 'verildi' || o.status === 'alisveris' ? lineLeft(l) : l.qty) : 0); }, 0);
        },
        nextOrderNo() { return 'SP-' + String(nextNo('SP')).padStart(4, '0'); },
        order: id => db.orders.find(o => o.id === id),
        partsOf, notesOf,
        // yönetici doğrudan verir (onay gerekmez)
        // via: 'wa' (WhatsApp ile iletildi → tedarikçi cevabı beklenir) | 'mark' (tedarikçi zaten onayladı → yolda) | diğer: iletilecek
        createOrder(supplierId, lines, user, note = '', via = '') {
            if (this.isPickup(supplierId))
                supplierId = SHOP;
            const t = now(), confirmed = via === 'mark' || via === 'manual';
            const o = { id: uid(), no: this.nextOrderNo(), supplierId, lines, status: confirmed ? 'verildi' : 'tedarik', createdAt: t, createdBy: user,
                approvedBy: user, approvedAt: t, note: '', notes: [], adminNote: '', supplierNote: note, log: [{ at: t, user, action: 'olusturdu' }] };
            if (via === 'wa') {
                o.contacts = [{ at: t, by: user, via: 'wa' }];
                o.log.push({ at: t, user, action: 'iletti', via: 'wa' });
            }
            if (confirmed) {
                o.confirmedBy = user;
                o.confirmedAt = t;
                o.log.push({ at: t, user, action: 'tedarikci_onay' });
            }
            db.orders.unshift(o);
            commit();
            return o;
        },
        // ---- tedarikçi ile iletişim (onaydan sonra; asıl sorumlu müdür)
        logContact(id, user, via) {
            const o = this.order(id);
            if (!o || o.status !== 'tedarik')
                return;
            (o.contacts || (o.contacts = [])).push({ at: now(), by: user, via });
            o.log.push({ at: now(), user, action: 'iletti', via });
            commit();
            return o;
        },
        // r: { lines: {itemId: tedarikçinin verebildiği miktar}, eta, note }
        supplierConfirm(id, user, r = {}) {
            const o = this.order(id);
            if (!o)
                return;
            const av = r.lines || {};
            o.lines.forEach(l => {
                var _a;
                if (av[l.itemId] == null)
                    return;
                const q = Math.max(0, Number(av[l.itemId]) || 0);
                if (q < l.qty) {
                    l.asked = (_a = l.asked) !== null && _a !== void 0 ? _a : l.qty;
                    l.qty = q;
                }
            });
            const cut = o.lines.filter(l => l.qty <= 0);
            if (cut.length)
                o.cutLines = (o.cutLines || []).concat(cut);
            o.lines = o.lines.filter(l => l.qty > 0);
            if (!o.lines.length)
                return this.supplierFail(id, user, r.note || 'Tedarikçide ürün yok');
            Object.assign(o, { status: 'verildi', confirmedBy: user, confirmedAt: now(), eta: r.eta || null, supplierReply: r.note || '' });
            o.log.push({ at: now(), user, action: 'tedarikci_onay', eta: r.eta || null, note: r.note || '', partial: o.lines.some(l => l.asked != null) || !!cut.length });
            commit();
            return o;
        },
        // tedarikçi getirmiyor / market alışverişi: listeyi bir personele ata, o gidip alsın
        assignShopper(id, user, a = {}) {
            const o = this.order(id);
            if (!o || !a.to)
                return;
            const re = o.status === 'alisveris';
            Object.assign(o, { status: 'alisveris', shopper: a.to, shopNote: a.note || '', shopDue: a.due || null, assignedBy: user, assignedAt: now() });
            if (!o.approvedBy)
                Object.assign(o, { approvedBy: user, approvedAt: now() });
            o.log.push({ at: now(), user, action: re ? 'yeniden_atadi' : 'atadi', to: a.to, note: a.note || '' });
            commit();
            return o;
        },
        supplierFail(id, user, note = '') {
            const o = this.order(id);
            if (!o)
                return;
            Object.assign(o, { status: 'yok', confirmedBy: user, confirmedAt: now(), supplierReply: note });
            o.log.push({ at: now(), user, action: 'tedarikci_yok', note });
            commit();
            return o;
        },
        // personel yöneticiye onaya gönderir
        // personel yöneticiye onaya gönderir. Aynı tedarikçiye ait onay bekleyen sipariş varsa
        // yeni kalemler ona eklenir (tek liste); kimin ne eklediği kalem bazında tutulur.
        requestOrder(supplierId, lines, user, note = '') {
            const t = now();
            if (this.isPickup(supplierId))
                supplierId = SHOP;
            const open = this.openOrderFor(supplierId);
            if (note && lines.length === 1 && !lines[0].note)
                lines = [Object.assign(Object.assign({}, lines[0]), { note })];
            if (open) {
                lines.forEach(l => addLine(open, l, user, t));
                (open.log || (open.log = [])).push({ at: t, user, action: 'ekledi', note });
                this.lastMerged = true;
                commit();
                return open;
            }
            const o = { id: uid(), no: this.nextOrderNo(), supplierId: supplierId || null, lines: [], status: 'onay', createdAt: t, createdBy: user,
                note: '', notes: [], adminNote: '', supplierNote: '', log: [{ at: t, user, action: 'onaya_gonderdi', note }] };
            lines.forEach(l => addLine(o, l, user, t));
            db.orders.unshift(o);
            this.lastMerged = false;
            commit();
            return o;
        },
        openOrderFor(supplierId) {
            return db.orders.filter(o => o.status === 'onay' && (o.supplierId || null) === (supplierId || null))
                .sort((a, b) => a.createdAt - b.createdAt)[0] || null;
        },
        // eski kayıtlar: aynı tedarikçiye ait birden fazla onay bekleyen siparişi tek listede topla
        mergeOpenOrders() {
            const groups = {};
            let changed = false;
            db.orders.filter(o => o.status === 'onay' && o.supplierId !== SHOP && this.isPickup(o.supplierId)).forEach(o => { o.supplierId = SHOP; changed = true; });
            db.orders.filter(o => o.status === 'onay').forEach(o => { var _a; return (groups[_a = o.supplierId || '_'] || (groups[_a] = [])).push(o); });
            Object.values(groups).filter(g => g.length > 1).forEach(g => {
                g.sort((a, b) => a.createdAt - b.createdAt);
                const base = g[0];
                base.notes = notesOf(base);
                attachNotes(base);
                g.slice(1).forEach(o => {
                    attachNotes(o);
                    o.lines.forEach(l => partsOf(o, l).forEach(pt => addLine(base, { itemId: l.itemId, qty: pt.qty, note: pt.note }, pt.by, pt.at || o.createdAt)));
                    base.notes.push(...notesOf(o));
                    (base.log || (base.log = [])).push(...(o.log || []).map(x => x.action === 'onaya_gonderdi' ? Object.assign(Object.assign({}, x), { action: 'ekledi' }) : x));
                    db.orders = db.orders.filter(x => x.id !== o.id);
                });
                base.log.sort((a, b) => a.at - b.at);
                changed = true;
            });
            db.orders.filter(o => o.status === 'onay').forEach(o => { if (attachNotes(o))
                changed = true; });
            if (changed)
                commit();
            return changed;
        },
        // yönetici kısmi onay: seçilmeyen kalemler ayrı bir listede onay beklemeye devam eder
        splitOrder(id, itemIds, user) {
            const o = this.order(id);
            if (!o || !itemIds.length)
                return null;
            const rest = o.lines.filter(l => itemIds.includes(l.itemId));
            if (!rest.length || rest.length === o.lines.length)
                return null;
            o.lines = o.lines.filter(l => !itemIds.includes(l.itemId));
            const t = now();
            const n = { id: uid(), no: this.nextOrderNo(), supplierId: o.supplierId, lines: rest, status: 'onay', createdAt: o.createdAt, createdBy: o.createdBy,
                note: '', notes: [], adminNote: '', supplierNote: '', splitFrom: o.no,
                log: [{ at: o.createdAt, user: o.createdBy, action: 'onaya_gonderdi' }, { at: t, user, action: 'ayirdi', from: o.no }] };
            o.log.push({ at: t, user, action: 'ayirdi', to: n.no });
            db.orders.unshift(n);
            commit();
            return n;
        },
        // personel kendi eklediği kalemleri geri çeker; başkalarınınki kalır
        withdrawFromOrder(orderId, user) {
            const o = this.order(orderId);
            if (!o)
                return;
            o.lines = o.lines.map(l => {
                const keep = partsOf(o, l).filter(pt => pt.by !== user);
                return Object.assign(Object.assign({}, l), { parts: keep, qty: keep.reduce((a, pt) => a + pt.qty, 0) });
            }).filter(l => l.qty > 0);
            o.notes = notesOf(o).filter(n => n.by !== user);
            if (!o.lines.length)
                db.orders = db.orders.filter(x => x.id !== orderId);
            else
                (o.log || (o.log = [])).push({ at: now(), user, action: 'geri_cekti' });
            commit();
        },
        updateOrder(id, patch, user) {
            const o = this.order(id);
            if (!o)
                return;
            const before = JSON.stringify(o.lines);
            Object.assign(o, patch);
            if (patch.lines && JSON.stringify(patch.lines) !== before)
                o.log.push({ at: now(), user, action: 'duzenledi' });
            commit();
            return o;
        },
        approveOrder(id, user, adminNote) {
            const o = this.order(id);
            if (!o)
                return;
            if (adminNote !== undefined)
                o.adminNote = adminNote;
            Object.assign(o, { status: 'tedarik', approvedBy: user, approvedAt: now() });
            o.log.push({ at: now(), user, action: 'onayladi', note: o.adminNote });
            commit();
            return o;
        },
        rejectOrder(id, user, adminNote) {
            const o = this.order(id);
            if (!o)
                return;
            Object.assign(o, { status: 'red', adminNote: adminNote || o.adminNote, rejectedBy: user, rejectedAt: now() });
            o.log.push({ at: now(), user, action: 'reddetti', note: o.adminNote });
            commit();
            return o;
        },
        lineLeft,
        // Teslim alma. rec: {itemId: sayı | {qty, reason, note}}
        //  reason: 'eksik' (eksik geldi) | 'begenmedim' (iade) | 'hasarli' (iade)
        //  keepOpen: eksik kalan miktar sonra gelecek → sipariş "yolda" kalır, sadece kalan bekler
        receiveOrder(orderId, rec, user, keepOpen = false, extra = {}) {
            const o = db.orders.find(x => x.id === orderId);
            if (!o)
                return;
            if (extra.spent)
                o.spent = (Number(o.spent) || 0) + Number(extra.spent);
            let short = false;
            o.lines.forEach(l => {
                var _a;
                const left = lineLeft(l);
                if (left <= 0)
                    return;
                const r = rec[l.itemId], v = r != null && typeof r === 'object' ? r : { qty: r };
                const q = Math.max(0, Number((_a = v.qty) !== null && _a !== void 0 ? _a : left) || 0);
                l.received = (l.received || 0) + q;
                (l.recv || (l.recv = [])).push({ qty: q, at: now(), by: user });
                if (q < left) {
                    short = true;
                    const reason = v.reason || 'eksik';
                    (l.issues || (l.issues = [])).push({ qty: left - q, reason, note: v.note || '', by: user, at: now() });
                    if (reason !== 'eksik' || !keepOpen)
                        l.closed = true; // iade edilen / gelmeyecek miktar artık beklenmez
                }
                const it = this.item(l.itemId);
                if (it && q > 0)
                    this.setQty(it.id, it.qty + q, user, 'giris', `Sipariş teslim (${o.no || ''})`);
            });
            const waiting = o.lines.some(l => lineLeft(l) > 0);
            if (short)
                o.short = true;
            if (waiting) {
                o.partial = true;
                (o.log || (o.log = [])).push({ at: now(), user, action: 'kismi_teslim' });
            }
            else {
                if (o.status === 'alisveris')
                    o.bought = true;
                o.status = 'teslim';
                o.receivedAt = now();
                o.receivedBy = user;
                (o.log || (o.log = [])).push({ at: now(), user, action: 'teslim_aldi', short: !!o.short, spent: extra.spent || 0 });
            }
            commit();
            return o;
        },
        // kısmen gelen siparişte kalanı bekleme: kalanları "gelmedi" diye kapatır
        closeRest(orderId, user) {
            const o = db.orders.find(x => x.id === orderId);
            if (!o)
                return;
            o.lines.forEach(l => { const left = lineLeft(l); if (left > 0) {
                (l.issues || (l.issues = [])).push({ qty: left, reason: 'gelmedi', note: '', by: user, at: now() });
                l.closed = true;
            } });
            if (o.status === 'alisveris')
                o.bought = true;
            Object.assign(o, { status: 'teslim', short: true, receivedAt: now(), receivedBy: user });
            (o.log || (o.log = [])).push({ at: now(), user, action: 'teslim_aldi', short: true });
            commit();
            return o;
        },
        cancelOrder(orderId) {
            const o = this.order(orderId);
            if (!o)
                return;
            toTrash('orders', o);
            audit('sil', 'orders', o.id, `${o.no} · sipariş iptal`);
            db.orders = db.orders.filter(x => x.id !== orderId);
            commit();
        },
        // kayıt düzenleme (ayarlar)
        upsert(coll, obj, opts = {}) {
            const list = db[coll];
            if (!obj.id) {
                obj.id = uid();
                list.push(obj);
                if (AUD[coll] && !opts.quiet)
                    audit('ekle', coll, obj.id, nameOf(obj));
            }
            else {
                const i = list.findIndex(x => x.id === obj.id);
                if (i >= 0) {
                    const d = changes(coll, list[i], obj);
                    if (d && !opts.quiet)
                        audit('duzenle', coll, obj.id, nameOf(Object.assign(Object.assign({}, list[i]), obj)), d);
                    list[i] = Object.assign(Object.assign({}, list[i]), obj);
                }
                else {
                    list.push(obj);
                    if (AUD[coll] && !opts.quiet)
                        audit('ekle', coll, obj.id, nameOf(obj));
                }
            }
            commit();
            return obj;
        },
        remove(coll, id) {
            const rec = (db[coll] || []).find(x => x.id === id);
            if (rec) {
                toTrash(coll, rec);
                if (AUD[coll] || coll === 'tickets')
                    audit('sil', coll, id, nameOf(rec));
            }
            db[coll] = db[coll].filter(x => x.id !== id);
            commit();
        },
        // çöp kutusu
        restoreTrash(tid) {
            const t = (db.trash || []).find(x => x.id === tid);
            if (!t)
                return null;
            const list = db[t.coll] || (db[t.coll] = []);
            if (!list.some(x => x.id === t.ref))
                list.push(t.data);
            db.trash = db.trash.filter(x => x.id !== tid);
            audit('geri', t.coll, t.ref, t.name);
            commit();
            return t;
        },
        trashFor: (coll, ref) => (db.trash || []).find(t => t.coll === coll && t.ref === ref),
        pruneTrash(days = 30) {
            const lim = now() - days * D, old = (db.trash || []).filter(t => t.at < lim);
            if (old.length) {
                db.trash = db.trash.filter(t => t.at >= lim);
                commit();
            }
            return old.length;
        },
        setActor(n) { actor = n || ''; },
        audit(action, coll, ref, name, detail) { audit(action, coll, ref, name, detail); commit(); },
        // numaralar
        setNumberSource(f) { numSrc = f; },
        maxNo,
        setCafeName(n) { db.cafe.name = n; commit(); },
        setCafe(patch) {
            const ch = [];
            if (patch.name !== undefined && patch.name !== db.cafe.name)
                ch.push(['name', db.cafe.name, patch.name]);
            if (patch.logo !== undefined && patch.logo !== db.cafe.logo)
                ch.push(['logo', '', '']);
            if (patch.mode !== undefined && patch.mode !== db.cafe.mode)
                ch.push(['mode', db.cafe.mode || '', patch.mode]);
            if (ch.length)
                audit('ayar', 'cafe', 'cafe', 'Kafe ayarları', { ch });
            Object.assign(db.cafe, patch);
            commit();
        },
        // demirbaş
        ASSET_CATS, ASSET_STATUS,
        asset: id => db.assets.find(a => a.id === id || a.code === id),
        // demirbaş kodu etikete basılır: bulutta numara alınamazsa (internetsiz) kayıt açılmaz
        nextAssetCode() { const n = nextNo('DB', true); return n == null ? null : 'DB-' + String(n).padStart(4, '0'); },
        saveAsset(obj, user, opts = {}) {
            if (!obj.id) {
                const code = this.nextAssetCode();
                if (!code) {
                    const e = new Error('numara-yok');
                    e.code = 'numara-yok';
                    throw e;
                }
                Object.assign(obj, { id: uid(), code, createdAt: now(), updatedAt: now() });
                db.assets.push(obj);
                db.assetLog.unshift({ id: uid(), assetId: obj.id, from: null, to: obj.status, user, at: now(), note: 'Kayıt açıldı' });
                if (!opts.quiet)
                    audit('ekle', 'assets', obj.id, `${obj.code} · ${obj.name}`);
            }
            else {
                const a = this.asset(obj.id);
                if (obj.status && obj.status !== a.status)
                    db.assetLog.unshift({ id: uid(), assetId: a.id, from: a.status, to: obj.status, user, at: now(), note: obj.statusNote || '' });
                delete obj.statusNote;
                const d = changes('assets', a, obj);
                if (d)
                    audit('duzenle', 'assets', a.id, `${a.code} · ${obj.name || a.name}`, d);
                Object.assign(a, obj, { updatedAt: now() });
            }
            if (!opts.noCommit)
                commit();
            return obj;
        },
        setAssetStatus(id, status, user, note) {
            const a = this.asset(id);
            if (!a || a.status === status)
                return;
            db.assetLog.unshift({ id: uid(), assetId: a.id, from: a.status, to: status, user, at: now(), note: note || '' });
            a.status = status;
            a.updatedAt = now();
            if (note)
                a.note = note;
            commit();
        },
        removeAsset(id) { const a = this.asset(id); if (!a)
            return; toTrash('assets', a); audit('sil', 'assets', a.id, `${a.code} · ${a.name}`); db.assets = db.assets.filter(x => x.id !== a.id); commit(); },
        // ---- servis talepleri (arıza / bakım): talep → onay → servis (iletişim) → işlemde → bitti | red
        service: id => (db.services || []).find(s => s.id === id),
        ticket: id => (db.tickets || []).find(t => t.id === id),
        openTicketFor: assetId => (db.tickets || []).find(t => t.assetId === assetId && !['bitti', 'red'].includes(t.status)),
        // bakım zamanı: maintEvery (ay) + lastMaint; null = bakım takibi yok
        maintDue(a) {
            if (!a.maintEvery)
                return null;
            const base = a.lastMaint || a.createdAt || now();
            const d = new Date(base);
            d.setMonth(d.getMonth() + Number(a.maintEvery));
            return d.getTime();
        },
        nextTicketNo() { return 'SR-' + String(nextNo('SR')).padStart(4, '0'); },
        createTicket(f, user, autoApprove = false) {
            const t = now(), a = this.asset(f.assetId);
            if (!a)
                return;
            const tk = { id: uid(), no: this.nextTicketNo(), assetId: a.id, type: f.type || 'ariza', priority: f.priority || 'normal', status: autoApprove ? 'servis' : 'talep',
                desc: f.desc || '', serviceId: f.serviceId || a.serviceId || null, createdBy: user, createdAt: t, log: [{ at: t, user, action: 'talep' }] };
            if (autoApprove) {
                Object.assign(tk, { approvedBy: user, approvedAt: t });
                tk.log.push({ at: t, user, action: 'onayladi' });
            }
            (db.tickets || (db.tickets = [])).unshift(tk);
            if (tk.type === 'ariza' && a.status === 'aktif') {
                db.assetLog.unshift({ id: uid(), assetId: a.id, from: a.status, to: 'arizali', user, at: t, note: `${tk.no} · ${tk.desc || 'Arıza bildirildi'}` });
                a.status = 'arizali';
                a.note = tk.desc || a.note;
                a.updatedAt = t;
            }
            commit();
            return tk;
        },
        approveTicket(id, user, note, patch = {}) {
            const tk = this.ticket(id);
            if (!tk)
                return;
            Object.assign(tk, patch, { status: 'servis', approvedBy: user, approvedAt: now(), adminNote: note || tk.adminNote || '' });
            tk.log.push({ at: now(), user, action: 'onayladi', note: note || '' });
            commit();
            return tk;
        },
        rejectTicket(id, user, note) {
            const tk = this.ticket(id);
            if (!tk)
                return;
            Object.assign(tk, { status: 'red', rejectedBy: user, rejectedAt: now(), adminNote: note || '' });
            tk.log.push({ at: now(), user, action: 'reddetti', note: note || '' });
            commit();
            return tk;
        },
        ticketContact(id, user, via) {
            const tk = this.ticket(id);
            if (!tk)
                return;
            (tk.contacts || (tk.contacts = [])).push({ at: now(), by: user, via });
            tk.log.push({ at: now(), user, action: 'iletti', via });
            commit();
            return tk;
        },
        // servis kaydı açıldı: kayıt no, randevu, cihaz servise götürüldü mü
        ticketProgress(id, user, p = {}) {
            var _a, _b, _c, _d, _e, _f;
            const tk = this.ticket(id);
            if (!tk)
                return;
            const first = tk.status !== 'islemde';
            Object.assign(tk, { status: 'islemde', serviceRef: (_b = (_a = p.serviceRef) !== null && _a !== void 0 ? _a : tk.serviceRef) !== null && _b !== void 0 ? _b : '', visitAt: (_d = (_c = p.visitAt) !== null && _c !== void 0 ? _c : tk.visitAt) !== null && _d !== void 0 ? _d : null, taken: !!p.taken,
                serviceId: p.serviceId || tk.serviceId, progressNote: (_f = (_e = p.note) !== null && _e !== void 0 ? _e : tk.progressNote) !== null && _f !== void 0 ? _f : '', progressAt: now(), progressBy: user });
            tk.log.push({ at: now(), user, action: first ? 'islemde' : 'guncelledi', note: p.note || '' });
            const a = this.asset(tk.assetId);
            if (a && p.taken && a.status !== 'tamirde')
                this.setAssetStatus(a.id, 'tamirde', user, `${tk.no} · servise götürüldü${tk.serviceRef ? ' (' + tk.serviceRef + ')' : ''}`);
            else
                commit();
            return tk;
        },
        // taşıma: cihazı servise kim götürecek / servisten kim getirecek
        assignCarrier(id, user, c = {}) {
            const tk = this.ticket(id);
            if (!tk || !c.to)
                return;
            const re = tk.carry && !tk.carry.doneAt && tk.carry.dir === c.dir;
            tk.carry = { dir: c.dir || 'gotur', to: c.to, note: c.note || '', due: c.due || null, by: user, at: now() };
            if (tk.status === 'servis') {
                tk.status = 'islemde';
                tk.progressAt = now();
                tk.progressBy = user;
            }
            tk.log.push({ at: now(), user, action: re ? 'tasima_yeniden' : 'tasima_atandi', to: c.to, dir: tk.carry.dir, note: c.note || '' });
            commit();
            return tk;
        },
        carryDone(id, user) {
            const tk = this.ticket(id);
            if (!tk || !tk.carry || tk.carry.doneAt)
                return;
            Object.assign(tk.carry, { doneAt: now(), doneBy: user });
            const a = this.asset(tk.assetId);
            if (tk.carry.dir === 'gotur') {
                tk.taken = true;
                tk.returned = false;
                tk.log.push({ at: now(), user, action: 'teslim_etti' });
                if (a && a.status !== 'tamirde') {
                    this.setAssetStatus(a.id, 'tamirde', user, `${tk.no} · servise teslim edildi`);
                    return tk;
                }
            }
            else {
                tk.taken = false;
                tk.returned = true;
                tk.log.push({ at: now(), user, action: 'geri_getirdi' });
            }
            commit();
            return tk;
        },
        // sonuç: cozuldu (aktif) | onarilamadi (hurda/arızalı) | gerek_yok
        closeTicket(id, user, r = {}) {
            const tk = this.ticket(id);
            if (!tk)
                return;
            Object.assign(tk, { status: 'bitti', resolution: r.resolution || 'cozuldu', cost: Number(r.cost) || 0, resultNote: r.note || '', doneBy: user, doneAt: now() });
            tk.log.push({ at: now(), user, action: 'bitti', resolution: tk.resolution, cost: tk.cost });
            const a = this.asset(tk.assetId);
            if (a) {
                if (tk.type === 'bakim' && tk.resolution !== 'onarilamadi')
                    a.lastMaint = now();
                const to = tk.resolution === 'onarilamadi' ? (r.scrap ? 'hurda' : 'arizali') : 'aktif';
                if (a.status !== to) {
                    this.setAssetStatus(a.id, to, user, `${tk.no} · ${tk.resolution === 'onarilamadi' ? 'onarılamadı' : tk.type === 'bakim' ? 'bakım yapıldı' : 'arıza giderildi'}${r.note ? ' · ' + r.note : ''}`);
                    return tk;
                }
                a.updatedAt = now();
            }
            commit();
            return tk;
        },
        exportJSON: () => JSON.stringify(db, null, 2),
        reset() { db = IS_DEMO ? seed() : emptyDb(); commit(); },
        // bu telefon kafeden çıkarıldı / kafe taşındı: gerçek kafe verisini telefondan sil (buluta dokunmaz)
        wipeReal() { if (IS_DEMO) {
            try {
                localStorage.removeItem('kafestok.v1');
            }
            catch (e) { }
            return;
        } db = emptyDb(); persist(); subs.forEach(f => f()); },
        // yedekten geri yükle: işlem geçmişi korunur, diğer her şey yedekteki hâline döner
        replaceAll(data) {
            const keep = db.audit || [];
            const next = Object.assign({ version: 1, cafe: data.cafe || db.cafe }, blank());
            COLLS.forEach(c => { if (c !== 'audit' && Array.isArray(data[c]))
                next[c] = data[c]; });
            next.audit = keep;
            db = next;
            audit('geriyukle', 'cafe', 'cafe', 'Yedekten geri yükleme');
            commit();
        },
    };
})();
