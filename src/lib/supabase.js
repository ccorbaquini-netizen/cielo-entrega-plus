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

export async function cadastrarEntregador({ cpf, nome, telefone, selfieFile, plataforma }) {
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
