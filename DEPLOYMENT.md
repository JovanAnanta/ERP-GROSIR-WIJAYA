# Deployment ERP Grosir Wijaya

Panduan ini memakai satu VPS Ubuntu, Docker Compose, Cloudflare Tunnel, dan
backup PostgreSQL terenkripsi ke Backblaze B2. Database tidak dibuka ke
internet. Pengguna hanya melihat halaman login; aplikasi tidak menyediakan
registrasi mandiri.

## Arsitektur

```text
Browser -> HTTPS Cloudflare -> Cloudflare Tunnel -> Nginx frontend
                                                   -> NestJS backend
                                                   -> PostgreSQL private

PostgreSQL -> pg_dump -> restic encryption -> Backblaze B2 (S3 API)
Git tag -> GitHub Actions -> GHCR images -> VPS pull dan restart
```

VPS tidak membangun source code. GitHub Actions menjalankan lint, test, build,
dan membuat image. Cara ini menghemat RAM/CPU VPS 2 GB dan membuat rilis dapat
diulang atau di-rollback.

## Yang perlu dibayar dan dipasang

- Satu VPS Linux. Untuk beban toko saat ini, mulai dari 2 vCPU, RAM 2 GB, dan
  SSD 40 GB. RAM 1 GB terlalu sempit untuk PostgreSQL, aplikasi, tunnel, dan
  proses maintenance bersamaan.
- Satu domain. Pembayaran domain terpisah dari VPS dan umumnya tahunan.
- Akun Cloudflare gratis untuk DNS, HTTPS, dan Tunnel.
- Bucket privat Backblaze B2 untuk backup. Gunakan batas biaya USD 0 dan
  notifikasi pemakaian agar operasi berhenti ketika kuota gratis tercapai.
- Docker Engine di VPS; Docker Engine tidak memerlukan biaya lisensi untuk
  skenario ini.

Laptop pengembangan dan PC kasir tidak perlu menjadi server. VPS tetap hidup
ketika kedua perangkat tersebut dimatikan.

## 1. Persiapan repository dan image

Commit source code beserta regression test (`*.spec.ts`, `frontend/tests`).
Push ke GitHub dan pastikan workflow **ERP CI Pipeline** hijau. Buat rilis
pertama dengan tag tetap:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Workflow akan menerbitkan empat image ke GitHub Container Registry (GHCR).
Jadikan package GHCR public, atau login pada VPS menggunakan GitHub Personal
Access Token dengan izin `read:packages`:

```bash
docker login ghcr.io -u NAMA_USER_GITHUB
```

Jangan memakai tag `latest` untuk deployment produksi. Gunakan `v1.0.0`,
`v1.0.1`, dan seterusnya agar rollback selalu menunjuk versi yang pasti.

## 2. Persiapan VPS

Gunakan Ubuntu LTS. Masuk melalui SSH, pasang Docker Engine beserta plugin
Docker Compose dari repository resmi Docker, lalu clone repository ke lokasi
misalnya `/opt/erp-grosir-wijaya`.

Keamanan minimum server:

- gunakan SSH key, bukan password;
- nonaktifkan login SSH langsung sebagai root setelah user administrator siap;
- aktifkan firewall dan buka SSH saja; port PostgreSQL dan port aplikasi tidak
  perlu dibuka ke internet karena koneksi masuk menggunakan Tunnel;
- aktifkan pembaruan keamanan otomatis;
- gunakan swap 2 GB sebagai pengaman RAM, bukan pengganti RAM utama;
- pastikan waktu server dan zona waktu benar.

## 3. Konfigurasi aplikasi

Di root repository pada VPS:

```bash
cp .env.production.example .env
mkdir -p secrets
```

Edit `.env`:

- `DB_PASSWORD`: password database acak dan kuat;
- `DATABASE_URL`: password yang sama pada URL internal PostgreSQL;
- `APP_ORIGIN`: alamat HTTPS final, misalnya `https://erp.namatoko.com`;
- `APP_VERSION`: tag rilis, misalnya `v1.0.0`;
- `RESTIC_REPOSITORY`: endpoint S3 bucket Backblaze B2;
- `BACKUP_S3_REGION`: region pada endpoint bucket, misalnya `us-east-005`.

Untuk menghindari kesalahan URL encoding, gunakan password database acak
minimal 32 karakter yang terdiri dari huruf dan angka. File `.env` tidak boleh
di-commit.

Buat file berikut di folder `secrets/`, masing-masing berisi satu nilai tanpa
tanda kutip:

```text
cloudflare_tunnel_token.txt
restic_password.txt
backup_access_key_id.txt
backup_secret_access_key.txt
initial_admin_password.txt
```

Gunakan password restic berbeda dari password database dan simpan salinannya di
password manager. Tanpa password restic, backup terenkripsi tidak dapat
dipulihkan.

```bash
chmod 700 secrets
chmod 600 .env secrets/*.txt
sudo chown root:root secrets/cloudflare_tunnel_token.txt
```

## 4. Cloudflare Tunnel

Di dashboard Cloudflare Zero Trust:

1. Buat satu Tunnel untuk ERP.
2. Tambahkan public hostname, misalnya `erp.namatoko.com`.
3. Arahkan service hostname tersebut ke `http://frontend:80`.
4. Salin token Tunnel ke `secrets/cloudflare_tunnel_token.txt`.

Jangan menaruh token pada `.env`, source code, screenshot, atau log. Tunnel
memberikan HTTPS dan menyembunyikan port VPS, tetapi halaman login tetap dapat
dibuka siapa pun yang mengetahui alamatnya. Data ERP tetap dilindungi oleh
login, session, dan permission backend.

File token dibuat milik `root:root` dengan permission `0600`. Container
`cloudflared` hanya memakai root untuk membaca file tersebut dan tetap memakai
filesystem read-only, tanpa Linux capability, serta `no-new-privileges`; jangan
melonggarkan permission file token menjadi dapat dibaca semua user. Health check
`cloudflared` juga memastikan sedikitnya satu koneksi ke edge Cloudflare sudah
aktif.

## 5. Backblaze B2 untuk backup

1. Buat bucket privat khusus dan aktifkan enkripsi bawaan.
2. Nonaktifkan Object Lock agar restic dapat menghapus data sesuai retensi.
3. Atur lifecycle menjadi `Keep only the last version` agar versi tersembunyi
   yang sudah dibuang restic tidak terus memakai kapasitas.
4. Buat Application Key `Read and Write` yang hanya dapat mengakses bucket
   tersebut, serta aktifkan `Allow List All Bucket Names` untuk kompatibilitas
   S3.
5. Isi key ID dan application key pada file secret backup terkait.
6. Isi endpoint bucket pada `RESTIC_REPOSITORY` dan region endpoint pada
   `BACKUP_S3_REGION`.

Backup berjalan setiap hari pukul 02:00 zona `Asia/Jakarta`, terenkripsi sebelum
disimpan, dengan retensi 7 harian, 4 mingguan, dan 12 bulanan. Ubah angka
retensi di `.env` bila kebijakan toko berubah.

## 6. Deployment pertama

Jalankan dari root repository:

```bash
bash deployment/scripts/deploy.sh v1.0.0
```

Perintah tersebut menarik image, menunggu PostgreSQL sehat, membuat backup
pengaman, menjalankan Prisma migration, menjalankan aplikasi, kemudian mengecek
health endpoint lokal. Deployment dihentikan jika backup atau migration gagal.

Pada database kosong saja, buat role, permission, akun kas/bank awal, dan user
administrator:

```bash
bash deployment/scripts/compose.sh run --rm bootstrap
```

Login menggunakan username `admin` dan password dari
`initial_admin_password.txt`, lalu segera ganti password melalui aplikasi.
Bootstrap bersifat idempotent dan tidak menimpa password user yang sudah ada.
Setelah berhasil, pindahkan salinan password awal ke password manager dan hapus
file `initial_admin_password.txt` dari VPS. Jangan menjalankan seed destruktif
atau `prisma migrate reset`.

## 7. Operasi rutin

### Rilis versi baru

Setelah CI hijau:

```bash
git tag v1.0.1
git push origin v1.0.1
git pull --ff-only
bash deployment/scripts/deploy.sh v1.0.1
```

### Melihat kondisi dan log

```bash
bash deployment/scripts/compose.sh ps
bash deployment/scripts/compose.sh logs --tail=200 backend frontend postgres
bash deployment/scripts/health-check.sh
```

Log Docker dibatasi menjadi tiga file berukuran maksimum 10 MB per container,
sehingga tidak memenuhi SSD tanpa batas.

### Backup manual

```bash
bash deployment/scripts/backup-now.sh
bash deployment/scripts/compose.sh run --rm backup restic snapshots
```

Backup dianggap siap produksi hanya setelah restore percobaan ke database
terisolasi berhasil. Ulangi uji restore sekurangnya setiap tiga bulan.

### Rollback aplikasi

```bash
bash deployment/scripts/rollback.sh
```

Rollback mengganti image aplikasi ke versi sebelumnya, tetapi tidak menurunkan
schema database secara destruktif. Karena itu migration rilis harus additive dan
backward-aware.

Versi mayor PostgreSQL dipatok, sedangkan patch keamanannya diambil ketika image
dibangun ulang. Nginx dan cloudflared memakai rilis stabil tertentu. Tinjau dan
uji pembaruan ketiganya secara berkala; jangan melakukan upgrade mayor database
tanpa backup serta uji restore.

### Restore database

Restore mengganti database aktif. Jalankan hanya saat insiden dan setelah semua
user berhenti bekerja:

```bash
bash deployment/scripts/restore.sh latest
```

Script membuat backup pengaman, meminta kata konfirmasi `RESTORE`, menghentikan
akses aplikasi, memulihkan snapshot, menjalankan migration, lalu memeriksa
kesehatan aplikasi. Jika restore gagal, aplikasi sengaja tetap tidak dianggap
sehat sampai administrator memeriksa database dan log.

## 8. Printer thermal 80 mm

Pencetakan dilakukan oleh browser pada PC kasir, bukan oleh VPS. Pasang driver
printer, pilih ukuran kertas 80 mm, nonaktifkan header/footer bawaan browser,
dan jadikan printer thermal sebagai default.

Dialog print normal adalah opsi paling aman. Jika toko ingin satu klik langsung
mencetak ke printer default, jalankan Chrome/Edge khusus kasir menggunakan mode
`--kiosk-printing`. Mode tersebut harus hanya dipakai pada profil/browser kasir
karena seluruh print dari profil itu tidak meminta konfirmasi lagi. HP tetap
dapat memakai aplikasi, tetapi bukan target utama pencetakan USB.

## 9. Checklist sebelum go-live

- CI, lint, test, dan build hijau pada commit yang akan dirilis.
- Semua image menggunakan tag versi tetap.
- HTTPS aktif dan HTTP dialihkan oleh Cloudflare.
- Database tidak memiliki port publik.
- `.env`, token, password, dan file backup tidak ada di Git.
- Password administrator awal sudah diganti.
- Permission setiap role sudah diuji dengan akun non-owner.
- Backup harian terlihat di Backblaze B2 dan restore terisolasi sudah diuji.
- Waktu server, jam backup, format struk 80 mm, dan printer default sudah diuji.
- Login, logout, transaksi, pembayaran, FIFO, serta audit log diuji pada alamat
  produksi sebelum data nyata dimasukkan.

## Batas tanggung jawab

Konfigurasi repository menyiapkan aplikasi untuk deployment yang dapat diulang,
tetapi server belum benar-benar online sampai domain, VPS, Tunnel, B2, dan secret
diisi. Kondisi produksi juga perlu dipantau dan diperbarui secara berkala.
