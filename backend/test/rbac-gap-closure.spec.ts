import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { CustomersController } from '../src/customers/customers.controller';
import { StockController } from '../src/stock/stock.controller';
import { PERMISSIONS_KEY } from '../src/common/decorators/permissions.decorator';

/**
 * Regression tests for the two RBAC gaps identified in
 * docs/FULL-SYSTEM-AUDIT.md §4. These read the actual decorator metadata
 * NestJS attaches to each controller method — the same metadata
 * PermissionsGuard reads at request time — so a passing test here is a
 * real guarantee the endpoint is protected, not just that the code compiles.
 */
function permissionsOn(target: any, methodName: string): string[] | undefined {
  return Reflect.getMetadata(PERMISSIONS_KEY, target[methodName]);
}

describe('RBAC gap closure (audit §4)', () => {
  describe('CustomersController — previously had no permission checks at all', () => {
    const proto = CustomersController.prototype;

    it('requires customers.view to list customers', () => {
      expect(permissionsOn(proto, 'list')).toEqual(['customers.view']);
    });

    it('requires customers.view to read a single customer', () => {
      expect(permissionsOn(proto, 'findOne')).toEqual(['customers.view']);
    });

    it('requires customers.manage to create a customer', () => {
      expect(permissionsOn(proto, 'create')).toEqual(['customers.manage']);
    });
  });

  describe('StockController — location-creation endpoints previously only required stock.view', () => {
    const proto = StockController.prototype;

    it('requires the stronger stock.manage_locations permission to create a warehouse', () => {
      expect(permissionsOn(proto, 'createWarehouse')).toEqual(['stock.manage_locations']);
    });

    it('requires stock.manage_locations for the full zone/rack/shelf/bin hierarchy', () => {
      expect(permissionsOn(proto, 'createZone')).toEqual(['stock.manage_locations']);
      expect(permissionsOn(proto, 'createRack')).toEqual(['stock.manage_locations']);
      expect(permissionsOn(proto, 'createShelf')).toEqual(['stock.manage_locations']);
      expect(permissionsOn(proto, 'createBin')).toEqual(['stock.manage_locations']);
    });

    it('still allows plain stock.view for read-only endpoints (unchanged behavior)', () => {
      expect(permissionsOn(proto, 'listWarehouses')).toEqual(['stock.view']);
      expect(permissionsOn(proto, 'getSummary')).toEqual(['stock.view']);
    });

    it('leaves movement recording gated by stock.view at the route level (fine-grained check happens inside the service)', () => {
      expect(permissionsOn(proto, 'recordMovement')).toEqual(['stock.view']);
    });
  });
});
