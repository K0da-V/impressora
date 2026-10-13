// Teste de ponta a ponta em modo demonstração (sem rede nem chaves).
// Uso: npm run selftest
process.env.DATA_FILE = `data/selftest-${Date.now()}.json`;
process.env.AUTO_PUBLISH_PRODUCTS = 'true';
process.env.AUTO_ACTIVATE_ADS = 'true';
process.env.MIN_STOCK = '100';
process.env.MAX_NEW_PRODUCTS_PER_DAY = '4';
process.env.MAX_DAILY_AD_BUDGET_TOTAL_BRL = '100';
process.env.INITIAL_CAMPAIGN_BUDGET_BRL = '30';
process.env.MIN_SPEND_BEFORE_JUDGE_BRL = '50';
process.env.GEMINI_API_KEY = '';
process.env.CJ_API_KEY = '';

import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../server/config.ts');
const { initDb, db } = await import('../server/db.ts');
const { buildProviders } = await import('../server/integrations/index.ts');
const { createContentGenerator } = await import('../server/ai.ts');
const { Autopilot } = await import('../server/autopilot.ts');
const { priceFor, economics, isBlocked } = await import('../server/pricing.ts');
const { orderFromShopify, ingestOrder } = await import('../server/orders.ts');

// 1. Precificação
const price = priceFor(40, 30);
const eco = economics(price, 40, 30);
console.log('preço', price, eco);
assert.ok(eco.marginPercent >= config.rules.targetMarginPercent - 0.5, 'margem-alvo respeitada');
assert.ok(price % 1 > 0.89 && price % 1 < 0.91, 'preço termina em ,90');
assert.equal(isBlocked('Nike Air replica sneakers'), 'replica');
assert.equal(isBlocked('Portable blender'), undefined);

// 2. Descoberta -> loja -> anúncio
initDb();
const ap = new Autopilot(buildProviders(), createContentGenerator());
const found = await ap.discover('');
console.log('encontrados:', found.map((p) => `${p.name} R$${p.priceBRL} m${p.marginPercent}% be${p.breakEvenRoas}`));
assert.ok(found.length > 0, 'achou produtos');
assert.ok(db.products.every((p) => p.status !== 'publicado' || p.storeUrl), 'publicados têm URL');
assert.ok(db.campaigns.length > 0, 'criou campanhas');
const budget = ap.activeBudget();
assert.ok(budget <= 100, `teto de orçamento respeitado (${budget})`);
assert.equal((await ap.discover('')).length, 0, 'não duplica produtos já importados');

// 3. Otimização de anúncios (3 rodadas)
for (let i = 0; i < 3; i++) await ap.optimizeAds();
console.log(db.campaigns.map((c) => `${c.productName.slice(0, 25)} ${c.status} roas=${c.roas} gasto=${c.spendBRL}`));
assert.ok(db.campaigns.some((c) => c.spendBRL > 0), 'métricas sincronizadas');
assert.ok(ap.activeBudget() <= 100, 'teto respeitado após escalar');

// 4. Pedido pago -> fornecedor (idempotente)
const prod = db.products.find((p) => p.status === 'publicado')!;
const payload = {
  id: 9001, name: '#1001', email: 'Cliente@Teste.com', total_price: String(prod.priceBRL),
  line_items: [{ variant_id: prod.storeVariantId, title: prod.name, quantity: 1 }],
  shipping_address: { name: 'Maria Silva', address1: 'Rua A 10', city: 'Contagem', province_code: 'MG', zip: '32000-000', country_code: 'BR', phone: '+55 31 99999-0000' },
};
const order = orderFromShopify(payload)!;
assert.equal(order.items[0].productId, prod.id, 'item mapeado ao produto');
await ingestOrder(order, ap.p);
assert.equal(db.orders[0].status, 'enviado_fornecedor');
assert.equal((await ingestOrder(orderFromShopify(payload)!, ap.p)).duplicate, true, 'webhook repetido ignorado');
const bad = orderFromShopify({ ...payload, id: 9002, line_items: [{ variant_id: 1, title: 'Desconhecido', quantity: 1 }] })!;
await ingestOrder(bad, ap.p);
assert.equal(db.orders[0].status, 'erro', 'item desconhecido vira erro visível');

// 5. Ciclo completo
await ap.runCycle();
assert.ok(db.meta.lastCycleAt);
console.log('\nTODOS OS TESTES PASSARAM —', db.products.length, 'produtos,', db.campaigns.length, 'campanhas,', db.orders.length, 'pedidos');
fs.rmSync(process.env.DATA_FILE!, { force: true });
process.exit(0);
