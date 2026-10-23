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

  return {
    uid,
    async createCafe() {
      await F.setDoc(cafeRef(), { joinCode: cloud.joinCode, createdAt: Date.now(), createdBy: uid });
      await this.join();
    },
    async join() {
      await F.setDoc(memberRef(), { code: cloud.joinCode, joinedAt: Date.now(), device: navigator.userAgent.slice(0, 120) });
    },
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
