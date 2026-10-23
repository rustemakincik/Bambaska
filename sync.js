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
        else
            setState({ status: st, msg: err ? errText(err) : '' });
    }
    async function loadBackend(c) {
        const mod = c.type === 'mock' ? await import('./mock-backend.js') : await import('./firebase-backend.js');
        return mod.create(c);
    }
    async function start() {
        if (Store.isDemo) {
            setState({ status: 'demo' });
            return;
        } // demo asla buluta bağlanmaz
        if (!cloud) {
            computeStatus();
            return;
        }
        setState({ status: 'connecting', msg: '' });
        try {
            backend = await loadBackend(cloud);
            reconciled.clear();
            unsub = backend.subscribe(ALL(), onChanges, onBackendStatus);
            setState({ status: 'online' });
            computeStatus();
            push(); // bağlantı yokken birikmiş değişiklikler
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
        // yönetici: bulutu ilk kez kurar ve bu cihazdaki veriyi yükler
        async setup({ type = 'firebase', config }) {
            const c = { type, config, cafeId: 'kafe-' + rand(10), joinCode: rand(20) };
            const be = await loadBackend(c);
            await be.createCafe();
            cloud = c;
            ls.set(LS_CLOUD, cloud);
            backend = be;
            shadow = {};
            ls.set(LS_SHADOW, shadow);
            reconciled.clear();
            ALL().forEach(x => reconciled.add(x)); // ilk yüklemede silme yapma
            push();
            unsub = backend.subscribe(ALL(), onChanges, onBackendStatus);
            setState({ status: 'online', msg: '' });
            computeStatus();
            return c;
        },
        // personel/diğer cihaz: katılım bağlantısıyla kafeye bağlanır, veriler buluttan gelir
        async join(payload) {
            const config = payload.c || window.KAFE_FIREBASE;
            if (!config)
                throw new Error('Bağlantıda bulut ayarı yok');
            const c = { type: payload.t || 'firebase', config, cafeId: payload.id, joinCode: payload.k };
            const be = await loadBackend(c);
            await be.join();
            unsub === null || unsub === void 0 ? void 0 : unsub();
            cloud = c;
            ls.set(LS_CLOUD, cloud);
            backend = be;
            shadow = {};
            ls.set(LS_SHADOW, shadow);
            applying = true;
            Store.emptyForJoin();
            applying = false;
            reconciled.clear();
            unsub = backend.subscribe(ALL(), onChanges, onBackendStatus);
            setState({ status: 'online', msg: '' });
            computeStatus();
        },
        leave() { unsub === null || unsub === void 0 ? void 0 : unsub(); unsub = null; backend = null; cloud = null; shadow = {}; ls.set(LS_CLOUD, null); ls.set(LS_SHADOW, null); setState({ status: 'local', msg: '', pending: 0 }); },
        pushNow() { push(); },
        joinLink() {
            if (!cloud)
                return '';
            const emb = window.KAFE_FIREBASE;
            const p = { id: cloud.cafeId, k: cloud.joinCode };
            if (cloud.type !== 'firebase')
                p.t = cloud.type;
            if (!(emb && emb.projectId === cloud.config.projectId && emb.apiKey === cloud.config.apiKey))
                p.c = cloud.config;
            return location.origin + location.pathname + '#/katil/' + b64e(p);
        },
        decodeJoin: s => b64d(s),
    };
})();
