-- ═══════════════════════════════════════════════════════════════
-- MÓDULO 2 — Agendamento do job de verificação (pg_cron)
-- Execute no SQL Editor do Supabase após o deploy da função
-- ═══════════════════════════════════════════════════════════════

-- Habilita pg_cron (já vem instalado no Supabase)
-- Agenda a função verificar-pendentes para rodar a cada 30 minutos

SELECT cron.schedule(
  'verificar-pendentes-30min',         -- nome do job
  '*/30 * * * *',                      -- a cada 30 minutos
  $$
  SELECT net.http_post(
    url    := 'https://tynxdwaaedkdnmksfycf.supabase.co/functions/v1/verificar-pendentes',
    body   := '{}',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    )
  );
  $$
);

-- Para ver os jobs agendados:
-- SELECT * FROM cron.job;

-- Para remover o job se precisar:
-- SELECT cron.unschedule('verificar-pendentes-30min');
