-- ═══════════════════════════════════════════════════════════════
-- MÓDULO SORTEIOS — Tabelas de configuração e resultados
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════

-- Configuração dos parâmetros do sorteio
CREATE TABLE IF NOT EXISTS public.sorteios_config (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proporcao_mensal        integer DEFAULT 2000,  -- 1 ganhador a cada X bilhetes
  max_ganhadores_mensal   integer DEFAULT 100,
  min_ganhadores_mensal   integer DEFAULT 1,
  max_premios_entregador  integer DEFAULT 1,     -- max prêmios mensais por entregador
  updated_at              timestamptz DEFAULT now()
);

-- Seed de configuração padrão
INSERT INTO public.sorteios_config (proporcao_mensal, max_ganhadores_mensal, min_ganhadores_mensal)
VALUES (2000, 100, 1)
ON CONFLICT DO NOTHING;

-- Resultados dos sorteios realizados
CREATE TABLE IF NOT EXISTS public.sorteios_resultados (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo                text NOT NULL CHECK (tipo IN ('mensal','trimestral','semestral','grande_premio')),
  ciclo               text NOT NULL,             -- ex: "2025-M04", "2025-T2"
  data_sorteio        date NOT NULL,
  numero_extracao     integer,                   -- número da extração da Loteria Federal
  resultado_1premio   text,                      -- número do 1º prêmio da Loteria Federal
  resultado_2premio   text,                      -- número do 2º prêmio da Loteria Federal
  numero_vencedor     text,                      -- número calculado (2 últimos do 1º + 4 primeiros do 2º)
  total_bilhetes      integer,
  total_ganhadores    integer,
  ganhadores          jsonb,                     -- array de {cpf, nome, bilhete, premio}
  status              text DEFAULT 'pendente' CHECK (status IN ('pendente','realizado','cancelado')),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sorteios_tipo_ciclo ON public.sorteios_resultados (tipo, ciclo);

ALTER TABLE public.sorteios_resultados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sorteios_select" ON public.sorteios_resultados FOR SELECT USING (true);
CREATE POLICY "sorteios_service" ON public.sorteios_resultados FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE public.sorteios_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_select" ON public.sorteios_config FOR SELECT USING (true);
CREATE POLICY "config_service" ON public.sorteios_config FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT ON public.sorteios_resultados TO anon;
GRANT SELECT ON public.sorteios_config TO anon;
GRANT ALL ON public.sorteios_resultados TO service_role;
GRANT ALL ON public.sorteios_config TO service_role;
