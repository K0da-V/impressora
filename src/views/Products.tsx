import { useState } from 'react';
import { Package, Search } from 'lucide-react';
import { api, useApi } from '../lib/api.ts';
import { brl, num } from '../lib/format.ts';
import { ActionButton, Badge, Card, Empty, PageTitle } from '../ui.tsx';
import type { Product, ProductStatus } from '../../shared/types.ts';

const tone: Record<ProductStatus, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
  publicado: 'green', rascunho: 'amber', candidata: 'blue', esgotado: 'red', rejeitada: 'gray',
};

export function Products() {
  const { data: products, reload } = useApi<Product[]>('/products', 6000);
  const [kw, setKw] = useState('');
  const [filter, setFilter] = useState<'todos' | ProductStatus>('todos');
  const list = (products ?? []).filter((p) => filter === 'todos' || p.status === filter);

  return (
    <div className="fade-in">
      <PageTitle title="Produtos" subtitle="Achados no fornecedor, com preço e margem calculados" />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">Palavra-chave</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Buscar nicho (ex.: neck massager) — vazio usa suas palavras-chave"
            className="w-full rounded-lg border border-white/10 bg-slate-950/60 py-2 pl-9 pr-3 text-sm placeholder:text-slate-500" />
        </label>
        <ActionButton onClick={async () => { const r = await api<{ found: number }>('/products/scout', { body: { keyword: kw } }); await reload(); alert(r.found ? `${r.found} produto(s) novo(s) adicionados.` : 'Nenhum produto novo passou nos filtros de margem, estoque e preço.'); }}>
          Buscar produtos agora
        </ActionButton>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por status">
        {(['todos', 'publicado', 'rascunho', 'candidata', 'esgotado', 'rejeitada'] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${filter === f ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>{f}</button>
        ))}
      </div>

      {!list.length ? (
        <Card><Empty icon={<Package className="h-10 w-10" />} title="Nenhum produto aqui ainda" hint="Clique em “Buscar produtos agora” ou ligue o autopiloto para ele encontrar produtos sozinho." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((p) => (
            <Card key={p.id} className="flex gap-4 p-4">
              <img src={p.images[0]} alt="" loading="lazy" className="h-24 w-24 shrink-0 rounded-xl bg-slate-800 object-cover" />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={tone[p.status]}>{p.status}</Badge>
                  <span className="text-xs text-slate-500">{p.category}</span>
                </div>
                <h3 className="truncate font-bold text-white" title={p.listing?.title ?? p.name}>{p.listing?.title ?? p.name}</h3>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-slate-500">Preço</dt><dd className="font-bold text-white">{brl(p.priceBRL)}</dd></div>
                  <div><dt className="text-slate-500">Margem</dt><dd className="font-bold text-emerald-300">{p.marginPercent.toFixed(0)}%</dd></div>
                  <div><dt className="text-slate-500">Estoque</dt><dd className="font-bold text-white">{num(p.stock)}</dd></div>
                  <div><dt className="text-slate-500">Custo + frete</dt><dd className="text-slate-300">{brl(p.costBRL + p.shippingBRL)}</dd></div>
                  <div><dt className="text-slate-500">ROAS mín.</dt><dd className="text-slate-300">{p.breakEvenRoas.toFixed(2)}x</dd></div>
                  <div><dt className="text-slate-500">Nota</dt><dd className="text-slate-300">{p.score}/100</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(p.status === 'rascunho' || p.status === 'candidata') && <ActionButton small onClick={async () => { await api(`/products/${p.id}/publish`, { body: {} }); await reload(); }}>Publicar</ActionButton>}
                  {p.status === 'publicado' && <ActionButton small variant="ghost" onClick={async () => { await api(`/products/${p.id}/unpublish`, { body: {} }); await reload(); }}>Despublicar</ActionButton>}
                  {p.storeUrl && p.status !== 'candidata' && <ActionButton small variant="ghost" onClick={async () => { await api(`/products/${p.id}/campaign`, { body: {} }); alert('Campanha criada (pausada). Ative em Anúncios.'); }}>Criar anúncio</ActionButton>}
                  {p.status !== 'rejeitada' && p.status !== 'publicado' && <ActionButton small variant="danger" onClick={async () => { await api(`/products/${p.id}/reject`, { body: {} }); await reload(); }}>Rejeitar</ActionButton>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
