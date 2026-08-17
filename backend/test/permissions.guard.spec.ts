import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';

function makeContext(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard (RBAC — backend enforcement, PHASE 5)', () => {
  it('allows the request through when the endpoint requires no permissions', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as any;
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(makeContext({ roles: [], permissions: [] }))).toBe(true);
  });

  it('always allows SUPER_ADMIN, regardless of the granted permission list', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['finance.approve']) } as any;
    const guard = new PermissionsGuard(reflector);
    expect(
      guard.canActivate(makeContext({ roles: ['SUPER_ADMIN'], permissions: [] })),
    ).toBe(true);
  });

  it('rejects a user missing the required permission (e.g. Warehouse Operator hitting a Finance endpoint)', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['finance.view']) } as any;
    const guard = new PermissionsGuard(reflector);
    const ctx = makeContext({ roles: ['WAREHOUSE_OPERATOR'], permissions: ['stock.view', 'stock.receive'] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows a user who holds every required permission', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['sales.view', 'sales.create']) } as any;
    const guard = new PermissionsGuard(reflector);
    const ctx = makeContext({ roles: ['SALES_REP'], permissions: ['sales.view', 'sales.create', 'products.view'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects when only some of several required permissions are held', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['sales.view', 'sales.approve']) } as any;
    const guard = new PermissionsGuard(reflector);
    const ctx = makeContext({ roles: ['SALES_REP'], permissions: ['sales.view'] }); // missing sales.approve
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects an unauthenticated request (no user on the request at all)', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['products.view']) } as any;
    const guard = new PermissionsGuard(reflector);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
