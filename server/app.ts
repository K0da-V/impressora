import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, hasAds, hasAI, hasSupplier, isDemoMode, storeProviderName } from './config.ts';
import { db, log } from './db.ts';
import { safeEqual, maskEmail, round2, nowIso } from './util.ts';
import { supportReply } from './ai.ts';
import { ingestOrder, orderFromShopify, orderFromWoo, verifyShopify, verifyWoo } from './orders.ts';
import type { Autopilot } from './autopilot.ts';
import type { Stats, StatusResponse, Product } from '../shared/types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((e: any) => {
    log('error', 'api', `${req.method} ${req.path}: ${e?.message ?? e}`);
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Erro interno' });
  });
};

// Limite simples por IP para o chat público
const hits = new Map<string, number[]>();
function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const k = req.ip ?? 'x';
    const now = Date.now();
    const arr = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Muitas mensagens. Tente novamente em instantes.' });
    arr.push(now); hits.set(k, arr);
    next();
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!config.adminToken) {
    if (config.production) return res.status(503).json({ error: 'Defina ADMIN_TOKEN no servidor para usar o painel em produção.' });
    return next(); // desenvolvimento local sem token
  }
  const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!given || !safeEqual(given, config.adminToken)) return res.status(401).json({ error: 'Token inválido' });
  next();
}

export function stats(): Stats {
  const spend = db.campaigns.reduce((s, c) => s + c.spendBRL, 0);
  const paid = db.orders.filter((o) => o.status !== 'erro');
  const revenue = paid.reduce((s, o) => s + o.totalBRL, 0);
  let contribution = 0;
  for (const o of paid) for (const it of o.items) {
    const p = db.products.find((x) => x.id === it.productId);
    if (p) contribution += (p.priceBRL * (p.marginPercent / 100)) * it.qty;
  }
  const adRevenue = db.campaigns.reduce((s, c) => s + c.revenueBRL, 0);
  return {
    revenueBRL: round2(revenue), estimatedProfitBRL: round2(contribution - spend), adSpendBRL: round2(spend),
    roas: spend > 0 ? round2(adRevenue / spend) : 0, orders: db.orders.length,
    productsPublished: db.products.filter((p) => p.status === 'publicado').length,
    productsCandidate: db.products.filter((p) => p.status === 'candidata' || p.status === 'rascunho').length,
    activeCampaigns: db.campaigns.filter((c) => c.status === 'ativa').length,
    ordersWithError: db.orders.filter((o) => o.status === 'erro').length,
  };
}

function status(ap: Autopilot): StatusResponse {
  const r = config.rules;
  const sp = storeProviderName();
  return {
    demoMode: isDemoMode(), autopilotEnabled: db.settings.autopilotEnabled, cycleRunning: ap.running, lastCycleAt: db.meta.lastCycleAt,
    keywords: db.settings.keywords,
    integrations: [
      { id: 'supplier', label: 'Fornecedor (CJ Dropshipping)', configured: hasSupplier(), detail: hasSupplier() ? 'Conectado' : 'Usando catálogo de demonstração', env: ['CJ_API_KEY'] },
      { id: 'store', label: `Loja (${sp === 'demo' ? 'Shopify ou WooCommerce' : sp})`, configured: sp !== 'demo', detail: sp !== 'demo' ? 'Conectada' : 'Usando loja de demonstração', env: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_TOKEN', 'SHOPIFY_WEBHOOK_SECRET', 'ou WOO_URL, WOO_CONSUMER_KEY, WOO_CONSUMER_SECRET, WOO_WEBHOOK_SECRET'] },
      { id: 'ads', label: 'Anúncios (Meta Ads)', configured: hasAds(), detail: hasAds() ? 'Conectado' : 'Simulando anúncios', env: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID', 'META_PIXEL_ID'] },
      { id: 'ai', label: 'IA (Gemini)', configured: hasAI(), detail: hasAI() ? `Modelo ${config.gemini.model}` : 'Textos por modelo simples, sem IA', env: ['GEMINI_API_KEY'] },
      { id: 'admin', label: 'Senha do painel', configured: Boolean(config.adminToken), detail: config.adminToken ? 'Protegido' : 'SEM PROTEÇÃO (use ADMIN_TOKEN)', env: ['ADMIN_TOKEN'] },
    ],
    guardrails: {
      'Publicar produtos automaticamente': r.autoPublishProducts, 'Ativar anúncios automaticamente': r.autoActivateAds,
      'Enviar pedidos ao fornecedor automaticamente': r.autoFulfillOrders, 'Pagar fornecedor automaticamente': r.autoPaySupplier,
      'Novos produtos por dia (máx.)': r.maxNewProductsPerDay, 'Orçamento diário total de anúncios (R$)': r.maxDailyAdBudgetTotalBRL,
      'Orçamento inicial por campanha (R$)': r.initialCampaignBudgetBRL, 'Margem mínima (%)': r.minMarginPercent, 'Margem-alvo (%)': r.targetMarginPercent,
      'Faixa de preço (R$)': `${r.minPriceBRL} – ${r.maxPriceBRL}`, 'ROAS de equilíbrio máximo': r.maxBreakEvenRoas,
      'Gasto mínimo antes de julgar anúncio (R$)': r.minSpendBeforeJudgeBRL, 'Intervalo do ciclo (min)': r.intervalMin,
    },
  };
}

export function createApp(ap: Autopilot) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // Webhooks: corpo bruto para validar a assinatura HMAC
  app.post('/webhooks/shopify', express.raw({ type: '*/*', limit: '2mb' }), wrap(async (req, res) => {
    const raw = req.body as Buffer;
    if (!verifyShopify(raw, req.header('x-shopify-hmac-sha256'))) return res.status(401).end();
    const order = orderFromShopify(JSON.parse(raw.toString('utf8')));
    res.status(200).end(); // responde rápido; Shopify exige < 5s
    if (order) await ingestOrder(order, ap.p).catch((e) => log('error', 'webhook', e.message));
  }));
  app.post('/webhooks/woocommerce', express.raw({ type: '*/*', limit: '2mb' }), wrap(async (req, res) => {
    const raw = req.body as Buffer;
    if (!verifyWoo(raw, req.header('x-wc-webhook-signature'))) return res.status(401).end();
    const j = JSON.parse(raw.toString('utf8'));
    res.status(200).end();
    if (j?.status === 'processing' || j?.status === 'completed') {
      const order = orderFromWoo(j);
      if (order) await ingestOrder(order, ap.p).catch((e) => log('error', 'webhook', e.message));
    }
  }));

  app.use(express.json({ limit: '100kb' }));

  // Chat público da loja (sem token; limitado por IP)
  app.post('/api/support/chat', rateLimit(20, 60_000), wrap(async (req, res) => {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : [];
    const history = messages.map((m: any) => ({ sender: m.sender === 'user' ? 'user' : 'ai', text: String(m.text ?? '').slice(0, 1000) }));
    const userText = history.filter((m: any) => m.sender === 'user').map((m: any) => m.text).join(' ');
    const email = userText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]?.toLowerCase();
    const num = userText.match(/#?\b(\d{3,})\b/)?.[1];
    let ctx = '';
    if (email && num) {
      const o = db.orders.find((x) => x.customerEmail === email && x.number.replace(/\D/g, '') === num);
      if (o) {
        const label: Record<string, string> = { recebido: 'recebido, em preparação', enviado_fornecedor: 'em preparação para envio', em_transito: 'em trânsito', entregue: 'entregue', erro: 'em análise pela equipe' };
        ctx = `Pedido ${o.number}: ${label[o.status]}${o.tracking ? `; código de rastreio ${o.tracking}` : ''}.`;
      }
    }
    res.json({ reply: await supportReply(history, ctx), timestamp: nowIso() });
  }));

  const api = express.Router();
  api.use(requireAdmin);

  api.get('/status', (_req, res) => res.json(status(ap)));
  api.get('/stats', (_req, res) => res.json(stats()));
  api.get('/products', (_req, res) => res.json(db.products));
  api.get('/campaigns', (_req, res) => res.json(db.campaigns));
  api.get('/orders', (_req, res) => res.json(db.orders.map((o) => ({ ...o, customerEmail: maskEmail(o.customerEmail), shipping: { ...o.shipping, phone: undefined, address1: '***', address2: undefined } }))));
  api.get('/events', (_req, res) => res.json(db.events.slice(0, 100)));

  const findProduct = (req: Request): Product => {
    const p = db.products.find((x) => x.id === req.params.id);
    if (!p) throw Object.assign(new Error('Produto não encontrado'), { status: 404 });
    return p;
  };

  api.post('/products/scout', wrap(async (req, res) => {
    const kw = typeof req.body?.keyword === 'string' ? req.body.keyword.trim().slice(0, 60) : undefined;
    const found = await ap.discover(kw || undefined);
    res.json({ found: found.length });
  }));
  api.post('/products/:id/publish', wrap(async (req, res) => { const p = findProduct(req); await ap.publishToStore(p, true); res.json(p); }));
  api.post('/products/:id/unpublish', wrap(async (req, res) => { const p = findProduct(req); await ap.publishToStore(p, false); res.json(p); }));
  api.post('/products/:id/reject', wrap(async (req, res) => { const p = findProduct(req); p.status = 'rejeitada'; p.updatedAt = nowIso(); db.save(); res.json(p); }));
  api.post('/products/:id/campaign', wrap(async (req, res) => { const p = findProduct(req); res.json(await ap.createCampaignFor(p, false)); }));

  const findCampaign = (req: Request) => {
    const c = db.campaigns.find((x) => x.id === req.params.id);
    if (!c) throw Object.assign(new Error('Campanha não encontrada'), { status: 404 });
    return c;
  };
  api.post('/campaigns/:id/activate', wrap(async (req, res) => { const c = findCampaign(req); await ap.activateCampaign(c); res.json(c); }));
  api.post('/campaigns/:id/pause', wrap(async (req, res) => { const c = findCampaign(req); await ap.pauseCampaign(c, 'pausada manualmente'); res.json(c); }));
  api.post('/campaigns/:id/budget', wrap(async (req, res) => {
    const c = findCampaign(req);
    const v = Number(req.body?.value);
    if (!Number.isFinite(v) || v < 1 || v > config.rules.maxCampaignBudgetBRL) throw Object.assign(new Error(`Orçamento deve ficar entre R$ 1 e R$ ${config.rules.maxCampaignBudgetBRL}`), { status: 400 });
    const delta = v - c.dailyBudgetBRL;
    if (c.status === 'ativa' && ap.activeBudget() + delta > config.rules.maxDailyAdBudgetTotalBRL) throw Object.assign(new Error('Excede o teto diário total de anúncios'), { status: 400 });
    if (c.externalIds.adSetId) await ap.p.ads.setBudget(c.externalIds.adSetId, v);
    c.dailyBudgetBRL = v; db.save(); res.json(c);
  }));

  api.post('/orders/:id/retry', wrap(async (req, res) => { await ap.retryOrder(req.params.id); res.json({ ok: true }); }));

  api.post('/autopilot/toggle', wrap((req, res) => {
    db.settings.autopilotEnabled = Boolean(req.body?.enabled); db.save();
    log('info', 'autopilot', `Autopiloto ${db.settings.autopilotEnabled ? 'LIGADO' : 'DESLIGADO'}`);
    res.json(status(ap));
  }));
  api.post('/autopilot/run', wrap(async (_req, res) => { res.json(await ap.runCycle()); }));
  api.post('/settings/keywords', wrap((req, res) => {
    const kws = (Array.isArray(req.body?.keywords) ? req.body.keywords : []).map((k: unknown) => String(k).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
    if (!kws.length) throw Object.assign(new Error('Informe ao menos uma palavra-chave'), { status: 400 });
    db.settings.keywords = kws; db.save(); res.json(status(ap));
  }));

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
  return app;
}

export async function attachFrontend(app: express.Express) {
  if (!config.production) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve(here, '..', 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
}
