import { config } from '../config.ts';
import { http } from '../util.ts';
import type { AdsProvider, AdCampaignInput, AdInsights } from './types.ts';

/**
 * Meta Marketing API (Facebook/Instagram Ads).
 * Requer: token com ads_management, conta de anúncios, Página, Pixel e app aprovado pela Meta.
 * Valores monetários são enviados na menor unidade da moeda da conta (centavos para BRL).
 */
export class MetaAds implements AdsProvider {
  readonly name = 'meta' as const;
  readonly isDemo = false;

  private get base() { return `https://graph.facebook.com/${config.meta.apiVersion}`; }
  private get acct() { return `act_${config.meta.adAccountId}`; }

  private post<T = any>(path: string, body: Record<string, unknown>) {
    return http<T>(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.meta.token}` },
      body: JSON.stringify(body),
    });
  }
  private get<T = any>(path: string, params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return http<T>(`${this.base}${path}${qs ? '?' + qs : ''}`, {
      headers: { Authorization: `Bearer ${config.meta.token}` },
    });
  }

  async createCampaign(i: AdCampaignInput) {
    const status = i.active ? 'ACTIVE' : 'PAUSED';
    const camp = await this.post(`/${this.acct}/campaigns`, {
      name: i.name,
      objective: 'OUTCOME_SALES',
      status,
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    });
    const adset = await this.post(`/${this.acct}/adsets`, {
      name: `${i.name} | Conjunto`,
      campaign_id: camp.id,
      daily_budget: Math.round(i.dailyBudgetBRL * 100),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      promoted_object: { pixel_id: config.meta.pixelId, custom_event_type: 'PURCHASE' },
      targeting: {
        geo_locations: { countries: [config.rules.targetCountry] },
        age_min: i.copy.audience.ageMin,
        age_max: i.copy.audience.ageMax,
      },
      status,
    });
    const creative = await this.post(`/${this.acct}/adcreatives`, {
      name: `${i.name} | Criativo`,
      object_story_spec: {
        page_id: config.meta.pageId,
        link_data: {
          link: i.productUrl,
          message: i.copy.primaryText,
          name: i.copy.headline,
          picture: i.imageUrl,
          call_to_action: { type: 'SHOP_NOW', value: { link: i.productUrl } },
        },
      },
    });
    const ad = await this.post(`/${this.acct}/ads`, {
      name: `${i.name} | Anúncio`,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status,
    });
    return { campaignId: camp.id, adSetId: adset.id, creativeId: creative.id, adId: ad.id };
  }

  async setActive(ids: { campaignId?: string; adSetId?: string; adId?: string }, active: boolean) {
    const status = active ? 'ACTIVE' : 'PAUSED';
    for (const id of [ids.campaignId, ids.adSetId, ids.adId]) {
      if (id) await this.post(`/${id}`, { status });
    }
  }

  async setBudget(adSetId: string, dailyBudgetBRL: number) {
    await this.post(`/${adSetId}`, { daily_budget: Math.round(dailyBudgetBRL * 100) });
  }

  async insights(campaignId: string): Promise<AdInsights> {
    const r = await this.get(`/${campaignId}/insights`, {
      fields: 'spend,clicks,impressions,actions,action_values',
      date_preset: 'maximum',
    });
    const row = r?.data?.[0] ?? {};
    const pick = (arr: any[] | undefined) =>
      Number((arr ?? []).find((a) => a.action_type === 'omni_purchase')?.value
        ?? (arr ?? []).find((a) => a.action_type === 'purchase')?.value ?? 0);
    return {
      spendBRL: Number(row.spend ?? 0),
      revenueBRL: pick(row.action_values),
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      purchases: pick(row.actions),
    };
  }
}
