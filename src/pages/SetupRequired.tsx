import { Logo } from "@/components/Logo";

export default function SetupRequired() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-lg p-8">
        <Logo />
        <h1 className="mt-6 text-xl font-bold">Conecte o Supabase para começar</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Crie um arquivo <code className="rounded bg-canvas px-1.5 py-0.5">.env</code> na raiz do projeto com as variáveis abaixo
          (veja <code className="rounded bg-canvas px-1.5 py-0.5">.env.example</code> e o README) e reinicie o servidor.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-white">
{`VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key`}
        </pre>
      </div>
    </div>
  );
}
