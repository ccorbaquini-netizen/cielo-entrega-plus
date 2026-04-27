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
const REF_EXTRACAO = 6058
const REF_DATE = new Date(Date.UTC(2026, 3, 12)) // 12/04/2026 UTC

// ── Encontra o próximo 1º sábado do mês (usando UTC) ─────────────────────────
function primeiraSabadoDoMes(ano: number, mes: number): Date {
  // Cria data no primeiro dia do mês em UTC
  const d = new Date(Date.UTC(ano, mes, 1))
  const diaSemana = d.getUTCDay() // 0=Dom, 6=Sáb
  const diasAte = diaSemana === 6 ? 0 : (6 - diaSemana + 7) % 7
  d.setUTCDate(1 + diasAte)
  return d
}

// ── Estima número da extração para uma data ──────────────────────────────────
function estimarExtracaoParaData(data: Date): number {
  const diffMs = data.getTime() - REF_DATE.getTime()
  const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24))
  const diffSemanas = diffDias / 7
  const diffExtracoes = Math.round(diffSemanas * 2)
  return REF_EXTRACAO + diffExtracoes
}

// ── Formata data para exibição (UTC → pt-BR) ─────────────────────────────────
function fmtData(d: Date): string {
  // Usa UTC para evitar deslocamento de fuso
  const dia  = String(d.getUTCDate()).padStart(2, '0')
  const mes  = String(d.getUTCMonth() + 1).padStart(2, '0')
  const ano  = d.getUTCFullYear()
  return `${dia}/${mes}/${ano}`
}

// ── Calcula próximos sorteios ────────────────────────────────────────────────
function calcularProximosSorteios() {
  const hoje = new Date()
  const anoAtual = hoje.getUTCFullYear()
  const mesAtual = hoje.getUTCMonth() // 0-11

  // ── MENSAL — 1º sábado do mês seguinte ──────────────────────────────────
  let mesMensal = mesAtual + 1
  let anoMensal = anoAtual
  if (mesMensal > 11) { mesMensal = 0; anoMensal++ }
  const dataMensal = primeiraSabadoDoMes(anoMensal, mesMensal)
  const cicloMensal = `${anoAtual}-M${String(mesAtual + 1).padStart(2, '0')}`

  // ── TRIMESTRAL — 1º sábado após encerramento do trimestre ───────────────
  const trimAtual = Math.ceil((mesAtual + 1) / 3)
  const mesEncerramentoTrim = trimAtual * 3 - 1 // 0-indexed: Mar=2, Jun=5, Set=8, Dez=11
  let anoTrimestral = anoAtual
  let mesTrimestral = mesEncerramentoTrim + 1
  if (mesTrimestral > 11) { mesTrimestral = 0; anoTrimestral++ }
  let dataTrimFinal = primeiraSabadoDoMes(anoTrimestral, mesTrimestral)
  if (dataTrimFinal < hoje) {
    const proxTrim = mesTrimestral + 3
    dataTrimFinal = primeiraSabadoDoMes(
      proxTrim > 11 ? anoTrimestral + 1 : anoTrimestral,
      proxTrim > 11 ? proxTrim - 12 : proxTrim
    )
  }
  const cicloTrimestral = `${anoAtual}-T${trimAtual}`

  // ── SEMESTRAL — 1º sábado após Jun (→ Jul) e Dez (→ Jan) ────────────────
  const semAtual = mesAtual < 6 ? 1 : 2
  let dataSemestral: Date
  let cicloSemestral: string
  if (semAtual === 1) {
    dataSemestral = primeiraSabadoDoMes(anoAtual, 6) // Jul
    cicloSemestral = `${anoAtual}-S1`
  } else {
    dataSemestral = primeiraSabadoDoMes(anoAtual + 1, 0) // Jan
    cicloSemestral = `${anoAtual}-S2`
  }
  if (dataSemestral < hoje) {
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

  const diasRestantes = (d: Date) =>
    Math.ceil((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

  return {
    mensal: {
      tipo: 'mensal', ciclo: cicloMensal,
      data: fmtData(dataMensal), dataISO: dataMensal.toISOString().slice(0, 10),
      extracao: estimarExtracaoParaData(dataMensal),
      diasRestantes: diasRestantes(dataMensal),
    },
    trimestral: {
      tipo: 'trimestral', ciclo: cicloTrimestral,
      data: fmtData(dataTrimFinal), dataISO: dataTrimFinal.toISOString().slice(0, 10),
      extracao: estimarExtracaoParaData(dataTrimFinal),
      diasRestantes: diasRestantes(dataTrimFinal),
    },
    semestral: {
      tipo: 'semestral', ciclo: cicloSemestral,
      data: fmtData(dataSemestral), dataISO: dataSemestral.toISOString().slice(0, 10),
      extracao: estimarExtracaoParaData(dataSemestral),
      diasRestantes: diasRestantes(dataSemestral),
    },
    grande_premio: {
      tipo: 'grande_premio', ciclo: cicloGP,
      data: fmtData(dataGP), dataISO: dataGP.toISOString().slice(0, 10),
      extracao: estimarExtracaoParaData(dataGP),
      diasRestantes: diasRestantes(dataGP),
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
