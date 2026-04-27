import { createClient } from '@supabase/supabase-js'

// Estas variáveis são definidas no arquivo .env local e no painel do Netlify
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('⚠️ Variáveis do Supabase não configuradas. Verifique o arquivo .env')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── FEATURE FLAGS ────────────────────────────────────────────────────────────
export async function getFeatureFlag(nome) {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('habilitado')
    .eq('nome', nome)
    .single()
  if (error) return false
  return data?.habilitado ?? false
}

export async function getAllFeatureFlags() {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('*')
    .order('nome')
  if (error) return []
  return data
}

export async function updateFeatureFlag(nome, habilitado) {
  const { error } = await supabase
    .from('feature_flags')
    .update({ habilitado, updated_at: new Date().toISOString() })
    .eq('nome', nome)
  return !error
}

// ─── WHATSAPP CONFIG ──────────────────────────────────────────────────────────
export async function getWhatsappConfig() {
  const { data, error } = await supabase
    .from('whatsapp_config')
    .select('*')
    .single()
  if (error) return null
  return data
}

export async function updateWhatsappConfig(config) {
  const { error } = await supabase
    .from('whatsapp_config')
    .update({ ...config, updated_at: new Date().toISOString() })
    .eq('id', config.id)
  return !error
}

// ─── INTELIPOST CONFIG ────────────────────────────────────────────────────────
export async function getIntelipostConfig() {
  const { data, error } = await supabase
    .from('intelipost_config')
    .select('*')
    .single()
  if (error) return null
  return data
}

export async function updateIntelipostConfig(config) {
  const { error } = await supabase
    .from('intelipost_config')
    .update({ ...config, updated_at: new Date().toISOString() })
    .eq('id', config.id)
  return !error
}

export async function testarIntelipostConexao(apiKey) {
  const { data, error } = await supabase.functions.invoke('intelipost-consultar', {
    body: { numeroPedido: 'PEDIDO0001', apiKey, apenasTestar: true }
  })
  return { ok: !error, mensagem: error?.message || data?.mensagem }
}

// ─── ENTREGADORES ─────────────────────────────────────────────────────────────
export async function buscarEntregadorPorCPF(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '')
  const { data, error } = await supabase
    .from('entregadores')
    .select('*')
    .eq('cpf', cpfLimpo)
    .single()
  if (error) return null
  return data
}

export async function cadastrarEntregador({ cpf, nome, telefone, cidade, uf, selfieFile, plataforma }) {
  const cpfLimpo = cpf.replace(/\D/g, '')

  // 1. Faz upload da selfie
  let selfieUrl = null
  if (selfieFile) {
    const ext = selfieFile.name?.split('.').pop() || 'jpg'
    const path = `selfies/${cpfLimpo}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('entregadores')
      .upload(path, selfieFile, { upsert: true })
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('entregadores').getPublicUrl(path)
      selfieUrl = urlData.publicUrl
    }
  }

  // 2. Insere o entregador
  const { data, error } = await supabase
    .from('entregadores')
    .insert({
      cpf: cpfLimpo,
      nome: nome.trim(),
      telefone: telefone?.replace(/\D/g, '') || null,
      cidade: cidade?.trim() || null,
      uf: uf || null,
      selfie_url: selfieUrl,
      plataforma: plataforma || 'web',
      status: 'ativo'
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function registrarInstalacaoPWA(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '')
  await supabase
    .from('entregadores')
    .update({ pwa_instalado: true, updated_at: new Date().toISOString() })
    .eq('cpf', cpfLimpo)
}

// ─── MÓDULO 2 — SCANS E TOKENS ────────────────────────────────────────────────

export async function registrarEntrega({ numeroPedido, cpf, lat, lng, accuracy }) {
  const { data, error } = await supabase.functions.invoke('validar-entrega', {
    body: { numeroPedido, cpf, lat, lng, accuracy }
  })
  if (error) throw new Error(error.message)
  if (data?.erro) throw new Error(data.erro)
  return data
}

export async function buscarHistoricoScans(cpf, limite = 20) {
  const cpfLimpo = cpf.replace(/\D/g, '')
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('cpf_entregador', cpfLimpo)
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) return []
  return data
}

export async function buscarTokens(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '')
  const { data, error } = await supabase
    .from('scans')
    .select('tokens_creditados')
    .eq('cpf_entregador', cpfLimpo)
    .eq('status', 'liberado')
  if (error) return 0
  return (data || []).reduce((sum, s) => sum + (s.tokens_creditados || 0), 0)
}

// ─── ADMIN — GESTÃO DE ENTREGADORES E SCANS ──────────────────────────────────

export async function listarEntregadores() {
  const { data, error } = await supabase
    .from('entregadores')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data
}

export async function atualizarEntregador(id, campos) {
  const { data, error } = await supabase
    .from('entregadores')
    .update(campos)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function excluirEntregador(id) {
  // 1. Busca o CPF primeiro
  const { data: ent, error: errBusca } = await supabase
    .from('entregadores')
    .select('cpf')
    .eq('id', id)
    .single()

  if (errBusca || !ent) throw new Error('Entregador não encontrado')

  const cpfLimpo = ent.cpf.replace(/\D/g, '')

  // 2. Exclui bilhetes
  await supabase.from('bilhetes').delete().eq('cpf_entregador', cpfLimpo)

  // 3. Exclui scans
  await supabase.from('scans').delete().eq('cpf_entregador', cpfLimpo)

  // 4. Exclui o entregador
  const { error } = await supabase.from('entregadores').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function excluirScan(id) {
  const { error } = await supabase.from('scans').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function excluirTodosScansEntregador(cpf) {
  const cpfLimpo = cpf.replace(/\D/g,'')
  // Exclui scans e bilhetes juntos (limpeza de dados de teste)
  const { error: e1 } = await supabase.from('scans').delete().eq('cpf_entregador', cpfLimpo)
  const { error: e2 } = await supabase.from('bilhetes').delete().eq('cpf_entregador', cpfLimpo)
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)
}

// ─── RELATÓRIOS ───────────────────────────────────────────────────────────────

export async function buscarRelatorioEntregas({ dataInicio, dataFim, apenasAtivos } = {}) {
  let query = supabase
    .from('scans')
    .select(`
      id, numero_pedido, cpf_entregador, status_intelipost,
      status, tokens_creditados, situacao,
      lat_scan, lng_scan, accuracy_metros, distancia_metros,
      geo_situacao, geo_mensagem, modo_simulacao, created_at,
      entregadores!inner(nome, telefone)
    `)
    .order('created_at', { ascending: false })

  if (dataInicio) query = query.gte('created_at', dataInicio)
  if (dataFim)    query = query.lte('created_at', dataFim + 'T23:59:59')
  if (apenasAtivos) query = query.eq('status', 'liberado')

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

// ─── BILHETES ─────────────────────────────────────────────────────────────────

export async function buscarBilhetes(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '')
  const { data, error } = await supabase
    .from('bilhetes')
    .select('*')
    .eq('cpf_entregador', cpfLimpo)
    .order('created_at', { ascending: false })
  if (error) return []
  return data || []
}

export async function buscarTokensNaoConvertidos(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '')

  // Total de tokens liberados
  const { data: scansData } = await supabase
    .from('scans')
    .select('tokens_creditados')
    .eq('cpf_entregador', cpfLimpo)
    .eq('status', 'liberado')
  const totalTokens = (scansData || []).reduce((s, r) => s + (r.tokens_creditados || 0), 0)

  // Total de tokens já convertidos em bilhetes
  const { data: bilhetesData } = await supabase
    .from('bilhetes')
    .select('tokens_usados')
    .eq('cpf_entregador', cpfLimpo)
  const tokensConvertidos = (bilhetesData || []).reduce((s, r) => s + (r.tokens_usados || 0), 0)

  return {
    tokensDisponiveis: Math.max(0, totalTokens - tokensConvertidos),
    tokensConvertidos,
    totalTokens,
    bilhetes: bilhetesData?.length || 0
  }
}

export async function converterTokensEmBilhetes(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '')

  // Busca saldo atual
  const { tokensDisponiveis, bilhetes: qtdAtual } = await buscarTokensNaoConvertidos(cpfLimpo)

  if (tokensDisponiveis < 10) throw new Error('Tokens insuficientes. Você precisa de pelo menos 10 tokens.')

  const qtdNovos = Math.floor(tokensDisponiveis / 10)
  const ciclo = gerarCicloAtual()

  // Gera os bilhetes
  const novos = Array.from({ length: qtdNovos }, (_, i) => ({
    cpf_entregador: cpfLimpo,
    numero: String(qtdAtual + i + 1).padStart(6, '0'),
    ciclo,
    tokens_usados: 10
  }))

  const { error } = await supabase.from('bilhetes').insert(novos)
  if (error) throw new Error(error.message)

  return { gerados: qtdNovos, total: qtdAtual + qtdNovos }
}

function gerarCicloAtual() {
  const now = new Date()
  const ano = now.getFullYear()
  const mes = now.getMonth() + 1
  const trim = Math.ceil(mes / 3)
  return `${ano}-T${trim}`
}

// ─── SORTEIOS ─────────────────────────────────────────────────────────────────

// Retorna ciclo atual no formato "2025-T2" ou "2025-M04"
export function cicloAtual(tipo = 'trimestral') {
  const now = new Date()
  const ano = now.getFullYear()
  const mes = now.getMonth() + 1
  if (tipo === 'mensal') return `${ano}-M${String(mes).padStart(2,'0')}`
  const trim = Math.ceil(mes / 3)
  return `${ano}-T${trim}`
}

// Retorna início/fim de um período em ISO
function periodoAtivo(meses) {
  const now = new Date()
  const inicio = new Date(now)
  inicio.setMonth(inicio.getMonth() - meses)
  inicio.setHours(0,0,0,0)
  return inicio.toISOString()
}

// Bilhetes por ciclo — resumo para o admin
export async function buscarBilhetesPorCiclo() {
  const { data, error } = await supabase
    .from('bilhetes')
    .select(`
      id, numero, ciclo, tokens_usados, created_at, cpf_entregador,
      entregadores!inner(nome, cpf, cidade, uf, telefone)
    `)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  // Agrupa por ciclo
  const porCiclo = (data || []).reduce((acc, b) => {
    if (!acc[b.ciclo]) acc[b.ciclo] = []
    acc[b.ciclo].push(b)
    return acc
  }, {})

  return porCiclo
}

// Elegíveis por tipo de sorteio
export async function buscarElegiveis(tipo) {
  // 1. Busca bilhetes no ciclo relevante
  let filtroCiclo = null
  let filtroAtivo = null // data mínima de último scan para semestral/grande prêmio

  const now = new Date()
  const ano = now.getFullYear()
  const mes = now.getMonth() + 1
  const trim = Math.ceil(mes / 3)

  if (tipo === 'mensal') {
    filtroCiclo = `${ano}-T${trim}` // bilhetes do trimestre atual (inclui mês)
  } else if (tipo === 'trimestral') {
    filtroCiclo = `${ano}-T${trim}`
  } else if (tipo === 'semestral' || tipo === 'grande_premio') {
    // Bilhetes do semestre atual (2 trimestres)
    const trimAnterior = trim === 1
      ? { ano: ano - 1, trim: 4 }
      : { ano, trim: trim - 1 }
    filtroCiclo = [`${ano}-T${trim}`, `${trimAnterior.ano}-T${trimAnterior.trim}`]
    // Ativo nos últimos 2 meses
    filtroAtivo = periodoAtivo(2)
  }

  // Busca bilhetes no(s) ciclo(s)
  let queryBilhetes = supabase
    .from('bilhetes')
    .select(`
      cpf_entregador, numero, ciclo, created_at,
      entregadores!inner(nome, cpf, cidade, uf, telefone)
    `)

  if (Array.isArray(filtroCiclo)) {
    queryBilhetes = queryBilhetes.in('ciclo', filtroCiclo)
  } else if (filtroCiclo) {
    queryBilhetes = queryBilhetes.eq('ciclo', filtroCiclo)
  }

  const { data: bilhetes, error: errB } = await queryBilhetes
  if (errB) throw new Error(errB.message)

  // Se semestral/grande prêmio, filtra por atividade recente
  let cpfsAtivos = null
  if (filtroAtivo) {
    const { data: scansAtivos } = await supabase
      .from('scans')
      .select('cpf_entregador')
      .gte('created_at', filtroAtivo)
      .eq('status', 'liberado')
    cpfsAtivos = new Set((scansAtivos || []).map(s => s.cpf_entregador))
  }

  // Agrupa por entregador
  const porEntregador = (bilhetes || []).reduce((acc, b) => {
    const cpf = b.cpf_entregador
    if (!acc[cpf]) {
      acc[cpf] = {
        cpf,
        nome: b.entregadores?.nome || '',
        cidade: b.entregadores?.cidade || '',
        uf: b.entregadores?.uf || '',
        telefone: b.entregadores?.telefone || '',
        bilhetes: [],
        elegivel: cpfsAtivos ? cpfsAtivos.has(cpf) : true
      }
    }
    acc[cpf].bilhetes.push(b.numero)
    return acc
  }, {})

  return Object.values(porEntregador)
    .filter(e => e.elegivel)
    .sort((a, b) => b.bilhetes.length - a.bilhetes.length)
}

// ─── FOTO DE PERFIL ───────────────────────────────────────────────────────────

export async function atualizarFotoPerfil(cpf, arquivo) {
  const cpfLimpo = cpf.replace(/\D/g, '')
  const path = `selfies/${cpfLimpo}.jpg`

  // Upload (sobrescreve a foto existente)
  const { error: errUpload } = await supabase.storage
    .from('entregadores')
    .upload(path, arquivo, { upsert: true, contentType: 'image/jpeg' })

  if (errUpload) throw new Error(errUpload.message)

  // Busca URL pública
  const { data } = supabase.storage.from('entregadores').getPublicUrl(path)
  const url = data.publicUrl + '?t=' + Date.now() // cache-bust

  // Atualiza no banco
  const { error: errUpdate } = await supabase
    .from('entregadores')
    .update({ selfie_url: url })
    .eq('cpf', cpfLimpo)

  if (errUpdate) throw new Error(errUpdate.message)
  return url
}
