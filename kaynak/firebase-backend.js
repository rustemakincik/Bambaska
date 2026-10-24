// KafeStok — Firebase (Firestore) arka ucu
// Yapı: cafes/{cafeId}                 → { joinCode, createdAt, createdBy }
//       cafes/{cafeId}/members/{uid}   → bu kafeye bağlı cihazlar (anonim kullanıcı)
//       cafes/{cafeId}/{koleksiyon}/{id} → items, orders, assets … ve meta/cafe
// Güvenlik firestore.rules dosyasında: sadece üye cihazlar okuyup yazabilir.
const V = '12.19.0';
const B = `https://www.gstatic.com/firebasejs/${V}/`;

let mods = null;
async function sdk() {
  if (!mods) {
    const [app, auth, fs] = await Promise.all([import(B + 'firebase-app.js'), import(B + 'firebase-auth.js'), import(B + 'firebase-firestore.js')]);
    mods = { app, auth, fs };
  }
  return mods;
}

export async function create(cloud) {
  const { app: A, auth: Au, fs: F } = await sdk();
  const name = 'kafestok-' + cloud.config.projectId;
  const app = A.getApps().find(a => a.name === name) || A.initializeApp(cloud.config, name);
  let db;
  try {
    // çevrimdışı önbellek: internet yokken okur/yazar, gelince gönderir
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) { db = F.getFirestore(app); }
  const auth = Au.getAuth(app);
  if (!auth.currentUser) {
    await new Promise(res => { const u = Au.onAuthStateChanged(auth, () => { u(); res(); }); });
    if (!auth.currentUser) await Au.signInAnonymously(auth);
  }
  const uid = auth.currentUser.uid;
  const cafeRef = () => F.doc(db, 'cafes', cloud.cafeId);
  const memberRef = () => F.doc(db, 'cafes', cloud.cafeId, 'members', uid);

  const sub = (c, id) => F.doc(db, 'cafes', cloud.cafeId, c, id);
  const fromServer = r => (F.getDocFromServer ? F.getDocFromServer(r) : F.getDoc(r));
  const memOf = d => ({ uid: d.id, ...d.data() });

  return {
    uid,
    // kafe var mı? (kurulum ekranı "Yeni kafe kur"u gizler)
    async cafeExists() { return (await fromServer(cafeRef())).exists(); },
    // kafeyi kur: kafe kaydı + bu telefon yönetici cihazı (kurallar ikisini birlikte kontrol eder)
    async createCafe(info) {
      const b = F.writeBatch(db);
      b.set(cafeRef(), { createdAt: Date.now(), createdBy: uid, name: info.name || '' });
      b.set(memberRef(), { level: 'owner', joinedAt: Date.now(), device: info.device || '', lastSeen: Date.now(), lastUser: info.user || '', invitedBy: '', inviteName: info.user || '' });
      await b.commit();
    },
    // davetle katıl: üyelik + davet "kullanıldı" tek seferde
    async join(inv) {
      const b = F.writeBatch(db);
      b.set(memberRef(), { level: 'member', invite: inv.id, joinedAt: Date.now(), device: inv.device || '', lastSeen: Date.now(), lastUser: '', invitedBy: inv.by || '', inviteName: inv.forName || '' });
      b.update(sub('invites', inv.id), { usedBy: uid, usedAt: F.serverTimestamp() });
      await b.commit();
      try { await F.deleteDoc(sub('removed', uid)); } catch (e) {}
    },
    async getDoc(coll, id) { const d = await fromServer(sub(coll, id)); return d.exists() ? d.data() : null; },
    async me() { const d = await fromServer(memberRef()); return d.exists() ? memOf(d) : null; },
    async touch(p) { await F.updateDoc(memberRef(), { lastSeen: Date.now(), lastUser: p.user || '', device: p.device || '' }); },
    async wasRemoved() { try { return (await fromServer(sub('removed', uid))).exists(); } catch (e) { return false; } },
    async listMembers() { const q = await (F.getDocsFromServer || F.getDocs)(F.collection(db, 'cafes', cloud.cafeId, 'members')); return q.docs.map(memOf); },
    async listInvites() {
      const q = await (F.getDocsFromServer || F.getDocs)(F.collection(db, 'cafes', cloud.cafeId, 'invites'));
      return q.docs.map(d => { const o = { id: d.id, ...d.data() }; o.exp = o.exp && o.exp.toMillis ? o.exp.toMillis() : o.exp; return o; });
    },
    async createInvite(inv) {
      await F.setDoc(sub('invites', inv.id), { exp: F.Timestamp.fromMillis(inv.exp), mode: inv.mode, forUser: inv.forUser || '', forName: inv.forName || '', byName: inv.byName || '', createdBy: uid, createdAt: Date.now(), usedBy: null });
    },
    async cancelInvite(id) { await F.deleteDoc(sub('invites', id)); },
    async setLevel(mid, lvl) { await F.updateDoc(sub('members', mid), { level: lvl }); },
    async removeDevice(mid) {
      const b = F.writeBatch(db);
      b.delete(sub('members', mid)); b.set(sub('removed', mid), { at: Date.now(), by: uid });
      await b.commit();
    },
    async leave() { try { await F.deleteDoc(memberRef()); } catch (e) {} },
    subscribe(colls, onChanges, onStatus) {
      const unsubs = colls.map(c => F.onSnapshot(
        F.collection(db, 'cafes', cloud.cafeId, c),
        { includeMetadataChanges: true },
        snap => {
          // _t (sunucu zamanı) sadece eski cihazların değişiklik takibi içindir; uygulamaya verilmez
          const changes = snap.docChanges().map(d => {
            if (d.type === 'removed') return { id: d.doc.id, data: null };
            const data = d.doc.data(); delete data._t; return { id: d.doc.id, data };
          });
          onChanges(c, changes, { ids: snap.docs.map(d => d.id), fromCache: snap.metadata.fromCache });
        },
        err => onStatus('error', err)
      ));
      return () => unsubs.forEach(u => u());
    },
    // numara bloğu ayır: sayaç = max(sayaç, cihazdaki en büyük numara) + count
    async reserve(kind, count, localMax) {
      const ref = F.doc(db, 'cafes', cloud.cafeId, 'sys', 'counters');
      return F.runTransaction(db, async tx => {
        const s = await tx.get(ref);
        const cur = s.exists() ? (Number(s.data()[kind]) || 0) : 0;
        const start = Math.max(cur, localMax || 0) + 1;
        tx.set(ref, { [kind]: start + count - 1 }, { merge: true });
        return start;
      });
    },
    // Her kayda _t (sunucu zamanı) eklenir; silinenler için 'deleted' izi bırakılır; sys/rev sayacı artar.
    // Böylece eski cihazlar (REST ile) sadece değişenleri okuyabilir.
    async write(ops) {
      for (let i = 0; i < ops.length; i += 150) {
        const b = F.writeBatch(db);
        ops.slice(i, i + 150).forEach(o => {
          const r = F.doc(db, 'cafes', cloud.cafeId, o.coll, o.id);
          if (o.data) b.set(r, Object.assign({}, o.data, { _t: F.serverTimestamp() }));
          else {
            b.delete(r);
            b.set(F.doc(db, 'cafes', cloud.cafeId, 'deleted', o.coll + '__' + o.id), { coll: o.coll, id: o.id, _t: F.serverTimestamp() });
          }
        });
        b.set(F.doc(db, 'cafes', cloud.cafeId, 'sys', 'rev'), { n: F.increment(1), t: F.serverTimestamp() }, { merge: true });
        await b.commit();
      }
    },
  };
}
