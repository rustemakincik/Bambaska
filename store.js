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
    // gerçek kafe: boş başlar, ilk açılışta yönetici oluşturulur
    function emptyDb() {
        return { version: 1, cafe: Object.assign({}, DEFAULT_CAFE), depts: DEFAULT_DEPTS.map(d => (Object.assign({}, d))), suppliers: [], items: [], movements: [], orders: [], users: [], assets: [], assetLog: [] };
    }
    const subs = new Set();
    let db = null;
    const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5);
    const now = () => Date.now();
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
            { id: 's3', name: 'Toptan Market', contact: 'Sipariş hattı', phone: '905057778899', mode: 'pickup' },
            { id: 's4', name: 'Süt & Fırın', contact: 'Kemal', phone: '905441234567' },
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
        return Object.assign({ version: 1, cafe: Object.assign(Object.assign({}, DEFAULT_CAFE), { name: 'Bambaşka (Demo)' }), depts, suppliers, items, movements, orders, users }, seedAssets());
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
        return { assets, assetLog };
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
            Object.assign(db, IS_DEMO ? seedAssets() : { assets: [], assetLog: [] });
            persist();
        }
    }
    function persist() { try {
        localStorage.setItem(KEY, JSON.stringify(db));
    }
    catch (e) { } }
    const commitHooks = new Set();
    function commit() { persist(); commitHooks.forEach(f => f(db)); subs.forEach(f => f()); }
    const SORT = { movements: (a, b) => b.at - a.at, assetLog: (a, b) => b.at - a.at, orders: (a, b) => b.createdAt - a.createdAt };
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
            commit();
        },
        createFirstAdmin(name, pin, cafeName) {
            const u = { id: uid(), name, pin, role: 'yonetici', deptIds: [], perms: {} };
            db.users.push(u);
            if (cafeName)
                db.cafe.name = cafeName;
            commit();
            return u;
        },
        // gerçek kafeyi sıfırla: kafe kimliği, bölümler ve bu yönetici kalır; diğer her şey silinir (buluttan da)
        resetCafe(keepUserId) {
            const me = db.users.find(u => u.id === keepUserId);
            Object.assign(db, { suppliers: [], items: [], movements: [], orders: [], assets: [], assetLog: [], users: me ? [me] : [] });
            commit();
        },
        // ---- bulut senkronu için (sync.js kullanır)
        onCommit: f => (commitHooks.add(f), () => commitHooks.delete(f)),
        COLLS: ['depts', 'suppliers', 'items', 'movements', 'orders', 'users', 'assets', 'assetLog'],
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
            db = { version: 1, cafe: { name: ((_a = db.cafe) === null || _a === void 0 ? void 0 : _a.name) || 'Kafe' }, depts: [], suppliers: [], items: [], movements: [], orders: [], users: [], assets: [], assetLog: [] };
            persist();
            subs.forEach(f => f());
        },
        wipeDemo(adminPin) {
            const admin = db.users.find(u => u.role === 'yonetici') || { id: uid(), name: 'Yönetici', role: 'yonetici', deptIds: [] };
            admin.pin = adminPin || admin.pin;
            Object.assign(db, { suppliers: [], items: [], movements: [], orders: [], assets: [], assetLog: [], users: [admin] });
            persist();
            subs.forEach(f => f());
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
        nextOrderNo() {
            const max = db.orders.reduce((m, o) => Math.max(m, parseInt(String(o.no || '').replace(/\D/g, '')) || 0), 0);
            return 'SP-' + String(max + 1).padStart(4, '0');
        },
        order: id => db.orders.find(o => o.id === id),
        partsOf, notesOf,
        // yönetici doğrudan verir (onay gerekmez)
        // via: 'wa' (WhatsApp ile iletildi → tedarikçi cevabı beklenir) | 'mark' (tedarikçi zaten onayladı → yolda) | diğer: iletilecek
        createOrder(supplierId, lines, user, note = '', via = '') {
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
            db.orders.filter(o => o.status === 'onay').forEach(o => { var _a; return (groups[_a = o.supplierId || '_'] || (groups[_a] = [])).push(o); });
            let changed = false;
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
            db.orders = db.orders.filter(o => o.id !== orderId);
            commit();
        },
        // kayıt düzenleme (ayarlar)
        upsert(coll, obj) {
            const list = db[coll];
            if (!obj.id) {
                obj.id = uid();
                list.push(obj);
            }
            else {
                const i = list.findIndex(x => x.id === obj.id);
                i >= 0 ? (list[i] = Object.assign(Object.assign({}, list[i]), obj)) : list.push(obj);
            }
            commit();
            return obj;
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
            }
            else {
                const a = this.asset(obj.id);
                if (obj.status && obj.status !== a.status)
                    db.assetLog.unshift({ id: uid(), assetId: a.id, from: a.status, to: obj.status, user, at: now(), note: obj.statusNote || '' });
                delete obj.statusNote;
                Object.assign(a, obj, { updatedAt: now() });
            }
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
        removeAsset(id) { db.assets = db.assets.filter(a => a.id !== id); commit(); },
        exportJSON: () => JSON.stringify(db, null, 2),
        reset() { db = IS_DEMO ? seed() : emptyDb(); commit(); },
    };
})();
