import { config } from '../config.ts';
import { http } from '../util.ts';
import type { StoreProvider, StorePublishInput } from './types.ts';

/** WooCommerce REST API v3 (Autenticação básica com consumer key/secret; use HTTPS). */
export class WooStore implements StoreProvider {
  readonly name = 'WooCommerce';
  readonly isDemo = false;

  private headers() {
    const { key, secret } = config.store.woo;
    return {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
    };
  }
  private api(path: string) { return `${config.store.woo.url}/wp-json/wc/v3${path}`; }
  publicUrl() { return config.store.publicUrl || config.store.woo.url; }

  async publishProduct(i: StorePublishInput) {
    const p = await http<any>(this.api('/products'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: i.title,
        type: 'simple',
        status: i.publish ? 'publish' : 'draft',
        regular_price: i.priceBRL.toFixed(2),
        description: i.descriptionHtml,
        sku: i.sku,
        manage_stock: false,
        images: i.images.slice(0, 6).map((src) => ({ src })),
      }),
    });
    return { storeProductId: String(p.id), storeVariantId: String(p.id), url: p.permalink as string };
  }

  async setPublished(storeProductId: string, published: boolean) {
    await http(this.api(`/products/${storeProductId}`), {
      method: 'PUT', headers: this.headers(), body: JSON.stringify({ status: published ? 'publish' : 'draft' }),
    });
  }

  async setPrice(storeProductId: string, _variantId: string, priceBRL: number) {
    await http(this.api(`/products/${storeProductId}`), {
      method: 'PUT', headers: this.headers(), body: JSON.stringify({ regular_price: priceBRL.toFixed(2) }),
    });
  }
}
