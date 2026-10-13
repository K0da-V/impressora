import { config } from '../config.ts';
import { http, sleep } from '../util.ts';
import type {
  SupplierProvider, SupplierCandidate, SupplierDetail, SupplierOrderInput,
} from './types.ts';

/**
 * CJ Dropshipping API 2.0 — https://developers.cjdropshipping.com/en/api/api2/
 * Autenticação: POST /authentication/getAccessToken { apiKey } -> accessToken (header CJ-Access-Token).
 * O endpoint de token tem limite de ~1 chamada/segundo, então o token é reaproveitado até expirar.
 */
export class CjSupplier implements SupplierProvider {
  readonly name = 'CJ Dropshipping';
  readonly isDemo = false;
  private token?: { value: string; expiresAt: number };
  private tokenPromise?: Promise<string>;

  private get base() { return config.cj.baseUrl.replace(/\/$/, ''); }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    if (this.tokenPromise) return this.tokenPromise;
    this.tokenPromise = (async () => {
      const res = await http<any>(`${this.base}/authentication/getAccessToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: config.cj.apiKey }),
      });
      const data = res?.data;
      if (!res?.result || !data?.accessToken) {
        throw new Error(`CJ recusou a autenticação: ${res?.message ?? 'resposta inesperada'}`);
      }
      const exp = data.accessTokenExpiryDate ? Date.parse(data.accessTokenExpiryDate) : NaN;
      this.token = { value: data.accessToken, expiresAt: Number.isFinite(exp) ? exp : Date.now() + 12 * 24 * 3600_000 };
      return this.token.value;
    })();
    try { return await this.tokenPromise; } finally { this.tokenPromise = undefined; }
  }

  private async call<T = any>(method: 'GET' | 'POST', path: string, opts: { query?: Record<string, string | number>; body?: unknown } = {}): Promise<T> {
    const token = await this.getToken();
    const qs = opts.query ? '?' + new URLSearchParams(Object.entries(opts.query).map(([k, v]) => [k, String(v)])).toString() : '';
    const res = await http<any>(`${this.base}${path}${qs}`, {
      method,
      headers: { 'CJ-Access-Token': token, 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    await sleep(350); // respeita o limite de requisições da CJ
    if (res && res.result === false) throw new Error(`CJ: ${res.message ?? 'erro'} (código ${res.code})`);
    return res as T;
  }

  /** CJ devolve preço como "1.5" ou faixa "1.5 -- 2.5"; usamos o maior valor (conservador). */
  private parsePrice(v: unknown): number {
    const nums = String(v ?? '').match(/[\d.]+/g)?.map(Number).filter(Number.isFinite) ?? [];
    return nums.length ? Math.max(...nums) : 0;
  }

  async search(keyword: string, page = 1, size = 20): Promise<SupplierCandidate[]> {
    const res = await this.call('GET', '/product/listV2', { query: { page, size, keyWord: keyword } });
    const d = res?.data;
    const raw: any[] = d?.content?.flatMap((c: any) => c?.productList ?? []) ?? d?.list ?? (Array.isArray(d) ? d : []);
    return raw
      .map((p): SupplierCandidate => ({
        sourceId: String(p.id ?? p.pid ?? ''),
        name: String(p.nameEn ?? p.productNameEn ?? p.name ?? ''),
        category: String(p.threeCategoryName ?? p.twoCategoryName ?? p.categoryName ?? p.oneCategoryName ?? 'Geral'),
        image: String(p.bigImage ?? p.productImage ?? ''),
        costUsd: this.parsePrice(p.nowPrice ?? p.sellPrice ?? p.discountPrice),
        stock: Number(p.warehouseInventoryNum ?? p.totalVerifiedInventory ?? p.inventory ?? 0) || 0,
        popularity: Number(p.listedNum ?? 0) || 0,
      }))
      .filter((p) => p.sourceId && p.name && p.costUsd > 0);
  }

  async detail(sourceId: string): Promise<SupplierDetail> {
    const res = await this.call('GET', '/product/query', { query: { pid: sourceId } });
    const p = res?.data;
    if (!p) throw new Error(`CJ: produto ${sourceId} não encontrado`);
    const variants: any[] = p.variants ?? [];
    const v = variants[0];
    const imgs: string[] = [];
    const rawImg = p.productImage ?? p.bigImage;
    if (typeof rawImg === 'string' && rawImg.startsWith('[')) {
      try { imgs.push(...JSON.parse(rawImg)); } catch { /* ignora */ }
    } else if (Array.isArray(rawImg)) imgs.push(...rawImg);
    else if (rawImg) imgs.push(String(rawImg));
    return {
      sourceId,
      name: String(p.productNameEn ?? p.nameEn ?? ''),
      category: String(p.categoryName ?? 'Geral'),
      image: imgs[0] ?? '',
      images: imgs.slice(0, 6),
      costUsd: this.parsePrice(v?.variantSellPrice ?? p.sellPrice),
      stock: 0,
      popularity: Number(p.listedNum ?? 0) || 0,
      vid: v?.vid ? String(v.vid) : undefined,
      description: String(p.description ?? p.productNameEn ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500),
    };
  }

  async stock(vid: string): Promise<number> {
    const res = await this.call('GET', '/product/stock/queryByVid', { query: { vid } });
    const arr: any[] = Array.isArray(res?.data) ? res.data : [];
    return arr.reduce((s, w) => s + (Number(w.totalInventoryNum ?? w.verifiedWarehouse ?? w.storageNum ?? 0) || 0), 0);
  }

  async shippingUsd(vid: string, countryCode: string, quantity = 1): Promise<number | null> {
    try {
      const res = await this.call('POST', '/logistic/freightCalculate', {
        body: { startCountryCode: 'CN', endCountryCode: countryCode, products: [{ quantity, vid }] },
      });
      const opts: any[] = Array.isArray(res?.data) ? res.data : [];
      const prices = opts.map((o) => Number(o.logisticPrice)).filter((n) => Number.isFinite(n) && n > 0);
      return prices.length ? Math.min(...prices) : null;
    } catch {
      return null;
    }
  }

  async createOrder(i: SupplierOrderInput): Promise<{ supplierOrderId: string }> {
    const res = await this.call('POST', '/shopping/order/createOrderV2', {
      body: {
        orderNumber: i.orderNumber.slice(0, 40),
        shippingCountryCode: i.countryCode,
        shippingCountry: i.countryCode === 'BR' ? 'Brazil' : i.countryCode,
        shippingProvince: i.province,
        shippingCity: i.city,
        shippingAddress: i.address1,
        shippingAddress2: i.address2 ?? '',
        shippingCustomerName: i.customerName,
        shippingZip: i.zip,
        shippingPhone: i.phone ?? '',
        fromCountryCode: 'CN',
        logisticName: '',
        products: i.lines.map((l) => ({ vid: l.vid, quantity: l.quantity })),
      },
    });
    const id = res?.data?.orderId ?? res?.data?.id ?? (typeof res?.data === 'string' ? res.data : undefined);
    if (!id) throw new Error('CJ não devolveu o ID do pedido');
    return { supplierOrderId: String(id) };
  }

  async payOrder(supplierOrderId: string): Promise<void> {
    await this.call('POST', '/shopping/pay/payBalance', { body: { orderId: supplierOrderId } });
  }

  async orderStatus(supplierOrderId: string) {
    const res = await this.call('GET', '/shopping/order/getOrderDetail', { query: { orderId: supplierOrderId } });
    const d = res?.data ?? {};
    const s = String(d.orderStatus ?? '').toUpperCase();
    const tracking = d.trackNumber ?? d.trackingNumber ?? undefined;
    if (s.includes('DELIVER') && !s.includes('UN')) return { status: 'entregue' as const, tracking };
    if (s.includes('SHIPPED') || s.includes('TRANSIT')) return { status: 'em_transito' as const, tracking };
    if (s.includes('CANCEL') || s.includes('ERROR')) return { status: 'erro' as const, tracking };
    return { status: 'processando' as const, tracking };
  }
}
