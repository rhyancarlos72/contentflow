import { Logo } from "@/components/Logo";

export default function SetupRequired() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-lg p-8">
        <Logo />
        <h1 className="mt-6 text-xl font-bold">Conecte o Supabase para começar</h1>
        <p className="mt-2 text-sm text-ink-soft">
          O app não recebeu a URL e/ou a anon key do Supabase. Defina as variáveis abaixo nas configurações da hospedagem
          (na Hostinger: <strong>Variáveis de ambiente</strong> do app Node.js) e reimplante. Em desenvolvimento, use um
          arquivo <code className="rounded bg-canvas px-1.5 py-0.5">.env</code> na raiz.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-white">
{`VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key`}
        </pre>
        <p className="mt-4 text-xs text-ink-soft">
          Para ver quais variáveis o servidor recebeu, abra <a className="font-semibold text-brand-600" href="/healthz">/healthz</a>.
        </p>
      </div>
    </div>
  );
}
