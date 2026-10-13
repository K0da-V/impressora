import { ShoppingBag } from 'lucide-react';
import { api, useApi } from '../lib/api.ts';
import { brl, when } from '../lib/format.ts';
import { ActionButton, Badge, Card, Empty, PageTitle } from '../ui.tsx';
import type { Order, OrderStatus } from '../../shared/types.ts';

const label: Record<OrderStatus, string> = { recebido: 'Recebido', enviado_fornecedor: 'No fornecedor', em_transito: 'Em trânsito', entregue: 'Entregue', erro: 'Erro' };
const tone: Record<OrderStatus, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = { recebido: 'gray', enviado_fornecedor: 'blue', em_transito: 'amber', entregue: 'green', erro: 'red' };

export function Orders() {
  const { data: orders, reload } = useApi<Order[]>('/orders', 6000);
  return (
    <div className="fade-in">
      <PageTitle title="Pedidos" subtitle="Pedidos pagos na loja são enviados ao fornecedor automaticamente" />
      {!orders?.length ? (
        <Card><Empty icon={<ShoppingBag className="h-10 w-10" />} title="Nenhum pedido ainda" hint="Configure o webhook de pedidos da sua loja (veja Configurações) para que as vendas apareçam aqui e sigam para o fornecedor." /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr>{['Pedido', 'Cliente', 'Total', 'Status', 'Rastreio', 'Data', ''].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-white/5">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-bold text-white">{o.number}</td>
                  <td className="px-4 py-3 text-slate-300">{o.customerName}<div className="text-xs text-slate-500">{o.customerEmail}</div></td>
                  <td className="px-4 py-3 tabular-nums">{brl(o.totalBRL)}</td>
                  <td className="px-4 py-3"><Badge tone={tone[o.status]}>{label[o.status]}</Badge>{o.error && <div className="mt-1 max-w-xs text-xs text-rose-300">{o.error}</div>}</td>
                  <td className="px-4 py-3 text-slate-300">{o.tracking ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{when(o.createdAt)}</td>
                  <td className="px-4 py-3">{o.status === 'erro' && <ActionButton small variant="ghost" onClick={async () => { await api(`/orders/${o.id}/retry`, { body: {} }); await reload(); }}>Tentar de novo</ActionButton>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
