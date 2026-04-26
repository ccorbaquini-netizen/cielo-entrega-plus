// supabase/functions/validar-entrega/index.ts
// Módulo 2 — Validação de entregas via Intelipost + geolocalização OpenStreetMap

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── Raios adaptativos (metros) ─────────────────────────────────────────────
const RAIO_RESIDENCIAL = 200
const RAIO_CEP_UNICO   = 500
const RAIO_RURAL       = 1000

// ── Distância em metros entre dois pontos GPS ──────────────────────────────
function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── Geocodifica endereço via OpenStreetMap Nominatim ──────────────────────
async function geocodificar(endereco: string): Promise<{ lat: number, lng: number, tipo: string } | null> {
  try {
    const q = encodeURIComponent(endereco)
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { "User-Agent": "CieloEntregaPlus/2.0" }
    })
    const data = await r.json()
    if (!data || data.length === 0) return null
    const tipo = data[0].type || 'residential'
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), tipo }
  } catch {
    return null
  }
}

// ── Define raio adaptativo pelo tipo de local ──────────────────────────────
function raioAdaptativo(tipo: string): number {
  if (['residential','house','apartments','building'].includes(tipo)) return RAIO_RESIDENCIAL
  if (['postcode','suburb','neighbourhood'].includes(tipo)) return RAIO_CEP_UNICO
  return RAIO_RURAL
}

// ── Consulta Intelipost ────────────────────────────────────────────────────
async function consultarIntelipost(numeroPedido: string, apiKey: string, baseUrl: string) {
  const url = `${baseUrl}/shipment_order/${numeroPedido}`
  const r = await fetch(url, {
    headers: { "api-key": apiKey, "Content-Type": "application/json" }
  })
  if (!r.ok) {
    // Fallback: consulta de status simplificado
    const r2 = await fetch(`${baseUrl}/shipment_order/read_status/${numeroPedido}`, {
      headers: { "api-key": apiKey }
    })
    if (!r2.ok) throw new Error(`Intelipost: pedido ${numeroPedido} não encontrado`)
    const d2 = await r2.json()
    return { status: d2.content?.shipment_order_volume_state, endereco: null, cpfEntregador: null }
  }
  const d = await r.json()
  const content = d.content
  const vol = content?.shipment_order_volume_array?.[0]
  const end = content?.end_customer
  const endereco = end
    ? `${end.street}, ${end.number}, ${end.city}, ${end.state}, Brasil`
    : null
  const cpfEntregador = content?.carrier?.driver?.federal_tax_id?.replace(/\D/g,'') || null
  return {
    status: vol?.shipment_order_volume_state || content?.shipment_order_status,
    endereco,
    cpfEntregador,
  }
}

// ── Mapeia status Intelipost → tokens/situação ─────────────────────────────
function calcularTokens(status: string, geoSituacao: string): { tokens: number, situacao: string, statusToken: string } {
  const s = status?.toUpperCase() || ''

  if (['DELIVERED','ENTREGUE'].some(x => s.includes(x))) {
    return { tokens: 10, situacao: 'entregue', statusToken: 'liberado' }
  }

  if (['DELIVERY_FAILED','DELIVERY_REFUSED','FALHA','RECUSADO'].some(x => s.includes(x))) {
    if (geoSituacao === 'sem_geocod') {
      return { tokens: 10, situacao: 'falha_sem_geocod', statusToken: 'liberado' }
    }
    if (geoSituacao === 'dentro_raio') {
      return { tokens: 4, situacao: 'falha_dentro_raio', statusToken: 'liberado' }
    }
    return { tokens: 0, situacao: 'falha_fora_raio', statusToken: 'cancelado' }
  }

  if (['CANCELLED','CANCELADO','LOST','STOLEN'].some(x => s.includes(x))) {
    return { tokens: 0, situacao: 'cancelado', statusToken: 'cancelado' }
  }

  // Status em trânsito: scan prematuro — aceita custódia
  return { tokens: 0, situacao: 'em_transito', statusToken: 'reservado' }
}

// ── Handler principal ──────────────────────────────────────────────────────
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

    const apiKey = ipConfig?.api_key || Deno.env.get("INTELIPOST_API_KEY") || ""
    const baseUrl = ipConfig?.base_url || "https://api.intelipost.com.br/api/v1"
    const modoSim = ipConfig?.modo_simulacao ?? true

    // 2. Anti-fraude: verifica scan duplicado
    const { data: scanExist } = await supabase
      .from('scans')
      .select('id, status')
      .eq('numero_pedido', numeroPedido)
      .eq('cpf_entregador', cpf.replace(/\D/g,''))
      .single()

    if (scanExist && scanExist.status !== 'reservado') {
      return new Response(JSON.stringify({
        erro: "Este pedido já foi registrado anteriormente.",
        numeroPedido, statusIntelipost: scanExist.status,
        tokens: 0, situacao: 'duplicado'
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // 3. Consulta Intelipost (ou simula)
    let inteliData: any
    if (modoSim || !apiKey) {
      // Modo simulação — retorna entrega confirmada para testes
      inteliData = {
        status: 'DELIVERED',
        endereco: 'Rua Exemplo, 100, São Paulo, SP, Brasil',
        cpfEntregador: cpf.replace(/\D/g,'')
      }
    } else {
      inteliData = await consultarIntelipost(numeroPedido, apiKey, baseUrl)
    }

    // 4. Geolocalização (apenas para falhas)
    let geoSituacao = 'sem_gps'
    let geoOk = false
    let geoMsg = ''
    let distancia: number | null = null

    const isFalha = ['DELIVERY_FAILED','DELIVERY_REFUSED','FALHA','RECUSADO']
      .some(x => inteliData.status?.toUpperCase().includes(x))

    if (isFalha) {
      if (!lat || !lng) {
        geoSituacao = 'sem_gps'
        geoMsg = 'GPS não capturado'
      } else if (!inteliData.endereco) {
        geoSituacao = 'sem_geocod'
        geoMsg = 'Endereço não geocodificável (falha cadastral)'
      } else {
        const geocod = await geocodificar(inteliData.endereco)
        if (!geocod) {
          geoSituacao = 'sem_geocod'
          geoMsg = 'Endereço não geocodificável (falha cadastral)'
        } else {
          const raio = raioAdaptativo(geocod.tipo)
          distancia = distanciaMetros(lat, lng, geocod.lat, geocod.lng)
          if (distancia <= raio) {
            geoSituacao = 'dentro_raio'
            geoOk = true
            geoMsg = `${Math.round(distancia)}m do endereço (raio: ${raio}m)`
          } else {
            geoSituacao = 'fora_raio'
            geoMsg = `${Math.round(distancia)}m do endereço (raio: ${raio}m) — fora do raio`
          }
        }
      }
    }

    // 5. Calcula tokens
    const { tokens, situacao, statusToken } = calcularTokens(inteliData.status, geoSituacao)

    // 6. Registra scan no banco
    const cpfLimpo = cpf.replace(/\D/g,'')
    const scanPayload = {
      numero_pedido: numeroPedido,
      cpf_entregador: cpfLimpo,
      status_intelipost: inteliData.status,
      status: statusToken,
      tokens_creditados: tokens,
      situacao,
      lat_scan: lat || null,
      lng_scan: lng || null,
      accuracy_metros: accuracy || null,
      distancia_metros: distancia,
      geo_situacao: geoSituacao,
      geo_mensagem: geoMsg,
      modo_simulacao: modoSim || !apiKey,
    }

    if (scanExist) {
      await supabase.from('scans').update(scanPayload).eq('id', scanExist.id)
    } else {
      await supabase.from('scans').insert(scanPayload)
    }

    return new Response(JSON.stringify({
      numeroPedido,
      statusIntelipost: inteliData.status,
      tokens,
      situacao,
      geoOk,
      geoMsg,
      mensagem: modoSim ? '⚠️ Modo simulação ativo' : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })

  } catch (e) {
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
