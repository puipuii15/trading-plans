# Trading Plan — panduan setup

Isi folder:
- `index.html`, `style.css`, `app.js` — websitenya
- `stocks.js` — daftar 951 emiten BEI (data s/d Jan 2025, IPO setelah itu tetap bisa diketik manual)
- `config.js` — **satu-satunya file yang perlu kamu edit**
- `schema.sql` — struktur database

Total waktu: ±15 menit. Gratis.

## 1. Bikin database (Supabase)
1. Daftar di https://supabase.com, lalu klik **New project**. Pilih region **Singapore**, simpan password database-nya.
2. Buka menu **SQL Editor** → **New query** → paste seluruh isi `schema.sql` → **Run**.
   Harus muncul "Success". Ini membuat tabel `trades` dan `user_settings`. Aturannya: tiap akun cuma bisa lihat datanya sendiri.
3. Buka **Project Settings → API**. Copy:
   - **Project URL** → taruh di `SUPABASE_URL` dalam `config.js`
   - **anon public key** → taruh di `SUPABASE_ANON_KEY`
   > Anon key memang aman ditaruh di website publik, karena datanya dijaga aturan RLS. **Jangan pernah** taruh `service_role` key di sini.

## 2. Online-kan website
Cara paling gampang (tanpa Git):
1. Buka https://app.netlify.com/drop
2. Drag folder `trading-web` ke halaman itu, tunggu sampai jadi. Kamu dapat link seperti `https://nama-acak.netlify.app`.
3. (Opsional) Ganti nama situs di Site settings, atau sambungkan domain sendiri.

Alternatif: push folder ini ke GitHub lalu import di https://vercel.com (tanpa build command).

## 3. Sambungkan login ke URL website
Di Supabase → **Authentication → URL Configuration**:
- **Site URL** = link Netlify kamu
- **Redirect URLs**: tambahkan link yang sama

Tanpa langkah ini, link konfirmasi email & reset password akan membuka `localhost` dan gagal.

Opsional: kalau tidak mau user wajib konfirmasi email, matikan **Confirm email** di pengaturan provider Email (Authentication).
Catatan: email bawaan Supabase dibatasi beberapa email per jam. Kalau user-nya banyak, pasang SMTP sendiri (Authentication → Emails → SMTP).

## 4. Link RTI
Kode saham di tabel bisa diklik dan membuka `STOCK_LINK` di `config.js`.
Format URL per saham di RTI belum bisa dipastikan dari luar. Jadi tes dulu: klik satu kode.
Kalau yang terbuka bukan saham itu:
1. Buka halaman BBCA di RTI secara manual.
2. Copy URL dari address bar.
3. Ganti `BBCA` di URL itu dengan `{CODE}`, lalu paste ke `STOCK_LINK`.
4. Upload ulang foldernya ke Netlify.

## Update website
Edit file → drag ulang folder ke Netlify (Deploys → drag & drop). Data di database tetap aman.

## 5. Harga & grafik (Edge Function "quote")
Harga terakhir + grafik diambil dari Yahoo Finance lewat Supabase Edge Function (gratis).
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nama function: `quote` (persis).
3. Hapus isi contoh, paste seluruh isi `supabase/functions/quote/index.ts` → **Deploy**.
4. Biarkan setting **Verify JWT** menyala (hanya user yang login bisa memakai).

Harga dari Yahoo bisa delay ±10–15 menit. Jangan dipakai untuk eksekusi order.
Indikator (SMA, Ichimoku, Volume, RSI, MACD) dipilih di "Grafik lengkap" dan tersimpan per akun.
