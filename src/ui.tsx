import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-white/10 bg-slate-900/60 ${className}`}>{children}</section>;
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const tones = {
  green: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  red: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  blue: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  gray: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
};
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

/** Botão que mostra carregando e exibe o erro do servidor. */
export function ActionButton({ onClick, children, variant = 'primary', disabled, small }: {
  onClick: () => Promise<unknown>; children: ReactNode; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; small?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const styles = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
    ghost: 'bg-white/5 text-slate-200 hover:bg-white/10 ring-1 ring-inset ring-white/10',
    danger: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 ring-1 ring-inset ring-rose-500/30',
  }[variant];
  return (
    <button
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        try { await onClick(); } catch (e: any) { alert(e?.message ?? 'Algo deu errado'); } finally { setBusy(false); }
      }}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} ${styles}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-slate-400">
      <div className="text-slate-500">{icon}</div>
      <p className="font-semibold text-slate-200">{title}</p>
      {hint && <p className="max-w-md text-sm">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-white'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}
