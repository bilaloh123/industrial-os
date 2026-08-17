import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Must run AFTER JwtAuthGuard (relies on req.user.permissions from the JWT).
 * SUPER_ADMIN always passes. Everyone else needs every listed permission.
 * This enforces PHASE 5: "الصلاحيات يجب أن تطبق في Backend" — never trust
 * the frontend to hide a button as the only line of defense.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('غير مصرح');

    if (user.roles?.includes('SUPER_ADMIN')) return true;

    const granted: string[] = user.permissions ?? [];
    const hasAll = required.every((p) => granted.includes(p));
    if (!hasAll) {
      throw new ForbiddenException('ليس لديك الصلاحية للقيام بهذا الإجراء');
    }
    return true;
  }
}
