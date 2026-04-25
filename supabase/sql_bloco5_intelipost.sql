-- ─── BLOCO 5 — Tabela de Configuração Intelipost ─────────────────────────────
-- Execute este bloco no SQL Editor do Supabase

create table public.intelipost_config (
  id                  uuid default gen_random_uuid() primary key,
  api_key             text,                          -- chave fornecida pela Intelipost
  base_url            text default 'https://api.intelipost.com.br/api/v1',
  modo_simulacao      boolean default true,           -- true = sem chamadas reais
  timeout_segundos    integer default 10,
  updated_at          timestamptz default now()
);

-- Configuração inicial (modo simulação, sem key)
insert into public.intelipost_config (modo_simulacao) values (true);

-- RLS: apenas service_role acessa (a key é sensível)
alter table public.intelipost_config enable row level security;

create policy "intelipost_service_only" on public.intelipost_config
  for all using (auth.role() = 'service_role');

-- ─── BLOCO 6 — Tabela de Registros de Scan ────────────────────────────────────
-- Histórico de leituras para anti-fraude e auditoria

create table public.scans (
  id                uuid default gen_random_uuid() primary key,
  entregador_cpf    text not null references public.entregadores(cpf),
  numero_pedido     text not null,
  status_intelipost text,                 -- estado bruto retornado
  status_app        text,                 -- ENTREGUE | FALHA | EM_ROTA | FULFILLMENT | CANCELADO
  latitude          numeric(10, 7),
  longitude         numeric(10, 7),
  geoloc_valida     boolean,              -- resultado da validação de raio
  distancia_metros  integer,             -- distância calculada ao endereço
  tokens_creditados integer default 0,
  tokens_status     text,               -- RESERVADO | LIBERADO | CANCELADO
  cpf_motorista_intelipost text,        -- CPF do motorista retornado pela Intelipost
  created_at        timestamptz default now()
);

-- Índice para consulta de anti-fraude (mesmo pedido + mesmo status + mesmo CPF)
create unique index scans_antifraude
  on public.scans (entregador_cpf, numero_pedido, status_app)
  where tokens_status != 'CANCELADO';

-- RLS
alter table public.scans enable row level security;

create policy "scan_self" on public.scans
  for all using (entregador_cpf = current_setting('app.cpf', true));

-- View para o painel admin
create policy "scan_service_read" on public.scans
  for select using (auth.role() = 'service_role');
