import http from 'node:http';
import { URL } from 'node:url';

/**
 * ============================================================================
 * TRACECASE PERSON 2 / STAGE 7: SHOPPING CART CONTROLLED TEST APPLICATION
 * ============================================================================
 * 
 * Second controlled application with a genuinely different interaction domain:
 * 1. Minimal E-Commerce shopping cart with product list, quantity modification, and subtotal calculation
 * 2. Deterministic Integer Currency (cents): eliminates floating-point rounding
 * 3. Exact Seeded Defect (Buggy Mode):
 *    - Changing quantity from 1 to 2 correctly stores quantity 2
 *    - Buggy subtotal calculation evaluates with quantity 1 ($120.00)
 *    - Fixed mode multiplies unitPrice * quantity ($240.00)
 * 4. Authenticated Scoped Reset Webhook (POST /api/test/reset-fixture)
 * 5. Authenticated Independent Readback Webhook (GET /api/test/readback)
 */

export interface Product {
  id: string;
  name: string;
  unitPriceCents: number; // Integer minor currency units
  category: string;
  stock: number;
}

export interface CartItem {
  productId: string;
  product: Product;
  quantity: number;
  subtotalCents: number;
}

export const CATALOG: Product[] = [
  {
    id: 'prod-keyboard',
    name: 'Mechanical Keyboard',
    unitPriceCents: 12000, // $120.00
    category: 'Hardware',
    stock: 10,
  },
  {
    id: 'prod-mouse',
    name: 'Ergonomic Mouse',
    unitPriceCents: 6000, // $60.00
    category: 'Hardware',
    stock: 15,
  },
  {
    id: 'prod-hub',
    name: 'USB-C Aluminum Hub',
    unitPriceCents: 3000, // $30.00
    category: 'Accessories',
    stock: 20,
  },
];

export class CartStore {
  private items = new Map<string, CartItem>();
  private bugMode: boolean;
  private buildVersion: string;

  constructor(bugMode: boolean = true, buildVersion?: string) {
    this.bugMode = bugMode;
    this.buildVersion = buildVersion || (bugMode ? 'cart-v1.0.0-buggy' : 'cart-v1.0.1-fixed');
    this.resetToBaseline();
  }

  public setBugMode(active: boolean) {
    this.bugMode = active;
    this.buildVersion = active ? 'cart-v1.0.0-buggy' : 'cart-v1.0.1-fixed';
    this.recalculateAll();
  }

  public isBugMode(): boolean {
    return this.bugMode;
  }

  public getBuildVersion(): string {
    return this.buildVersion;
  }

  public resetToBaseline(): void {
    this.items.clear();
    const keyboard = CATALOG[0];
    this.items.set(keyboard.id, {
      productId: keyboard.id,
      product: keyboard,
      quantity: 1,
      subtotalCents: keyboard.unitPriceCents,
    });
  }

  public getItems(): CartItem[] {
    return Array.from(this.items.values());
  }

  public getItem(productId: string): CartItem | undefined {
    return this.items.get(productId);
  }

  public updateQuantity(productId: string, quantity: number): CartItem {
    const product = CATALOG.find((p) => p.id === productId);
    if (!product) {
      throw new Error(`Product '${productId}' not found in catalog.`);
    }

    if (quantity <= 0) {
      this.items.delete(productId);
      return {
        productId,
        product,
        quantity: 0,
        subtotalCents: 0,
      };
    }

    // Seeded defect logic:
    // In buggy mode: changing quantity from 1 to 2 calculates subtotal using quantity 1!
    // In fixed mode: calculates unitPriceCents * quantity.
    let subtotalCents = 0;
    if (this.bugMode && quantity === 2) {
      // Deterministic calculation bug: subtotal still charges for 1 item
      subtotalCents = product.unitPriceCents * 1;
    } else {
      subtotalCents = product.unitPriceCents * quantity;
    }

    const item: CartItem = {
      productId,
      product,
      quantity,
      subtotalCents,
    };
    this.items.set(productId, item);
    return item;
  }

  public addItem(productId: string): CartItem {
    const existing = this.items.get(productId);
    const newQty = existing ? existing.quantity + 1 : 1;
    return this.updateQuantity(productId, newQty);
  }

  public removeItem(productId: string): void {
    this.items.delete(productId);
  }

  public getTotalCents(): number {
    let total = 0;
    for (const item of this.items.values()) {
      total += item.subtotalCents;
    }
    return total;
  }

  private recalculateAll(): void {
    for (const [id, item] of this.items.entries()) {
      this.updateQuantity(id, item.quantity);
    }
  }
}

export function formatCents(cents: number): string {
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars}`;
}

export function createCartServer(options?: {
  port?: number;
  bugMode?: boolean;
  buildVersion?: string;
  resetSecret?: string;
}) {
  const port = options?.port || Number(process.env.PORT || process.env.CART_PORT || 3007);
  const bugMode = options?.bugMode ?? (process.env.DEMO_TARGET_BUG_MODE !== 'false');
  const buildVersion = options?.buildVersion || (bugMode ? 'cart-v1.0.0-buggy' : 'cart-v1.0.1-fixed');
  // Privileged reset secret: Missing, empty, or whitespace configuration in production
  // disables privileged target operations (fails closed).
  const rawSecret = options?.resetSecret || process.env.CART_RESET_SECRET || process.env.TARGET_RESET_SECRET || process.env.DEMO_TARGET_RESET_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'tc-fixture-secret-2026');
  const resetSecret = typeof rawSecret === 'string' ? rawSecret.trim() : '';

  const store = new CartStore(bugMode, buildVersion);

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method || 'GET';

    const sendJson = (statusCode: number, data: unknown) => {
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-TraceCase-Reset-Auth',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      });
      res.end(JSON.stringify(data));
    };

    const readJson = async <T>(): Promise<T> => {
      return new Promise((resolve, reject) => {
        let b = '';
        req.on('data', (c) => (b += c));
        req.on('end', () => {
          try {
            resolve(b ? JSON.parse(b) : {});
          } catch (e) {
            reject(e);
          }
        });
        req.on('error', reject);
      });
    };

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-TraceCase-Reset-Auth',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      });
      res.end();
      return;
    }

    const verifyResetAuth = (): boolean => {
      if (!resetSecret || resetSecret.trim().length === 0) {
        return false;
      }
      const raw = req.headers['x-tracecase-reset-auth'] || req.headers['authorization'];
      if (!raw || typeof raw !== 'string') return false;
      const tok = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
      return tok.trim() === resetSecret;
    };

    // 1. WEB UI
    if (method === 'GET' && (pathname === '/' || pathname === '/cart' || pathname === '/index.html')) {
      const items = store.getItems();
      const totalCents = store.getTotalCents();

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Acme Hardware Store - Controlled Test Application</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f8fafc;
    color: #0f172a;
    line-height: 1.5;
    padding: 24px;
  }
  .container { max-width: 900px; margin: 0 auto; }
  header {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .title-group h1 { font-size: 1.3rem; font-weight: 700; color: #0f172a; }
  .title-group p { font-size: 0.8rem; color: #64748b; }
  .badge {
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }
  .badge-buggy { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
  .badge-fixed { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
  .main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .panel {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 20px;
  }
  h2 { font-size: 1.05rem; font-weight: 700; margin-bottom: 12px; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
  .product-card {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .btn {
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }
  .btn-primary { background: #2563eb; color: #ffffff; }
  .btn-primary:hover { background: #1d4ed8; }
  .btn-outline { background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; }
  .btn-outline:hover { background: #f1f5f9; }
  .cart-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .cart-table th { text-align: left; font-size: 0.75rem; color: #64748b; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
  .cart-table td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; vertical-align: middle; }
  .qty-controls { display: flex; align-items: center; gap: 6px; }
  .qty-btn { width: 26px; height: 26px; padding: 0; display: inline-flex; justify-content: center; align-items: center; border-radius: 4px; border: 1px solid #cbd5e1; background: #ffffff; font-weight: bold; cursor: pointer; }
  .qty-val { font-weight: 700; width: 20px; text-align: center; }
  .total-box { margin-top: 16px; border-top: 2px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 1.1rem; font-weight: 800; }
  .filter-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
  .filter-tab { padding: 4px 10px; border-radius: 4px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
  .filter-tab.active { background: #2563eb; color: #ffffff; border-color: #2563eb; }
  .search-input { width: 100%; padding: 6px 10px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 0.8rem; margin-bottom: 12px; box-sizing: border-box; }
  .technical-drawer { margin-top: 24px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; padding: 12px; font-size: 0.75rem; color: #475569; }
  .technical-drawer summary { font-weight: 700; cursor: pointer; color: #334155; user-select: none; }
  .technical-content { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .drawer-actions { display: flex; gap: 8px; margin-top: 8px; }
  .diagnostic-note { margin-top: 16px; font-size: 0.75rem; color: #64748b; background: #f1f5f9; padding: 8px 12px; border-radius: 4px; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="title-group">
      <h1>Acme Hardware Store</h1>
      <p>Controlled Testing Application &bull; Port ${port}</p>
    </div>
    <span id="target-build-badge" class="badge ${store.isBugMode() ? 'badge-buggy' : 'badge-fixed'}">${store.getBuildVersion()}</span>
  </header>

  <div class="main-grid">
    <div class="panel">
      <h2>Products Catalog</h2>
      <div class="filter-tabs" role="tablist" aria-label="Product categories">
        <button type="button" class="filter-tab active" data-category="all" role="tab" aria-selected="true">All Products</button>
        <button type="button" class="filter-tab" data-category="Hardware" role="tab" aria-selected="false">Hardware</button>
        <button type="button" class="filter-tab" data-category="Accessories" role="tab" aria-selected="false">Accessories</button>
      </div>
      <input type="number" min="0" id="catalog-search" class="search-input" placeholder="Search catalog..." aria-label="Search catalog items" />
      <div id="product-list">
        ${CATALOG.map((p) => `
          <div class="product-card" id="catalog-${p.id}" data-product-id="${p.id}" data-category="${p.category}" data-product-name="${p.name.toLowerCase()}">
            <div>
              <div style="font-weight: 700;">${p.name}</div>
              <div style="font-size: 0.8rem; color: #64748b;">${formatCents(p.unitPriceCents)} &bull; ${p.category}</div>
            </div>
            <button
              type="button"
              class="btn btn-outline"
              data-action="add-to-cart"
              data-product-id="${p.id}"
              aria-label="Add ${p.name} to cart"
            >
              Add to Cart
            </button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="panel">
      <h2>Your Cart</h2>
      <div id="cart-contents">
        ${items.length === 0 ? `
          <p id="empty-cart-msg" style="color: #64748b; font-size: 0.85rem; padding: 12px 0;">Your cart is currently empty.</p>
        ` : `
          <table class="cart-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Price</th>
                <th>Quantity</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => `
                <tr class="cart-row" id="cart-row-${item.productId}" data-cart-item-id="${item.productId}">
                  <td style="font-weight: 600;">${item.product.name}</td>
                  <td>${formatCents(item.product.unitPriceCents)}</td>
                  <td>
                    <div class="qty-controls">
                      <button
                        type="button"
                        class="qty-btn"
                        id="btn-decrease-${item.productId}"
                        data-action="decrease-quantity"
                        data-item-id="${item.productId}"
                        aria-label="Decrease quantity of ${item.product.name}"
                      >-</button>
                      <input
                        type="text"
                        readonly
                        class="qty-val"
                        id="qty-${item.productId}"
                        data-testid="item-quantity"
                        aria-label="${item.product.name} quantity"
                        value="${item.quantity}"
                        style="width: 32px; text-align: center; font-weight: bold; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px;"
                      />
                      <button
                        type="button"
                        class="qty-btn"
                        id="btn-increase-${item.productId}"
                        data-action="increase-quantity"
                        data-item-id="${item.productId}"
                        aria-label="Increase quantity of ${item.product.name}"
                      >+</button>
                    </div>
                  </td>
                  <td id="subtotal-${item.productId}" data-testid="item-subtotal" style="font-weight: 700; color: #0f172a;">
                    <span data-testid="subtotal" id="subtotal-val-${item.productId}">${formatCents(item.subtotalCents)}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="total-box">
            <span>Order Subtotal:</span>
            <span id="cart-total" data-testid="cart-total">${formatCents(totalCents)}</span>
          </div>
        `}
      </div>
      <details class="technical-drawer" id="technical-diagnostics-drawer">
        <summary>Technical Diagnostics & Fixture Controls</summary>
        <div class="technical-content">
          <div><strong>Current Build:</strong> <span id="drawer-build-version">${store.getBuildVersion()}</span> (${store.isBugMode() ? 'Buggy Mode Active' : 'Fixed Mode Active'})</div>
          <div><strong>Target Scope:</strong> <code>cart_baseline</code> &bull; Integer minor currency units (cents)</div>
          <div><strong>Active Items:</strong> ${items.length} items &bull; Total: ${formatCents(totalCents)}</div>
          <div class="drawer-actions">
            <button type="button" class="btn btn-outline" id="toggle-mode-btn" data-action="toggle-mode">Toggle Mode (${store.isBugMode() ? 'Switch to Fixed' : 'Switch to Buggy'})</button>
            <button type="button" class="btn btn-outline" id="reset-fixture-btn" data-action="reset-cart">Reset Fixture to Baseline</button>
          </div>
        </div>
      </details>
      <div class="diagnostic-note" style="display: none;">
        Deterministic Seeded Defect: In buggy mode, changing quantity from 1 to 2 keeps charging for 1 item ($120.00 subtotal). Fixed mode multiplies unit price by quantity ($240.00).
      </div>
    </div>
  </div>
</div>

<script>
  async function refreshCartDom() {
    try {
      const res = await fetch('/api/cart');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.items) return;
      for (const it of data.items) {
        const qtyEl = document.getElementById('qty-' + it.productId);
        if (qtyEl) {
          if ('value' in qtyEl) qtyEl.value = String(it.quantity);
          qtyEl.textContent = String(it.quantity);
        }
        const subSpan = document.getElementById('subtotal-val-' + it.productId);
        const subTd = document.getElementById('subtotal-' + it.productId);
        const formatted = '$' + (it.subtotalCents / 100).toFixed(2);
        if (subSpan) subSpan.textContent = formatted;
        if (subTd && !subSpan) subTd.textContent = formatted;
      }
      const totalEl = document.getElementById('cart-total');
      if (totalEl) totalEl.textContent = data.totalFormatted;
    } catch (e) {
      console.error('Failed to refresh cart DOM', e);
    }
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'increase-quantity') {
      const id = btn.getAttribute('data-item-id');
      const qtyEl = document.getElementById('qty-' + id);
      const currentQty = qtyEl ? parseInt(qtyEl.value || qtyEl.textContent || '1', 10) : 1;
      await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, quantity: currentQty + 1 })
      });
      await refreshCartDom();
    } else if (action === 'decrease-quantity') {
      const id = btn.getAttribute('data-item-id');
      const qtyEl = document.getElementById('qty-' + id);
      const currentQty = qtyEl ? parseInt(qtyEl.value || qtyEl.textContent || '1', 10) : 1;
      await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, quantity: Math.max(0, currentQty - 1) })
      });
      await refreshCartDom();
    } else if (action === 'add-to-cart') {
      const id = btn.getAttribute('data-product-id');
      await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, quantity: 1 })
      });
      await refreshCartDom();
    } else if (action === 'toggle-mode') {
      const isBuggy = ${store.isBugMode()};
      const secret = prompt('Enter Privileged Reset Secret to switch mode:') || '';
      if (!secret.trim()) {
        alert('Action canceled: Privileged secret required.');
        return;
      }
      const res = await fetch('/api/test/mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': secret.trim(),
        },
        body: JSON.stringify({ bugMode: !isBuggy })
      });
      if (!res.ok) {
        alert('Privileged authorization failed.');
        return;
      }
      window.location.reload();
      return;
    } else if (action === 'reset-cart') {
      const secret = prompt('Enter Privileged Reset Secret to restore baseline:') || '';
      if (!secret.trim()) {
        alert('Action canceled: Privileged secret required.');
        return;
      }
      const res = await fetch('/api/test/reset-fixture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TraceCase-Reset-Auth': secret.trim(),
        }
      });
      if (!res.ok) {
        alert('Privileged authorization failed.');
        return;
      }
      window.location.reload();
      return;
    }
  });

  let activeCategory = 'all';
  let searchQuery = '';

  function filterCatalog() {
    document.querySelectorAll('.product-card').forEach((card) => {
      const cat = card.getAttribute('data-category') || '';
      const name = card.getAttribute('data-product-name') || '';
      const matchCat = activeCategory === 'all' || cat.toLowerCase() === activeCategory.toLowerCase();
      const matchSearch = !searchQuery || name.includes(searchQuery.toLowerCase());
      card.style.display = matchCat && matchSearch ? 'flex' : 'none';
    });
  }

  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      activeCategory = tab.getAttribute('data-category') || 'all';
      filterCatalog();
    });
  });

  const searchInput = document.getElementById('catalog-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      filterCatalog();
    });
  }
</script>
</body>
</html>`;

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // 2. PUBLIC API: GET /api/cart
    if (method === 'GET' && pathname === '/api/cart') {
      sendJson(200, {
        buildVersion: store.getBuildVersion(),
        isBuggyMode: store.isBugMode(),
        items: store.getItems(),
        totalCents: store.getTotalCents(),
        totalFormatted: formatCents(store.getTotalCents()),
      });
      return;
    }

    // 3. PUBLIC API: POST /api/cart/items
    if (method === 'POST' && pathname === '/api/cart/items') {
      try {
        const body = await readJson<{ productId?: string; quantity?: number }>();
        if (!body.productId || typeof body.quantity !== 'number') {
          sendJson(400, { error: 'Missing productId or quantity' });
          return;
        }
        const updated = store.updateQuantity(body.productId, body.quantity);
        sendJson(200, {
          success: true,
          item: updated,
          totalCents: store.getTotalCents(),
          totalFormatted: formatCents(store.getTotalCents()),
        });
      } catch (err) {
        sendJson(500, { error: String(err) });
      }
      return;
    }

    // 4. PRIVILEGED RESET HOOK: POST /api/test/reset-fixture
    if (method === 'POST' && (pathname === '/api/test/reset-fixture' || pathname === '/api/cart/reset')) {
      if (!verifyResetAuth()) {
        sendJson(401, { error: 'Unauthorized: missing or invalid reset auth' });
        return;
      }
      store.resetToBaseline();
      sendJson(200, {
        isVerifiedRestored: true,
        fixtureScope: 'cart_baseline',
        restoredAt: new Date().toISOString(),
        buildVersion: store.getBuildVersion(),
        cartItemsCount: store.getItems().length,
        totalCents: store.getTotalCents(),
      });
      return;
    }

    // 5. PRIVILEGED READBACK HOOK: GET /api/test/readback
    if (method === 'GET' && (pathname === '/api/test/readback' || pathname === '/api/cart/baseline')) {
      if (!verifyResetAuth()) {
        sendJson(401, { error: 'Unauthorized: missing or invalid reset auth' });
        return;
      }
      sendJson(200, {

        fixtureScope: 'cart_baseline',
        buildVersion: store.getBuildVersion(),
        cartItemsCount: store.getItems().length,
        totalCents: store.getTotalCents(),
        items: store.getItems(),
      });
      return;
    }

    // 5b. PRIVILEGED MODE TOGGLE: POST /api/test/mode
    if (method === 'POST' && pathname === '/api/test/mode') {
      if (!verifyResetAuth()) {
        sendJson(401, { error: 'Unauthorized: missing or invalid reset auth' });
        return;
      }
      try {
        const body = await readJson<{ bugMode?: boolean }>();
        if (typeof body.bugMode === 'boolean') {
          store.setBugMode(body.bugMode);
        }
        sendJson(200, {
          success: true,
          bugMode: store.isBugMode(),
          buildVersion: store.getBuildVersion(),
        });
      } catch (err) {
        sendJson(500, { error: String(err) });
      }
      return;
    }

    // 6. HEALTH / BUILD INFO
    if (method === 'GET' && (pathname === '/api/health' || pathname === '/api/build-info')) {
      sendJson(200, {
        applicationName: 'TraceCase-Cart-Target',
        buildVersion: store.getBuildVersion(),
        port,
        isBugMode: store.isBugMode(),
        status: 'UP',
      });
      return;
    }

    // 404 fallback
    sendJson(404, { error: `Not found: ${method} ${pathname}` });
  });

  return { server, store, port };
}

// Start standalone server when executed directly via tsx or node .mjs bundle
if (
  require.main === module ||
  process.argv[1]?.endsWith('cart/server.ts') ||
  process.argv[1]?.endsWith('cart\\server.ts') ||
  process.argv[1]?.endsWith('cart/server.mjs') ||
  process.argv[1]?.endsWith('cart\\server.mjs')
) {
  const { server, port, store } = createCartServer();
  const bindHost = process.env.HOST || '0.0.0.0';
  server.listen(port, bindHost, () => {
    // eslint-disable-next-line no-console
    console.log(`[TraceCase Cart Target] Listening on http://${bindHost}:${port} (Build: ${store.getBuildVersion()})`);
  });
}
