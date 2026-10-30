import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Brain, CalendarDays, FolderKanban, Lightbulb, Target, Wand2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { SLOGAN } from "@/lib/constants";
import { PLANS } from "./Pricing";
import { fmtCurrency } from "@/lib/utils";

const PILLARS = [
  { icon: Target, title: "Planejamento estratégico personalizado", text: "Diga seu objetivo e receba 7, 15 ou 30 dias de conteúdo com pilares equilibrados e sem temas repetidos." },
  { icon: Brain, title: "IA que entende seu estilo", text: "Cada projeto tem uma memória com tom de voz, público e palavras proibidas. A IA respeita tudo isso." },
  { icon: Wand2, title: "Da ideia ao conteúdo completo", text: "Gancho, roteiro, legenda, CTA e hashtags — escritos de forma natural, como gente falando com gente." },
  { icon: FolderKanban, title: "Toda a produção num só lugar", text: "Calendário, banco de ideias, roteiros e Kanban de gravação, edição e revisão conectados entre si." },
  { icon: BarChart3, title: "Aprendizado com resultados reais", text: "Registre suas métricas e receba análises honestas sobre formatos, temas e frequência que funcionam." },
];

const STEPS = [
  { icon: Lightbulb, title: "Conte sobre você", text: "Nicho, público, redes e objetivo. Leva 2 minutos." },
  { icon: CalendarDays, title: "Receba seu plano", text: "A IA monta o calendário com tudo pronto para gravar." },
  { icon: FolderKanban, title: "Produza com fluidez", text: "Acompanhe cada etapa até publicar." },
  { icon: BarChart3, title: "Melhore a cada semana", text: "Os resultados reais orientam os próximos conteúdos." },
];

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link to="/precos" className="hidden px-3 text-sm font-semibold text-ink-soft hover:text-ink sm:block">Preços</Link>
            <Link to="/entrar"><Button variant="ghost">Entrar</Button></Link>
            <Link to="/cadastro"><Button>Começar grátis</Button></Link>
          </nav>
        </div>
      </header>

      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,#E9E1F9,transparent_60%)]" />
        <div className="absolute -right-40 top-20 -z-10 h-[420px] w-[420px] rounded-full bg-brand-200/40 blur-3xl" />
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-bold text-brand-700">
            <Wand2 className="h-3.5 w-3.5" /> Estrategista, roteirista e organizador num só lugar
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold leading-[1.08] sm:text-6xl">
            Da ideia à publicação.<br /><span className="bg-gradient-to-r from-brand-500 to-brand-800 bg-clip-text text-transparent">Seu conteúdo, com estratégia e inteligência.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-soft">
            O ContentFlow AI transforma ideias simples em conteúdos completos, organiza toda a sua produção e aprende com os seus resultados — para você publicar com constância sem perder a sua voz.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/cadastro"><Button size="lg">Criar conta grátis <ArrowRight className="h-4 w-4" /></Button></Link>
            <Link to="/precos"><Button size="lg" variant="secondary">Ver planos</Button></Link>
          </div>
          <p className="mt-3 text-xs text-ink-soft">Sem cartão de crédito no plano gratuito.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-center text-3xl font-extrabold">Mais que um gerador de textos</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-ink-soft">Cinco pilares para pensar estrategicamente, produzir com consistência e evoluir sua comunicação.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p, i) => (
            <div key={p.title} className={`card p-6 ${i === 0 ? "lg:col-span-2 bg-gradient-to-br from-white to-brand-50" : ""}`}>
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500 text-white shadow-glow"><p.icon className="h-5 w-5" /></div>
              <h3 className="mt-4 text-lg font-bold">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-extrabold">Como funciona</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative">
                <span className="text-5xl font-extrabold text-brand-100">0{i + 1}</span>
                <div className="-mt-4 flex items-center gap-2"><s.icon className="h-5 w-5 text-brand-500" /><h3 className="font-bold">{s.title}</h3></div>
                <p className="mt-1.5 text-sm text-ink-soft">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-center text-3xl font-extrabold">Planos</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.id} className="card p-6">
              <p className="font-bold">{p.name}</p>
              <p className="mt-2 text-3xl font-extrabold">{p.price ? fmtCurrency(p.price) : "Grátis"}<span className="text-sm font-semibold text-ink-soft">{p.price ? "/mês" : ""}</span></p>
              <p className="mt-2 text-sm text-ink-soft">{p.tagline}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center"><Link to="/precos" className="font-semibold text-brand-600 hover:underline">Comparar todos os recursos →</Link></div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-[#2A1A5C] px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-extrabold">Seu próximo mês de conteúdo começa hoje</h2>
          <p className="mx-auto mt-3 max-w-lg text-white/80">Crie sua conta, responda 6 perguntas e receba seu primeiro planejamento.</p>
          <Link to="/cadastro"><Button size="lg" variant="secondary" className="mt-7">Começar grátis <ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
      </section>

      <footer className="border-t border-line bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 text-sm text-ink-soft">
          <Logo />
          <p>{SLOGAN}</p>
          <p>© {new Date().getFullYear()} ContentFlow AI</p>
        </div>
      </footer>
    </div>
  );
}
