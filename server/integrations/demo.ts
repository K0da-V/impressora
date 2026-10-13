import { uid, sleep } from '../util.ts';
import type {
  SupplierProvider, SupplierCandidate, SupplierDetail, SupplierOrderInput,
  StoreProvider, StorePublishInput, AdsProvider, AdCampaignInput, AdInsights,
} from './types.ts';

const CATALOG: (SupplierDetail & { vid: string })[] = [
  { sourceId: 'demo-1', vid: 'demo-v1', name: 'Smart Sleep Mask with Bluetooth Audio', category: 'Saúde & Bem-Estar', image: '/demo/mascara.jpg', images: ['/demo/mascara.jpg'], costUsd: 9.8, stock: 2840, popularity: 1420, description: 'Máscara de dormir blackout com fones Bluetooth integrados e bateria recarregável USB-C.' },
  { sourceId: 'demo-2', vid: 'demo-v2', name: 'Foldable 3-in-1 Magnetic Wireless Charger', category: 'Acessórios', image: '/demo/carregador.jpg', images: ['/demo/carregador.jpg'], costUsd: 8.1, stock: 3410, popularity: 2890, description: 'Base de carregamento magnética dobrável para celular, relógio e fones.' },
  { sourceId: 'demo-3', vid: 'demo-v3', name: 'Portable Electric Espresso Maker', category: 'Casa & Cozinha', image: '/demo/cafeteira.jpg', images: ['/demo/cafeteira.jpg'], costUsd: 21.5, stock: 890, popularity: 814, description: 'Cafeteira espresso portátil com bateria recarregável, ideal para viagem e escritório.' },
  { sourceId: 'demo-4', vid: 'demo-v4', name: 'Flexible LED Neck Reading Light', category: 'Casa & Escritório', image: '/demo/luminaria.jpg', images: ['/demo/luminaria.jpg'], costUsd: 4.2, stock: 4120, popularity: 3940, description: 'Luminária de pescoço flexível com 3 temperaturas de cor e bateria recarregável.' },
];

export class DemoSupplier implements SupplierProvider {
  readonly name = 'Fornecedor (demonstração)';
  readonly isDemo = true;
  private orders = new Map<string, number>();

  async search(keyword: string): Promise<SupplierCandidate[]> {
    await sleep(100);
    const k = keyword.toLowerCase();
    const hit = CATALOG.filter((p) => !k || p.name.toLowerCase().includes(k) || p.category.toLowerCase().includes(k));
    return (hit.length ? hit : CATALOG).map(({ vid, images, description, ...c }) => c);
  }
  async detail(sourceId: string): Promise<SupplierDetail> {
    const p = CATALOG.find((c) => c.sourceId === sourceId);
    if (!p) throw new Error(`Produto demo ${sourceId} não existe`);
    return { ...p };
  }
  async stock(_vid: string, sourceId?: string) {
    return CATALOG.find((c) => c.sourceId === sourceId)?.stock ?? 500;
  }
  async shippingUsd() { return 5; }
  async createOrder(i: SupplierOrderInput) {
    const id = uid('cjdemo');
    this.orders.set(id, Date.now());
    return { supplierOrderId: id };
  }
  async payOrder() { /* nada */ }
  async orderStatus(id: string) {
    const age = Date.now() - (this.orders.get(id) ?? 0);
    if (age > 120_000) return { status: 'entregue' as const, tracking: 'DEMO123456BR' };
    if (age > 30_000) return { status: 'em_transito' as const, tracking: 'DEMO123456BR' };
    return { status: 'processando' as const };
  }
}

export class DemoStore implements StoreProvider {
  readonly name = 'Loja (demonstração)';
  readonly isDemo = true;
  publicUrl() { return 'https://loja-demo.exemplo.com'; }
  async publishProduct(i: StorePublishInput) {
    const id = uid('shop');
    return { storeProductId: id, storeVariantId: `${id}-v`, url: `${this.publicUrl()}/products/${i.sku.toLowerCase()}` };
  }
  async setPublished() {}
  async setPrice() {}
}

export class DemoAds implements AdsProvider {
  readonly name = 'demo' as const;
  readonly isDemo = true;
  private spend = new Map<string, { spend: number; ticks: number; roasBias: number }>();

  async createCampaign(i: AdCampaignInput) {
    const id = uid('adsdemo');
    this.spend.set(id, { spend: 0, ticks: 0, roasBias: 0.6 + Math.random() * 3.2 });
    return { campaignId: id, adSetId: `${id}-s`, creativeId: `${id}-c`, adId: `${id}-a` };
  }
  async setActive() {}
  async setBudget() {}
  async insights(campaignId: string): Promise<AdInsights> {
    const s = this.spend.get(campaignId) ?? { spend: 0, ticks: 0, roasBias: 1.5 };
    s.ticks += 1;
    s.spend += 20 + Math.random() * 10;
    this.spend.set(campaignId, s);
    const revenue = s.spend * s.roasBias;
    return {
      spendBRL: Math.round(s.spend * 100) / 100,
      revenueBRL: Math.round(revenue * 100) / 100,
      clicks: Math.round(s.spend * 4),
      impressions: Math.round(s.spend * 120),
      purchases: Math.round(revenue / 120),
    };
  }
}
