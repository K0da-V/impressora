import { config } from '../config.ts';
import { http } from '../util.ts';
import type { StoreProvider, StorePublishInput } from './types.ts';

/** Shopify Admin GraphQL API (escopos: write_products, read_products, read_orders, write_publications). */
export class ShopifyStore implements StoreProvider {
  readonly name = 'Shopify';
  readonly isDemo = false;
  private publicationId?: string;

  private get endpoint() {
    const s = config.store.shopify;
    return `https://${s.domain}/admin/api/${s.apiVersion}/graphql.json`;
  }

  publicUrl() {
    return config.store.publicUrl || `https://${config.store.shopify.domain}`;
  }

  private async gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await http<any>(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': config.store.shopify.token },
      body: JSON.stringify({ query, variables }),
    });
    if (res?.errors?.length) throw new Error(`Shopify: ${JSON.stringify(res.errors).slice(0, 300)}`);
    return res.data as T;
  }

  private throwUserErrors(errs?: { field?: string[]; message: string }[]) {
    if (errs?.length) throw new Error(`Shopify: ${errs.map((e) => e.message).join('; ')}`);
  }

  private async onlineStorePublicationId(): Promise<string | undefined> {
    if (this.publicationId) return this.publicationId;
    const d = await this.gql(`{ publications(first: 20) { nodes { id name } } }`);
    const pub = d.publications.nodes.find((p: any) => /online store|loja online/i.test(p.name));
    this.publicationId = pub?.id;
    return this.publicationId;
  }

  async publishProduct(i: StorePublishInput) {
    const created = await this.gql(
      `mutation($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
        productCreate(product: $product, media: $media) {
          product { id handle onlineStoreUrl variants(first: 1) { nodes { id } } }
          userErrors { field message }
        }
      }`,
      {
        product: {
          title: i.title,
          descriptionHtml: i.descriptionHtml,
          vendor: i.vendor,
          productType: i.category,
          status: i.publish ? 'ACTIVE' : 'DRAFT',
        },
        media: i.images.slice(0, 6).map((src) => ({ originalSource: src, mediaContentType: 'IMAGE', alt: i.title })),
      },
    );
    this.throwUserErrors(created.productCreate.userErrors);
    const product = created.productCreate.product;
    const variantId: string = product.variants.nodes[0].id;

    const upd = await this.gql(
      `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }`,
      {
        productId: product.id,
        variants: [{ id: variantId, price: i.priceBRL.toFixed(2), inventoryItem: { sku: i.sku, tracked: false } }],
      },
    );
    this.throwUserErrors(upd.productVariantsBulkUpdate.userErrors);

    if (i.publish) await this.publishToOnlineStore(product.id);
    return { storeProductId: product.id, storeVariantId: variantId, url: `${this.publicUrl()}/products/${product.handle}` };
  }

  private async publishToOnlineStore(productId: string) {
    const pubId = await this.onlineStorePublicationId();
    if (!pubId) return;
    const r = await this.gql(
      `mutation($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { message } }
      }`,
      { id: productId, input: [{ publicationId: pubId }] },
    );
    this.throwUserErrors(r.publishablePublish.userErrors);
  }

  async setPublished(storeProductId: string, published: boolean) {
    const r = await this.gql(
      `mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { userErrors { message } } }`,
      { product: { id: storeProductId, status: published ? 'ACTIVE' : 'DRAFT' } },
    );
    this.throwUserErrors(r.productUpdate.userErrors);
    if (published) await this.publishToOnlineStore(storeProductId);
  }

  async setPrice(storeProductId: string, storeVariantId: string, priceBRL: number) {
    const r = await this.gql(
      `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } }
      }`,
      { productId: storeProductId, variants: [{ id: storeVariantId, price: priceBRL.toFixed(2) }] },
    );
    this.throwUserErrors(r.productVariantsBulkUpdate.userErrors);
  }
}
