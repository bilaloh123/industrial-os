import { getCached, setCached, enqueue } from './offline/db';
import { registerAccessTokenGetter, syncOutbox } from './offline/sync';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
registerAccessTokenGetter(() => accessToken);

/** True network failure (offline, DNS, timeout) — as opposed to a valid
 * HTTP error response from a reachable server. Only this kind of failure
 * should trigger cache fallback / offline queueing (PHASE 53). */
function isNetworkError(err: unknown) {
  return err instanceof TypeError; // fetch() rejects with TypeError on network failure
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include', // send the httpOnly refresh cookie
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && path !== '/api/auth/refresh') {
    // try a silent refresh once, then retry the original request
    const refreshed = await request('/api/auth/refresh', { method: 'POST' }).catch(() => null);
    if (refreshed?.accessToken) {
      setAccessToken(refreshed.accessToken);
      return request(path, options);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // NestJS exceptions thrown with an object payload (e.g. ForbiddenException
    // with { message, belowMinMargin }) arrive as body.message being that object.
    const nested = typeof body.message === 'object' && body.message !== null ? body.message : null;
    const err: any = new Error(nested?.message ?? (typeof body.message === 'string' ? body.message : `طلب فشل: ${res.status}`));
    if (nested?.belowMinMargin) err.belowMinMargin = nested.belowMinMargin;
    throw err;
  }
  return res.json();
}

/**
 * GET wrapper with offline fallback (PHASE 53): on a real network failure,
 * serve the last-known-good response from IndexedDB instead of a blank
 * screen. Every successful online read refreshes the cache silently.
 */
async function cachedRequest(path: string): Promise<any> {
  try {
    const data = await request(path);
    setCached(path, data); // fire-and-forget
    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await getCached(path);
      if (cached) {
        const withMeta = Array.isArray(cached.value)
          ? cached.value
          : { ...(cached.value as object) };
        (withMeta as any).__offlineCachedAt = cached.cachedAt;
        return withMeta;
      }
    }
    throw err;
  }
}

/**
 * Mutation wrapper with offline queueing (PHASE 53): if the device is
 * offline (or the request fails on a real network error), the action is
 * queued locally and synced automatically once connectivity returns —
 * instead of failing the warehouse operation outright.
 */
async function queueableRequest(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  description: string,
): Promise<any> {
  const offlineNow = typeof navigator !== 'undefined' && !navigator.onLine;
  if (!offlineNow) {
    try {
      return await request(path, { method, body: JSON.stringify(body) });
    } catch (err) {
      if (!isNetworkError(err)) throw err; // real server error (e.g. validation) — don't hide it
      // fall through to queueing below
    }
  }
  const entry = await enqueue({ method, path, body, description });
  return { queued: true, offlineEntryId: entry.id };
}

export const api = {
  login: (email: string, password: string) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  registerCompany: (payload: {
    companyName: string; email: string; password: string; firstName: string; lastName: string;
  }) => request('/api/auth/register-company', { method: 'POST', body: JSON.stringify(payload) }),

  // MFA (PHASE 4 "MFA-ready")
  verifyMfaLogin: (mfaToken: string, code: string) =>
    request('/api/auth/mfa/verify-login', { method: 'POST', body: JSON.stringify({ mfaToken, code }) }),
  setupMfa: () => request('/api/auth/mfa/setup', { method: 'POST' }),
  enableMfa: (code: string) => request('/api/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
  disableMfa: (password: string, code: string) =>
    request('/api/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password, code }) }),

  // Company settings (PHASE 8)
  getMyCompany: () => request('/api/companies/me'),
  updateMyCompany: (payload: Record<string, any>) =>
    request('/api/companies/me', { method: 'PATCH', body: JSON.stringify(payload) }),

  // Users (PHASE 4)
  listUsers: () => request('/api/users'),
  inviteUser: (payload: { email: string; firstName: string; lastName: string; tempPassword: string; roleIds: string[] }) =>
    request('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  setUserActive: (id: string, isActive: boolean) =>
    request(`/api/users/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  deleteUser: (id: string) => request(`/api/users/${id}/delete`, { method: 'PATCH' }),

  // Roles / RBAC (PHASE 5)
  listRoles: () => request('/api/roles'),
  listPermissionsCatalogue: () => request('/api/roles/permissions/catalogue'),
  createRole: (payload: { name: string; description?: string }) =>
    request('/api/roles', { method: 'POST', body: JSON.stringify(payload) }),
  setRolePermissions: (roleId: string, permissionKeys: string[]) =>
    request(`/api/roles/${roleId}/permissions`, { method: 'POST', body: JSON.stringify({ permissionKeys }) }),
  assignRole: (roleId: string, userId: string) =>
    request(`/api/roles/${roleId}/assign/${userId}`, { method: 'POST' }),

  // Products (PHASE 9-11)
  listProducts: () => cachedRequest('/api/products'),
  searchProducts: (q: string) => request(`/api/products/search?q=${encodeURIComponent(q)}`),
  createProduct: (payload: Record<string, any>) =>
    request('/api/products', { method: 'POST', body: JSON.stringify(payload) }),
  archiveProduct: (id: string) => request(`/api/products/${id}/archive`, { method: 'PATCH' }),
  listCategories: () => request('/api/products/categories'),
  createCategory: (payload: { name: string; parentId?: string }) =>
    request('/api/products/categories', { method: 'POST', body: JSON.stringify(payload) }),
  listBrands: () => request('/api/products/brands'),
  createBrand: (payload: { name: string }) =>
    request('/api/products/brands', { method: 'POST', body: JSON.stringify(payload) }),
  listAttributeDefinitions: (categoryId?: string) =>
    request(`/api/products/attributes${categoryId ? `?categoryId=${categoryId}` : ''}`),
  createAttributeDefinition: (payload: { categoryId?: string; key: string; label: string; type?: 'STRING' | 'NUMBER' | 'ENUM'; unit?: string }) =>
    request('/api/products/attributes', { method: 'POST', body: JSON.stringify(payload) }),
  listVariants: (productId: string) => request(`/api/products/${productId}/variants`),
  createVariant: (productId: string, payload: { sku: string; sellingPrice?: number; purchaseCost?: number; attributeValues?: { attributeDefinitionId: string; value: string }[] }) =>
    request(`/api/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(payload) }),
  archiveVariant: (productId: string, variantId: string) =>
    request(`/api/products/${productId}/variants/${variantId}/archive`, { method: 'PATCH' }),

  // Stock / Inventory (PHASE 18-20)
  listWarehouses: () => cachedRequest('/api/stock/warehouses'),
  createWarehouse: (payload: { name: string; code: string; address?: string }) =>
    request('/api/stock/warehouses', { method: 'POST', body: JSON.stringify(payload) }),
  getStockSummary: () => cachedRequest('/api/stock/summary'),
  getVariantStockSummary: (productId: string) => request(`/api/stock/summary/variants/${productId}`),
  listMovements: (filters?: { productId?: string; warehouseId?: string }) => {
    const params = new URLSearchParams(filters as Record<string, string>).toString();
    return request(`/api/stock/movements${params ? `?${params}` : ''}`);
  },
  // PHASE 53 — warehouse-floor operations must survive poor/no connectivity:
  // recording a movement while offline queues it locally instead of failing,
  // and it's replayed automatically once the connection returns.
  recordMovement: (payload: {
    productId: string; warehouseId: string; binId?: string; type: string;
    quantity: number; reason?: string; referenceDocument?: string;
  }) => queueableRequest(
    '/api/stock/movements', 'POST', payload,
    `حركة مخزون: ${payload.type} — ${payload.quantity > 0 ? '+' : ''}${payload.quantity}`,
  ),

  // Customers (PHASE 13)
  listCustomers: () => request('/api/customers'),
  createCustomer: (payload: { name: string; ice?: string; address?: string; phone?: string; email?: string }) =>
    request('/api/customers', { method: 'POST', body: JSON.stringify(payload) }),

  // Sales (PHASE 24/26)
  listSalesOrders: () => request('/api/sales/orders'),
  getSalesOrder: (id: string) => request(`/api/sales/orders/${id}`),
  createSalesOrder: (payload: {
    customerId: string; notes?: string; marginOverrideReason?: string;
    items: { productId: string; variantId?: string; quantity: number; unitPrice: number; discountPercent?: number }[];
  }) => request('/api/sales/orders', { method: 'POST', body: JSON.stringify(payload) }),
  confirmSalesOrder: (id: string) => request(`/api/sales/orders/${id}/confirm`, { method: 'POST' }),
  advanceSalesOrder: (id: string, status: string) => request(`/api/sales/orders/${id}/advance/${status}`, { method: 'POST' }),
  cancelSalesOrder: (id: string) => request(`/api/sales/orders/${id}/cancel`, { method: 'POST' }),
  deliverSalesOrder: (id: string, warehouseId: string) =>
    request(`/api/sales/orders/${id}/deliver`, { method: 'POST', body: JSON.stringify({ warehouseId }) }),
  invoiceSalesOrder: (id: string) => request(`/api/sales/orders/${id}/invoice`, { method: 'POST' }),

  // Suppliers (PHASE 12)
  listSuppliers: () => request('/api/suppliers'),
  createSupplier: (payload: { name: string; country?: string; currency?: string; paymentTerms?: string; leadTimeDays?: number }) =>
    request('/api/suppliers', { method: 'POST', body: JSON.stringify(payload) }),
  addSupplierOffer: (supplierId: string, payload: { productId: string; unitCost: number; currency?: string; leadTimeDays?: number; notes?: string }) =>
    request(`/api/suppliers/${supplierId}/offers`, { method: 'POST', body: JSON.stringify(payload) }),
  compareSuppliersForProduct: (productId: string) => request(`/api/suppliers/comparison?productId=${productId}`),

  // Purchases (PHASE 14)
  listPurchaseOrders: () => request('/api/purchases/orders'),
  createPurchaseOrder: (payload: {
    supplierId: string; currency?: string; notes?: string;
    items: { productId: string; variantId?: string; quantityOrdered: number; unitCost: number }[];
  }) => request('/api/purchases/orders', { method: 'POST', body: JSON.stringify(payload) }),
  confirmPurchaseOrder: (id: string) => request(`/api/purchases/orders/${id}/confirm`, { method: 'POST' }),
  cancelPurchaseOrder: (id: string) => request(`/api/purchases/orders/${id}/cancel`, { method: 'POST' }),
  receivePurchaseOrder: (id: string, warehouseId: string, lines: { itemId: string; quantity: number }[]) =>
    request(`/api/purchases/orders/${id}/receive`, { method: 'POST', body: JSON.stringify({ warehouseId, lines }) }),

  // Finance (PHASE 34/37)
  listInvoices: () => request('/api/finance/invoices'),
  getFinanceSummary: () => request('/api/finance/summary'),
  recordPayment: (invoiceId: string, amount: number, method?: string) =>
    request(`/api/finance/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify({ amount, method }) }),

  // Supplier Bills (Payables)
  listBills: () => request('/api/finance/bills'),
  recordSupplierPayment: (billId: string, amount: number, method?: string) =>
    request(`/api/finance/bills/${billId}/payments`, { method: 'POST', body: JSON.stringify({ amount, method }) }),

  // Imports + True Landed Cost (PHASE 16/17)
  listImports: () => request('/api/imports'),
  getImport: (id: string) => request(`/api/imports/${id}`),
  createImport: (payload: { purchaseOrderId: string; countryOfOrigin?: string; portOfDeparture?: string; portOfArrival?: string; carrier?: string; incoterm?: string }) =>
    request('/api/imports', { method: 'POST', body: JSON.stringify(payload) }),
  addImportExpense: (importId: string, payload: { type: string; amount: number; currency?: string; notes?: string }) =>
    request(`/api/imports/${importId}/expenses`, { method: 'POST', body: JSON.stringify(payload) }),
  getLandedCost: (importId: string) => request(`/api/imports/${importId}/landed-cost`),
  advanceImport: (importId: string, status: string) => request(`/api/imports/${importId}/advance/${status}`, { method: 'POST' }),
  closeImport: (importId: string) => request(`/api/imports/${importId}/close`, { method: 'POST' }),

  // Delivery & Drivers
  listDrivers: () => request('/api/drivers'),
  createDriver: (payload: { name: string; phone?: string; vehicleInfo?: string }) =>
    request('/api/drivers', { method: 'POST', body: JSON.stringify(payload) }),
  setDriverActive: (id: string, isActive: boolean) =>
    request(`/api/drivers/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  listDeliveries: () => request('/api/deliveries'),
  createDelivery: (payload: { salesOrderId: string; warehouseId: string; address?: string; scheduledDate?: string; notes?: string }) =>
    request('/api/deliveries', { method: 'POST', body: JSON.stringify(payload) }),
  assignDriverToDelivery: (deliveryId: string, driverId: string) =>
    request(`/api/deliveries/${deliveryId}/assign-driver`, { method: 'POST', body: JSON.stringify({ driverId }) }),
  startDeliveryTransit: (deliveryId: string) => request(`/api/deliveries/${deliveryId}/start-transit`, { method: 'POST' }),
  completeDelivery: (deliveryId: string, recipientName: string, notes?: string) =>
    request(`/api/deliveries/${deliveryId}/complete`, { method: 'POST', body: JSON.stringify({ recipientName, notes }) }),
  failDelivery: (deliveryId: string, reason: string) =>
    request(`/api/deliveries/${deliveryId}/fail`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Documents (PHASE 47) — real downloadable PDF files
  downloadInvoicePdf: (invoiceId: string) => downloadPdf(`/api/documents/invoices/${invoiceId}/pdf`, `facture-${invoiceId}.pdf`),
  downloadPurchaseOrderPdf: (poId: string) => downloadPdf(`/api/documents/purchase-orders/${poId}/pdf`, `bon-commande-${poId}.pdf`),

  // Excel Import/Export (PHASE 48)
  exportProductsExcel: () => downloadBlob('/api/excel/products/export', 'produits.xlsx'),
  exportStockExcel: () => downloadBlob('/api/excel/stock/export', 'stock.xlsx'),
  exportSalesExcel: () => downloadBlob('/api/excel/sales/export', 'ventes.xlsx'),
  exportPurchasesExcel: () => downloadBlob('/api/excel/purchases/export', 'achats.xlsx'),
  downloadImportTemplate: () => downloadBlob('/api/excel/products/import-template', 'modele-import-produits.xlsx'),
  importProductsExcel: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/api/excel/products/import`, {
      method: 'POST',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.message === 'string' ? body.message : `فشل الاستيراد (${res.status})`);
    }
    return res.json();
  },
};

async function downloadBlob(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.message === 'string' ? body.message : `تعذّر تحميل الملف (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Fetches a PDF (with auth) and triggers a browser download — used for
 * invoices/purchase orders since these are binary responses, not JSON. */
async function downloadPdf(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.message === 'string' ? body.message : `تعذّر تحميل الملف (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
