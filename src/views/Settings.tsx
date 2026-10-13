import { useState } from 'react';
import { CheckCircle2, CircleDashed, Copy } from 'lucide-react';
import { api } from '../lib/api.ts';
import { ActionButton, Badge, Card, PageTitle } from '../ui.tsx';
import type { StatusResponse } from '../../shared/types.ts';

export function Settings({ status, reload }: { status: StatusResponse; reload: () => void }) {
  const [kws, setKws] = useState(status.keywords.join(', '));
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <div className="fade-in">
      <PageTitle title="Configurações" subtitle="Integrações, travas de segurança e palavras-chave de busca" />

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-bold text-white">Integrações</h2>
        <ul className="divide-y divide-white/5">
          {status.integrations.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start gap-3 py-3">
              {i.configured ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" aria-label="Conectado" /> : <CircleDashed className="mt-0.5 h-5 w-5 text-amber-400" aria-label="Pendente" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-100">{i.label} <span className="ml-2 text-xs font-normal text-slate-400">{i.detail}</span></p>
                {!i.configured && <p className="mt-1 break-words text-xs text-slate-500">Defina no arquivo <code>.env</code>: {i.env.join(', ')}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-xl bg-slate-950/60 p-4 text-xs text-slate-400">
          <p className="mb-2 font-semibold text-slate-200">URLs de webhook de pedidos (configure na sua loja, evento “pedido pago”):</p>
          {[`${origin}/webhooks/shopify`, `${origin}/webhooks/woocommerce`].map((u) => (
            <p key={u} className="flex items-center gap-2 font-mono">{u}
              <button className="text-slate-500 hover:text-slate-200" aria-label={`Copiar ${u}`} onClick={() => navigator.clipboard?.writeText(u)}><Copy className="h-3.5 w-3.5" /></button>
            </p>
          ))}
          <p className="mt-2">Use HTTPS público (a loja precisa alcançar este servidor) e o mesmo segredo definido em <code>SHOPIFY_WEBHOOK_SECRET</code> / <code>WOO_WEBHOOK_SECRET</code>.</p>
        </div>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-1 font-bold text-white">Palavras-chave de busca</h2>
        <p className="mb-3 text-sm text-slate-400">O autopiloto procura produtos por estes termos (em inglês funciona melhor no catálogo da CJ). Separe por vírgula.</p>
        <div className="flex flex-wrap gap-2">
          <label className="min-w-64 flex-1"><span className="sr-only">Palavras-chave</span>
            <input value={kws} onChange={(e) => setKws(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm" />
          </label>
          <ActionButton onClick={async () => { await api('/settings/keywords', { body: { keywords: kws.split(',') } }); reload(); }}>Salvar</ActionButton>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-bold text-white">Travas e regras ativas</h2>
        <p className="mb-3 text-sm text-slate-400">Definidas no <code>.env</code> (reinicie o servidor após alterar). Os padrões são conservadores: produtos entram como rascunho e anúncios nascem pausados.</p>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {Object.entries(status.guardrails).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5">
              <dt className="text-slate-400">{k}</dt>
              <dd>{typeof v === 'boolean' ? <Badge tone={v ? 'amber' : 'green'}>{v ? 'Automático' : 'Manual'}</Badge> : <span className="font-bold tabular-nums text-white">{v}</span>}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
