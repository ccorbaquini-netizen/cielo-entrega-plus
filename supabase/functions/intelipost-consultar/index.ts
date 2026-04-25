// supabase/functions/intelipost-consultar/index.ts
// Edge Function — Consulta de pedidos na Intelipost
// Mantém a API Key segura no servidor, nunca exposta ao front-end

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Mapeamento de estados Intelipost → ação do programa ──────────────────────
const STATUS_MAP: Record<string, string> = {
  // Entregue — libera token integral sem checar geoloc
  'DELIVERED': 'ENTREGUE',

  // Falha na entrega — aciona fluxo de geocodificação
  'DELIVERY_FAILED':          'FALHA',
  'DELIVERY_FAILED_ATTEMPTS': 'FALHA',
  'DELIVERY_REFUSED':         'FALHA',

  // Em rota — aceita custódia (token reservado)
  'SHIPPED':      'EM_ROTA',
  'IN_TRANSIT':   'EM_ROTA',
  'OUT_FOR_DEL':  'EM_ROTA',

  // Ainda em fulfillment — rejeita scan
  'NEW':                  'FULFILLMENT',
  'READY_FOR_SHIPMENT':   'FULFILLMENT',
  'HANDLING':             'FULFILLMENT',

  // Cancelado — cancela token
  'CANCELLED': 'CANCELADO',
  'LOST':      'CANCELADO',
  'STOLEN':    'CANCELADO',
}

function mapStatus(estado: string): string {
  return STATUS_MAP[estado?.toUpperCase()] ?? 'DESCONHECIDO'
}

// ── Extrai endereço do destinatário para geocodificação ──────────────────────
function extrairEndereco(content: Record<string, unknown>) {
  const cliente = content.end_customer as Record<string, string> | null
  if (!cliente) return null

  return {
    logradouro:   cliente.shipping_address  || '',
    numero:       cliente.shipping_number   || '',
    complemento:  cliente.shipping_additional || '',
    bairro:       cliente.shipping_quarter  || '',
    cidade:       cliente.shipping_city     || '',
    estado:       cliente.shipping_state    || '',
    cep:          (cliente.shipping_zip_code || '').replace(/\D/g, ''),
    // Endereço completo para geocodificação
    enderecoCompleto: [
      cliente.shipping_address,
      cliente.shipping_number,
      cliente.shipping_quarter,
      cliente.shipping_city,
      cliente.shipping_state,
      'Brasil'
    ].filter(Boolean).join(', ')
  }
}

// ── Extrai CPF do motorista (quando disponível) ───────────────────────────────
function extrairCPFMotorista(content: Record<string, unknown>): string | null {
  const carrier = content.carrier as Record<string, unknown> | null
  const driver  = carrier?.driver as Record<string, string> | null
  return driver?.federal_tax_id?.replace(/\D/g, '') || null
}

// ── Consulta principal na Intelipost ─────────────────────────────────────────
async function consultarPedido(numeroPedido: string, apiKey: string, baseUrl: string) {
  const url = `${baseUrl}/shipment_order/${numeroPedido}`

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'api-key': apiKey,
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!resp.ok) {
    return { erro: `Intelipost retornou ${resp.status}`, status: resp.status }
  }

  const json = await resp.json()

  if (json.status !== 'OK' || !json.content) {
    return { erro: 'Resposta inválida da Intelipost', raw: json }
  }

  const content  = json.content as Record<string, unknown>
  const volumes  = content.shipment_order_volume_array as Array<Record<string, unknown>>
  const volume   = volumes?.[0] ?? {}
  const estadoBruto = (volume.shipment_order_volume_state as string) ?? ''
  const estadoApp   = mapStatus(estadoBruto)

  return {
    numeroPedido:       content.order_number,
    estadoBruto,
    estadoApp,
    endereco:           extrairEndereco(content),
    cpfMotorista:       extrairCPFMotorista(content),
    transportadora:     content.logistic_provider_name,
    dataEntrega:        volume.delivered_date,
    dataDespacho:       content.shipped_date_iso,
    historicoEstados:   (volume.shipment_order_volume_state_history_array as unknown[]) ?? [],
    raw: undefined, // não expor o JSON bruto em produção
  }
}

// ── Consulta de status rápido (fallback) ─────────────────────────────────────
async function consultarStatus(numeroPedido: string, apiKey: string, baseUrl: string) {
  const url = `${baseUrl}/shipment_order/read_status/${numeroPedido}`

  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json', 'api-key': apiKey },
    signal: AbortSignal.timeout(8_000),
  })

  if (!resp.ok) return { erro: `Status ${resp.status}` }

  const json = await resp.json()
  const estadoBruto = json.content?.shipment_order_state ?? ''

  return {
    estadoBruto,
    estadoApp: mapStatus(estadoBruto),
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const body = await req.json()
    const {
      numeroPedido,
      apiKey,
      apenasTestar = false,
      apenasStatus = false,
    } = body

    // Busca a API Key do banco se não vier no body (modo painel de gestão)
    // Em produção, a key vem da tabela intelipost_config via Supabase admin client
    const key     = apiKey || Deno.env.get('INTELIPOST_API_KEY') || ''
    const baseUrl = Deno.env.get('INTELIPOST_BASE_URL') || 'https://api.intelipost.com.br/api/v1'

    if (!key) {
      return new Response(
        JSON.stringify({ erro: 'API Key não configurada. Insira a chave no painel de gestão.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Modo teste de conexão (painel admin)
    if (apenasTestar) {
      const resultado = await consultarStatus('PEDIDO0001', key, baseUrl)
      // Retorna OK mesmo em 404 — confirma que a API respondeu com a key
      const conectou = !resultado.erro || resultado.erro.includes('404')
      return new Response(
        JSON.stringify({
          ok: conectou,
          mensagem: conectou ? 'API Key válida — Intelipost respondeu' : resultado.erro
        }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    if (!numeroPedido) {
      return new Response(
        JSON.stringify({ erro: 'numeroPedido é obrigatório' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Consulta rápida de status apenas
    if (apenasStatus) {
      const resultado = await consultarStatus(numeroPedido, key, baseUrl)
      return new Response(
        JSON.stringify(resultado),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Consulta completa (status + endereço + motorista)
    const resultado = await consultarPedido(numeroPedido, key, baseUrl)

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return new Response(
      JSON.stringify({ erro: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
