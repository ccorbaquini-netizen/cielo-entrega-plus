// supabase/functions/simular-status/index.ts
// Função de simulação para homologação — altera o status de um scan pendente
// como se a Intelipost tivesse atualizado o status do pedido
// ⚠️ USO EXCLUSIVO PARA TESTES — não usar em produção

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const STATUS_VALIDOS = [
  'DELIVERED',
  'DELIVERY_FAILED',
  'DELIVERY_REFUSED',
  'CANCELLED',
]

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { numeroPedido, novoStatus } = await req.json()

    if (!numeroPedido || !novoStatus) {
      return new Response(JSON.stringify({
        erro: "numeroPedido e novoStatus são obrigatórios"
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    if (!STATUS_VALIDOS.includes(novoStatus.toUpperCase())) {
      return new Response(JSON.stringify({
        erro: `Status inválido. Use um dos seguintes: ${STATUS_VALIDOS.join(', ')}`
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Busca o scan pendente
    const { data: scan, error: errBusca } = await supabase
      .from('scans')
      .select('*')
      .eq('numero_pedido', numeroPedido)
      .eq('pendente_verificacao', true)
      .maybeSingle()

    if (errBusca) throw new Error(errBusca.message)

    if (!scan) {
      return new Response(JSON.stringify({
        erro: `Nenhum scan pendente encontrado para o pedido ${numeroPedido}. Verifique se o pedido foi escaneado e está aguardando confirmação.`
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const status = novoStatus.toUpperCase()

    // Simula a lógica de tokens igual ao job verificar-pendentes
    let tokens = 0
    let situacao = ''
    let geoSituacao = ''
    let geoMsg = ''

    if (['DELIVERED'].includes(status)) {
      tokens = 10
      situacao = 'entregue'
      geoSituacao = 'nao_verificada'
      geoMsg = 'Entrega confirmada — geoloc não verificada'
    } else if (['DELIVERY_FAILED', 'DELIVERY_REFUSED'].includes(status)) {
      // Verifica GPS armazenado
      const lat = scan.lat_scan
      const lng = scan.lng_scan

      if (!lat || !lng) {
        tokens = 10
        situacao = 'falha_sem_geocod'
        geoSituacao = 'sem_gps'
        geoMsg = 'GPS não capturado no momento do scan'
      } else {
        // Simulação: considera que estava dentro do raio (para homologação)
        // Em produção, o job real faz a geocodificação via OpenStreetMap
        tokens = 4
        situacao = 'falha_dentro_raio'
        geoSituacao = 'dentro_raio'
        geoMsg = `Simulação: GPS presente (${lat.toFixed(4)}, ${lng.toFixed(4)}) — considerado dentro do raio`
      }
    } else {
      tokens = 0
      situacao = 'cancelado'
      geoSituacao = 'nao_aplicavel'
      geoMsg = 'Pedido cancelado'
    }

    // Atualiza o scan como se o job de verificação tivesse rodado
    const { error: errUpdate } = await supabase
      .from('scans')
      .update({
        pendente_verificacao: false,
        status: tokens > 0 ? 'liberado' : 'cancelado',
        status_intelipost: status,
        tokens_creditados: tokens,
        situacao,
        geo_situacao: geoSituacao,
        geo_mensagem: geoMsg,
        tentativas_verificacao: 1,
      })
      .eq('id', scan.id)

    if (errUpdate) throw new Error(errUpdate.message)

    return new Response(JSON.stringify({
      sucesso: true,
      numeroPedido,
      statusSimulado: status,
      tokens,
      situacao,
      geoMsg,
      mensagem: `Status do pedido ${numeroPedido} atualizado para ${status}. ${tokens} token(s) ${tokens > 0 ? 'creditado(s)' : 'não creditados'}.`
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })

  } catch (e) {
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
