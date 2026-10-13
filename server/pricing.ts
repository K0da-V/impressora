import { config } from './config.ts';
import { round2 } from './util.ts';

type Rules = typeof config.rules;

/** Preço de venda que garante a margem-alvo depois das taxas de pagamento (antes do custo de anúncios). */
export function priceFor(costBRL: number, shippingBRL: number, r: Rules = config.rules): number {
  const denom = 1 - r.paymentFeePercent / 100 - r.targetMarginPercent / 100;
  if (denom <= 0.05) throw new Error('Margem-alvo + taxa de pagamento deixam o preço inviável');
  const raw = (costBRL + shippingBRL + r.paymentFixedFeeBRL) / denom;
  return Math.max(1, Math.ceil(raw) - 0.1); // termina em ,90
}

export function economics(priceBRL: number, costBRL: number, shippingBRL: number, r: Rules = config.rules) {
  const fees = priceBRL * (r.paymentFeePercent / 100) + r.paymentFixedFeeBRL;
  const contribution = priceBRL - costBRL - shippingBRL - fees; // lucro por venda antes dos anúncios
  const marginPercent = priceBRL > 0 ? (contribution / priceBRL) * 100 : 0;
  // ROAS mínimo para não ter prejuízo: receita / lucro de contribuição
  const breakEvenRoas = contribution > 0 ? priceBRL / contribution : Infinity;
  return { contribution: round2(contribution), marginPercent: round2(marginPercent), breakEvenRoas: Number.isFinite(breakEvenRoas) ? round2(breakEvenRoas) : 999 };
}

export function isBlocked(text: string, r: Rules = config.rules): string | undefined {
  const t = text.toLowerCase();
  return r.blockedTerms.find((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(t));
}

let fxCache: { rate: number; at: number } | undefined;
/** Cotação USD→BRL (AwesomeAPI, gratuita). Em caso de falha usa FX_USD_BRL. */
export async function usdToBrl(): Promise<number> {
  if (fxCache && Date.now() - fxCache.at < 6 * 3600_000) return fxCache.rate;
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL', { signal: AbortSignal.timeout(5000) });
    const j: any = await r.json();
    const rate = Number(j?.USDBRL?.ask);
    if (Number.isFinite(rate) && rate > 1) {
      fxCache = { rate: rate * 1.03, at: Date.now() }; // +3% de colchão cambial
      return fxCache.rate;
    }
  } catch { /* usa o valor fixo */ }
  return config.rules.fxUsdBrl;
}
