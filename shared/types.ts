// Tipos compartilhados entre servidor e painel.

export type ProductStatus = 'candidata' | 'rascunho' | 'publicado' | 'esgotado' | 'rejeitada';
export type CampaignStatus = 'rascunho' | 'pausada' | 'ativa' | 'encerrada';
export type OrderStatus = 'recebido' | 'enviado_fornecedor' | 'em_transito' | 'entregue' | 'erro';

export interface Listing {
  title: string;
  descriptionHtml: string;
  bullets: string[];
}

export interface Product {
  id: string;
  source: 'cj' | 'demo';
  sourceId: string;
  sourceVid?: string;
  name: string;
  category: string;
  images: string[];
  costBRL: number;
  shippingBRL: number;
  priceBRL: number;
  marginPercent: number;
  breakEvenRoas: number;
  stock: number;
  score: number;
  reason: string;
  status: ProductStatus;
  storeProductId?: string;
  storeVariantId?: string;
  storeUrl?: string;
  listing?: Listing;
  createdAt: string;
  updatedAt: string;
}

export interface AdCopy {
  primaryText: string;
  headline: string;
  callToAction: string;
  audience: { ageMin: number; ageMax: number; interests: string[] };
}

export interface Campaign {
  id: string;
  productId: string;
  productName: string;
  platform: 'meta' | 'demo';
  externalIds: { campaignId?: string; adSetId?: string; creativeId?: string; adId?: string };
  status: CampaignStatus;
  dailyBudgetBRL: number;
  spendBRL: number;
  revenueBRL: number;
  roas: number;
  clicks: number;
  impressions: number;
  purchases: number;
  copy: AdCopy;
  lastSyncAt?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  storeOrderId: string;
  number: string;
  customerName: string;
  customerEmail: string;
  totalBRL: number;
  items: { productId?: string; storeVariantId?: string; name: string; qty: number }[];
  shipping: {
    name: string; address1: string; address2?: string; city: string;
    province: string; zip: string; countryCode: string; phone?: string;
  };
  status: OrderStatus;
  supplierOrderId?: string;
  tracking?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventLog {
  id: string;
  at: string;
  level: 'info' | 'warn' | 'error';
  scope: string;
  message: string;
}

export interface RuntimeSettings {
  autopilotEnabled: boolean;
  keywords: string[];
}

export interface Stats {
  revenueBRL: number;
  estimatedProfitBRL: number;
  adSpendBRL: number;
  roas: number;
  orders: number;
  productsPublished: number;
  productsCandidate: number;
  activeCampaigns: number;
  ordersWithError: number;
}

export interface IntegrationStatus {
  id: string;
  label: string;
  configured: boolean;
  detail: string;
  env: string[];
}

export interface StatusResponse {
  demoMode: boolean;
  autopilotEnabled: boolean;
  cycleRunning: boolean;
  lastCycleAt?: string;
  integrations: IntegrationStatus[];
  guardrails: Record<string, number | boolean | string>;
  keywords: string[];
}
