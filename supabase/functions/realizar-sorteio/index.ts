// supabase/functions/realizar-sorteio/index.ts
// Realiza o sorteio: busca resultado da Loteria Federal e calcula ganhadores

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── Busca resultado da Loteria Federal ───────────────────────────────────────
async function buscarResultadoFederal(numeroExtracao?: number) {
  const urls = numeroExtracao
    ? [
        `https://servicebus2.caixa.gov.br/portaldeloterias/api/federal/${numeroExtracao}`,
        `https://loteriascaixa-api.herokuapp.com/api/federal/${numeroExtracao}`,
        `https://api.guidi.dev.br/loteria/federal/${numeroExtracao}`,
      ]
    : [
        `https://servicebus2.caixa.gov.br/portaldeloterias/api/federal/latest`,
        `https://loteriascaixa-api.herokuapp.com/api/federal/latest`,
        `https://api.guidi.dev.br/loteria/federal/ultimo`,
      ]

  let lastError = ''
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'CieloEntregaPlus/1.0' },
        signal: AbortSignal.timeout(8000)
      })
      if (!r.ok) { lastError = `HTTP ${r.status} em ${url}`; continue }

      const data = await r.json()

      // Normaliza diferentes formatos de resposta
      const dezenas =
        data.dezenasSorteadasOrdemSorteio ||
        data.listaDezenas ||
        data.dezenas ||
        []

      if (dezenas.length < 2) { lastError = `Resultado inválido em ${url}`; continue }

      return {
        numero:   data.numero || data.concurso || numeroExtracao || 0,
        data:     data.dataApuracao || data.data || new Date().toLocaleDateString('pt-BR'),
        primeiro: String(dezenas[0]).replace(/\D/g, ''),
        segundo:  String(dezenas[1]).replace(/\D/g, ''),
      }
    } catch (e) {
      lastError = `${e.message} em ${url}`
      continue
    }
  }

  throw new Error(`Não foi possível buscar o resultado da Loteria Federal. ${lastError}. Use a opção de inserir os números manualmente.`)
}

// ── Calcula número vencedor ───────────────────────────────────────────────────
// Regra: 2 últimos dígitos do 1º prêmio + 4 primeiros dígitos do 2º prêmio
function calcularNumeroVencedor(primeiro: string, segundo: string): string {
  const ultimos2 = primeiro.slice(-2).padStart(2, '0')
  const primeiros4 = segundo.slice(0, 4).padStart(4, '0')
  return (ultimos2 + primeiros4).padStart(6, '0')
}

// ── Lógica circular: encontra bilhete mais próximo ───────────────────────────
function encontrarMaisProximo(numero: number, bilhetes: number[]): number {
  if (bilhetes.length === 0) return -1
  const sorted = [...bilhetes].sort((a, b) => a - b)
  const max = sorted[sorted.length - 1]

  // Distância direta e circular
  let melhor = sorted[0]
  let melhorDist = Infinity

  for (const b of sorted) {
    const distDireta = Math.abs(b - numero)
    const distCircular = max + 1 - distDireta // "dá a volta"
    const dist = Math.min(distDireta, distCircular)
    if (dist < melhorDist) { melhorDist = dist; melhor = b }
  }
  return melhor
}

// ── Distribui N ganhadores uniformemente no pool circular ────────────────────
function distribuirGanhadores(ancora: number, total: number, n: number, bilhetes: number[]): number[] {
  if (bilhetes.length === 0) return []
  const sorted = [...new Set(bilhetes)].sort((a, b) => a - b)
  const paso = Math.floor(sorted.length / n)
  const idxAncora = sorted.indexOf(ancora)

  const ganhadores: number[] = [ancora]
  for (let i = 1; i < n; i++) {
    const idx = (idxAncora + i * paso) % sorted.length
    if (!ganhadores.includes(sorted[idx])) ganhadores.push(sorted[idx])
  }
  return ganhadores
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { tipo, ciclo, numeroExtracao, primeiroPremio, segundoPremio } = await req.json()

    if (!tipo || !ciclo) {
      return new Response(JSON.stringify({ erro: "tipo e ciclo são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // 1. Busca config
    const { data: config } = await supabase
      .from('sorteios_config')
      .select('*')
      .single()

    // 2. Busca resultado da Loteria Federal (ou usa números inseridos manualmente)
    let resultado
    if (primeiroPremio && segundoPremio) {
      // Números inseridos manualmente pelo admin
      resultado = {
        numero:   numeroExtracao || 0,
        data:     new Date().toLocaleDateString('pt-BR'),
        primeiro: String(primeiroPremio).replace(/\D/g, ''),
        segundo:  String(segundoPremio).replace(/\D/g, ''),
      }
    } else {
      resultado = await buscarResultadoFederal(numeroExtracao)
    }
    const numeroVencedor = calcularNumeroVencedor(resultado.primeiro, resultado.segundo)
    const numVencedorInt = parseInt(numeroVencedor, 10)

    // 3. Busca bilhetes elegíveis do ciclo
    let queryBilhetes = supabase
      .from('bilhetes')
      .select(`
        id, numero, cpf_entregador, ciclo,
        entregadores!inner(nome, cpf, cidade, uf, telefone)
      `)

    if (tipo === 'mensal' || tipo === 'trimestral') {
      queryBilhetes = queryBilhetes.eq('ciclo', ciclo)
    } else if (tipo === 'semestral' || tipo === 'grande_premio') {
      // Semestral: últimos 2 ciclos trimestrais
      const [ano, sem] = ciclo.split('-S')
      const trimAtual = sem === '1' ? ['T1', 'T2'] : ['T3', 'T4']
      const ciclos = trimAtual.map(t => `${ano}-${t}`)
      queryBilhetes = queryBilhetes.in('ciclo', ciclos)
    }

    const { data: bilhetesData } = await queryBilhetes
    if (!bilhetesData?.length) {
      return new Response(JSON.stringify({
        erro: 'Nenhum bilhete elegível encontrado para este ciclo.'
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // 4. Para semestral e grande prêmio: filtra ativos nos últimos 2 meses
    let bilhetesElegiveis = bilhetesData
    if (tipo === 'semestral' || tipo === 'grande_premio') {
      const dataCorte = new Date()
      dataCorte.setMonth(dataCorte.getMonth() - 2)

      const { data: cpfsAtivos } = await supabase
        .from('scans')
        .select('cpf_entregador')
        .gte('created_at', dataCorte.toISOString())
        .eq('status', 'liberado')

      const setCpfs = new Set((cpfsAtivos || []).map(s => s.cpf_entregador))
      bilhetesElegiveis = bilhetesData.filter(b => setCpfs.has(b.cpf_entregador))

      if (!bilhetesElegiveis.length) {
        return new Response(JSON.stringify({
          erro: 'Nenhum entregador elegível (ativo nos últimos 2 meses) com bilhetes neste ciclo.'
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
    }

    // 4b. Exclui bilhetes que já ganharam em sorteios anteriores do mesmo dia
    // (Regra: bilhete premiado não concorre novamente no mesmo sábado)
    const hoje = new Date().toISOString().slice(0, 10)
    const { data: sorteiosHoje } = await supabase
      .from('sorteios_resultados')
      .select('ganhadores, tipo')
      .eq('data_sorteio', hoje)
      .eq('status', 'realizado')
      .neq('tipo', tipo) // não exclui o próprio tipo (caso de rerun)

    if (sorteiosHoje?.length) {
      // Coleta todos os números de bilhetes que já ganharam hoje
      const bilhetesJaGanharam = new Set<string>()
      for (const s of sorteiosHoje) {
        const ganhs = s.ganhadores as Array<{ bilhete: string }> || []
        for (const g of ganhs) {
          if (g.bilhete) bilhetesJaGanharam.add(g.bilhete)
        }
      }

      if (bilhetesJaGanharam.size > 0) {
        const antes = bilhetesElegiveis.length
        bilhetesElegiveis = bilhetesElegiveis.filter(b => !bilhetesJaGanharam.has(b.numero))
        const excluidos = antes - bilhetesElegiveis.length
        console.log(`Sorteio ${tipo}: ${excluidos} bilhete(s) excluído(s) por já terem sido premiados hoje`)

        if (!bilhetesElegiveis.length) {
          return new Response(JSON.stringify({
            erro: 'Todos os bilhetes elegíveis já foram premiados em sorteios anteriores de hoje.'
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
        }
      }
    }

    // 5. Calcula ganhadores
    const numeros = bilhetesElegiveis.map(b => parseInt(b.numero, 10))
    let bilhetesGanhadores: number[] = []

    if (tipo === 'mensal') {
      // Algoritmo proporcional com distribuição circular
      const proporcao = config?.proporcao_mensal || 2000
      const maxGanh = config?.max_ganhadores_mensal || 100
      const minGanh = config?.min_ganhadores_mensal || 1
      const qtd = Math.max(minGanh, Math.min(maxGanh, Math.floor(numeros.length / proporcao)))

      const ancora = encontrarMaisProximo(numVencedorInt, numeros)
      bilhetesGanhadores = distribuirGanhadores(ancora, numVencedorInt, qtd, numeros)
    } else if (tipo === 'trimestral' || tipo === 'semestral') {
      // 5 ganhadores distribuídos circularmente
      const ancora = encontrarMaisProximo(numVencedorInt, numeros)
      bilhetesGanhadores = distribuirGanhadores(ancora, numVencedorInt, 5, numeros)
    } else if (tipo === 'grande_premio') {
      // 1 ganhador — mais próximo circular
      const ancora = encontrarMaisProximo(numVencedorInt, numeros)
      bilhetesGanhadores = [ancora]
    }

    // 6. Monta lista de ganhadores com dados do entregador
    const ganhadores = bilhetesGanhadores.map((numBilhete, posicao) => {
      const numStr = String(numBilhete).padStart(6, '0')
      const bilhete = bilhetesElegiveis.find(b => b.numero === numStr)
      return {
        posicao: posicao + 1,
        bilhete: numStr,
        cpf: bilhete?.cpf_entregador || '',
        nome: bilhete?.entregadores?.nome || '',
        cidade: bilhete?.entregadores?.cidade || '',
        uf: bilhete?.entregadores?.uf || '',
        telefone: bilhete?.entregadores?.telefone || '',
      }
    })

    // 7. Registra resultado no banco
    const { data: sorteioSalvo, error: errSalvo } = await supabase
      .from('sorteios_resultados')
      .upsert({
        tipo,
        ciclo,
        data_sorteio: new Date().toISOString().slice(0, 10),
        numero_extracao: resultado.numero,
        resultado_1premio: resultado.primeiro,
        resultado_2premio: resultado.segundo,
        numero_vencedor: numeroVencedor,
        total_bilhetes: bilhetesElegiveis.length,
        total_ganhadores: ganhadores.length,
        ganhadores,
        status: 'realizado'
      }, { onConflict: 'tipo,ciclo' })
      .select()
      .single()

    if (errSalvo) throw new Error(errSalvo.message)

    return new Response(JSON.stringify({
      sucesso: true,
      tipo, ciclo,
      extracaoCEF: resultado.numero,
      dataCEF: resultado.data,
      primeiro: resultado.primeiro,
      segundo: resultado.segundo,
      numeroVencedor,
      totalBilhetes: bilhetesElegiveis.length,
      totalElegiveis: bilhetesElegiveis.length,
      ganhadores,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })

  } catch (e) {
    return new Response(JSON.stringify({ erro: e.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
