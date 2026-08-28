import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { validateEnvironment } from './config/environment.js';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './database/prisma.service.js';

// Import AuthModule yang baru saja kita buat
import { AuthModule } from './modules/system/auth.module.js';
import { UserModule } from './modules/system/user/user.module.js';
import { RolePermissionModule } from './modules/system/role-permission/role-permission.module.js';
import { SystemConfigurationModule } from './modules/system/system-configuration/system-configuration.module.js';

import { CustomerModule } from './modules/sales/customer/customer.module.js';
import { SupplierModule } from './modules/purchasing/supplier.module.js';
import { CategoryModule } from './modules/master-data/category/category.module.js';
import { UnitModule } from './modules/master-data/unit/unit.module.js';
import { ProductModule } from './modules/master-data/product/product.module.js';
import { BrandModule } from './modules/master-data/brand/brand.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { PurchasingModule } from './modules/purchasing/purchasing.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100, // Maksimal 100 request per menit per IP
      },
    ]),
    // Daftarkan AuthModule di sini
    AuthModule,
    UserModule,
    RolePermissionModule,
    SystemConfigurationModule,
    CustomerModule,
    SupplierModule,
    CategoryModule,
    UnitModule,
    BrandModule,
    ProductModule,
    PricingModule,
    PurchasingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
