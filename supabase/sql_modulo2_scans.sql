-- ═══════════════════════════════════════════════════════════════
-- MÓDULO 2 — Tabela de Scans + RLS
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════

-- Tabela principal de scans
CREATE TABLE IF NOT EXISTS public.scans (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_pedido       text NOT NULL,
  cpf_entregador      text NOT NULL,
  status_intelipost   text,
  status              text DEFAULT 'reservado'
                      CHECK (status IN ('reservado','liberado','cancelado')),
  tokens_creditados   integer DEFAULT 0,
  situacao            text,
  -- Geolocalização
  lat_scan            double precision,
  lng_scan            double precision,
  accuracy_metros     double precision,
  distancia_metros    double precision,
  geo_situacao        text,
  geo_mensagem        text,
  -- Meta
  modo_simulacao      boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Índice anti-fraude: impede scan duplicado ativo do mesmo pedido/entregador
CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_pedido_cpf
  ON public.scans (numero_pedido, cpf_entregador)
  WHERE status != 'reservado';

-- Índice para busca por entregador
CREATE INDEX IF NOT EXISTS idx_scan_cpf_created
  ON public.scans (cpf_entregador, created_at DESC);

-- Trigger updated_at
CREATE TRIGGER trg_scans_updated
  BEFORE UPDATE ON public.scans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

-- Entregador vê apenas os próprios scans
CREATE POLICY "scan_select_proprio" ON public.scans
  FOR SELECT USING (true);

-- Insert/update apenas via service_role (Edge Function)
CREATE POLICY "scan_service_write" ON public.scans
  FOR ALL USING (auth.role() = 'service_role');

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT ON public.scans TO anon;
GRANT ALL ON public.scans TO service_role;
