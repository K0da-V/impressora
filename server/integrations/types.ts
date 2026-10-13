import type { Listing, AdCopy } from '../../shared/types.ts';

export interface SupplierCandidate {
  sourceId: string;
  name: string;
  category: string;
  image: string;
  costUsd: number;
  stock: number;
  popularity: number;
}

export interface SupplierDetail extends SupplierCandidate {
  vid?: string;
  images: string[];
  description: string;
}

export interface SupplierOrderInput {
  orderNumber: string;
  customerName: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  countryCode: string;
  lines: { vid: string; quantity: number }[];
}

export interface SupplierProvider {
  readonly name: string;
  readonly isDemo: boolean;
  search(keyword: string, page?: number, size?: number): Promise<SupplierCandidate[]>;
  detail(sourceId: string): Promise<SupplierDetail>;
  stock(vid: string, sourceId?: string): Promise<number>;
  shippingUsd(vid: string, countryCode: string, quantity?: number): Promise<number | null>;
  createOrder(input: SupplierOrderInput): Promise<{ supplierOrderId: string }>;
  payOrder(supplierOrderId: string): Promise<void>;
  orderStatus(supplierOrderId: string): Promise<{ status: 'processando' | 'em_transito' | 'entregue' | 'erro'; tracking?: string }>;
}

export interface StorePublishInput {
  title: string;
  descriptionHtml: string;
  images: string[];
  priceBRL: number;
  sku: string;
  vendor: string;
  category: string;
  publish: boolean;
}

export interface StoreProvider {
  readonly name: string;
  readonly isDemo: boolean;
  /** URL pública da loja, usada nos anúncios. */
  publicUrl(): string;
  publishProduct(input: StorePublishInput): Promise<{ storeProductId: string; storeVariantId: string; url: string }>;
  setPublished(storeProductId: string, published: boolean): Promise<void>;
  setPrice(storeProductId: string, storeVariantId: string, priceBRL: number): Promise<void>;
}

export interface AdCampaignInput {
  name: string;
  productUrl: string;
  imageUrl: string;
  copy: AdCopy;
  dailyBudgetBRL: number;
  active: boolean;
}

export interface AdInsights {
  spendBRL: number;
  revenueBRL: number;
  clicks: number;
  impressions: number;
  purchases: number;
}

export interface AdsProvider {
  readonly name: 'meta' | 'demo';
  readonly isDemo: boolean;
  createCampaign(input: AdCampaignInput): Promise<{ campaignId: string; adSetId: string; creativeId: string; adId: string }>;
  setActive(ids: { campaignId?: string; adSetId?: string; adId?: string }, active: boolean): Promise<void>;
  setBudget(adSetId: string, dailyBudgetBRL: number): Promise<void>;
  insights(campaignId: string): Promise<AdInsights>;
}

export interface ContentGenerator {
  listing(p: { name: string; category: string; description: string; priceBRL: number }): Promise<Listing>;
  adCopy(p: { name: string; category: string; description: string; priceBRL: number }): Promise<AdCopy>;
  reviewProduct(p: { name: string; category: string; description: string }): Promise<{ ok: boolean; reason: string; fitScore: number }>;
}
