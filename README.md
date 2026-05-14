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

```bash
# Clone o repositório
git clone https://github.com/SEU-USUARIO/haw-crm.git
cd haw-crm

# Configure as credenciais locais
cp public/config.example.js public/config.js
# Edite public/config.js com suas credenciais

# Sirva localmente (qualquer servidor HTTP)
npx serve public
# ou
python3 -m http.server 8080 --directory public
# Acesse: http://localhost:8080
```

> ⚠️ `public/config.js` está no `.gitignore` — nunca commite credenciais reais.

---

## 📁 Estrutura do projeto

```
haw-crm/
├── public/
│   ├── index.html          # App completo (SPA)
│   ├── config.js           # 🔒 NÃO commitar — credenciais locais
│   ├── config.example.js   # Template de configuração
│   └── supabase-layer.js   # Camada de dados (sync, realtime, RLS)
├── supabase/
│   └── migrations/
│       ├── 001_schema.sql  # Tabelas, índices, triggers, funções
│       └── 002_rls.sql     # Row Level Security por perfil
└── .github/
    └── workflows/
        └── deploy.yml      # CI/CD → GitHub Pages
```

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

- **Frontend:** HTML + Vanilla JS + CSS (single-page, zero build)
- **Backend:** [Supabase](https://supabase.com) (PostgreSQL + Auth + RLS + Realtime)
- **PDF:** [html2pdf.js](https://github.com/eKoopmans/html2pdf.js)
- **Charts:** [Chart.js](https://chartjs.org)
- **Deploy:** GitHub Pages via GitHub Actions

---

*HAW Óticas · Manaus, AM*
