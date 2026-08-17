import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Usage:
 *   @RequirePermissions('products.create')
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 *   create(...) { ... }
 *
 * Matches PHASE 5 granular permission keys, e.g.:
 * products.view, stock.adjust, sales.approve, finance.approve, ai.use ...
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
