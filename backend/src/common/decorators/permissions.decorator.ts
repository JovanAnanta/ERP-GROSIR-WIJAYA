import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '../authorization/permission-catalog.js';

export const PERMISSIONS_KEY = 'permissions';
// Decorator untuk menandai rute mana yang butuh permission apa
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
