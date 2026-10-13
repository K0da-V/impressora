import crypto from 'node:crypto';
import { config } from './config.ts';
import { db, log } from './db.ts';
import { nowIso, uid, safeEqual } from './util.ts';
import type { Providers } from './integrations/index.ts';
import type { Order } from '../shared/types.ts';

const digits = (s: string) => (s ?? '').replace(/\D/g, '');

/** Cria o pedido no fornecedor para um pedido já pago na loja. Idempotente. */
export async function fulfillOrder(o: Order, p: Providers) {
  if (o.supplierOrderId) return;
  try {
    const lines: { vid: string; quantity: number }[] = [];
    for (const it of o.items) {
      const prod = db.products.find((x) => x.id === it.productId);
      if (!prod?.sourceVid) throw new Error(`Item "${it.name}" não corresponde a um produto do fornecedor`);
      lines.push({ vid: prod.sourceVid, quantity: it.qty });
    }
    if (!lines.length) throw new Error('Pedido sem itens mapeáveis');
    const s = o.shipping;
    const r = await p.supplier.createOrder({
      orderNumber: o.number, customerName: s.name, phone: digits(s.phone ?? ''), address1: s.address1, address2: s.address2,
      city: s.city, province: s.province, zip: digits(s.zip), countryCode: s.countryCode || 'BR', lines,
    });
    o.supplierOrderId = r.supplierOrderId;
    o.status = 'enviado_fornecedor';
    o.error = undefined;
    if (config.rules.autoPaySupplier) await p.supplier.payOrder(r.supplierOrderId);
    log('info', 'pedidos', `Pedido ${o.number} enviado ao fornecedor (${r.supplierOrderId})${config.rules.autoPaySupplier ? ' e pago' : ' — aguardando pagamento no fornecedor'}`);
  } catch (e: any) {
    o.status = 'erro';
    o.error = e?.message ?? String(e);
    log('error', 'pedidos', `Pedido ${o.number}: ${o.error}`);
  } finally {
    o.updatedAt = nowIso();
    db.save();
  }
}

export async function refreshOrders(p: Providers) {
  for (const o of db.orders.filter((x) => x.supplierOrderId && (x.status === 'enviado_fornecedor' || x.status === 'em_transito'))) {
    const s = await p.supplier.orderStatus(o.supplierOrderId!);
    if (s.tracking) o.tracking = s.tracking;
    if (s.status === 'em_transito' || s.status === 'entregue') o.status = s.status;
    if (s.status === 'erro') { o.status = 'erro'; o.error = 'Fornecedor cancelou ou reportou erro no pedido'; }
    o.updatedAt = nowIso();
  }
  db.save();
}

// ---------- Webhooks ----------
function hmacOk(raw: Buffer, secret: string, headerValue: string | undefined) {
  if (!secret || !headerValue) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  return safeEqual(expected, headerValue);
}
export const verifyShopify = (raw: Buffer, h?: string) => hmacOk(raw, config.store.shopify.webhookSecret, h);
export const verifyWoo = (raw: Buffer, h?: string) => hmacOk(raw, config.store.woo.webhookSecret, h);

function findProductByVariant(variantId: string | number | undefined) {
  if (variantId === undefined) return undefined;
  const tail = String(variantId);
  return db.products.find((x) => x.storeVariantId && (x.storeVariantId === tail || x.storeVariantId.endsWith(`/${tail}`)));
}

export function orderFromShopify(j: any): Order | undefined {
  if (!j?.id) return undefined;
  const a = j.shipping_address ?? {};
  return {
    id: uid('ord'), storeOrderId: String(j.id), number: String(j.name ?? j.order_number ?? j.id),
    customerName: a.name ?? `${j.customer?.first_name ?? ''} ${j.customer?.last_name ?? ''}`.trim(),
    customerEmail: String(j.email ?? '').toLowerCase(), totalBRL: Number(j.total_price ?? 0),
    items: (j.line_items ?? []).map((l: any) => ({ productId: findProductByVariant(l.variant_id)?.id, storeVariantId: String(l.variant_id ?? ''), name: l.title, qty: Number(l.quantity) || 1 })),
    shipping: { name: a.name ?? '', address1: a.address1 ?? '', address2: a.address2 ?? '', city: a.city ?? '', province: a.province_code ?? a.province ?? '', zip: a.zip ?? '', countryCode: a.country_code ?? 'BR', phone: a.phone ?? j.phone ?? '' },
    status: 'recebido', createdAt: nowIso(), updatedAt: nowIso(),
  };
}

export function orderFromWoo(j: any): Order | undefined {
  if (!j?.id) return undefined;
  const a = j.shipping?.address_1 ? j.shipping : j.billing ?? {};
  const byProduct = (pid: number) => db.products.find((x) => x.storeProductId === String(pid));
  return {
    id: uid('ord'), storeOrderId: String(j.id), number: String(j.number ?? j.id),
    customerName: `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim(), customerEmail: String(j.billing?.email ?? '').toLowerCase(),
    totalBRL: Number(j.total ?? 0),
    items: (j.line_items ?? []).map((l: any) => ({ productId: byProduct(l.product_id)?.id, name: l.name, qty: Number(l.quantity) || 1 })),
    shipping: { name: `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim(), address1: a.address_1 ?? '', address2: a.address_2 ?? '', city: a.city ?? '', province: a.state ?? '', zip: a.postcode ?? '', countryCode: a.country ?? 'BR', phone: j.billing?.phone ?? '' },
    status: 'recebido', createdAt: nowIso(), updatedAt: nowIso(),
  };
}

/** Registra o pedido (ignora duplicatas de reenvio do webhook) e dispara o envio ao fornecedor. */
export async function ingestOrder(order: Order, p: Providers) {
  if (db.orders.some((o) => o.storeOrderId === order.storeOrderId)) return { duplicate: true };
  db.orders.unshift(order);
  db.save();
  log('info', 'pedidos', `Novo pedido ${order.number} (R$ ${order.totalBRL.toFixed(2)})`);
  if (config.rules.autoFulfillOrders) await fulfillOrder(order, p);
  return { duplicate: false };
}
