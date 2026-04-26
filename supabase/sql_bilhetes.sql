-- ═══════════════════════════════════════════════════════════════
-- MÓDULO 2 — Tabela de Bilhetes
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.bilhetes (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf_entregador  text NOT NULL,
  numero          text NOT NULL,        -- número sequencial do bilhete no ciclo
  ciclo           text NOT NULL,        -- ex: "2025-T1" (trimestre), "2025-M04" (mês)
  tokens_usados   integer NOT NULL,     -- quantos tokens foram consumidos (sempre 10)
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bilhetes_cpf
  ON public.bilhetes (cpf_entregador, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bilhetes_numero_ciclo
  ON public.bilhetes (numero, ciclo);

ALTER TABLE public.bilhetes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bilhetes_select" ON public.bilhetes
  FOR SELECT USING (true);

CREATE POLICY "bilhetes_insert" ON public.bilhetes
  FOR INSERT WITH CHECK (true);

GRANT SELECT, INSERT ON public.bilhetes TO anon;
GRANT ALL ON public.bilhetes TO service_role;
