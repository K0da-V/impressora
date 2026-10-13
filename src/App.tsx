import { useState } from 'react';
import { BarChart3, Package, Megaphone, ShoppingBag, MessageCircle, Settings as Cog, Lock, FlaskConical } from 'lucide-react';
import { api, setToken, clearToken, useApi, ApiError } from './lib/api.ts';
import { Dashboard } from './views/Dashboard.tsx';
import { Products } from './views/Products.tsx';
import { Ads } from './views/Ads.tsx';
import { Orders } from './views/Orders.tsx';
import { Support } from './views/Support.tsx';
import { Settings } from './views/Settings.tsx';
import type { StatusResponse } from '../shared/types.ts';

const TABS = [
  { id: 'dashboard', label: 'Painel', icon: BarChart3 },
  { id: 'products', label: 'Produtos', icon: Package },
  { id: 'ads', label: 'Anúncios', icon: Megaphone },
  { id: 'orders', label: 'Pedidos', icon: ShoppingBag },
  { id: 'support', label: 'Atendimento', icon: MessageCircle },
  { id: 'settings', label: 'Configurações', icon: Cog },
] as const;

function Login({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/70 p-6"
        onSubmit={async (e) => {
          e.preventDefault(); setToken(t.trim());
          try { await api('/status'); onDone(); } catch (x) { clearToken(); setErr((x as ApiError).message); }
        }}>
        <Lock className="mb-3 h-8 w-8 text-indigo-400" aria-hidden />
        <h1 className="text-xl font-extrabold text-white">AutoDrop AI</h1>
        <p className="mb-4 text-sm text-slate-400">Digite a senha do painel (<code>ADMIN_TOKEN</code>).</p>
        <label className="block"><span className="sr-only">Senha</span>
          <input type="password" autoFocus value={t} onChange={(e) => setT(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2" />
        </label>
        {err && <p role="alert" className="mt-2 text-sm text-rose-300">{err}</p>}
        <button className="mt-4 w-full rounded-lg bg-indigo-500 py-2 font-semibold text-white hover:bg-indigo-400">Entrar</button>
      </form>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<string>('dashboard');
  const { data: status, error, reload } = useApi<StatusResponse>('/status', 5000);

  if (error?.status === 401) return <Login onDone={reload} />;
  if (error?.status === 503) return <div className="grid min-h-screen place-items-center p-6 text-center text-slate-300">{error.message}</div>;
  if (!status) return <div className="grid min-h-screen place-items-center text-slate-400">Carregando…</div>;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-white/10 bg-slate-950/80 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500 font-extrabold text-white">A</div>
          <span className="font-extrabold text-white">AutoDrop AI</span>
        </div>
        <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${tab === id ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        {status.demoMode && (
          <div role="status" className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-sm text-amber-200">
            <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
            <span><b>Modo demonstração:</b> dados simulados, nada é publicado nem gasto de verdade. Conecte o fornecedor e a loja em Configurações.</span>
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {tab === 'dashboard' && <Dashboard status={status} reloadStatus={reload} go={setTab} />}
          {tab === 'products' && <Products />}
          {tab === 'ads' && <Ads />}
          {tab === 'orders' && <Orders />}
          {tab === 'support' && <Support />}
          {tab === 'settings' && <Settings status={status} reload={reload} />}
        </div>
      </main>
    </div>
  );
}
