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
        if (v && typeof v === 'object' && v.__ts)
            return { timestampValue: new Date(v.__ts).toISOString() };
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
        var commit = function (writes) { return api('POST', root + ':commit', { writes: writes }); };
        var memDoc = function (d) { return d ? Object.assign({ uid: lastSeg(d.name) }, decMap(d.fields)) : null; };
        return {
            uid: uid,
            // kafe var mı? (kurulum ekranı "Yeni kafe kur"u gizler)
            async cafeExists() { var d = await api('GET', cafePath); return !!d; },
            // kafeyi kur: kafe kaydı + bu telefon yönetici cihazı (tek seferde)
            async createCafe(info) {
                await commit([
                    { update: { name: cafePath, fields: encMap({ createdAt: Date.now(), createdBy: uid, name: info.name || '' }) }, currentDocument: { exists: false } },
                    { update: { name: docPath('members', uid), fields: encMap({ level: 'owner', joinedAt: Date.now(), device: info.device || '', lastSeen: Date.now(), lastUser: info.user || '', invitedBy: '', inviteName: info.user || '' }) }, currentDocument: { exists: false } },
                ]);
            },
            // davetle katıl: üyelik + davet "kullanıldı" tek seferde (kurallar ikisini birlikte kontrol eder)
            async join(inv) {
                var ip = docPath('invites', inv.id);
                await commit([
                    { update: { name: docPath('members', uid), fields: encMap({ level: 'member', invite: inv.id, joinedAt: Date.now(), device: inv.device || '', lastSeen: Date.now(), lastUser: '', invitedBy: inv.by || '', inviteName: inv.forName || '' }) }, currentDocument: { exists: false } },
                    { update: { name: ip, fields: encMap({ usedBy: uid }) }, updateMask: { fieldPaths: ['usedBy'] }, updateTransforms: [{ fieldPath: 'usedAt', setToServerValue: 'REQUEST_TIME' }] },
                ]);
                try {
                    await api('DELETE', docPath('removed', uid));
                }
                catch (e) { }
            },
            async getDoc(coll, id) { var d = await api('GET', docPath(coll, id)); return d ? decMap(d.fields) : null; },
            async me() { return memDoc(await api('GET', docPath('members', uid))); },
            async touch(p) { await api('PATCH', docPath('members', uid) + '?updateMask.fieldPaths=lastSeen&updateMask.fieldPaths=lastUser&updateMask.fieldPaths=device', { fields: encMap({ lastSeen: Date.now(), lastUser: p.user || '', device: p.device || '' }) }); },
            async wasRemoved() { var d = await api('GET', docPath('removed', uid)); return !!d; },
            async listMembers() { return ((await listAll('members')) || []).map(memDoc); },
            async listInvites() { return ((await listAll('invites')) || []).map(function (d) { var o = memDoc(d); o.id = o.uid; o.exp = ms(o.exp); return o; }); },
            async createInvite(inv) {
                await commit([{ update: { name: docPath('invites', inv.id), fields: encMap({ exp: { __ts: inv.exp }, mode: inv.mode, forUser: inv.forUser || '', forName: inv.forName || '', byName: inv.byName || '', createdBy: uid, createdAt: Date.now(), usedBy: null }) }, currentDocument: { exists: false } }]);
            },
            async cancelInvite(id) { await api('DELETE', docPath('invites', id)); },
            async setLevel(mid, lvl) { await api('PATCH', docPath('members', mid) + '?updateMask.fieldPaths=level&currentDocument.exists=true', { fields: encMap({ level: lvl }) }); },
            async removeDevice(mid) {
                await commit([{ delete: docPath('members', mid) }, { update: { name: docPath('removed', mid), fields: encMap({ at: Date.now(), by: uid }) } }]);
            },
            async leave() { try {
                await api('DELETE', docPath('members', uid));
            }
            catch (e) { } },
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
                    for (var k = 0; k < dels.length; k++) {
                        var d = dels[k];
                        delMs = Math.max(delMs, d.t);
                        if (!d.data.coll || colls.indexOf(d.data.coll) < 0)
                            continue;
                        // silinip sonra yeniden oluşturulan kayıt (ör. yedekten geri yükleme): hâlâ duruyorsa silme
                        var still = await api('GET', docPath(d.data.coll, d.data.id));
                        if (still)
                            continue;
                        (by[d.data.coll] = by[d.data.coll] || []).push({ id: d.data.id, data: null });
                    }
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
            // numara bloğu ayır (iyimser kilit: belge değişmediyse yaz, değiştiyse tekrar dene)
            async reserve(kind, count, localMax) {
                var path = docPath('sys', 'counters');
                for (var i = 0; i < 6; i++) {
                    var d = await api('GET', path);
                    var cur = d && d.fields && d.fields[kind] ? Number(dec(d.fields[kind])) || 0 : 0;
                    var start = Math.max(cur, localMax || 0) + 1, f = {};
                    f[kind] = enc(start + count - 1);
                    try {
                        await api('POST', root + ':commit', { writes: [{ update: { name: path, fields: f }, updateMask: { fieldPaths: [kind] },
                                    currentDocument: d ? { updateTime: d.updateTime } : { exists: false } }] });
                        return start;
                    }
                    catch (e) {
                        if (!/FAILED_PRECONDITION|ABORTED|ALREADY_EXISTS|NOT_FOUND|HTTP 409|HTTP 400/.test(String(e.code || '') + ' ' + String(e.message || '')))
                            throw e;
                    }
                }
                throw new Error('network: sayaç meşgul');
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
