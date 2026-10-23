# Kaynak kod
Bu klasördeki dosyalar düzenlenen asıl kaynak koddur.
Yayındaki (kök klasördeki) .js dosyaları, eski iPad/iPhone Safari'de de çalışsın diye
TypeScript derleyicisiyle ES2017'ye çevrilmiş hâlidir:

    tsc --allowJs --target ES2017 --module esnext --lib es2017,dom --skipLibCheck --outDir . kaynak/*.js
