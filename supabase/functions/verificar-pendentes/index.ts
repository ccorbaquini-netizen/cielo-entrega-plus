// supabase/functions/verificar-pendentes/index.ts
// Job de verificação — roda a cada 30 minutos via pg_cron ou chamada externa
// Busca scans pendentes e verifica o status final na Intelipost

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const STATUS_ENTREGUE  = ['DELIVERED', 'ENTREGUE']
const STATUS_FALHA     = ['DELIVERY_FAILED', 'DELIVERY_REFUSED', 'FALHA', 'RECUSADO']
const STATUS_CANCELADO = ['CANCELLED', 'CANCELADO', 'LOST', 'STOLEN']
const STATUS_FINAIS    = [...STATUS_ENTREGUE, ...STATUS_FALHA, ...STATUS_CANCELADO]

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

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

async function consultarStatus(numeroPedido: string, apiKey: string, baseUrl: string) {
  try {
    const r = await fetch(`${baseUrl}/shipment_order/${numeroPedido}`, {
      headers: { "api-key": apiKey }
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
    const r2 = await fetch(`${baseUrl}/shipment_order/read_status/${numeroPedido}`, {
      headers: { "api-key": apiKey }
    })
    if (!r2.ok) return null
    const d2 = await r2.json()
    return { status: (d2.content?.shipment_order_volume_state || '').toUpperCase(), endereco: null }
  } catch { return null }
}

async function resolverTokens(scan: any, status: string, endereco: string | null) {
  // Extrai GPS do campo geo_mensagem (armazenado como JSON)
  let lat = scan.lat_scan
  let lng = scan.lng_scan
  try {
    const meta = JSON.parse(scan.geo_mensagem || '{}')
    if (meta.lat) lat = meta.lat
    if (meta.lng) lng = meta.lng
    if (!endereco && meta.endereco) endereco = meta.endereco
  } catch {}

  if (STATUS_ENTREGUE.some(s => status.includes(s))) {
    return { tokens: 10, situacao: 'entregue', geoSituacao: 'nao_verificada', geoMsg: '' }
  }

  if (STATUS_FALHA.some(s => status.includes(s))) {
    if (!lat || !lng) {
      return { tokens: 10, situacao: 'falha_sem_geocod', geoSituacao: 'sem_gps', geoMsg: 'GPS não capturado' }
    }
    if (!endereco) {
      return { tokens: 10, situacao: 'falha_sem_geocod', geoSituacao: 'sem_geocod', geoMsg: 'Endereço não geocodificável' }
    }
    const geocod = await geocodificar(endereco)
    if (!geocod) {
      return { tokens: 10, situacao: 'falha_sem_geocod', geoSituacao: 'sem_geocod', geoMsg: 'Endereço não geocodificável' }
    }
    const raio = raioAdaptativo(geocod.tipo)
    const dist = distanciaMetros(lat, lng, geocod.lat, geocod.lng)
    if (dist <= raio) {
      return { tokens: 4, situacao: 'falha_dentro_raio', geoSituacao: 'dentro_raio', geoMsg: `${Math.round(dist)}m (raio: ${raio}m)` }
    }
    return { tokens: 0, situacao: 'falha_fora_raio', geoSituacao: 'fora_raio', geoMsg: `${Math.round(dist)}m (raio: ${raio}m) — fora` }
  }

  return { tokens: 0, situacao: 'cancelado', geoSituacao: 'nao_aplicavel', geoMsg: '' }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const { data: ipConfig } = await supabase
    .from('intelipost_config')
    .select('api_key, base_url, modo_simulacao')
    .single()

  const apiKey  = ipConfig?.api_key || Deno.env.get("INTELIPOST_API_KEY") || ""
  const baseUrl = ipConfig?.base_url || "https://api.intelipost.com.br/api/v1"
  const modoSim = ipConfig?.modo_simulacao ?? true

  const agora = new Date().toISOString()

  // Busca scans pendentes com verificação vencida
  const { data: pendentes } = await supabase
    .from('scans')
    .select('*')
    .eq('pendente_verificacao', true)
    .lte('proxima_verificacao', agora)

  if (!pendentes?.length) {
    return new Response(JSON.stringify({ processados: 0, msg: 'Nenhum scan pendente' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }

  let processados = 0
  let expirados = 0

  for (const scan of pendentes) {
    const agora2 = new Date()

    // Expirou? (24h sem status final)
    if (scan.expira_em && new Date(scan.expira_em) < agora2) {
      await supabase.from('scans').update({
        pendente_verificacao: false,
        status: 'cancelado',
        tokens_creditados: 0,
        situacao: 'expirado',
        geo_mensagem: 'Sem confirmação de status em 24h',
      }).eq('id', scan.id)
      expirados++
      continue
    }

    // Modo simulação: simula DELIVERED após 1 tentativa
    if (modoSim || !apiKey) {
      const result = { tokens: 10, situacao: 'entregue', geoSituacao: 'nao_verificada', geoMsg: 'Simulação' }
      await supabase.from('scans').update({
        pendente_verificacao: false,
        status: 'liberado',
        status_intelipost: 'DELIVERED (simulado)',
        tokens_creditados: result.tokens,
        situacao: result.situacao,
        tentativas_verificacao: (scan.tentativas_verificacao || 0) + 1,
      }).eq('id', scan.id)
      processados++
      continue
    }

    // Consulta Intelipost
    const inteliData = await consultarStatus(scan.numero_pedido, apiKey, baseUrl)
    if (!inteliData) {
      // Erro na consulta — agenda próxima tentativa em 30min
      const proxima = new Date(agora2.getTime() + 30 * 60 * 1000)
      await supabase.from('scans').update({
        tentativas_verificacao: (scan.tentativas_verificacao || 0) + 1,
        proxima_verificacao: proxima.toISOString(),
      }).eq('id', scan.id)
      continue
    }

    const status = inteliData.status
    const isFinal = STATUS_FINAIS.some(s => status.includes(s))

    if (!isFinal) {
      // Status ainda não é final — agenda próxima tentativa em 30min
      const proxima = new Date(agora2.getTime() + 30 * 60 * 1000)
      await supabase.from('scans').update({
        status_intelipost: status,
        tentativas_verificacao: (scan.tentativas_verificacao || 0) + 1,
        proxima_verificacao: proxima.toISOString(),
      }).eq('id', scan.id)
      continue
    }

    // Status final encontrado — calcula tokens
    const result = await resolverTokens(scan, status, inteliData.endereco)

    await supabase.from('scans').update({
      pendente_verificacao: false,
      status: result.tokens > 0 ? 'liberado' : 'cancelado',
      status_intelipost: status,
      tokens_creditados: result.tokens,
      situacao: result.situacao,
      geo_situacao: result.geoSituacao,
      geo_mensagem: result.geoMsg,
      tentativas_verificacao: (scan.tentativas_verificacao || 0) + 1,
    }).eq('id', scan.id)

    processados++
  }

  return new Response(JSON.stringify({
    processados,
    expirados,
    total_pendentes: pendentes.length,
    msg: `${processados} scans resolvidos, ${expirados} expirados`
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
})
