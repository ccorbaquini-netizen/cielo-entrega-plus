// supabase/functions/validar-entrega/index.ts
// Módulo 2 — Fluxo pendente: scan aceito apenas em OUT_FOR_DELIVERY/IN_TRANSIT
// Tokens creditados após confirmação do status final na Intelipost

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── Status que aceitam o scan (pacote na rota, custódia transferida) ────────
const STATUS_ACEITOS = [
  'OUT_FOR_DELIVERY',
  'IN_TRANSIT',
  'SAIU_PARA_ENTREGA',
  'EM_ROTA',
  'EM_TRANSITO',
]

// ── Status finais que encerram o ciclo ──────────────────────────────────────
const STATUS_ENTREGUE = ['DELIVERED', 'ENTREGUE']
const STATUS_FALHA    = ['DELIVERY_FAILED', 'DELIVERY_REFUSED', 'FALHA', 'RECUSADO']
const STATUS_CANCELADO= ['CANCELLED', 'CANCELADO', 'LOST', 'STOLEN']

// ── Mensagens amigáveis para status rejeitados ───────────────────────────────
const MSG_STATUS: Record<string, string> = {
  NEW:                  'Pedido recém criado — ainda não saiu para entrega.',
  READY_FOR_SHIPMENT:   'Pedido pronto para envio — aguardando retirada.',
  HANDLING:             'Em manuseio no armazém — ainda não transferido.',
  SHIPPED:              'Pedido despachado, aguardando transferência para rota.',
  DELIVERED:            'Este pedido já foi entregue e os tokens já foram processados.',
  DELIVERY_FAILED:      'Este pedido já teve falha registrada e os tokens já foram processados.',
  CANCELLED:            'Pedido cancelado — não gera tokens.',
  LOST:                 'Pedido marcado como perdido — não gera tokens.',
  STOLEN:               'Pedido marcado como roubado — não gera tokens.',
}

// ── Distância em metros ──────────────────────────────────────────────────────
function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── Geocodifica endereço via OpenStreetMap ───────────────────────────────────
async function geocodificar(endereco: string) {
  try {
    const q = encodeURIComponent(endereco)
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { "User-Agent": "CieloEntregaPlus/2.0" } }
    )
    const data = await r.json()
    if (!data?.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), tipo: data[0].type || 'residential' }
  } catch { return null }
}

function raioAdaptativo(tipo: string): number {
  if (['residential','house','apartments','building'].includes(tipo)) return 200
  if (['postcode','suburb','neighbourhood'].includes(tipo)) return 500
  return 1000
}

// ── Consulta Intelipost (completa ou status) ─────────────────────────────────
async function consultarIntelipost(numeroPedido: string, apiKey: string, baseUrl: string) {
  // Tenta API completa primeiro
  const r = await fetch(`${baseUrl}/shipment_order/${numeroPedido}`, {
    headers: { "api-key": apiKey, "Content-Type": "application/json" }
  })
  if (r.ok) {
    const d = await r.json()
    const content = d.content
    const vol = content?.shipment_order_volume_array?.[0]
    const end = content?.end_customer
    return {
      status: (vol?.shipment_order_volume_state || content?.shipment_order_status || '').toUpperCase(),
      endereco: end ? `${end.street}, ${end.number}, ${end.city}, ${end.state}, Brasil` : null,
    }
  }
  // Fallback: API de status
  const r2 = await fetch(`${baseUrl}/shipment_order/read_status/${numeroPedido}`, {
    headers: { "api-key": apiKey }
  })
  if (!r2.ok) throw new Error(`Pedido ${numeroPedido} não encontrado na Intelipost`)
  const d2 = await r2.json()
  return {
    status: (d2.content?.shipment_order_volume_state || '').toUpperCase(),
    endereco: null,
  }
}

// ── Calcula tokens após confirmação do status final ──────────────────────────
async function calcularTokensFinais(
  status: string,
  endereco: string | null,
  lat: number | null,
  lng: number | null
) {
  // Entregue: 10 tokens sem verificar GPS
  if (STATUS_ENTREGUE.some(s => status.includes(s))) {
    return { tokens: 10, situacao: 'entregue', geoSituacao: 'nao_verificada', geoMsg: '' }
  }

  // Falha: verifica geolocalização
  if (STATUS_FALHA.some(s => status.includes(s))) {
    if (!lat || !lng) {
      return { tokens: 10, situacao: 'falha_sem_geocod', geoSituacao: 'sem_gps', geoMsg: 'GPS não capturado no momento do scan' }
    }
    if (!endereco) {
      return { tokens: 10, situacao: 'falha_sem_geocod', geoSituacao: 'sem_geocod', geoMsg: 'Endereço não geocodificável (falha cadastral)' }
    }
    const geocod = await geocodificar(endereco)
    if (!geocod) {
      return { tokens: 10, situacao: 'falha_sem_geocod', geoSituacao: 'sem_geocod', geoMsg: 'Endereço não geocodificável (falha cadastral)' }
    }
    const raio = raioAdaptativo(geocod.tipo)
    const dist = distanciaMetros(lat, lng, geocod.lat, geocod.lng)
    if (dist <= raio) {
      return { tokens: 4, situacao: 'falha_dentro_raio', geoSituacao: 'dentro_raio', geoMsg: `${Math.round(dist)}m do endereço (raio: ${raio}m)` }
    }
    return { tokens: 0, situacao: 'falha_fora_raio', geoSituacao: 'fora_raio', geoMsg: `${Math.round(dist)}m do endereço (raio: ${raio}m) — fora do raio` }
  }

  // Cancelado
  return { tokens: 0, situacao: 'cancelado', geoSituacao: 'nao_aplicavel', geoMsg: '' }
}

// ── Handler principal ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { numeroPedido, cpf, lat, lng, accuracy } = await req.json()
    if (!numeroPedido || !cpf) {
      return new Response(JSON.stringify({ erro: "numeroPedido e cpf são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // 1. Busca config Intelipost
    const { data: ipConfig } = await supabase
      .from('intelipost_config')
      .select('api_key, base_url, modo_simulacao')
      .single()

    const apiKey  = ipConfig?.api_key || Deno.env.get("INTELIPOST_API_KEY") || ""
    const baseUrl = ipConfig?.base_url || "https://api.intelipost.com.br/api/v1"
    const modoSim = ipConfig?.modo_simulacao ?? true
    const cpfLimpo = cpf.replace(/\D/g, '')

    // 2. Anti-fraude: scan duplicado?
    const { data: scanExist } = await supabase
      .from('scans')
      .select('id, status, pendente_verificacao')
      .eq('numero_pedido', numeroPedido)
      .eq('cpf_entregador', cpfLimpo)
      .maybeSingle()

    if (scanExist) {
      if (scanExist.pendente_verificacao) {
        return new Response(JSON.stringify({
          numeroPedido,
          statusIntelipost: 'PENDENTE',
          tokens: 0,
          situacao: 'aguardando_confirmacao',
          mensagem: 'Este pedido já foi escaneado e está aguardando a confirmação do status na Intelipost. Os tokens serão creditados em breve.',
          pendente: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      if (scanExist.status !== 'reservado') {
        return new Response(JSON.stringify({
          erro: 'Este pedido já foi processado anteriormente.',
          numeroPedido, tokens: 0, situacao: 'duplicado'
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
    }

    // 3. Consulta Intelipost (ou simula)
    let inteliData: { status: string, endereco: string | null }

    if (modoSim || !apiKey) {
      // Modo simulação: simula OUT_FOR_DELIVERY para aceitar o scan
      inteliData = { status: 'OUT_FOR_DELIVERY', endereco: 'Rua Exemplo, 100, São Paulo, SP, Brasil' }
    } else {
      inteliData = await consultarIntelipost(numeroPedido, apiKey, baseUrl)
    }

    const status = inteliData.status

    // 4. Verifica se o status aceita o scan
    const statusAceito = STATUS_ACEITOS.some(s => status.includes(s))

    if (!statusAceito) {
      // Status não permite scan — retorna mensagem explicativa
      const msg = MSG_STATUS[status] || `Status "${status}" não permite registrar a entrega agora.`
      return new Response(JSON.stringify({
        numeroPedido,
        statusIntelipost: status,
        tokens: 0,
        situacao: 'status_invalido',
        mensagem: msg,
        rejeitado: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // 5. Status aceito → registra scan como PENDENTE
    const agora = new Date()
    const expira = new Date(agora.getTime() + 24 * 60 * 60 * 1000) // 24h
    const proxima = new Date(agora.getTime() + 30 * 60 * 1000)     // 30min

    const scanPayload = {
      numero_pedido:           numeroPedido,
      cpf_entregador:          cpfLimpo,
      status_intelipost:       status,
      status:                  'reservado',
      tokens_creditados:       0,
      situacao:                'aguardando_confirmacao',
      lat_scan:                lat || null,
      lng_scan:                lng || null,
      accuracy_metros:         accuracy || null,
      distancia_metros:        null,
      geo_situacao:            lat ? 'capturado' : 'sem_gps',
      geo_mensagem:            lat ? `GPS capturado ±${Math.round(accuracy || 0)}m` : 'GPS não capturado',
      modo_simulacao:          modoSim || !apiKey,
      pendente_verificacao:    true,
      tentativas_verificacao:  0,
      proxima_verificacao:     proxima.toISOString(),
      expira_em:               expira.toISOString(),
      // Armazena endereço para uso na verificação posterior
      geo_mensagem:            JSON.stringify({
        gpsMsg:   lat ? `GPS capturado ±${Math.round(accuracy || 0)}m` : 'sem_gps',
        endereco: inteliData.endereco,
        lat, lng
      }),
    }

    if (scanExist) {
      await supabase.from('scans').update(scanPayload).eq('id', scanExist.id)
    } else {
      await supabase.from('scans').insert(scanPayload)
    }

    return new Response(JSON.stringify({
      numeroPedido,
      statusIntelipost: status,
      tokens: 0,
      situacao: 'aguardando_confirmacao',
      pendente: true,
      mensagem: modoSim
        ? '⚠️ Modo simulação — scan registrado como pendente'
        : 'Entrega registrada! Os tokens serão creditados após a confirmação do status na Intelipost (pode levar até 30 minutos).',
      gpsCapturado: !!lat,
      gpsMsg: lat ? `GPS capturado · precisão ±${Math.round(accuracy || 0)}m` : 'GPS não capturado',
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })

  } catch (e) {
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
