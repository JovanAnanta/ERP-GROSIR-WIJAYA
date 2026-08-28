import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
// Decorator untuk menandai rute mana yang butuh permission apa
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
