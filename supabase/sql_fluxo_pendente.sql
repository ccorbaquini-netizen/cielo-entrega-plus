-- ═══════════════════════════════════════════════════════════════
-- MÓDULO 2 — Atualização da tabela scans para fluxo pendente
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════

-- Adiciona campos para controle do polling
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS pendente_verificacao boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tentativas_verificacao integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proxima_verificacao timestamptz,
  ADD COLUMN IF NOT EXISTS expira_em timestamptz;

-- Índice para o job de polling encontrar pendentes rapidamente
CREATE INDEX IF NOT EXISTS idx_scans_pendentes
  ON public.scans (pendente_verificacao, proxima_verificacao)
  WHERE pendente_verificacao = true;
