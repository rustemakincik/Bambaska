"use strict";
/* KafeStok — bulut senkronu
 * Her kayıt (malzeme, sipariş, demirbaş…) bulutta ayrı bir belge olarak tutulur.
 * Yerelde bir değişiklik olunca sadece değişen kayıtlar gönderilir; başka cihazdan
 * gelen değişiklikler anında yerel veriye işlenir. İnternet yoksa değişiklikler
 * telefonda bekler, bağlantı gelince gönderilir.
 *
 * Arka uç (backend) değiştirilebilir: firebase-backend.js (gerçek) / mock-backend.js (test).
 */
const Sync = (() => {
    const LS_CLOUD = 'kafestok.cloud', LS_SHADOW = 'kafestok.shadow';
    const ls = {
        get(k) { try {
            return JSON.parse(localStorage.getItem(k));
        }
        catch (e) {
            return null;
        } },
        set(k, v) { try {
            v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v));
        }
        catch (e) { } },
    };
    let cloud = ls.get(LS_CLOUD); // { type, config, cafeId, joinCode }
    let shadow = ls.get(LS_SHADOW) || {}; // bulutla en son eşleşen hâl: coll -> id -> json
    let backend = null, unsub = null, applying = false;
    let state = { status: cloud ? 'connecting' : 'local', msg: '', pending: 0, last: 0 };
    const listeners = new Set();
    const reconciled = new Set();
    const COLLS = () => Store.COLLS;
    const ALL = () => [...COLLS(), 'meta'];
    function setState(p) { Object.assign(state, p); listeners.forEach(f => f(state)); }
    function computeStatus() {
        if (Store.isDemo)
            return setState({ status: 'demo' });
        if (!cloud)
            return setState({ status: 'local' });
        if (state.status === 'error' || state.status === 'connecting')
            return;
        if (!navigator.onLine)
            return setState({ status: 'offline' });
        setState({ status: state.pending > 0 ? 'syncing' : 'online' });
    }
    function snapshotOf(db) {
        const out = {};
        COLLS().forEach(c => { out[c] = {}; (db[c] || []).forEach(r => { out[c][r.id] = JSON.stringify(r); }); });
        out.meta = { cafe: JSON.stringify(db.cafe || {}) };
        return out;
    }
    function diff(db) {
        const cur = snapshotOf(db), ops = [];
        ALL().forEach(c => {
            const a = shadow[c] || {}, b = cur[c] || {};
            for (const id in b)
                if (a[id] !== b[id])
                    ops.push({ coll: c, id, data: JSON.parse(b[id]) });
            for (const id in a)
                if (!(id in b))
                    ops.push({ coll: c, id, data: null });
        });
        return { ops, cur };
    }
    function push() {
        if (!backend || applying || Store.isDemo)
            return;
        const { ops, cur } = diff(Store.get());
        if (!ops.length)
            return;
        const prev = ops.map(o => { var _a; return [o.coll, o.id, (_a = shadow[o.coll]) === null || _a === void 0 ? void 0 : _a[o.id]]; });
        shadow = cur;
        ls.set(LS_SHADOW, shadow);
        setState({ pending: state.pending + 1 });
        computeStatus();
        backend.write(ops)
            .then(() => { setState({ pending: Math.max(0, state.pending - 1), last: Date.now() }); computeStatus(); })
            .catch(e => {
            // reddedildi: gönderilmemiş say, bir sonraki değişiklikte/yeniden denemede tekrar gönderilir
            prev.forEach(([c, id, v]) => { shadow[c] || (shadow[c] = {}); if (v === undefined)
                delete shadow[c][id];
            else
                shadow[c][id] = v; });
            ls.set(LS_SHADOW, shadow);
            setState({ pending: Math.max(0, state.pending - 1), status: 'error', msg: errText(e) });
        });
    }
    function onChanges(coll, changes, info = {}) {
        if (!changes.length && !(info.ids && !info.fromCache && !reconciled.has(coll)))
            return;
        applying = true;
        try {
            shadow[coll] || (shadow[coll] = {});
            changes.forEach(ch => {
                Store.applyRemote(coll, ch.id, ch.data);
                if (ch.data)
                    shadow[coll][ch.id] = JSON.stringify(ch.data);
                else
                    delete shadow[coll][ch.id];
            });
            // ilk tam (önbellek dışı) görüntüde, bulutta olmayan yerel kayıtları sil
            if (info.ids && !info.fromCache && !reconciled.has(coll)) {
                reconciled.add(coll);
                if (coll !== 'meta') {
                    const keep = new Set(info.ids);
                    (Store.get()[coll] || []).filter(r => !keep.has(r.id)).map(r => r.id).forEach(id => {
                        Store.applyRemote(coll, id, null);
                        delete shadow[coll][id];
                    });
                }
            }
            ls.set(LS_SHADOW, shadow);
            Store.finishRemote();
        }
        finally {
            applying = false;
        }
        setState({ last: Date.now() });
    }
    const errText = e => {
        const m = String((e === null || e === void 0 ? void 0 : e.code) || (e === null || e === void 0 ? void 0 : e.message) || e);
        if (/eski-tarayici/.test(m))
            return 'Bu cihazın tarayıcısı çok eski (iOS 11.3 ve üstü gerekir); bulut bağlantısı kurulamıyor';
        if (/permission/i.test(m))
            return 'Yetki yok: bu cihaz kafeye bağlı değil ya da Firestore kuralları eksik';
        if (/network|unavailable|failed to fetch/i.test(m))
            return 'İnternet bağlantısı yok';
        if (/api-key|invalid/i.test(m))
            return 'Firebase ayarları hatalı';
        if (/admin-restricted|operation-not-allowed/i.test(m))
            return 'Firebase’de Anonymous giriş açık değil';
        return m.slice(0, 140);
    };
    function onBackendStatus(st, err) {
        if (st === 'online') {
            if (state.status !== 'online' && state.status !== 'syncing')
                setState({ status: 'online', msg: '' });
            computeStatus();
        }
        else {
            setState({ status: st, msg: err ? errText(err) : '' });
            if (err && /permission/i.test(String(err.code || err.message || err)))
                checkMembership();
        }
    }
    // ---- bu cihazın üyeliği: yetki seviyesi (owner = yönetici cihazı, admin = yetkili, member) ve çıkarılma kontrolü
    const LS_LEVEL = 'kafestok.level', LS_REMOVED = 'kafestok.removedNotice';
    let level = ls.get(LS_LEVEL) || null, checking = false;
    function setLevel(l) { level = l; ls.set(LS_LEVEL, l); setState({ level: l }); }
    function wipeLocal(reason) {
        try {
            unsub === null || unsub === void 0 ? void 0 : unsub();
        }
        catch (e) { }
        unsub = null;
        backend = null;
        ls.set(poolKey(), null);
        pool = {};
        cloud = null;
        shadow = {};
        ls.set(LS_CLOUD, null);
        ls.set(LS_SHADOW, null);
        ls.set(LS_LEVEL, null);
        level = null;
        if (reason)
            ls.set(LS_REMOVED, reason);
        applying = true;
        Store.wipeReal();
        applying = false;
        setState({ status: 'local', msg: '', pending: 0, level: null });
    }
    async function checkMembership() {
        if (!backend || checking)
            return;
        checking = true;
        try {
            const me = await backend.me();
            if (me) {
                if (me.level !== level)
                    setLevel(me.level);
            }
            else if (await backend.wasRemoved())
                wipeLocal('removed');
        }
        catch (e) {
            try {
                if (await backend.wasRemoved())
                    wipeLocal('removed');
            }
            catch (x) { }
        }
        finally {
            checking = false;
        }
    }
    // cihaz adı (Chrome'da model bilgisi ayrıca istenir)
    let devName = '';
    async function deviceName() {
        if (devName)
            return devName;
        const u = navigator.userAgent;
        let n = '';
        try {
            if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
                const h = await navigator.userAgentData.getHighEntropyValues(['model', 'platform']);
                n = (h.model || '').trim();
            }
        }
        catch (e) { }
        if (!n) {
            const m = u.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/);
            if (m && m[1].trim().length > 1)
                n = m[1].trim();
        }
        const kind = /iPad/.test(u) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : 'Cihaz';
        devName = (n && n !== kind ? kind + ' · ' + n : kind) + (window.BambaskaApp ? ' (uygulama)' : '');
        return devName;
    }
    let touched = '';
    async function touch(userName) {
        if (!backend || !backend.touch || Store.isDemo)
            return;
        const key = (userName || '') + '|' + new Date().toDateString();
        if (touched === key)
            return;
        touched = key;
        try {
            await backend.touch({ user: userName || '', device: await deviceName() });
        }
        catch (e) {
            touched = '';
        }
    }
    async function loadBackend(c) {
        // eski tarayıcılar (iOS 10–11.2): Firebase kütüphanesi çalışmaz → REST bağlantısı (rest-backend.js)
        if (c.type !== 'mock' && (!window.__canImport || window.__forceRest)) {
            if (!window.fetch)
                throw new Error('eski-tarayici');
            if (!window.KafeRest)
                await new Promise((ok, fail) => {
                    const sc = document.createElement('script');
                    sc.src = new URL('rest-backend.js', document.baseURI).href;
                    sc.onload = ok;
                    sc.onerror = () => fail(new Error('network: rest-backend yüklenemedi'));
                    document.head.appendChild(sc);
                });
            return window.KafeRest.create(c);
        }
        // eski tarayıcılarda "import(...)" yazımı sayfayı tamamen bozar; bu yüzden metin olarak kurulur
        if (!window.__canImport)
            throw new Error('eski-tarayici');
        const load = new Function('u', 'return import(u)');
        const mod = await load(new URL(c.type === 'mock' ? 'mock-backend.js' : 'firebase-backend.js', document.baseURI).href);
        return mod.create(c);
    }
    async function start() {
        if (Store.isDemo) {
            setState({ status: 'demo' });
            return;
        } // demo asla buluta bağlanmaz
        // güvenlik güncellemesi: kafe yeni Firebase projesine taşındı → eski bağlantıyı bırak, davetle yeniden bağlanılır
        const emb = window.KAFE_FIREBASE;
        if (cloud && cloud.type === 'firebase' && emb && (cloud.config.projectId !== emb.projectId || !cloud.v2)) {
            wipeLocal('moved');
            computeStatus();
            return;
        }
        if (!cloud) {
            computeStatus();
            return;
        }
        setState({ status: 'connecting', msg: '', level });
        try {
            backend = await loadBackend(cloud);
            setTimeout(checkMembership, 1200);
            reconciled.clear();
            unsub = backend.subscribe(ALL(), onChanges, onBackendStatus);
            setState({ status: 'online' });
            computeStatus();
            push(); // bağlantı yokken birikmiş değişiklikler
            setTimeout(() => Object.keys(BLOCK).forEach(refill), 1500);
        }
        catch (e) {
            backend = null;
            setState({ status: 'error', msg: errText(e) });
        }
    }
    const rand = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join(''); };
    const b64e = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const b64d = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
    // Firebase'in verdiği "const firebaseConfig = {...}" metninden ayarları çıkarır
    function parseConfig(text) {
        const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
        const cfg = {};
        keys.forEach(k => { const m = String(text).match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`)); if (m)
            cfg[k] = m[1]; });
        if (!cfg.apiKey || !cfg.projectId || !cfg.appId)
            throw new Error('apiKey, projectId ve appId bulunamadı. firebaseConfig bloğunun tamamını yapıştır.');
        return cfg;
    }
    // ---- numara havuzu: her cihaz buluttaki sayaçtan küçük numara blokları ayırır (DB-/SP-/SR- çakışmaz)
    const BLOCK = { DB: 3, SP: 3, SR: 2 };
    const poolKey = () => 'kafestok.pool.' + (cloud ? cloud.cafeId : '');
    let pool = {};
    const loadPool = () => { pool = (cloud && ls.get(poolKey())) || {}; };
    const savePool = () => { if (cloud)
        ls.set(poolKey(), pool); };
    const refilling = {};
    async function reserve(kind, count) {
        if (!backend || !backend.reserve)
            throw new Error('network: bağlantı yok');
        const start = await backend.reserve(kind, count, Store.maxNo(kind));
        const p = pool[kind] || (pool[kind] = []);
        for (let i = 0; i < count; i++)
            p.push(start + i);
        p.sort((a, b) => a - b);
        savePool();
    }
    function refill(kind) {
        if (!backend || Store.isDemo || refilling[kind] || (pool[kind] || []).length >= 1)
            return;
        refilling[kind] = true;
        reserve(kind, BLOCK[kind]).catch(() => { }).then(() => { refilling[kind] = false; });
    }
    Store.setNumberSource((kind, localMax) => {
        if (!cloud || Store.isDemo)
            return undefined;
        const p = pool[kind] || [];
        while (p.length && p[0] <= 0)
            p.shift();
        if (!p.length) {
            refill(kind);
            return null;
        }
        const n = p.shift();
        savePool();
        refill(kind);
        return n;
    });
    loadPool();
    Store.onCommit(() => push());
    window.addEventListener('online', () => { computeStatus(); push(); });
    setInterval(() => { if (backend && state.status === 'error') {
        setState({ status: 'online', msg: '' });
        push();
        computeStatus();
    } }, 15000);
    window.addEventListener('offline', computeStatus);
    return {
        get state() { return state; },
        get cloud() { return cloud; },
        onState: f => (listeners.add(f), () => listeners.delete(f)),
        start,
        parseConfig,
        // kafe bulutta kurulmuş mu? (kurulum ekranı "Yeni kafe kur"u buna göre gösterir)
        async cafeExists() {
            const c = { type: window.__cloudType || 'firebase', config: window.KAFE_FIREBASE, cafeId: window.KAFE_CAFE_ID || 'bambaska' };
            if (!c.config && c.type !== 'mock')
                return false;
            const be = await loadBackend(c);
            return be.cafeExists ? be.cafeExists() : false;
        },
        // yönetici: bulutu ilk kez kurar; bu telefon "yönetici cihazı" olur
        async setup({ type = 'firebase', config, name, user }) {
            const c = { type, config: config || window.KAFE_FIREBASE, cafeId: window.KAFE_CAFE_ID || ('kafe-' + rand(10)), v2: true };
            const be = await loadBackend(c);
            await be.createCafe({ name: name || '', user: user || '', device: await deviceName() });
            cloud = c;
            ls.set(LS_CLOUD, cloud);
            loadPool();
            ls.set(LS_REMOVED, null);
            backend = be;
            shadow = {};
            ls.set(LS_SHADOW, shadow);
            setLevel('owner');
            reconciled.clear();
            ALL().forEach(x => reconciled.add(x)); // ilk yüklemede silme yapma
            push();
            setTimeout(() => Object.keys(BLOCK).forEach(refill), 800);
            unsub = backend.subscribe(ALL(), onChanges, onBackendStatus);
            setState({ status: 'online', msg: '' });
            computeStatus();
            return c;
        },
        // davetle katıl: bağlantı (t) + 6 haneli PIN (p). Karekodda PIN de vardır.
        async join(payload, pin) {
            if (!payload || payload.k || !payload.t)
                throw new Error('eski-baglanti');
            const p = String(pin || payload.p || '').replace(/\D/g, '');
            if (p.length !== 6)
                throw new Error('pin-eksik');
            const c = { type: payload.ty || window.__cloudType || 'firebase', config: window.KAFE_FIREBASE, cafeId: payload.id, v2: true };
            if (!c.config && c.type !== 'mock')
                throw new Error('Bulut ayarı yok');
            const be = await loadBackend(c);
            await be.join({ id: payload.t + '-' + p, device: await deviceName(), by: payload.b || '', forName: payload.n || '' });
            unsub === null || unsub === void 0 ? void 0 : unsub();
            cloud = c;
            ls.set(LS_CLOUD, cloud);
            loadPool();
            ls.set(LS_REMOVED, null);
            backend = be;
            shadow = {};
            ls.set(LS_SHADOW, shadow);
            setLevel('member');
            applying = true;
            Store.emptyForJoin();
            applying = false;
            reconciled.clear();
            unsub = backend.subscribe(ALL(), onChanges, onBackendStatus);
            setState({ status: 'online', msg: '' });
            computeStatus();
            setTimeout(() => Object.keys(BLOCK).forEach(refill), 2500);
        },
        // ---- cihaz ve davet yönetimi (sadece yetkili telefon; kurallar da kontrol eder)
        get level() { return level; },
        get uid() { return backend ? backend.uid : null; },
        isAdminDevice: () => level === 'owner' || level === 'admin',
        isOwnerDevice: () => level === 'owner',
        refreshMe: () => checkMembership(),
        touch,
        deviceName,
        removedNotice: () => ls.get(LS_REMOVED),
        clearRemovedNotice: () => ls.set(LS_REMOVED, null),
        // gece yedeğinin (Apps Script) son durumu: { at, ok, note }
        async backupInfo() { if (!backend || !backend.getDoc)
            return null; try {
            return await backend.getDoc('sys', 'backup');
        }
        catch (e) {
            return null;
        } },
        async devices() { return backend ? backend.listMembers() : []; },
        async invites() { return backend ? backend.listInvites() : []; },
        async createInvite({ mode, forUser, forName, byName }) {
            if (!backend)
                throw new Error('network: bağlantı yok');
            const token = rand(10), digits = new Uint32Array(1);
            crypto.getRandomValues(digits);
            const pin = String(digits[0] % 1000000).padStart(6, '0');
            const exp = Date.now() + (mode === 'qr' ? 10 * 60e3 : 2 * 3600e3);
            await backend.createInvite({ id: token + '-' + pin, mode, exp, forUser, forName, byName });
            return { id: token + '-' + pin, token, pin, exp, mode, forUser, forName, byName };
        },
        inviteLink(inv, withPin) {
            const p = { id: cloud.cafeId, t: inv.token || inv.id.split('-')[0], n: inv.forName || '', u: inv.forUser || '', b: inv.byName || '' };
            if (cloud.type !== 'firebase')
                p.ty = cloud.type;
            if (withPin)
                p.p = inv.pin || inv.id.split('-')[1];
            return location.origin + location.pathname + '#/katil/' + b64e(p);
        },
        async cancelInvite(id) { return backend.cancelInvite(id); },
        async setDeviceLevel(uid, l) { return backend.setLevel(uid, l); },
        async removeDevice(uid) { return backend.removeDevice(uid); },
        leave() { try {
            backend && backend.leave && backend.leave();
        }
        catch (e) { } ls.set(poolKey(), null); pool = {}; unsub === null || unsub === void 0 ? void 0 : unsub(); unsub = null; backend = null; cloud = null; shadow = {}; ls.set(LS_CLOUD, null); ls.set(LS_SHADOW, null); ls.set(LS_LEVEL, null); level = null; setState({ status: 'local', msg: '', pending: 0, level: null }); },
        pushNow() { push(); },
        // toplu ekleme öncesi: n numara hazır olsun (bulut yoksa her zaman hazır)
        async ensureNumbers(kind, n) {
            if (!cloud || Store.isDemo)
                return true;
            const have = (pool[kind] || []).length;
            if (have >= n)
                return true;
            try {
                await reserve(kind, n - have);
                return true;
            }
            catch (e) {
                return false;
            }
        },
        numbersReady: (kind, n = 1) => !cloud || Store.isDemo || (pool[kind] || []).length >= n,
        decodeJoin: s => b64d(s),
    };
})();
