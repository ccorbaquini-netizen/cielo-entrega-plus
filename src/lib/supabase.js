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
  const { error } = await supabase.from('scans').delete().eq('cpf_entregador', cpf.replace(/\D/g,''))
  if (error) throw new Error(error.message)
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
    tokensDisponiveis: totalTokens - tokensConvertidos,
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
