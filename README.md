# HAW CRM 👓

Sistema de gestão comercial para a **HAW Óticas** — CRM completo com pipeline de vendas, receitas ópticas, orçamento automático e dashboard gerencial.

## ✨ Funcionalidades

- 📊 Dashboard com KPIs, ranking de vendedores e alertas automáticos
- 🏷️ Pipeline Kanban (Lead → Pós-venda)
- 👥 Cadastro de clientes com histórico completo
- 👁️ Receitas ópticas (OD/OE com graus, eixo, adição, DNP)
- 🛍️ Pedidos com gerador de orçamento PDF automático
- 📦 Catálogo de armações, lentes e acessórios com tabela de preços
- 💰 Módulo financeiro
- 📈 Relatórios e clientes para contatar (WhatsApp direto)
- 🔒 Controle de acesso por perfil (Vendedor / Gestor / Financeiro / Dono)

---

## 🚀 Deploy em 5 passos

### 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New Project**
2. Anote a **URL** e a **anon key** (Settings → API)

### 2. Executar o schema SQL

No Supabase Dashboard → **SQL Editor**, execute em ordem:

```bash
# Cole e execute o conteúdo de:
supabase/migrations/001_schema.sql   # Tabelas, índices e funções
supabase/migrations/002_rls.sql      # Políticas de segurança (RLS)
```

### 3. Criar o primeiro usuário (Dono)

No Supabase → **Authentication → Users → Invite user** (ou Add user):
- Crie o email/senha do dono da conta
- Depois execute no SQL Editor:
```sql
insert into public.usuarios (id, nome, email, perfil)
values (
  'UUID-DO-USUARIO-CRIADO-ACIMA',
  'Seu Nome',
  'seu@email.com',
  'dono'
);
```

### 4. Configurar credenciais no GitHub

No seu repositório GitHub → **Settings → Secrets and variables → Actions**:

| Secret | Valor |
|--------|-------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJ...` |

### 5. Habilitar GitHub Pages

GitHub → Settings → Pages → Source: **GitHub Actions**

No próximo push para `main`, o deploy acontece automaticamente. A URL será:
```
https://SEU-USUARIO.github.io/haw-crm/
```

---

## 🖥️ Desenvolvimento local

Requer Node ≥ 22.12 (Astro 6).

```bash
git clone https://github.com/SEU-USUARIO/haw-crm.git
cd haw-crm
npm install

# Credenciais locais (a anon key é pública; a RLS protege os dados)
cp .env.example .env   # edite PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY

npm run dev            # http://localhost:4321/haw-crm/
npm run build          # gera dist/ (o que vai para o GitHub Pages)
npm run preview
```

Para testar sem tocar no banco real, rode com a URL de exemplo — o app abre em modo offline (localStorage), login `Admin HAW` / PIN `0000`:

```bash
PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co PUBLIC_SUPABASE_ANON_KEY=offline npm run dev
```

> ⚠️ Ao conectar no Supabase, o app envia para o banco registros que só existem no localStorage daquele endereço. Não abra o modo online numa origem (porta) que tenha dados de teste salvos.

---

## 📁 Estrutura do projeto (Astro)

```
haw-crm/
├── src/
│   ├── layouts/AppLayout.astro     # <head>, CDNs, config do Supabase
│   ├── pages/
│   │   ├── index.astro             # App (SPA) — monta telas, modais e scripts na ordem original
│   │   └── recovery.astro          # Redefinição de PIN (recovery.html)
│   ├── components/
│   │   ├── HawConfig.astro         # window.HAW_CONFIG a partir de PUBLIC_SUPABASE_*
│   │   ├── LoginScreen.astro
│   │   ├── layout/                 # Sidebar, Topbar
│   │   ├── tabs/                   # Uma tela por arquivo (Dashboard, Pedidos, Financeiro…)
│   │   └── modals/                 # Um modal por arquivo (Pedido, OS, Crediário…)
│   ├── scripts/                    # JS do app (scripts clássicos, ver abaixo) + register-sw.ts
│   └── styles/                     # app.css, recovery.css
├── public/                         # manifest.json, sw.js, logo.png (copiados como estão)
├── supabase/
│   ├── migrations/                 # 001_schema.sql, 002_rls.sql
│   └── seeds/catalog.sql           # Seed do catálogo (rodado no deploy)
├── legacy/public/                  # Versão vanilla anterior, só para referência
└── .github/workflows/deploy.yml    # npm ci → build → dist/ → GitHub Pages
```

**Por que os JS de `src/scripts` são carregados como scripts clássicos** (`?url` + `<script is:inline>`) e não como módulos ES: o HTML tem centenas de `onclick="funcao()"` e o código sobrescreve funções globais (`window.save`, `window.nav`) esperando que todas as chamadas passem a usar a nova versão. Em módulo ES as funções deixam de ser globais e esses dois mecanismos quebram. O Vite ainda processa os arquivos (nome com hash, cache do service worker sempre atualizado); o código é idêntico ao original. Código novo deve ser escrito como módulo (`<script>` normal do Astro), como `register-sw.ts`.

---

## 🔒 Segurança

- **RLS ativo** em todas as tabelas — vendedor só vê seus próprios dados
- **Anon key** é segura para expor no frontend (não tem permissões de admin)
- **Service role key** NUNCA vai para o frontend
- Senhas gerenciadas pelo Supabase Auth (bcrypt + JWT)

---

## 📱 Perfis de acesso

| Perfil | Clientes | Pedidos | Financeiro | Catálogo | Relatórios | Config |
|--------|----------|---------|-----------|----------|-----------|--------|
| Vendedor | Só seus | Só seus | ✗ | Leitura | ✗ | ✗ |
| Gestor | Todos | Todos | ✓ | Editar | ✓ | Parcial |
| Financeiro | Todos | Leitura | ✓ | Leitura | ✓ | ✗ |
| Dono | Todos | Todos | ✓ | Editar | ✓ | Total |

---

## 🛠️ Stack

- **Frontend:** [Astro](https://astro.build) (`output: 'static'`) + Vanilla JS + CSS (single-page)
- **Backend:** [Supabase](https://supabase.com) (PostgreSQL + Auth + RLS + Realtime)
- **PDF:** [html2pdf.js](https://github.com/eKoopmans/html2pdf.js)
- **Charts:** [Chart.js](https://chartjs.org)
- **Deploy:** GitHub Pages via GitHub Actions

---

*HAW Óticas · Manaus, AM*
