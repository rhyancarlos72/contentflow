import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Chips, Field, Input, Textarea } from "@/components/ui/Field";
import { PageLoader } from "@/components/ui/misc";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { GOALS, PLATFORMS, TONES } from "@/lib/constants";
import { friendlyError, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const NICHE_SUGGESTIONS = ["Finanças pessoais", "Nutrição", "Moda", "Marketing digital", "Educação", "Fitness", "Beleza", "Tecnologia", "Gastronomia", "Psicologia"];

export default function Onboarding() {
  const { user, profile, loading, updateProfile } = useAuth();
  const { projects, refetchProjects } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    niche: "",
    audience: "",
    platforms: [] as string[],
    goal: "" as string,
    perWeek: 3,
    style: "natural",
    projectName: "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/entrar" replace />;
  if (profile?.onboarding_completed && projects.length > 0) return <Navigate to="/app" replace />;

  const steps = [
    { title: "Qual é o seu nicho?", subtitle: "O assunto principal do seu conteúdo.", valid: form.niche.trim().length > 1 },
    { title: "Quem é o seu público?", subtitle: "Descreva quem você quer alcançar — quanto mais específico, melhor a IA te ajuda.", valid: form.audience.trim().length > 5 },
    { title: "Quais redes sociais você usa?", subtitle: "Escolha uma ou mais.", valid: form.platforms.length > 0 },
    { title: "Qual é o seu principal objetivo?", subtitle: "Isso orienta a estratégia dos planejamentos.", valid: Boolean(form.goal) },
    { title: "Quantas vezes pretende publicar por semana?", subtitle: "Seja realista: constância vale mais que volume.", valid: form.perWeek > 0 },
    { title: "Qual é o seu estilo de comunicação?", subtitle: "A IA vai escrever nesse tom.", valid: Boolean(form.style) },
  ];
  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  const finish = async () => {
    setSaving(true);
    try {
      const toneLabel = TONES.find((t) => t.value === form.style)?.label ?? form.style;
      const projectFields = {
        name: form.projectName.trim() || `${profile?.full_name?.split(" ")[0] || "Meu"} · ${form.niche}`.slice(0, 80),
        kind: "marca_pessoal",
        niche: form.niche.trim(),
        audience: form.audience.trim(),
        voice: toneLabel,
        platforms: form.platforms,
        goals: [form.goal],
        posts_per_week: form.perWeek,
      };
      let projectId = projects[0]?.id;
      if (projectId) {
        const { error } = await supabase.from("projects").update(projectFields).eq("id", projectId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("projects").insert({ ...projectFields, user_id: user.id }).select("id").single();
        if (error) throw error;
        projectId = data.id as string;
      }
      const base = { user_id: user.id, project_id: projectId, source: "onboarding" };
      await supabase.from("ai_memory").upsert([
        { ...base, kind: "publico", content: form.audience.trim() },
        { ...base, kind: "tom_de_voz", content: toneLabel },
        { ...base, kind: "objetivo", content: form.goal },
      ], { onConflict: "project_id,kind,content", ignoreDuplicates: true });
      await supabase.from("idea_categories").upsert(
        [["Educativo", "#4F7BE8"], ["Bastidores", "#E8A33D"], ["Vendas", "#20B486"], ["Tendências", "#D6337A"]]
          .map(([name, color]) => ({ user_id: user.id, project_id: projectId, name, color })),
        { onConflict: "project_id,name", ignoreDuplicates: true },
      );
      await updateProfile({
        niche: form.niche.trim(),
        communication_style: form.style,
        weekly_goal: form.perWeek,
        onboarding_completed: true,
        tutorial_completed: false,
        active_project_id: projectId,
      });
      await qc.invalidateQueries({ queryKey: ["plan"] });
      refetchProjects();
      toast.success("Tudo pronto! Seu primeiro projeto foi criado.");
      navigate("/app", { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#EDE6FB,transparent_60%)]">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="text-sm font-semibold text-ink-soft">{step + 1} de {steps.length}</span>
        </div>
        <div className="mt-6 flex gap-1.5">
          {steps.map((_, i) => (
            <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-brand-500" : "bg-line")} />
          ))}
        </div>

        <div key={step} className="card mt-10 flex-1 animate-fade-in p-6 sm:flex-none sm:p-8">
          <h1 className="text-2xl font-bold">{current.title}</h1>
          <p className="mt-1.5 text-sm text-ink-soft">{current.subtitle}</p>
          <div className="mt-6">
            {step === 0 && (
              <div className="space-y-4">
                <Input autoFocus value={form.niche} onChange={(e) => set("niche", e.target.value)} placeholder="Ex.: finanças para jovens adultos" />
                <div className="flex flex-wrap gap-2">
                  {NICHE_SUGGESTIONS.map((n) => (
                    <button key={n} type="button" className={cn("chip", form.niche === n && "chip-active")} onClick={() => set("niche", n)}>{n}</button>
                  ))}
                </div>
                <Field label="Nome do projeto (opcional)" hint="Você pode criar outros projetos depois, como clientes ou marcas.">
                  <Input value={form.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="Ex.: Minha marca pessoal" />
                </Field>
              </div>
            )}
            {step === 1 && (
              <Textarea autoFocus rows={4} value={form.audience} onChange={(e) => set("audience", e.target.value)}
                placeholder="Ex.: mulheres de 25 a 40 anos, CLT, que querem sair das dívidas e começar a investir, mas acham o assunto complicado." />
            )}
            {step === 2 && (
              <Chips multiple options={PLATFORMS} value={form.platforms} onChange={(v) => set("platforms", v)} />
            )}
            {step === 3 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {GOALS.map((g) => (
                  <button key={g} type="button" onClick={() => set("goal", g)}
                    className={cn("flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition",
                      form.goal === g ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line hover:border-brand-200")}>
                    {g}
                    {form.goal === g && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}
            {step === 4 && (
              <div>
                <div className="flex items-center gap-4">
                  <input type="range" min={1} max={14} value={form.perWeek} onChange={(e) => set("perWeek", Number(e.target.value))}
                    className="flex-1 accent-brand-500" aria-label="Publicações por semana" />
                  <span className="w-28 text-right text-2xl font-extrabold text-brand-600">{form.perWeek}<span className="text-sm font-semibold text-ink-soft"> /semana</span></span>
                </div>
                <p className="hint mt-3">Essa será sua meta semanal no dashboard. Dá para mudar quando quiser.</p>
              </div>
            )}
            {step === 5 && <Chips options={TONES} value={[form.style]} onChange={(v) => set("style", v[0] ?? "natural")} />}
          </div>
        </div>

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} disabled={step === 0} onClick={() => setStep(step - 1)}>Voltar</Button>
          {isLast ? (
            <Button size="lg" loading={saving} disabled={!current.valid} onClick={finish} icon={<Check className="h-4 w-4" />}>Concluir e criar projeto</Button>
          ) : (
            <Button size="lg" disabled={!current.valid} onClick={() => setStep(step + 1)}>Continuar <ArrowRight className="h-4 w-4" /></Button>
          )}
        </div>
      </div>
    </div>
  );
}
