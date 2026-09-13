# ERP Grosir Wijaya

ERP internal untuk operasional grosir: master data, purchasing, sales, inventory, FIFO, pinjaman persediaan, pricing, piutang/hutang, finance, dashboard, permission, serta audit log.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: NestJS, Prisma, PostgreSQL
- Authentication: opaque database session melalui cookie HttpOnly
- Production: Docker Compose, Nginx, health/readiness check

## Development

Gunakan Node.js 22 atau lebih baru. Siapkan file environment dari contoh yang tersedia, jalankan PostgreSQL melalui `docker compose up -d`, lalu jalankan backend dan frontend dari folder masing-masing dengan `npm run start:dev` dan `npm run dev`.

Sebelum commit:

```text
backend:  npm run lint, npm test, npm run build
frontend: npm run lint, npm test, npm run build
```

## Production

Petunjuk deployment, HTTPS, migration, backup, dan konfigurasi printer tersedia di [DEPLOYMENT.md](DEPLOYMENT.md). Jangan commit file `.env`, password, atau backup database.

## Printer thermal

Struk menggunakan template 80 mm, logo hitam-putih, dan dialog cetak browser. Pencetakan langsung ke default printer pada PC kasir didukung melalui Chrome/Edge `--kiosk-printing` setelah driver dan ukuran kertas 80 mm dikonfigurasi.
