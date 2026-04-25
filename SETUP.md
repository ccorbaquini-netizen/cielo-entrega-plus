# Cielo Entrega+ — Guia de Configuração
## Supabase + Netlify — Módulo 1

---

## PRÉ-REQUISITOS

- Conta no GitHub (github.com) — gratuita
- Conta no Supabase (supabase.com) — gratuita
- Conta no Netlify (netlify.com) — gratuita
- Node.js instalado localmente (node -v para verificar)

---

## PASSO 1 — CONFIGURAR O SUPABASE

### 1.1 Criar o projeto

1. Acesse supabase.com e faça login
2. Clique em "New Project"
3. Preencha:
   - Name: cielo-entrega-plus
   - Database Password: crie uma senha forte e ANOTE (Cris@195352251200scmn)
   - Region: South America (São Paulo)
4. Clique em "Create new project" e aguarde ~2 minutos

### 1.2 Criar as tabelas (SQL Editor)

No painel do Supabase, acesse **SQL Editor** e execute o SQL abaixo em blocos:

---

**BLOCO 1 — Tabela de entregadores**

```sql
create table public.entregadores (
  id          uuid default gen_random_uuid() primary key,
  cpf         text unique not null,
  nome        text not null,
  telefone    text,
  selfie_url  text,
  status      text default 'ativo' check (status in ('ativo', 'suspenso')),
  pwa_instalado boolean default false,
  plataforma  text default 'web',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Atualiza updated_at automaticamente
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_entregadores_updated
before update on public.entregadores
for each row execute function update_updated_at();
```

---

**BLOCO 2 — Feature Flags**

```sql
create table public.feature_flags (
  id          uuid default gen_random_uuid() primary key,
  nome        text unique not null,
  habilitado  boolean default false,
  descricao   text,
  updated_at  timestamptz default now()
);

-- Seed com todas as flags do programa
insert into public.feature_flags (nome, habilitado, descricao) values
  ('whatsapp_ios',         false, 'Disparo WhatsApp para usuarios iOS sem push'),
  ('whatsapp_android',     false, 'Disparo WhatsApp para Android sem PWA instalado'),
  ('push_notifications',   true,  'Push notifications para PWA instalado'),
  ('bonus_frequencia',     true,  'Calculo e credito do bonus trimestral'),
  ('sorteio_mensal',       true,  'Ciclo de sorteio mensal habilitado'),
  ('cadastro_aberto',      true,  'Permite novos cadastros no programa'),
  ('scan_qrcode_etiqueta', true,  'Validacao de entregas via QR Code');
```

---

**BLOCO 3 — Configuração WhatsApp**

```sql
create table public.whatsapp_config (
  id                    uuid default gen_random_uuid() primary key,
  provedor              text default '360dialog',
  api_key               text,
  phone_number_id       text,
  business_account_id   text,
  modo_simulacao        boolean default true,
  limite_diario         integer default 500,
  horario_inicio        time default '08:00',
  horario_fim           time default '20:00',
  intervalo_minimo_horas integer default 24,
  updated_at            timestamptz default now()
);

-- Insere configuração inicial vazia
insert into public.whatsapp_config (modo_simulacao) values (true);
```

---

**BLOCO 4 — Segurança (RLS)**

```sql
-- Habilita RLS em todas as tabelas
alter table public.entregadores     enable row level security;
alter table public.feature_flags    enable row level security;
alter table public.whatsapp_config  enable row level security;

-- Entregadores: cada um acessa apenas o próprio registro
create policy "entregador_self" on public.entregadores
  for all using (cpf = current_setting('app.cpf', true));

-- Feature Flags: leitura pública, escrita apenas pelo service_role
create policy "flags_public_read" on public.feature_flags
  for select using (true);

create policy "flags_service_write" on public.feature_flags
  for all using (auth.role() = 'service_role');

-- WhatsApp Config: apenas service_role
create policy "wa_service_only" on public.whatsapp_config
  for all using (auth.role() = 'service_role');
```

> ⚠️ ATENÇÃO: A política de feature_flags permite leitura pública pois
> as flags não contêm dados sensíveis. A escrita é restrita ao service_role
> (usado apenas pelo painel admin via Edge Function no Módulo 4).

---

### 1.3 Criar o bucket de selfies

1. No painel do Supabase, acesse **Storage**
2. Clique em "New bucket"
3. Nome: `entregadores`
4. Marque como **Public** (as URLs precisam ser acessíveis para exibir selfies)
5. Clique em "Create bucket"

Em seguida, no SQL Editor, execute a política de storage:

```sql
-- Permite upload autenticado e leitura pública
create policy "selfie_upload" on storage.objects
  for insert with check (bucket_id = 'entregadores');

create policy "selfie_read" on storage.objects
  for select using (bucket_id = 'entregadores');
```

### 1.4 Copiar as credenciais

1. Acesse **Project Settings > API**
2. Copie:
   - **Project URL** → será o VITE_SUPABASE_URL
   - **anon public key** → será o VITE_SUPABASE_ANON_KEY

---

## PASSO 2 — CONFIGURAR O REPOSITÓRIO LOCAL

```bash
# Clone ou crie o repositório
git init cielo-entrega-plus
cd cielo-entrega-plus

# Copie todos os arquivos do projeto para esta pasta

# Instale as dependências
npm install

# Crie o arquivo .env a partir do exemplo
cp .env.example .env
```

Abra o arquivo `.env` e preencha com as credenciais do Supabase:

```
VITE_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
VITE_ADMIN_PASSWORD=uma_senha_segura
```

Teste localmente:

```bash
npm run dev
# Acesse http://localhost:5173
```

Se aparecer a tela de boas-vindas do Cielo Entrega+, está funcionando.

---

## PASSO 3 — SUBIR PARA O GITHUB

```bash
# Dentro da pasta do projeto
git add .
git commit -m "feat: módulo 1 — cadastro e painel de gestão"

# Crie um repositório no github.com (botão New)
# Depois conecte e envie:
git remote add origin https://github.com/SEU_USUARIO/cielo-entrega-plus.git
git branch -M main
git push -u origin main
```

---

## PASSO 4 — CONFIGURAR O NETLIFY

### 4.1 Criar o site

1. Acesse netlify.com e faça login
2. Clique em **"Add new site" > "Import an existing project"**
3. Escolha **GitHub**
4. Autorize o Netlify a acessar seu GitHub
5. Selecione o repositório `cielo-entrega-plus`

### 4.2 Configurar o build

Na tela de configuração, preencha:

| Campo | Valor |
|-------|-------|
| Branch to deploy | main |
| Build command | npm run build |
| Publish directory | dist |

### 4.3 Adicionar as variáveis de ambiente

1. Clique em **"Show advanced"**
2. Em **"Environment variables"**, adicione:

| Key | Value |
|-----|-------|
| VITE_SUPABASE_URL | https://SEU_PROJECT_ID.supabase.co |
| VITE_SUPABASE_ANON_KEY | sua_anon_key_aqui |
| VITE_ADMIN_PASSWORD | sua_senha_admin |

3. Clique em **"Deploy site"**

### 4.4 Aguardar o deploy

O Netlify vai buildar e publicar o projeto automaticamente.
O deploy leva cerca de 1 a 2 minutos.
Ao terminar, você recebe uma URL no formato: `https://nome-aleatorio.netlify.app`

### 4.5 Configurar redirecionamento para o PWA

O React Router precisa que todas as rotas apontem para o index.html.
Crie o arquivo `public/_redirects` com o conteúdo:

```
/*  /index.html  200
```

Faça commit e push:

```bash
git add public/_redirects
git commit -m "fix: netlify SPA redirect"
git push
```

O Netlify fará um novo deploy automaticamente.

---

## PASSO 5 — DOMÍNIO CUSTOMIZADO (OPCIONAL)

Para usar um domínio próprio (ex: entregaplus.cielo.com.br):

1. No painel do Netlify, acesse **Domain settings**
2. Clique em **"Add custom domain"**
3. Digite o domínio e siga as instruções de DNS

---

## VERIFICAÇÃO FINAL

Acesse a URL do Netlify e confirme:

- [ ] Tela de boas-vindas carrega corretamente
- [ ] Botão "Quero participar" navega para o cadastro
- [ ] Formulário de CPF valida corretamente
- [ ] Selfie abre câmera ou galeria
- [ ] Cadastro completo salva no Supabase (verifique Table Editor)
- [ ] Painel admin em /admin pede senha
- [ ] Feature flags aparecem e o toggle funciona
- [ ] Configuração de WhatsApp salva corretamente

---

## ESTRUTURA DE ARQUIVOS DO PROJETO

```
cielo-entrega-plus/
├── .env.example           ← Template de variáveis (não subir o .env)
├── .gitignore
├── index.html
├── package.json
├── vite.config.js         ← Configuração do Vite + PWA
├── public/
│   ├── _redirects         ← Necessário para o Netlify (SPA)
│   ├── icon-192.png       ← Ícone PWA (adicionar manualmente)
│   └── icon-512.png       ← Ícone PWA (adicionar manualmente)
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── index.css
    ├── lib/
    │   └── supabase.js    ← Client e funções do Supabase
    ├── hooks/
    │   └── usePWAInstall.js
    └── pages/
        ├── Landing.jsx    ← Tela inicial
        ├── Register.jsx   ← Cadastro (4 etapas)
        ├── Dashboard.jsx  ← Painel do entregador (Módulo 2)
        └── Admin.jsx      ← Painel de gestão
```

---

## PRÓXIMOS PASSOS — MÓDULO 2

O Módulo 2 adiciona:
- Scanner de QR Code via câmera
- Captura e validação de geolocalização
- Edge Function para consultar status na Intelipost
- Lógica de crédito de tokens (reservado → liberado → cancelado)
- Histórico de entregas no painel do entregador

---

## SUPORTE

Em caso de dúvidas durante a configuração:
- Documentação Supabase: docs.supabase.com
- Documentação Netlify: docs.netlify.com
- Logs de build: painel Netlify > Deploys > clique no deploy
- Logs do banco: painel Supabase > Logs > API Logs
