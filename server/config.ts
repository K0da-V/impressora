import fs from 'node:fs';

// Carrega .env sem depender de pacote externo (Node >= 20.12).
try {
  if (fs.existsSync('.env')) (process as any).loadEnvFile?.('.env');
} catch {
  /* sem .env: usa variáveis do ambiente */
}

const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const num = (k: string, d: number) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && process.env[k] !== undefined && process.env[k] !== '' ? v : d;
};
const bool = (k: string, d: boolean) => {
  const v = env(k).toLowerCase();
  if (!v) return d;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(v);
};
const list = (k: string, d: string) =>
  env(k, d).split(',').map((s) => s.trim()).filter(Boolean);

export function loadConfig() {
  const cfg = {
    port: num('PORT', 3000),
    production: env('NODE_ENV') === 'production',
    adminToken: env('ADMIN_TOKEN'),
    appUrl: env('APP_URL'),
    dataFile: env('DATA_FILE', 'data/db.json'),

    gemini: { apiKey: env('GEMINI_API_KEY'), model: env('GEMINI_MODEL', 'gemini-flash-latest') },

    cj: { apiKey: env('CJ_API_KEY'), baseUrl: env('CJ_BASE_URL', 'https://developers.cjdropshipping.com/api2.0/v1') },

    store: {
      provider: env('STORE_PROVIDER', 'auto') as 'auto' | 'shopify' | 'woocommerce' | 'demo',
      shopify: {
        domain: env('SHOPIFY_STORE_DOMAIN'),
        token: env('SHOPIFY_ADMIN_TOKEN'),
        apiVersion: env('SHOPIFY_API_VERSION', '2026-04'),
        webhookSecret: env('SHOPIFY_WEBHOOK_SECRET'),
      },
      woo: {
        url: env('WOO_URL').replace(/\/$/, ''),
        key: env('WOO_CONSUMER_KEY'),
        secret: env('WOO_CONSUMER_SECRET'),
        webhookSecret: env('WOO_WEBHOOK_SECRET'),
      },
      publicUrl: env('STORE_PUBLIC_URL'),
    },

    meta: {
      token: env('META_ACCESS_TOKEN'),
      adAccountId: env('META_AD_ACCOUNT_ID').replace(/^act_/, ''),
      pageId: env('META_PAGE_ID'),
      pixelId: env('META_PIXEL_ID'),
      apiVersion: env('META_API_VERSION', 'v23.0'),
    },

    // ---- Parâmetros de negócio e travas de segurança ----
    rules: {
      autopilotEnabled: bool('AUTOPILOT_ENABLED', false),
      intervalMin: Math.max(5, num('AUTOPILOT_INTERVAL_MIN', 60)),
      autoPublishProducts: bool('AUTO_PUBLISH_PRODUCTS', false), // false = cria como rascunho
      autoActivateAds: bool('AUTO_ACTIVATE_ADS', false), // false = cria pausado
      autoFulfillOrders: bool('AUTO_FULFILL_ORDERS', true),
      autoPaySupplier: bool('AUTO_PAY_SUPPLIER', false), // paga com saldo CJ
      maxNewProductsPerDay: num('MAX_NEW_PRODUCTS_PER_DAY', 5),
      maxPublishedProducts: num('MAX_PUBLISHED_PRODUCTS', 300),
      maxDailyAdBudgetTotalBRL: num('MAX_DAILY_AD_BUDGET_TOTAL_BRL', 150),
      initialCampaignBudgetBRL: num('INITIAL_CAMPAIGN_BUDGET_BRL', 30),
      maxCampaignBudgetBRL: num('MAX_CAMPAIGN_BUDGET_BRL', 1000),
      minMarginPercent: num('MIN_MARGIN_PERCENT', 35),
      targetMarginPercent: num('TARGET_MARGIN_PERCENT', 45),
      minPriceBRL: num('MIN_PRICE_BRL', 60),
      maxPriceBRL: num('MAX_PRICE_BRL', 4000),
      minStock: num('MIN_STOCK', 100),
      maxBreakEvenRoas: num('MAX_BREAK_EVEN_ROAS', 3),
      paymentFeePercent: num('PAYMENT_FEE_PERCENT', 5),
      paymentFixedFeeBRL: num('PAYMENT_FIXED_FEE_BRL', 0.4),
      fxUsdBrl: num('FX_USD_BRL', 5.5),
      defaultShippingUsd: num('DEFAULT_SHIPPING_USD', 6),
      // Regras de anúncio, relativas ao ROAS de equilíbrio de cada produto
      minSpendBeforeJudgeBRL: num('MIN_SPEND_BEFORE_JUDGE_BRL', 60),
      pauseBelowBreakEvenFactor: num('PAUSE_BELOW_BREAK_EVEN_FACTOR', 0.8),
      scaleAboveBreakEvenFactor: num('SCALE_ABOVE_BREAK_EVEN_FACTOR', 1.3),
      minPurchasesToScale: num('MIN_PURCHASES_TO_SCALE', 3),
      scaleStepPercent: num('SCALE_STEP_PERCENT', 20),
      targetCountry: env('TARGET_COUNTRY', 'BR'),
      keywords: list('NICHE_KEYWORDS', 'neck massager,portable blender,led strip,pet hair remover'),
      blockedTerms: list(
        'BLOCKED_TERMS',
        'replica,fake,counterfeit,weapon,gun,knife,vape,cigarette,medicine,supplement,adult,sex,drug,cbd,steroid,nike,adidas,apple,iphone case brand,louis vuitton,gucci,disney,pokemon,marvel',
      ),
    },

    support: {
      storeName: env('STORE_NAME', 'Nossa loja'),
      deliveryPolicy: env('POLICY_DELIVERY', 'O prazo de entrega é informado na página do produto e no e-mail de confirmação; o rastreio é enviado assim que o pedido é postado.'),
      returnPolicy: env('POLICY_RETURNS', 'Você pode desistir da compra em até 7 dias após o recebimento, conforme o art. 49 do Código de Defesa do Consumidor.'),
      contactEmail: env('SUPPORT_EMAIL'),
    },
  };
  return cfg;
}

export type Config = ReturnType<typeof loadConfig>;
export const config: Config = loadConfig();

export function storeProviderName(c: Config = config): 'shopify' | 'woocommerce' | 'demo' {
  if (c.store.provider === 'shopify' || c.store.provider === 'woocommerce' || c.store.provider === 'demo') return c.store.provider;
  if (c.store.shopify.domain && c.store.shopify.token) return 'shopify';
  if (c.store.woo.url && c.store.woo.key && c.store.woo.secret) return 'woocommerce';
  return 'demo';
}

export const hasSupplier = (c: Config = config) => Boolean(c.cj.apiKey);
export const hasAds = (c: Config = config) =>
  Boolean(c.meta.token && c.meta.adAccountId && c.meta.pageId && c.meta.pixelId);
export const hasAI = (c: Config = config) => Boolean(c.gemini.apiKey);
/** Modo demonstração: nada é enviado a serviços externos de verdade. */
export const isDemoMode = (c: Config = config) =>
  !hasSupplier(c) || storeProviderName(c) === 'demo';
