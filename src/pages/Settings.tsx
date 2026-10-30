import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell, CreditCard, Database, ExternalLink, KeyRound, MessageCircle, Palette, Plus, Share2, ShieldCheck, Trash2, User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Chips, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, Card, Dot, ProgressBar } from "@/components/ui/misc";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { PLAN_INFO, platformLabel, PLATFORMS, TONES } from "@/lib/constants";
import { useProjectRows, useTableMutations } from "@/lib/queries";
import { friendlyError, supabase } from "@/lib/supabase";
import { cn, fmtCurrency, fmtDate, toISODate } from "@/lib/utils";
import type { NotificationPrefs, SocialAccount } from "@/types";

const TABS = [
  { value: "perfil", label: "Dados pessoais", icon: User },
  { value: "comunicacao", label: "Comunicação", icon: MessageCircle },
  { value: "identidade", label: "Identidade do projeto", icon: Palette },
  { value: "redes", label: "Redes sociais", icon: Share2 },
  { value: "notificacoes", label: "Notificações", icon: Bell },
  { value: "plano", label: "Plano", icon: CreditCard },
  { value: "seguranca", label: "Segurança", icon: KeyRound },
  { value: "privacidade", label: "Privacidade e dados", icon: ShieldCheck },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "perfil";
  const { refetchPlan } = useWorkspace();

  useEffect(() => {
    if (params.get("checkout") === "sucesso") {
      toast.success("Pagamento confirmado! Seu plano será atualizado em instantes.");
      setTimeout(refetchPlan, 2500);
      params.delete("checkout");
      setParams(params, { replace: true });
    }
  }, [params, setParams, refetchPlan]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Configurações</h1>
        <p className="page-subtitle">Sua conta, preferências, plano e privacidade.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card className="scrollbar-thin flex h-fit gap-1 overflow-x-auto p-2 lg:flex-col">
          {TABS.map((t) => (
            <button key={t.value} onClick={() => setParams({ tab: t.value })}
              className={cn("flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition",
                tab === t.value ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-canvas hover:text-ink")}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </Card>
        <div key={tab} className="min-w-0 animate-fade-in">
          {tab === "perfil" && <ProfileTab />}
          {tab === "comunicacao" && <CommunicationTab />}
          {tab === "identidade" && <IdentityTab />}
          {tab === "redes" && <SocialTab />}
          {tab === "notificacoes" && <NotificationsTab />}
          {tab === "plano" && <PlanTab />}
          {tab === "seguranca" && <SecurityTab />}
          {tab === "privacidade" && <PrivacyTab />}
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card>
      <div className="border-b border-line px-6 py-4">
        <h2 className="font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-3">{footer}</div>}
    </Card>
  );
}

function ProfileTab() {
  const { profile, user, updateProfile } = useAuth();
  const [form, setForm] = useState({ full_name: profile?.full_name ?? "", niche: profile?.niche ?? "", weekly_goal: profile?.weekly_goal ?? 3, avatar_url: profile?.avatar_url ?? "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({ ...form, avatar_url: form.avatar_url || null });
      await supabase.auth.updateUser({ data: { full_name: form.full_name } });
      toast.success("Perfil atualizado");
    } catch (e) { toast.error(friendlyError(e)); } finally { setSaving(false); }
  };
  return (
    <Section title="Dados pessoais" footer={<Button onClick={save} loading={saving}>Salvar alterações</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
        <Field label="E-mail" hint="Para trocar o e-mail, fale com o suporte."><Input value={user?.email ?? ""} disabled /></Field>
        <Field label="Nicho principal"><Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} /></Field>
        <Field label="Meta semanal de publicações"><Input type="number" min={0} max={50} value={form.weekly_goal} onChange={(e) => setForm({ ...form, weekly_goal: Number(e.target.value) })} /></Field>
        <Field label="URL da foto de perfil (opcional)" className="sm:col-span-2"><Input type="url" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://" /></Field>
      </div>
    </Section>
  );
}

function CommunicationTab() {
  const { profile, updateProfile } = useAuth();
  const [style, setStyle] = useState(profile?.communication_style ?? "natural");
  return (
    <Section title="Preferências de comunicação" description="Tom padrão usado quando você não escolhe outro nas ferramentas de IA."
      footer={<Button onClick={async () => { await updateProfile({ communication_style: style }); toast.success("Preferência salva"); }}>Salvar</Button>}>
      <Chips options={TONES} value={[style]} onChange={(v) => setStyle(v[0] ?? "natural")} />
      <p className="hint mt-4">Para ajustes finos por projeto (palavras a evitar, estilo de escrita), use a <Link to="/projetos" className="font-semibold text-brand-600">Memória da IA</Link> de cada projeto.</p>
    </Section>
  );
}

function IdentityTab() {
  const { project, refetchProjects } = useWorkspace();
  const [voice, setVoice] = useState(project?.voice ?? "");
  const [color, setColor] = useState(project?.color ?? "#7952D6");
  const save = async () => {
    const { error } = await supabase.from("projects").update({ voice, color }).eq("id", project!.id);
    if (error) return toast.error(friendlyError(error));
    refetchProjects();
    toast.success("Identidade atualizada");
  };
  return (
    <Section title={`Identidade de ${project?.name}`} description="Cor usada no app e identidade de comunicação que a IA segue." footer={<Button onClick={save}>Salvar</Button>}>
      <div className="space-y-4">
        <Field label="Cor do projeto">
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-line" aria-label="Cor" />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="max-w-[140px]" />
          </div>
        </Field>
        <Field label="Identidade de comunicação"><Textarea rows={4} value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Ex.: fala como uma amiga que entende de finanças; direta, sem termos técnicos" /></Field>
        <Link to="/projetos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">Editar todos os dados do projeto <ExternalLink className="h-3.5 w-3.5" /></Link>
      </div>
    </Section>
  );
}

function SocialTab() {
  const { project } = useWorkspace();
  const accounts = useProjectRows<SocialAccount>("social_accounts", { order: "created_at", ascending: true });
  const { create, remove } = useTableMutations<SocialAccount>("social_accounts");
  const [form, setForm] = useState({ platform: "instagram", handle: "", followers: "" });
  const add = async () => {
    if (!form.handle.trim()) return toast.error("Informe o @ ou nome do perfil.");
    await create.mutateAsync({ platform: form.platform, handle: form.handle.trim().replace(/^@?/, "@"), followers: form.followers ? Number(form.followers) : null, connection_type: "manual" });
    setForm({ ...form, handle: "", followers: "" });
  };
  return (
    <Section title={`Redes sociais de ${project?.name}`} description="Perfis vinculados a este projeto. A conexão oficial via API (OAuth) será habilitada conforme cada integração for aprovada pelas plataformas.">
      <div className="grid gap-2 sm:grid-cols-[180px_1fr_140px_auto]">
        <Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>{PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select>
        <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="@seuperfil" />
        <Input type="number" min={0} value={form.followers} onChange={(e) => setForm({ ...form, followers: e.target.value })} placeholder="Seguidores" />
        <Button onClick={add} loading={create.isPending} icon={<Plus className="h-4 w-4" />}>Adicionar</Button>
      </div>
      <div className="mt-4 space-y-2">
        {(accounts.data ?? []).length === 0 && <p className="py-6 text-center text-sm text-ink-soft">Nenhum perfil cadastrado.</p>}
        {(accounts.data ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
            <Dot color="#7952D6" />
            <div className="flex-1">
              <p className="text-sm font-semibold">{a.handle}</p>
              <p className="text-xs text-ink-soft">{platformLabel(a.platform)}{a.followers !== null && ` · ${a.followers.toLocaleString("pt-BR")} seguidores`}</p>
            </div>
            <Badge color="#5E5C73" bg="#F3F2F8">{a.connection_type === "oauth" ? "Conectado" : "Manual"}</Badge>
            <button onClick={() => remove.mutate(a.id)} className="text-ink-faint hover:text-[#D93A4A]" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function NotificationsTab() {
  const { profile, updateProfile } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(profile!.notification_prefs);
  const toggle = (k: keyof NotificationPrefs) => setPrefs((p) => ({ ...p, [k]: !p[k] }));
  const Row = ({ k, label, desc, disabled }: { k: keyof NotificationPrefs; label: string; desc?: string; disabled?: boolean }) => (
    <label className={cn("flex items-center justify-between gap-4 py-3", disabled && "opacity-50")}>
      <span><span className="block text-sm font-semibold">{label}</span>{desc && <span className="text-xs text-ink-soft">{desc}</span>}</span>
      <button type="button" role="switch" aria-checked={prefs[k]} disabled={disabled} onClick={() => toggle(k)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", prefs[k] ? "bg-brand-500" : "bg-line")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", prefs[k] ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
  return (
    <Section title="Notificações e lembretes" footer={<Button onClick={async () => { await updateProfile({ notification_prefs: prefs }); toast.success("Preferências salvas"); }}>Salvar</Button>}>
      <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Canais</p>
      <div className="divide-y divide-line">
        <Row k="in_app" label="No aplicativo" desc="Sino no topo da tela" />
        <Row k="email" label="Por e-mail" desc="Resumo dos lembretes pendentes" />
        <Row k="whatsapp" label="WhatsApp" desc="Em breve, via integração oficial do WhatsApp Business" disabled />
      </div>
      <p className="mt-5 text-xs font-bold uppercase tracking-wider text-ink-faint">Avisar sobre</p>
      <div className="divide-y divide-line">
        <Row k="recording_reminders" label="Conteúdo que precisa ser gravado" desc="Até 3 dias antes da publicação" />
        <Row k="scheduled_posts" label="Publicações programadas" desc="No dia anterior e no dia" />
        <Row k="overdue_tasks" label="Tarefas atrasadas" />
        <Row k="weekly_planning" label="Planejamento semanal" desc="Toda segunda, se a semana estiver vazia" />
        <Row k="goals" label="Metas de produção" desc="Quando a meta semanal estiver em risco" />
        <Row k="weekly_report" label="Relatório semanal" desc="Resumo com seus números reais" />
      </div>
    </Section>
  );
}

function PlanTab() {
  const { plan } = useWorkspace();
  const [loading, setLoading] = useState<string | null>(null);
  if (!plan) return null;
  const info = PLAN_INFO[plan.plan];
  const sub = plan.subscription;

  const call = async (fn: "billing-checkout" | "billing-portal", body?: object) => {
    setLoading(fn);
    const { data, error } = await supabase.functions.invoke(fn, { body: body ?? {} });
    setLoading(null);
    if (error || !data?.url) {
      const msg = await (error as { context?: Response })?.context?.json?.().then((b: { error?: { message?: string } }) => b.error?.message).catch(() => null);
      return toast.error(msg ?? "Pagamentos ainda não configurados. Tente novamente mais tarde.");
    }
    window.location.href = data.url;
  };

  return (
    <div className="space-y-4">
      <Section title="Plano contratado">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-extrabold">{info.name}</p>
            <p className="text-sm text-ink-soft">{info.price ? `${fmtCurrency(info.price)}/mês` : "Gratuito para sempre"}
              {sub?.current_period_end && plan.plan !== "free" && ` · ${sub.cancel_at_period_end ? "termina" : "renova"} em ${fmtDate(sub.current_period_end)}`}</p>
            {sub && sub.status !== "active" && <Badge color="#A44B1D" bg="#FDF0E9" className="mt-2">Pagamento pendente</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            {plan.plan !== "free" && <Button variant="secondary" loading={loading === "billing-portal"} onClick={() => call("billing-portal")}>Gerenciar assinatura</Button>}
            {plan.plan === "free" && <Button loading={loading === "billing-checkout"} onClick={() => call("billing-checkout", { plan: "creator" })}>Assinar Creator</Button>}
            {plan.plan !== "pro" && <Button variant={plan.plan === "free" ? "secondary" : "primary"} loading={loading === "billing-checkout"} onClick={() => call("billing-checkout", { plan: "pro" })}>Assinar Pro</Button>}
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-canvas p-4">
            <p className="text-sm font-semibold">Gerações de IA neste mês</p>
            <p className="mt-1 text-2xl font-extrabold">{plan.ai_used_this_month}<span className="text-base text-ink-soft">/{plan.limits.monthly_ai_generations}</span></p>
            <ProgressBar className="mt-2" value={plan.ai_used_this_month} max={plan.limits.monthly_ai_generations} />
          </div>
          <div className="rounded-xl bg-canvas p-4">
            <p className="text-sm font-semibold">Projetos ativos</p>
            <p className="mt-1 text-2xl font-extrabold">{plan.projects_count}<span className="text-base text-ink-soft">/{plan.limits.max_projects}</span></p>
            <ProgressBar className="mt-2" value={plan.projects_count} max={plan.limits.max_projects} />
          </div>
        </div>
        <Link to="/precos" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">Comparar planos <ExternalLink className="h-3.5 w-3.5" /></Link>
      </Section>
    </div>
  );
}

function SecurityTab() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const change = async () => {
    if (password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    setPassword(""); setConfirm("");
    toast.success("Senha alterada");
  };
  return (
    <div className="space-y-4">
      <Section title="Alterar senha" footer={<Button onClick={change} loading={saving}>Alterar senha</Button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nova senha"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Confirmar nova senha"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Sessões" description="Encerra o acesso em todos os dispositivos, inclusive este.">
        <Button variant="secondary" onClick={async () => { await supabase.auth.signOut({ scope: "global" }); await signOut(); navigate("/entrar"); }}>Sair de todos os dispositivos</Button>
      </Section>
    </div>
  );
}

function PrivacyTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const tables = ["profiles", "projects", "social_accounts", "idea_categories", "content_ideas", "content_plans", "script_folders",
        "scripts", "calendar_posts", "production_tasks", "analytics", "ai_memory", "library_items", "notifications", "subscriptions", "ai_usage"];
      const entries = await Promise.all(tables.map(async (t) => {
        const { data, error } = await supabase.from(t).select("*");
        if (error) throw error;
        return [t, data] as const;
      }));
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), user: { id: user!.id, email: user!.email }, ...Object.fromEntries(entries) }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `contentflow-dados-${toISODate(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Exportação concluída");
    } catch (e) { toast.error(friendlyError(e)); } finally { setExporting(false); }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    const { error } = await supabase.functions.invoke("delete-account", { body: { confirmation: confirmText } });
    setDeleting(false);
    if (error) return toast.error("Não foi possível excluir a conta agora. Tente novamente.");
    await supabase.auth.signOut();
    qc.clear();
    toast.success("Conta excluída. Sentiremos sua falta!");
    navigate("/");
  };

  return (
    <div className="space-y-4">
      <Section title="Privacidade" description="Seus dados são protegidos por regras de acesso no banco (Row Level Security): só você vê seus projetos e conteúdos.">
        <ul className="list-inside list-disc space-y-1.5 text-sm text-ink-soft">
          <li>Chaves de IA e pagamento ficam apenas no servidor, nunca no navegador.</li>
          <li>O conteúdo enviado para a IA é usado só para gerar a resposta que você pediu.</li>
          <li>Você pode exportar ou excluir todos os seus dados a qualquer momento (LGPD).</li>
        </ul>
      </Section>
      <Section title="Gerenciamento de dados">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold">Exportar meus dados</p><p className="text-xs text-ink-soft">Arquivo JSON com projetos, conteúdos, métricas e memória.</p></div>
          <Button variant="secondary" icon={<Database className="h-4 w-4" />} loading={exporting} onClick={exportData}>Exportar</Button>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50/60 p-4">
          <div><p className="text-sm font-semibold text-[#B42335]">Excluir conta</p><p className="text-xs text-ink-soft">Apaga definitivamente a conta, os arquivos e cancela a assinatura.</p></div>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>Excluir conta</Button>
        </div>
      </Section>
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Excluir sua conta?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
          <Button variant="danger" disabled={confirmText !== "EXCLUIR"} loading={deleting} onClick={deleteAccount}>Excluir para sempre</Button></>}>
        <p className="text-sm text-ink-soft">Esta ação não pode ser desfeita. Digite <strong className="text-ink">EXCLUIR</strong> para confirmar.</p>
        <Input className="mt-3" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      </Modal>
    </div>
  );
}
