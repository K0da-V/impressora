import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Card, PageTitle } from '../ui.tsx';

type Msg = { sender: 'user' | 'ai'; text: string };

export function Support() {
  const [msgs, setMsgs] = useState<Msg[]>([{ sender: 'ai', text: 'Olá! Sou o atendimento da loja. Posso ajudar com prazo, trocas ou o status do seu pedido (informe o número e o e-mail da compra).' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function send() {
    const t = text.trim(); if (!t || busy) return;
    const next = [...msgs, { sender: 'user' as const, text: t }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const res = await fetch('/api/support/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) });
      const d = await res.json();
      setMsgs([...next, { sender: 'ai', text: d.reply ?? d.error ?? 'Não consegui responder agora.' }]);
    } catch { setMsgs([...next, { sender: 'ai', text: 'Falha de conexão. Tente novamente.' }]); }
    finally { setBusy(false); }
  }

  return (
    <div className="fade-in">
      <PageTitle title="Atendimento" subtitle="Teste o assistente que responde seus clientes. A consulta de pedido exige número + e-mail da compra." />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="flex h-[32rem] flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : ''}`}>
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${m.sender === 'user' ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-200'}`}>{m.text}</p>
              </div>
            ))}
            {busy && <p className="text-xs text-slate-500">Digitando…</p>}
            <div ref={end} />
          </div>
          <form className="flex gap-2 border-t border-white/10 p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <label className="flex-1"><span className="sr-only">Mensagem</span>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Escreva uma mensagem" className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm" />
            </label>
            <button disabled={busy || !text.trim()} className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-500 text-white disabled:opacity-50" aria-label="Enviar"><Send className="h-4 w-4" /></button>
          </form>
        </Card>
        <Card className="p-5 text-sm text-slate-300">
          <h2 className="mb-2 font-bold text-white">Como funciona</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Responde só com as políticas definidas em <code>POLICY_DELIVERY</code> e <code>POLICY_RETURNS</code>.</li>
            <li>Status e rastreio só aparecem quando o cliente informa número do pedido e e-mail que conferem.</li>
            <li>Reembolsos e alterações são encaminhados à sua equipe (<code>SUPPORT_EMAIL</code>).</li>
            <li>O endpoint público <code>/api/support/chat</code> tem limite de 20 mensagens por minuto por IP.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
