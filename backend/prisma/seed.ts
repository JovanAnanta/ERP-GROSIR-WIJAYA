import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import * as bcrypt from 'bcrypt';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL wajib diatur sebelum menjalankan seed.');
}

const adapter = new PrismaPg({ connectionString: databaseUrl });

const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD wajib diatur sebelum menjalankan seed.',
    );
  }

  console.log('🌱 Memulai proses seeding database...');

  // 1. Buat Role Standar (SUPER_OWNER, OWNER, ADMIN)
  const superOwnerRole = await prisma.role.upsert({
    where: { roleCode: 'SUPER_OWNER' },
    update: {},
    create: {
      roleCode: 'SUPER_OWNER',
      roleName: 'Super Owner',
      isActive: true,
    },
  });

  await prisma.role.upsert({
    where: { roleCode: 'OWNER' },
    update: {},
    create: { roleCode: 'OWNER', roleName: 'Owner', isActive: true },
  });

  // Diubah: Langsung panggil tanpa menyimpan ke variabel adminRole yang tidak dipakai
  await prisma.role.upsert({
    where: { roleCode: 'ADMIN' },
    update: {},
    create: { roleCode: 'ADMIN', roleName: 'Admin', isActive: true },
  });

  // 2. Buat User Admin Pertama (Super Owner)
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  const user = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: passwordHash,
      fullName: 'Administrator ERP',
      roleId: superOwnerRole.roleId,
      isActive: true,
    },
  });

  // 3. Master Data Permission (FR-SYS-003)
  const permissions = [
    {
      code: 'DASHBOARD_VIEW',
      name: 'View Dashboard',
      module: 'DASHBOARD',
      action: 'VIEW',
    },
    {
      code: 'MASTER_VIEW',
      name: 'View Master Data',
      module: 'MASTER',
      action: 'VIEW',
    },
    {
      code: 'MASTER_CREATE',
      name: 'Create Master Data',
      module: 'MASTER',
      action: 'CREATE',
    },
    {
      code: 'MASTER_UPDATE',
      name: 'Update Master Data',
      module: 'MASTER',
      action: 'UPDATE',
    },
    { code: 'SALES_VIEW', name: 'View Sales', module: 'SALES', action: 'VIEW' },
    {
      code: 'SALES_CREATE',
      name: 'Create Sales',
      module: 'SALES',
      action: 'CREATE',
    },
    {
      code: 'SALES_APPROVE',
      name: 'Approve Sales',
      module: 'SALES',
      action: 'APPROVE',
    },
  ];

  console.log('⏳ Mengisi Master Data Permission...');
  for (const p of permissions) {
    await prisma.permission.upsert({
      where: { permissionCode: p.code },
      update: {},
      create: {
        permissionCode: p.code,
        permissionName: p.name,
        module: p.module,
        action: p.action,
        isActive: true,
      },
    });
  }

  console.log(
    `✅ Seeding selesai! User dibuat dengan username: ${user.username}`,
  );
}

main()
  .catch((e: unknown) => {
    const errorType = e instanceof Error ? e.constructor.name : typeof e;
    console.error(`❌ Proses seeding gagal (${errorType}).`);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
