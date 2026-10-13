import { Bot, Play, Power, AlertTriangle, Info, CircleAlert } from 'lucide-react';
import { api, useApi } from '../lib/api.ts';
import { brl, when } from '../lib/format.ts';
import { ActionButton, Card, PageTitle, Stat } from '../ui.tsx';
import type { Stats, StatusResponse, EventLog } from '../../shared/types.ts';

export function Dashboard({ status, reloadStatus, go }: { status: StatusResponse; reloadStatus: () => void; go: (t: string) => void }) {
  const { data: s } = useApi<Stats>('/stats');
  const { data: events } = useApi<EventLog[]>('/events', 5000);
  const missing = status.integrations.filter((i) => !i.configured && i.id !== 'admin');

  return (
    <div className="fade-in">
      <PageTitle title="Painel" subtitle="Visão geral da operação em tempo real" />

      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className={`grid h-12 w-12 place-items-center rounded-xl ${status.autopilotEnabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'}`}>
            <Bot className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="font-bold text-white">Autopiloto {status.autopilotEnabled ? 'ligado' : 'desligado'}</p>
            <p className="text-sm text-slate-400">
              {status.cycleRunning ? 'Executando um ciclo agora…' : `Último ciclo: ${when(status.lastCycleAt)}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="ghost" onClick={async () => { await api('/autopilot/toggle', { body: { enabled: !status.autopilotEnabled } }); reloadStatus(); }}>
            <Power className="h-4 w-4" aria-hidden /> {status.autopilotEnabled ? 'Desligar' : 'Ligar'}
          </ActionButton>
          <ActionButton onClick={async () => { await api('/autopilot/run', { body: {} }); reloadStatus(); }} disabled={status.cycleRunning}>
            <Play className="h-4 w-4" aria-hidden /> Rodar ciclo agora
          </ActionButton>
        </div>
      </Card>

      {missing.length > 0 && (
        <button onClick={() => go('settings')} className="mb-6 flex w-full items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left text-sm text-amber-200 hover:bg-amber-500/15">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span><b>{missing.length} integração(ões) ainda não conectada(s):</b> {missing.map((m) => m.label).join(', ')}. Clique para ver o que configurar.</span>
        </button>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receita" value={brl(s?.revenueBRL ?? 0)} hint={`${s?.orders ?? 0} pedidos`} />
        <Stat label="Lucro estimado" value={brl(s?.estimatedProfitBRL ?? 0)} hint="após taxas, produto e anúncios" tone={(s?.estimatedProfitBRL ?? 0) >= 0 ? 'good' : 'bad'} />
        <Stat label="Gasto em anúncios" value={brl(s?.adSpendBRL ?? 0)} hint={`${s?.activeCampaigns ?? 0} campanhas ativas`} />
        <Stat label="ROAS" value={`${(s?.roas ?? 0).toFixed(2)}x`} hint="receita ÷ gasto em anúncios" />
      </div>

      {(s?.ordersWithError ?? 0) > 0 && (
        <button onClick={() => go('orders')} className="mb-6 flex w-full items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-left text-sm text-rose-200">
          <CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> {s!.ordersWithError} pedido(s) com erro precisam da sua atenção.
        </button>
      )}

      <Card className="p-5">
        <h2 className="mb-3 font-bold text-white">Atividade recente</h2>
        {!events?.length ? (
          <p className="py-6 text-center text-sm text-slate-400">Nada aconteceu ainda. Rode um ciclo para ver o autopiloto trabalhando.</p>
        ) : (
          <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1 text-sm">
            {events.slice(0, 40).map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-24 shrink-0 text-xs tabular-nums text-slate-500">{when(e.at)}</span>
                {e.level === 'error' ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-label="erro" /> : e.level === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-label="aviso" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-label="info" />}
                <span className="text-slate-300"><b className="text-slate-100">{e.scope}:</b> {e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
