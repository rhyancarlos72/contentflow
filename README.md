# ContentFlow AI

> Da ideia à publicação. Seu conteúdo, com estratégia e inteligência.

SaaS de planejamento estratégico, criação, organização e análise de conteúdo para redes sociais.

**Stack:** React 19 + TypeScript + Vite · Tailwind CSS · TanStack Query · Recharts · Lucide · Supabase (Postgres, Auth, Storage, Edge Functions/Deno) · Claude API (Anthropic) · Stripe · Resend.

## Módulos

| Área | O que faz |
|---|---|
| Dashboard | Indicadores reais (planejados, publicados, pendentes, roteiros, views, engajamento, meta semanal), gráfico de produtividade 7/15/30 dias, próximas publicações, painel de tarefas e sugestões da IA |
| Planejamento Inteligente | Briefing → plano de 7/15/30 dias (data, plataforma, formato, tema, pilar, objetivo, gancho, roteiro, legenda, CTA, hashtags). Editar, duplicar, excluir, adicionar itens e enviar ao calendário. Histórico de planos |
| Calendário Editorial | Mensal, semanal e lista; arrastar e soltar entre dias; filtros por plataforma, status e projeto; 8 status |
| Estúdio de IA | Ideias, roteiros (15–90s, 8 tipos), legendas (7 tons), ganchos (8 categorias), CTAs (7 objetivos) e hashtags |
| Banco de Ideias | Categorias personalizáveis, favoritos, busca, ideia → roteiro ou → calendário |
| Meus Roteiros | Editor com salvamento automático, pastas, busca, duplicar, copiar, PDF, estimativa de duração e "Transformar em publicação" |
| Produção | Kanban de 7 etapas com responsável, prazo, prioridade, checklist e anexos (Storage) |
| Analytics | Registro manual de métricas, taxa de engajamento calculada no banco, evolução semanal, comparação entre publicações, análise da IA baseada só em dados reais, exportação CSV (Pro) |
| Projetos e Clientes | Vários projetos por usuário, cada um com calendário, biblioteca e **memória de IA isolada** (ver, editar, excluir) |
| Biblioteca | Textos, ganchos, CTAs, hashtags, links e arquivos |
| Configurações | Perfil, comunicação, identidade do projeto, redes sociais, notificações, plano, segurança, privacidade (exportar dados / excluir conta) |
| Extras | Onboarding de 6 perguntas + tutorial, busca global (Ctrl+K), notificações, página de preços, landing page |

## Arquitetura

```
src/                      Frontend (React)
  contexts/               Sessão (AuthContext) e projeto/plano ativos (WorkspaceContext)
  lib/queries.ts          Hooks genéricos de dados (RLS faz o isolamento)
  lib/ai.ts               Cliente da Edge Function de IA
  pages/ · components/
supabase/
  migrations/             Schema, RLS, gatilhos, notificações, bloqueio de recursos por plano
  functions/
    ai-generate/          Única porta para a IA: valida sessão, plano, cota mensal e limite/minuto,
                          monta contexto do projeto (memória + histórico) e chama o Claude
    billing-checkout/     Checkout de assinatura (Stripe)
    billing-portal/       Portal do cliente Stripe
    billing-webhook/      Sincroniza assinaturas (única via que libera plano pago)
    delete-account/       Exclusão definitiva (LGPD)
    send-notification-emails/  Cron: gera lembretes e envia e-mails (Resend)
  tests/                  Testes de banco (RLS, limites de plano, gatilhos)
tests/e2e/smoke.mjs       Smoke test visual de todas as telas (Playwright)
```

### Segurança e regras de negócio no backend
- **RLS em todas as tabelas**: `user_id = auth.uid()` e o projeto precisa pertencer ao usuário.
- **Planos validados no banco**: `effective_plan()` só considera assinaturas ativas e dentro do período; limite de projetos por gatilho; analytics, biblioteca e planejamentos exigem o recurso do plano (políticas *restrictive*). Assinaturas só são alteradas pelo webhook (service role).
- **IA só no servidor**: a chave `ANTHROPIC_API_KEY` fica nos secrets das Edge Functions. Cota mensal por plano (20/150/600), limite de 8 gerações/min, falhas não consomem cota, uso e tokens registrados em `ai_usage`.
- **Memória que aprende**: ao aprovar/publicar um post, um gatilho grava o assunto (e o gancho aprovado) na memória do projeto; a IA lê memória + títulos recentes antes de gerar para evitar repetição. No Pro, também considera os posts de melhor engajamento.
- Notificações: o cliente só pode alterar `read_at`.

### IA
Três provedores, escolhidos pelo secret `AI_PROVIDER` (sem ele, usa o primeiro com chave: OpenAI → Gemini → Claude):
- **OpenAI / GPT** (`openai`): Responses API com saída em JSON validada por schema (`strict`) e streaming no chat. Chave em https://platform.openai.com/api-keys. Modelo padrão `gpt-5.5` (troque com `OPENAI_MODEL`, ex.: `gpt-5.4-mini`, mais barato).
- **Google Gemini** (`gemini`): tem plano gratuito na API. Chave em https://aistudio.google.com/apikey. Modelo padrão `gemini-flash-latest` (troque com `GEMINI_MODEL`).
- **Claude** (`anthropic`): modelo padrão `claude-opus-5-5` (troque com `AI_MODEL`).

Recursos de IA:
- **Estúdio**: temas (pautas com ângulo e gancho), roteiros, ideias, legendas, ganchos, CTAs e hashtags — todos aceitam um **estilo de escrita** (9 prontos ou os estilos do usuário salvos na memória do projeto).
- **Assistente** (`/assistente`, Edge Function `ai-chat`): conversa com histórico por projeto, resposta em tempo real (NDJSON), ditado por voz, e ações para salvar a resposta como ideia, roteiro ou item da biblioteca.
- Cada geração ou mensagem conta no limite mensal do plano; a chave fica só no servidor.

## Como rodar

1. Crie um projeto no [Supabase](https://supabase.com) e aplique as migrações:
   ```bash
   npx supabase link --project-ref SEU_REF
   ```
   ```bash
   npx supabase db push
   ```
2. Configure os secrets das funções em **Supabase → Edge Functions → Secrets** (modelo em `supabase/functions/.env.example`). As funções são publicadas pelo GitHub Actions (`.github/workflows/deploy-supabase-functions.yml`) a cada mudança em `supabase/functions/`: basta criar uma vez o secret `SUPABASE_ACCESS_TOKEN` no GitHub (token em Supabase → Account → Access Tokens). Para publicar manualmente: `npx supabase functions deploy --project-ref SEU_REF`.
3. Frontend: copie `.env.example` para `.env` com a URL e a anon key, depois:
   ```bash
   npm install && npm run dev
   ```
4. **Auth**: em Authentication → URL Configuration, adicione `https://SEU_DOMINIO/redefinir-senha` e `/app` às URLs de redirecionamento. Para Google, habilite o provedor e defina `VITE_GOOGLE_AUTH_ENABLED=true`.
5. **Stripe**: crie os preços recorrentes em BRL (R$ 19,90 e R$ 39,90), coloque os IDs em `STRIPE_PRICE_CREATOR`/`STRIPE_PRICE_PRO` e aponte um webhook para `https://SEU_REF.supabase.co/functions/v1/billing-webhook` com os eventos `checkout.session.completed` e `customer.subscription.*`.
6. **Lembretes**: a migração agenda `generate_notifications()` a cada hora via `pg_cron` (habilite a extensão). Para e-mails, agende uma chamada a `send-notification-emails` com `Authorization: Bearer $CRON_SECRET`.

## Publicar na Hostinger

### Opção A — Aplicativo Node.js (hPanel → Sites → Adicionar site → Node.js / importar do GitHub)

| Campo | Valor |
|---|---|
| Framework | **Express** |
| Branch | `main` |
| Versão do Node | `22.x` |
| Diretório raiz | `./` |
| Gerenciador de pacotes | `npm` |
| Arquivo de entrada | `server.js` |
| Comando de build (se pedir) | `npm run build` |
| Comando de início (se pedir) | `npm start` |

Variáveis de ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_GOOGLE_AUTH_ENABLED` (`false` até configurar o Google).

A pasta `dist/` (build pronto) fica no repositório e é atualizada automaticamente pelo GitHub Actions a cada push na `main`, porque a Hostinger Node.js não roda o build. O `server.js` é CommonJS (o LiteSpeed o carrega com `require()`), serve o app com as rotas do React e entrega as variáveis acima em `/env-config.js`, então elas valem mesmo definidas só no painel. Se a `dist/` faltar, ele gera o build num processo separado e mostra uma página de "preparando". Estado do serviço: `/healthz`.

### Opção B — Hospedagem comum (Apache, hPanel → Avançado → Git)

O workflow `.github/workflows/deploy-hostinger.yml` gera o build a cada push na `main` e publica o resultado no branch **`hostinger`**, já com o `.htaccess` (rotas do React, HTTPS e cache). Na Hostinger, aponte o Git para o branch `hostinger` com diretório vazio e ative a implantação automática. Aqui a configuração vem do `.env.production` ou de secrets do GitHub com os mesmos nomes.

### Nos dois casos
No Supabase, use o seu domínio em **Authentication → URL Configuration** (Site URL e redirecionamentos `/redefinir-senha` e `/app`) e em `APP_URL`/`APP_ORIGIN` das Edge Functions. O backend (banco, login, IA e pagamentos) continua no Supabase.

## Notificações push (iPhone, Android, computador)
O app é um PWA (`public/manifest.webmanifest`, `public/sw.js`). Em Configurações → Notificações a pessoa ativa os lembretes no aparelho; no iPhone é preciso instalar o app na Tela de Início (iOS 16.4+). As chaves VAPID são geradas pelo próprio servidor na primeira ativação e guardadas em `public.app_secrets` (sem acesso para o cliente). O envio roda a cada hora via `pg_cron` + `pg_net`, chamando a função `send-notification-emails` com a senha `app_secrets.cron_secret`:

```sql
select cron.schedule('contentflow-dispatch', '7 * * * *', $$
  select net.http_post(
    url := 'https://SEU_REF.supabase.co/functions/v1/send-notification-emails',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.app_secrets where key = 'cron_secret')),
    body := '{}'::jsonb)
$$);
```

## Análise de conteúdo
Em `/analise` a pessoa cola o link de um Reels/TikTok/Short/post. A função `link-preview` lê o que é público (oEmbed do TikTok/YouTube, metatags Open Graph; no Instagram, legenda, curtidas e comentários quando visíveis), com proteção contra SSRF. A IA avalia legenda, fala/roteiro (colado ou ditado), capa (miniatura ou print enviado) e métricas informadas, e devolve notas por critério, pontos fortes, melhorias e versões reescritas para o público-alvo. O vídeo e o áudio em si não são acessíveis pelas redes sem integração oficial.

## Testes

```bash
PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
```
Aplica as migrações num Postgres limpo (com stub mínimo de `auth`/`storage`) e verifica isolamento entre usuários, bloqueio de projeto alheio, limites de plano, assinatura vencida, aprendizado da memória, busca global e notificações.

```bash
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=test npm run build
```
```bash
npx vite preview --port 4173
```
```bash
node tests/e2e/smoke.mjs
```
Abre todas as telas em desktop e celular com a API interceptada (dados de teste só no script), falha em erros de runtime ou rolagem horizontal e exercita sugestões da IA, criação de conteúdo, busca global e Estúdio.

## Próximos passos
- Integrações OAuth oficiais (Instagram Graph, YouTube Analytics, TikTok): tabelas `social_accounts`/`social_tokens` e `analytics.source = 'api'` já preparadas.
- WhatsApp Business para lembretes (ponto de extensão em `send-notification-emails`).
- Colaboração multiusuário no plano Pro.
