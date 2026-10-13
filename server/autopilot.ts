import { config, hasAds, isDemoMode } from './config.ts';
import { db, log } from './db.ts';
import { priceFor, economics, isBlocked, usdToBrl } from './pricing.ts';
import { nowIso, uid, round2, today } from './util.ts';
import { fulfillOrder, refreshOrders } from './orders.ts';
import type { Providers } from './integrations/index.ts';
import type { ContentGenerator } from './integrations/types.ts';
import type { Product, Campaign } from '../shared/types.ts';

const R = () => config.rules;

export class Autopilot {
  running = false;
  private timer?: NodeJS.Timeout;

  constructor(public p: Providers, public ai: ContentGenerator) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (db.settings.autopilotEnabled) void this.runCycle();
    }, R().intervalMin * 60_000);
    if (db.settings.autopilotEnabled) setTimeout(() => void this.runCycle(), 10_000);
  }

  // ---------- Ciclo completo ----------
  async runCycle() {
    if (this.running) return { skipped: true };
    this.running = true;
    log('info', 'autopilot', 'Ciclo iniciado');
    try {
      await this.safe('estoque', () => this.syncStockAndPrices());
      await this.safe('pedidos', () => refreshOrders(this.p));
      await this.safe('anúncios', () => this.optimizeAds());
      await this.safe('descoberta', () => this.discover());
      db.meta.lastCycleAt = nowIso();
      db.save();
      log('info', 'autopilot', 'Ciclo concluído');
      return { skipped: false };
    } finally {
      this.running = false;
    }
  }

  private async safe(step: string, fn: () => Promise<unknown>) {
    try { await fn(); } catch (e: any) { log('error', step, e?.message ?? String(e)); }
  }

  // ---------- 1. Estoque e preço ----------
  async syncStockAndPrices() {
    const live = db.products
      .filter((x) => x.status === 'publicado' && x.sourceVid)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, 10);
    const fx = await usdToBrl();
    for (const prod of live) {
      const stock = await this.p.supplier.stock(prod.sourceVid!, prod.sourceId);
      prod.stock = stock;
      if (stock < Math.max(5, R().minStock / 5)) {
        await this.soldOut(prod);
        continue;
      }
      const d = await this.p.supplier.detail(prod.sourceId);
      const newCost = round2(d.costUsd * fx);
      if (Math.abs(newCost - prod.costBRL) / prod.costBRL > 0.05) {
        const price = priceFor(newCost, prod.shippingBRL);
        const eco = economics(price, newCost, prod.shippingBRL);
        log('info', 'preço', `${prod.name}: custo R$ ${prod.costBRL} → R$ ${newCost}; preço R$ ${prod.priceBRL} → R$ ${price}`);
        prod.costBRL = newCost;
        if (prod.storeProductId && prod.storeVariantId) await this.p.store.setPrice(prod.storeProductId, prod.storeVariantId, price);
        Object.assign(prod, { priceBRL: price, marginPercent: eco.marginPercent, breakEvenRoas: eco.breakEvenRoas });
      }
      prod.updatedAt = nowIso();
    }
    db.save();
  }

  private async soldOut(prod: Product) {
    prod.status = 'esgotado';
    prod.updatedAt = nowIso();
    if (prod.storeProductId) await this.p.store.setPublished(prod.storeProductId, false);
    for (const c of db.campaigns.filter((c) => c.productId === prod.id && c.status === 'ativa')) await this.pauseCampaign(c, 'produto esgotado');
    log('warn', 'estoque', `${prod.name} esgotou no fornecedor: despublicado e anúncios pausados`);
  }

  // ---------- 2. Anúncios ----------
  activeBudget() {
    return db.campaigns.filter((c) => c.status === 'ativa').reduce((s, c) => s + c.dailyBudgetBRL, 0);
  }

  async optimizeAds() {
    for (const c of db.campaigns.filter((c) => c.status === 'ativa' && c.externalIds.campaignId)) {
      const i = await this.p.ads.insights(c.externalIds.campaignId!);
      Object.assign(c, {
        spendBRL: i.spendBRL, revenueBRL: i.revenueBRL, clicks: i.clicks, impressions: i.impressions, purchases: i.purchases,
        roas: i.spendBRL > 0 ? round2(i.revenueBRL / i.spendBRL) : 0, lastSyncAt: nowIso(),
      });
      const prod = db.products.find((x) => x.id === c.productId);
      const be = prod?.breakEvenRoas ?? 3;
      const r = R();
      if (c.spendBRL >= r.minSpendBeforeJudgeBRL && c.roas < be * r.pauseBelowBreakEvenFactor) {
        await this.pauseCampaign(c, `ROAS ${c.roas} abaixo do mínimo (${round2(be * r.pauseBelowBreakEvenFactor)})`);
      } else if (c.roas >= be * r.scaleAboveBreakEvenFactor && c.purchases >= r.minPurchasesToScale) {
        const target = Math.min(r.maxCampaignBudgetBRL, round2(c.dailyBudgetBRL * (1 + r.scaleStepPercent / 100)));
        const extra = target - c.dailyBudgetBRL;
        if (extra >= 1 && this.activeBudget() + extra <= r.maxDailyAdBudgetTotalBRL) {
          if (c.externalIds.adSetId) await this.p.ads.setBudget(c.externalIds.adSetId, target);
          log('info', 'anúncios', `${c.productName}: orçamento R$ ${c.dailyBudgetBRL} → R$ ${target} (ROAS ${c.roas})`);
          c.dailyBudgetBRL = target;
        }
      }
    }
    db.save();
  }

  async pauseCampaign(c: Campaign, why: string) {
    await this.p.ads.setActive(c.externalIds, false);
    c.status = 'pausada';
    db.save();
    log('warn', 'anúncios', `Campanha "${c.productName}" pausada: ${why}`);
  }

  async activateCampaign(c: Campaign) {
    if (c.status === 'ativa') return;
    const total = this.activeBudget() + c.dailyBudgetBRL;
    if (total > R().maxDailyAdBudgetTotalBRL) {
      throw new Error(`Ativar excede o teto diário de anúncios (R$ ${R().maxDailyAdBudgetTotalBRL}). Atual: R$ ${round2(this.activeBudget())}.`);
    }
    await this.p.ads.setActive(c.externalIds, true);
    c.status = 'ativa';
    db.save();
    log('info', 'anúncios', `Campanha "${c.productName}" ativada (R$ ${c.dailyBudgetBRL}/dia)`);
  }

  async createCampaignFor(prod: Product, active: boolean): Promise<Campaign> {
    if (!prod.storeUrl) throw new Error('Publique o produto na loja antes de criar anúncio');
    if (active && this.activeBudget() + R().initialCampaignBudgetBRL > R().maxDailyAdBudgetTotalBRL) {
      active = false; // sem orçamento livre: cria pausada
      log('warn', 'anúncios', 'Teto diário atingido: campanha criada pausada');
    }
    const copy = await this.ai.adCopy({ name: prod.listing?.title ?? prod.name, category: prod.category, description: prod.listing?.bullets.join('. ') ?? prod.name, priceBRL: prod.priceBRL });
    const budget = R().initialCampaignBudgetBRL;
    const ids = await this.p.ads.createCampaign({
      name: `AutoDrop | ${prod.name.slice(0, 50)}`, productUrl: prod.storeUrl, imageUrl: prod.images[0] ?? '', copy, dailyBudgetBRL: budget, active,
    });
    const c: Campaign = {
      id: uid('camp'), productId: prod.id, productName: prod.name, platform: this.p.ads.name, externalIds: ids,
      status: active ? 'ativa' : 'pausada', dailyBudgetBRL: budget, spendBRL: 0, revenueBRL: 0, roas: 0, clicks: 0, impressions: 0, purchases: 0,
      copy, createdAt: nowIso(),
    };
    db.campaigns.unshift(c);
    db.save();
    log('info', 'anúncios', `Campanha criada para "${prod.name}" (${active ? 'ativa' : 'pausada, aguardando ativação'})`);
    return c;
  }

  // ---------- 3. Loja ----------
  async publishToStore(prod: Product, publish: boolean) {
    if (!prod.listing) {
      prod.listing = await this.ai.listing({ name: prod.name, category: prod.category, description: prod.reason, priceBRL: prod.priceBRL });
    }
    if (prod.storeProductId) {
      await this.p.store.setPublished(prod.storeProductId, publish);
    } else {
      const r = await this.p.store.publishProduct({
        title: prod.listing.title, descriptionHtml: prod.listing.descriptionHtml, images: prod.images, priceBRL: prod.priceBRL,
        sku: `AD-${prod.sourceId}`.slice(0, 40), vendor: config.support.storeName, category: prod.category, publish,
      });
      Object.assign(prod, { storeProductId: r.storeProductId, storeVariantId: r.storeVariantId, storeUrl: r.url });
    }
    prod.status = publish ? 'publicado' : 'rascunho';
    prod.updatedAt = nowIso();
    db.save();
    log('info', 'loja', `"${prod.listing.title}" ${publish ? 'publicado' : 'salvo como rascunho'} na loja`);
  }

  // ---------- 4. Descoberta de produtos ----------
  async discover(keywordOverride?: string) {
    const r = R();
    const createdToday = db.products.filter((x) => x.createdAt.slice(0, 10) === today() && x.status !== 'rejeitada' && x.status !== 'candidata').length;
    const liveCount = db.products.filter((x) => x.status === 'publicado' || x.status === 'rascunho').length;
    let room = Math.min(r.maxNewProductsPerDay - createdToday, r.maxPublishedProducts - liveCount);
    if (room <= 0) { log('info', 'descoberta', 'Limite de novos produtos atingido; nada a fazer'); return []; }

    const fx = await usdToBrl();
    const keywords = keywordOverride ? [keywordOverride] : [...db.settings.keywords].sort(() => Math.random() - 0.5).slice(0, 2);
    const known = new Set(db.products.map((x) => x.sourceId));
    const out: Product[] = [];

    for (const kw of keywords) {
      const found = await this.p.supplier.search(kw, 1, 20);
      const shortlist = found
        .filter((c) => !known.has(c.sourceId))
        .filter((c) => !isBlocked(`${c.name} ${c.category}`))
        .filter((c) => c.stock >= r.minStock)
        .map((c) => {
          const cost = c.costUsd * fx;
          const ship = r.defaultShippingUsd * fx;
          const price = priceFor(cost, ship);
          return { c, price, score: Math.log10(1 + c.popularity) * 20 + Math.min(30, c.stock / 200) };
        })
        .filter((x) => x.price >= r.minPriceBRL && x.price <= r.maxPriceBRL)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      for (const { c, score } of shortlist) {
        if (room <= 0) break;
        known.add(c.sourceId);
        try {
          const d = await this.p.supplier.detail(c.sourceId);
          const costBRL = round2((d.costUsd || c.costUsd) * fx);
          const shipUsd = d.vid ? await this.p.supplier.shippingUsd(d.vid, r.targetCountry) : null;
          const shippingBRL = round2((shipUsd ?? r.defaultShippingUsd) * fx);
          const price = priceFor(costBRL, shippingBRL);
          const eco = economics(price, costBRL, shippingBRL);
          const base: Product = {
            id: uid('prod'), source: this.p.supplier.isDemo ? 'demo' : 'cj', sourceId: c.sourceId, sourceVid: d.vid, name: d.name || c.name,
            category: d.category || c.category, images: d.images.length ? d.images : [c.image], costBRL, shippingBRL, priceBRL: price,
            marginPercent: eco.marginPercent, breakEvenRoas: eco.breakEvenRoas, stock: c.stock, score: Math.round(score), reason: d.description,
            status: 'candidata', createdAt: nowIso(), updatedAt: nowIso(),
          };
          const why =
            !d.vid ? 'sem variante (VID) para criar pedidos' :
            eco.marginPercent < r.minMarginPercent ? `margem ${eco.marginPercent}% abaixo do mínimo` :
            price < r.minPriceBRL || price > r.maxPriceBRL ? 'preço fora da faixa' :
            eco.breakEvenRoas > r.maxBreakEvenRoas ? `ROAS de equilíbrio ${eco.breakEvenRoas} alto demais` :
            !base.images[0] ? 'sem imagem' : undefined;
          if (why) { log('info', 'descoberta', `Descartado "${base.name}": ${why}`); continue; }

          const review = await this.ai.reviewProduct({ name: base.name, category: base.category, description: d.description });
          base.score = Math.round((base.score + review.fitScore) / 2);
          base.reason = review.reason || base.reason;
          if (!review.ok) {
            base.status = 'rejeitada';
            db.products.unshift(base);
            log('info', 'descoberta', `Reprovado pela IA "${base.name}": ${review.reason}`);
            continue;
          }
          db.products.unshift(base);
          db.save();
          out.push(base);
          log('info', 'descoberta', `Candidato "${base.name}": preço R$ ${price}, margem ${eco.marginPercent}%, ROAS de equilíbrio ${eco.breakEvenRoas}`);

          await this.publishToStore(base, r.autoPublishProducts);
          room--;
          if (hasAds() || this.p.ads.isDemo) {
            await this.createCampaignFor(base, r.autoActivateAds && r.autoPublishProducts).catch((e) => log('error', 'anúncios', e.message));
          }
        } catch (e: any) {
          log('error', 'descoberta', `Falha em "${c.name}": ${e?.message ?? e}`);
        }
      }
    }
    return out;
  }

  async retryOrder(orderId: string) {
    const o = db.orders.find((x) => x.id === orderId);
    if (!o) throw new Error('Pedido não encontrado');
    await fulfillOrder(o, this.p);
  }

  describe() {
    return { demo: isDemoMode(), running: this.running };
  }
}
