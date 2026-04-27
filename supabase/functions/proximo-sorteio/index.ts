// supabase/functions/proximo-sorteio/index.ts
// Calcula próximas datas de sorteio e números de extração da Loteria Federal

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── Ponto de referência para cálculo de extrações ────────────────────────────
// Extração 6058 ocorreu em Sábado, 12/04/2026 (Milionária de Abril)
// A cada semana: +2 extrações (quarta + sábado)
// Sábados: +1 extração por semana
const REF_EXTRACAO = 6058
const REF_DATE = new Date('2026-04-12T00:00:00-03:00')

// ── Encontra o próximo 1º sábado do mês ─────────────────────────────────────
function primeiraSabadoDoMes(ano: number, mes: number): Date {
  // mes: 0-11
  const d = new Date(ano, mes, 1)
  // 0=Dom, 6=Sáb
  const diaSemana = d.getDay()
  const diasAte = diaSemana === 6 ? 0 : (6 - diaSemana + 7) % 7
  // Se cair no próprio dia 1 (sábado), verifica se é o primeiro sábado
  d.setDate(1 + diasAte)
  return d
}

// ── Estima número da extração para uma data ──────────────────────────────────
// Lógica: a cada sábado +1 extração (sábados) e quartas +1 (quartas)
// Simplificando: ~2 extrações por semana
function estimarExtracaoParaData(data: Date): number {
  const diffMs = data.getTime() - REF_DATE.getTime()
  const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24))
  const diffSemanas = diffDias / 7
  // ~2 extrações por semana (quarta + sábado)
  const diffExtracoes = Math.round(diffSemanas * 2)
  return REF_EXTRACAO + diffExtracoes
}

// ── Formata data para exibição ───────────────────────────────────────────────
function fmtData(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Sao_Paulo'
  })
}

// ── Calcula próximos sorteios ────────────────────────────────────────────────
function calcularProximosSorteios() {
  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() // 0-11

  // ── MENSAL — 1º sábado do mês seguinte ──────────────────────────────────
  let mesMensal = mesAtual + 1
  let anoMensal = anoAtual
  if (mesMensal > 11) { mesMensal = 0; anoMensal++ }
  const dataMensal = primeiraSabadoDoMes(anoMensal, mesMensal)
  const cicloMensal = `${anoAtual}-M${String(mesAtual + 1).padStart(2, '0')}`

  // ── TRIMESTRAL — 1º sábado após encerramento do trimestre ───────────────
  const trimAtual = Math.ceil((mesAtual + 1) / 3) // 1-4
  // Mês de encerramento do trimestre atual (0-indexed)
  const mesEncerramentoTrim = trimAtual * 3 - 1 // Mar=2, Jun=5, Set=8, Dez=11
  let anoTrimestral = anoAtual
  let mesTrimestral = mesEncerramentoTrim + 1
  if (mesTrimestral > 11) { mesTrimestral = 0; anoTrimestral++ }
  const dataTrimestral = primeiraSabadoDoMes(anoTrimestral, mesTrimestral)
  // Se já passou, usa próximo trimestre
  const dataTrimFinal = dataTrimestral < hoje
    ? primeiraSabadoDoMes(anoTrimestral, mesTrimestral + 3 > 11 ? mesTrimestral + 3 - 12 : mesTrimestral + 3)
    : dataTrimestral
  const cicloTrimestral = `${anoAtual}-T${trimAtual}`

  // ── SEMESTRAL — 1º sábado após Jun e Dez ────────────────────────────────
  // Semestre 1: encerra Jun → sorteio em Jul
  // Semestre 2: encerra Dez → sorteio em Jan
  let dataSemestral: Date
  let cicloSemestral: string
  const semAtual = mesAtual < 6 ? 1 : 2
  if (semAtual === 1) {
    // Encerra em Jun (5), sorteio em Jul
    dataSemestral = primeiraSabadoDoMes(anoAtual, 6)
    cicloSemestral = `${anoAtual}-S1`
  } else {
    // Encerra em Dez (11), sorteio em Jan do ano seguinte
    dataSemestral = primeiraSabadoDoMes(anoAtual + 1, 0)
    cicloSemestral = `${anoAtual}-S2`
  }
  if (dataSemestral < hoje) {
    // Já passou, pula para o próximo semestre
    if (semAtual === 1) {
      dataSemestral = primeiraSabadoDoMes(anoAtual + 1, 0)
      cicloSemestral = `${anoAtual}-S2`
    } else {
      dataSemestral = primeiraSabadoDoMes(anoAtual + 1, 6)
      cicloSemestral = `${anoAtual + 1}-S1`
    }
  }

  // ── GRANDE PRÊMIO — 1º sábado de Janeiro ────────────────────────────────
  let anoGP = anoAtual
  let dataGP = primeiraSabadoDoMes(anoGP, 0)
  if (dataGP < hoje) {
    anoGP++
    dataGP = primeiraSabadoDoMes(anoGP, 0)
  }
  const cicloGP = `${anoGP}`

  return {
    mensal: {
      tipo: 'mensal',
      ciclo: cicloMensal,
      data: fmtData(dataMensal),
      dataISO: dataMensal.toISOString().slice(0, 10),
      extracao: estimarExtracaoParaData(dataMensal),
      diasRestantes: Math.ceil((dataMensal.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)),
    },
    trimestral: {
      tipo: 'trimestral',
      ciclo: cicloTrimestral,
      data: fmtData(dataTrimFinal),
      dataISO: dataTrimFinal.toISOString().slice(0, 10),
      extracao: estimarExtracaoParaData(dataTrimFinal),
      diasRestantes: Math.ceil((dataTrimFinal.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)),
    },
    semestral: {
      tipo: 'semestral',
      ciclo: cicloSemestral,
      data: fmtData(dataSemestral),
      dataISO: dataSemestral.toISOString().slice(0, 10),
      extracao: estimarExtracaoParaData(dataSemestral),
      diasRestantes: Math.ceil((dataSemestral.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)),
    },
    grande_premio: {
      tipo: 'grande_premio',
      ciclo: cicloGP,
      data: fmtData(dataGP),
      dataISO: dataGP.toISOString().slice(0, 10),
      extracao: estimarExtracaoParaData(dataGP),
      diasRestantes: Math.ceil((dataGP.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)),
    },
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const sorteios = calcularProximosSorteios()

    // Tenta buscar último número de extração real da CEF para calibrar estimativas
    try {
      const r = await fetch(
        'https://servicebus2.caixa.gov.br/portaldeloterias/api/federal/latest',
        { headers: { 'Accept': 'application/json' } }
      )
      if (r.ok) {
        const data = await r.json()
        // Retorna também o último resultado real para referência
        return new Response(JSON.stringify({
          sorteios,
          ultimaExtracao: {
            numero: data.numero || data.concurso,
            data: data.dataApuracao || data.data,
            primeiro: data.dezenasSorteadasOrdemSorteio?.[0] || data.listaDezenas?.[0],
            segundo: data.dezenasSorteadasOrdemSorteio?.[1] || data.listaDezenas?.[1],
          }
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
    } catch {}

    // Se não conseguir buscar da CEF, retorna apenas as datas calculadas
    return new Response(JSON.stringify({ sorteios, ultimaExtracao: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } })

  } catch (e) {
    return new Response(JSON.stringify({ erro: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
