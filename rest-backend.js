"use strict";
/* KafeStok — eski cihazlar (iOS 10–11.2 Safari) için Firestore REST bağlantısı.
 * Firebase kütüphanesi bu tarayıcılarda çalışmadığı için doğrudan Google'ın REST adreslerini kullanır.
 * - Anonim giriş: identitytoolkit / securetoken
 * - Değişiklik takibi: cafes/{id}/sys/rev sayacı her yazımda artar; ~15 sn'de bir sadece bu belge okunur.
 *   Sayaç değişince yalnızca _t (sunucu zamanı) son okumadan yeni olan kayıtlar çekilir.
 * - Silinenler: cafes/{id}/deleted/{koleksiyon__id} izleri.
 * Klasik betik (modül değil); window.KafeRest.create(cloud) döndürür.
 */
window.KafeRest = (function () {
    'use strict';
    function base() {
        return window.__restBase || {
            fs: 'https://firestore.googleapis.com/v1',
            id: 'https://identitytoolkit.googleapis.com/v1',
            st: 'https://securetoken.googleapis.com/v1',
        };
    }
    // ---- Firestore değer biçimi <-> JS
    function enc(v) {
        if (v === null || v === undefined)
            return { nullValue: null };
        if (typeof v === 'boolean')
            return { booleanValue: v };
        if (typeof v === 'number')
            return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        if (typeof v === 'string')
            return { stringValue: v };
        if (Array.isArray(v))
            return { arrayValue: { values: v.map(enc) } };
        return { mapValue: { fields: encMap(v) } };
    }
    function encMap(o) {
        var f = {};
        Object.keys(o).forEach(function (k) { if (o[k] !== undefined && k !== '_t')
            f[k] = enc(o[k]); });
        return f;
    }
    function dec(v) {
        if (!v)
            return null;
        if ('nullValue' in v)
            return null;
        if ('booleanValue' in v)
            return v.booleanValue;
        if ('integerValue' in v)
            return Number(v.integerValue);
        if ('doubleValue' in v)
            return Number(v.doubleValue);
        if ('stringValue' in v)
            return v.stringValue;
        if ('timestampValue' in v)
            return v.timestampValue;
        if ('arrayValue' in v)
            return (v.arrayValue.values || []).map(dec);
        if ('mapValue' in v)
            return decMap(v.mapValue.fields || {});
        return null;
    }
    function decMap(f) {
        var o = {};
        Object.keys(f || {}).forEach(function (k) { o[k] = dec(f[k]); });
        return o;
    }
    var ms = function (iso) { var t = Date.parse(iso); return isNaN(t) ? 0 : t; };
    var lastSeg = function (name) { return name.slice(name.lastIndexOf('/') + 1); };
    async function create(cloud) {
        var B = base(), cfg = cloud.config, key = cfg.apiKey;
        var root = 'projects/' + cfg.projectId + '/databases/(default)/documents';
        var cafePath = root + '/cafes/' + cloud.cafeId;
        var AK = 'kafestok.restAuth.' + cfg.projectId;
        var auth = null;
        try {
            auth = JSON.parse(localStorage.getItem(AK));
        }
        catch (e) { }
        function saveAuth() { try {
            localStorage.setItem(AK, JSON.stringify(auth));
        }
        catch (e) { } }
        function fail(j, status) {
            var m = (j && j.error && (j.error.status || j.error.message)) || ('HTTP ' + status);
            var e = new Error(m);
            e.code = /PERMISSION_DENIED|INSUFFICIENT_PERMISSION/.test(m) || status === 403 ? 'permission-denied'
                : /ADMIN_ONLY_OPERATION|OPERATION_NOT_ALLOWED/.test(m) ? 'auth/operation-not-allowed'
                    : /API_KEY|API key/i.test(m) ? 'auth/invalid-api-key' : m;
            return e;
        }
        async function json(r) { try {
            return await r.json();
        }
        catch (e) {
            return {};
        } }
        async function token() {
            if (auth && auth.exp > Date.now() + 60000)
                return auth.idToken;
            if (auth && auth.refreshToken) {
                var r = await fetch(B.st + '/token?key=' + encodeURIComponent(key), {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(auth.refreshToken),
                });
                var j = await json(r);
                if (r.ok) {
                    auth = { idToken: j.id_token, refreshToken: j.refresh_token, uid: j.user_id, exp: Date.now() + Number(j.expires_in || 3600) * 1000 };
                    saveAuth();
                    return auth.idToken;
                }
            }
            var r2 = await fetch(B.id + '/accounts:signUp?key=' + encodeURIComponent(key), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
            });
            var j2 = await json(r2);
            if (!r2.ok)
                throw fail(j2, r2.status);
            auth = { idToken: j2.idToken, refreshToken: j2.refreshToken, uid: j2.localId, exp: Date.now() + Number(j2.expiresIn || 3600) * 1000 };
            saveAuth();
            return auth.idToken;
        }
        async function api(method, path, body) {
            var t = await token();
            var r = await fetch(B.fs + '/' + path, {
                method: method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (r.status === 404 && method === 'GET')
                return null;
            var j = await json(r);
            if (!r.ok)
                throw fail(j, r.status);
            return j;
        }
        var docPath = function (coll, id) { return cafePath + '/' + coll + '/' + id; };
        var withT = function (name, data) {
            return { update: { name: name, fields: encMap(data) }, updateTransforms: [{ fieldPath: '_t', setToServerValue: 'REQUEST_TIME' }] };
        };
        async function listAll(coll) {
            var out = [], pageToken = '';
            do {
                var j = await api('GET', docPath(coll, '').slice(0, -1) + '?pageSize=300' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
                out = out.concat((j && j.documents) || []);
                pageToken = j && j.nextPageToken;
            } while (pageToken);
            return out;
        }
        async function since(coll, fromMs) {
            var j = await api('POST', cafePath + ':runQuery', { structuredQuery: {
                    from: [{ collectionId: coll }],
                    where: { fieldFilter: { field: { fieldPath: '_t' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: new Date(fromMs).toISOString() } } },
                } });
            return (Array.isArray(j) ? j : [j]).filter(function (x) { return x && x.document; }).map(function (x) { return x.document; });
        }
        function toChange(d) {
            var data = decMap(d.fields), t = ms(data._t || d.updateTime);
            delete data._t;
            return { id: lastSeg(d.name), data: data, t: t };
        }
        await token();
        var uid = auth.uid;
        return {
            uid: uid,
            async createCafe() {
                await api('PATCH', cafePath + '?currentDocument.exists=false', { fields: encMap({ joinCode: cloud.joinCode, createdAt: Date.now(), createdBy: uid }) });
                await this.join();
            },
            async join() {
                await api('PATCH', docPath('members', uid), { fields: encMap({ code: cloud.joinCode, joinedAt: Date.now(), device: navigator.userAgent.slice(0, 120) }) });
            },
            subscribe(colls, onChanges, onStatus) {
                var stop = false, timer = null, lastRev = null, lastMs = {}, delMs = 0, busy = false;
                var every = function () { return window.__restPoll || 15000; };
                async function first() {
                    var rev = await api('GET', docPath('sys', 'rev'));
                    var t0 = rev && rev.fields && rev.fields.t ? ms(dec(rev.fields.t)) : 0;
                    lastRev = rev && rev.fields && rev.fields.n ? dec(rev.fields.n) : 0;
                    for (var i = 0; i < colls.length; i++) {
                        var c = colls[i], docs = (await listAll(c)).map(toChange);
                        lastMs[c] = t0 || docs.reduce(function (m, d) { return Math.max(m, d.t); }, 0);
                        onChanges(c, docs.map(function (d) { return { id: d.id, data: d.data }; }), { ids: docs.map(function (d) { return d.id; }), fromCache: false });
                    }
                    delMs = t0 || Date.now() - 60000;
                }
                async function poll() {
                    var rev = await api('GET', docPath('sys', 'rev'));
                    var n = rev && rev.fields && rev.fields.n ? dec(rev.fields.n) : 0;
                    if (n === lastRev)
                        return;
                    for (var i = 0; i < colls.length; i++) {
                        var c = colls[i], docs = (await since(c, lastMs[c] || 0)).map(toChange);
                        if (!docs.length)
                            continue;
                        lastMs[c] = docs.reduce(function (m, d) { return Math.max(m, d.t); }, lastMs[c] || 0);
                        onChanges(c, docs.map(function (d) { return { id: d.id, data: d.data }; }), {});
                    }
                    var dels = (await since('deleted', delMs)).map(toChange), by = {};
                    dels.forEach(function (d) { delMs = Math.max(delMs, d.t); if (d.data.coll && colls.indexOf(d.data.coll) >= 0)
                        (by[d.data.coll] = by[d.data.coll] || []).push({ id: d.data.id, data: null }); });
                    Object.keys(by).forEach(function (c) { onChanges(c, by[c], {}); });
                    lastRev = n;
                }
                async function tick() {
                    if (stop)
                        return;
                    if (!document.hidden && !busy) {
                        busy = true;
                        try {
                            if (lastRev === null)
                                await first();
                            else
                                await poll();
                            onStatus(navigator.onLine === false ? 'offline' : 'online');
                        }
                        catch (e) {
                            onStatus(/Failed to fetch|NetworkError|network|Load failed/i.test(String(e && e.message)) ? 'offline' : 'error', e);
                        }
                        busy = false;
                    }
                    timer = setTimeout(tick, lastRev === null ? 3000 : every());
                }
                tick();
                this._nudge = function () { clearTimeout(timer); timer = setTimeout(tick, 400); };
                return function () { stop = true; clearTimeout(timer); };
            },
            async write(ops) {
                for (var i = 0; i < ops.length; i += 150) {
                    var writes = [];
                    ops.slice(i, i + 150).forEach(function (o) {
                        if (o.data)
                            writes.push(withT(docPath(o.coll, o.id), o.data));
                        else {
                            writes.push({ delete: docPath(o.coll, o.id) });
                            writes.push(withT(docPath('deleted', o.coll + '__' + o.id), { coll: o.coll, id: o.id }));
                        }
                    });
                    writes.push({ update: { name: docPath('sys', 'rev'), fields: {} }, updateMask: { fieldPaths: [] },
                        updateTransforms: [{ fieldPath: 'n', increment: { integerValue: '1' } }, { fieldPath: 't', setToServerValue: 'REQUEST_TIME' }] });
                    await api('POST', root + ':commit', { writes: writes });
                }
                if (this._nudge)
                    this._nudge();
            },
        };
    }
    return { create: create, _enc: enc, _dec: dec };
})();
