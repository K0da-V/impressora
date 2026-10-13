import { Megaphone } from 'lucide-react';
import { api, useApi } from '../lib/api.ts';
import { brl, num } from '../lib/format.ts';
import { ActionButton, Badge, Card, Empty, PageTitle } from '../ui.tsx';
import type { Campaign, CampaignStatus } from '../../shared/types.ts';

const tone: Record<CampaignStatus, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = { ativa: 'green', pausada: 'amber', rascunho: 'gray', encerrada: 'gray' };

export function Ads() {
  const { data: campaigns, reload } = useApi<Campaign[]>('/campaigns', 6000);
  return (
    <div className="fade-in">
      <PageTitle title="Anúncios" subtitle="Campanhas criadas e otimizadas automaticamente, com teto de gasto" />
      {!campaigns?.length ? (
        <Card><Empty icon={<Megaphone className="h-10 w-10" />} title="Nenhuma campanha ainda" hint="Quando um produto for publicado, o autopiloto cria a campanha. Campanhas nascem pausadas até você liberar a ativação automática." /></Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2"><Badge tone={tone[c.status]}>{c.status}</Badge><span className="text-xs text-slate-500">{c.platform === 'meta' ? 'Meta Ads' : 'Simulação'}</span></div>
                  <h3 className="truncate font-bold text-white">{c.productName}</h3>
                  <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-slate-400">{c.copy.primaryText}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.status === 'ativa'
                    ? <ActionButton small variant="ghost" onClick={async () => { await api(`/campaigns/${c.id}/pause`, { body: {} }); await reload(); }}>Pausar</ActionButton>
                    : <ActionButton small onClick={async () => { await api(`/campaigns/${c.id}/activate`, { body: {} }); await reload(); }}>Ativar</ActionButton>}
                  <ActionButton small variant="ghost" onClick={async () => {
                    const v = prompt('Novo orçamento diário (R$):', String(c.dailyBudgetBRL)); if (!v) return;
                    await api(`/campaigns/${c.id}/budget`, { body: { value: Number(v.replace(',', '.')) } }); await reload();
                  }}>Orçamento</ActionButton>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                {[['Orçamento/dia', brl(c.dailyBudgetBRL)], ['Gasto', brl(c.spendBRL)], ['Receita', brl(c.revenueBRL)], ['ROAS', `${c.roas.toFixed(2)}x`], ['Compras', num(c.purchases)]].map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-bold tabular-nums text-white">{v}</dd></div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
