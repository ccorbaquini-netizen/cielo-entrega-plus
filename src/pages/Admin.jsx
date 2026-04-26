import { useState, useEffect } from 'react'
import {
  getAllFeatureFlags, updateFeatureFlag,
  getWhatsappConfig, updateWhatsappConfig,
  getIntelipostConfig, updateIntelipostConfig, testarIntelipostConexao,
  listarEntregadores, atualizarEntregador, excluirEntregador,
  excluirScan, excluirTodosScansEntregador,
  buscarHistoricoScans, buscarRelatorioEntregas,
  supabase
} from '../lib/supabase'
import Logo from '../components/Logo'

const PASS = import.meta.env.VITE_ADMIN_PASSWORD || 'cielo2025'
const ABAS = ['Entregadores', 'Feature Flags', 'Relatórios', 'Intelipost', 'WhatsApp']

const FLAG_LABELS = {
  whatsapp_ios:         { label: 'WhatsApp — iOS',         desc: 'Disparo para usuários iOS sem push' },
  whatsapp_android:     { label: 'WhatsApp — Android',     desc: 'Disparo para Android sem PWA instalado' },
  push_notifications:   { label: 'Push Notifications',    desc: 'Notificações push para PWA instalado' },
  bonus_frequencia:     { label: 'Bônus Frequência',       desc: 'Cálculo do bônus trimestral' },
  sorteio_mensal:       { label: 'Sorteio Mensal',         desc: 'Ciclo de sorteio mensal habilitado' },
  cadastro_aberto:      { label: 'Cadastro Aberto',        desc: 'Permite novos cadastros no programa' },
  scan_qrcode_etiqueta: { label: 'Scanner Code 128',       desc: 'Valida entregas via leitura da etiqueta' },
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtCPF(c) {
  const d = c?.replace(/\D/g,'') || ''
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

function exportCSV(dados, nome) {
  if (!dados.length) return
  const cols = Object.keys(dados[0])
  const rows = dados.map(r => cols.map(c => {
    const v = r[c]
    if (v === null || v === undefined) return ''
    if (typeof v === 'object') return JSON.stringify(v).replace(/"/g, '""')
    return String(v).replace(/"/g, '""')
  }).map(v => `"${v}"`).join(';'))
  const csv = [cols.join(';'), ...rows].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nome + '.csv'; a.click()
  URL.revokeObjectURL(url)
}

const Toggle = ({ checked, onChange }) => (
  <label className="toggle">
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span className="toggle-slider" />
  </label>
)

// ── Login ──────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [senha, setSenha] = useState('')
  const [err, setErr] = useState(false)
  return (
    <div className="page" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <Logo size="md" />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Painel de Gestão</div>
        </div>
        <div className="field">
          <label className="label">Senha</label>
          <input className={`input ${err ? 'err' : ''}`} type="password" placeholder="••••••••"
            value={senha} onChange={e => { setSenha(e.target.value); setErr(false) }}
            onKeyDown={e => e.key === 'Enter' && (senha === PASS ? onLogin() : setErr(true))} autoFocus />
          {err && <span className="field-error">Senha incorreta</span>}
        </div>
        <button className="btn btn-lime mt-6" onClick={() => senha === PASS ? onLogin() : setErr(true)}>Acessar</button>
      </div>
    </div>
  )
}

// ── Modal de confirmação ───────────────────────────────────────────────────
function ModalConfirm({ msg, onOk, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24
    }}>
      <div className="card" style={{ maxWidth: 340, width: '100%' }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Confirmar ação</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>{msg}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-blue" style={{ flex: 1, background: 'var(--red)', boxShadow: 'none' }} onClick={onOk}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

// ── Aba Entregadores ───────────────────────────────────────────────────────
function AbaEntregadores() {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [selecionado, setSelecionado] = useState(null)
  const [scans, setScans] = useState([])
  const [confirm, setConfirm] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [editando, setEditando] = useState(null)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const data = await listarEntregadores()
    setLista(data)
    setLoading(false)
  }

  async function abrirDetalhes(e) {
    setSelecionado(e)
    setEditando({ nome: e.nome, telefone: e.telefone || '', status: e.status })
    const s = await buscarHistoricoScans(e.cpf, 50)
    setScans(s)
  }

  async function salvarEdicao() {
    try {
      await atualizarEntregador(selecionado.id, editando)
      flash('✅ Entregador atualizado')
      carregar()
      setSelecionado(prev => ({ ...prev, ...editando }))
    } catch { flash('❌ Erro ao salvar') }
  }

  function confirmarExcluirEntregador(e) {
    setConfirm({
      msg: `Excluir ${e.nome} (${fmtCPF(e.cpf)}) e todos os seus scans? Esta ação não pode ser desfeita.`,
      action: async () => {
        await excluirEntregador(e.id)
        flash('✅ Entregador excluído')
        setSelecionado(null)
        carregar()
      }
    })
  }

  function confirmarExcluirScans(e) {
    setConfirm({
      msg: `Excluir TODOS os scans de ${e.nome}? Os tokens serão zerados mas o cadastro permanece.`,
      action: async () => {
        await excluirTodosScansEntregador(e.cpf)
        flash('✅ Scans excluídos')
        setScans([])
      }
    })
  }

  function confirmarExcluirScan(scan) {
    setConfirm({
      msg: `Excluir o scan do pedido ${scan.numero_pedido}?`,
      action: async () => {
        await excluirScan(scan.id)
        setScans(prev => prev.filter(s => s.id !== scan.id))
        flash('✅ Scan excluído')
      }
    })
  }

  function flash(msg) { setFeedback(msg); setTimeout(() => setFeedback(''), 3000) }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Carregando...</div>

  // Detalhe do entregador
  if (selecionado) return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button onClick={() => setSelecionado(null)}
          style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--fb)' }}>
          ← Voltar
        </button>
        {feedback && <span style={{ fontSize: 12, color: 'var(--lime)', fontWeight: 600 }}>{feedback}</span>}
      </div>

      {/* Foto + dados */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
          {selecionado.selfie_url
            ? <img src={selecionado.selfie_url} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--lime)', flexShrink: 0 }} />
            : <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--card)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>👤</div>
          }
          <div>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>{selecionado.nome}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtCPF(selecionado.cpf)}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Cadastro: {fmtData(selecionado.created_at)}</div>
          </div>
        </div>

        {/* Edição */}
        <div className="flex-col gap-3">
          <div className="field">
            <label className="label">Nome</label>
            <input className="input" type="text" value={editando?.nome || ''}
              onChange={e => setEditando(p => ({ ...p, nome: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">WhatsApp</label>
            <input className="input" type="tel" value={editando?.telefone || ''}
              onChange={e => setEditando(p => ({ ...p, telefone: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Status</label>
            <select className="input" value={editando?.status || 'ativo'}
              onChange={e => setEditando(p => ({ ...p, status: e.target.value }))}>
              <option value="ativo">Ativo</option>
              <option value="suspenso">Suspenso</option>
            </select>
          </div>
          <button className="btn btn-lime" onClick={salvarEdicao}>Salvar alterações</button>
        </div>
      </div>

      {/* Ações destrutivas */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--red)', marginBottom: 12 }}>
          Zona de Exclusão
        </div>
        <div className="flex-col gap-3">
          <button className="btn btn-outline" style={{ color: 'var(--red)', borderColor: 'rgba(255,61,87,.3)' }}
            onClick={() => confirmarExcluirScans(selecionado)}>
            🗑 Excluir todos os scans deste entregador
          </button>
          <button className="btn btn-outline" style={{ color: 'var(--red)', borderColor: 'rgba(255,61,87,.5)', background: 'rgba(255,61,87,.06)' }}
            onClick={() => confirmarExcluirEntregador(selecionado)}>
            ⛔ Excluir entregador e todos os dados
          </button>
        </div>
      </div>

      {/* Histórico de scans */}
      <div className="card">
        <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
          Scans ({scans.length})
        </div>
        {scans.length === 0
          ? <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: 13 }}>Sem scans registrados</div>
          : scans.map((s, i) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: i < scans.length - 1 ? '1px solid var(--border)' : 'none'
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--off)' }}>{s.numero_pedido}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtData(s.created_at)} · {s.situacao?.replace(/_/g,' ')}</div>
                {s.lat_scan && <div style={{ fontSize: 10, color: 'var(--blue)' }}>📍 {s.lat_scan?.toFixed(5)}, {s.lng_scan?.toFixed(5)}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--fd)', fontSize: 16, fontWeight: 800, color: s.tokens_creditados > 0 ? 'var(--teal)' : 'var(--red)' }}>
                  {s.tokens_creditados > 0 ? `+${s.tokens_creditados}` : '0'}
                </span>
                <button onClick={() => confirmarExcluirScan(s)}
                  style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 16 }}>
                  🗑
                </button>
              </div>
            </div>
          ))
        }
      </div>

      {confirm && <ModalConfirm msg={confirm.msg} onOk={async () => { await confirm.action(); setConfirm(null) }} onCancel={() => setConfirm(null)} />}
    </div>
  )

  // Lista de entregadores
  return (
    <div>
      {feedback && <div className="alert alert-lime" style={{ marginBottom: 14 }}><span>{feedback}</span></div>}
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>{lista.length} entregador{lista.length !== 1 ? 'es' : ''} cadastrado{lista.length !== 1 ? 's' : ''}</div>
      {lista.map((e, i) => (
        <div key={e.id} onClick={() => abrirDetalhes(e)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
            borderBottom: i < lista.length - 1 ? '1px solid var(--border)' : 'none',
            cursor: 'pointer'
          }}>
          {e.selfie_url
            ? <img src={e.selfie_url} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
            : <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--card)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>👤</div>
          }
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--off)' }}>{e.nome}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtCPF(e.cpf)} · {fmtData(e.created_at)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
              color: e.status === 'ativo' ? 'var(--teal)' : 'var(--red)',
              background: e.status === 'ativo' ? 'rgba(0,201,167,.1)' : 'rgba(255,61,87,.1)',
              padding: '3px 8px', borderRadius: 100
            }}>{e.status}</span>
            <span style={{ color: 'var(--muted)', fontSize: 18 }}>›</span>
          </div>
        </div>
      ))}
      {confirm && <ModalConfirm msg={confirm.msg} onOk={async () => { await confirm.action(); setConfirm(null) }} onCancel={() => setConfirm(null)} />}
    </div>
  )
}

// ── Aba Relatórios ─────────────────────────────────────────────────────────
function AbaRelatorios() {
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim,    setDataFim]    = useState('')
  const [apenasLib,  setApenasLib]  = useState(false)
  const [dados,      setDados]      = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [erro,       setErro]       = useState('')

  async function gerar() {
    setLoading(true); setErro(''); setDados(null)
    try {
      const res = await buscarRelatorioEntregas({ dataInicio, dataFim, apenasAtivos: apenasLib })
      setDados(res)
    } catch (e) { setErro(e.message) }
    setLoading(false)
  }

  function baixarCSV() {
    if (!dados) return
    const flat = dados.map(s => ({
      'Data/Hora': fmtData(s.created_at),
      'Pedido': s.numero_pedido,
      'CPF': fmtCPF(s.cpf_entregador),
      'Nome': s.entregadores?.nome || '',
      'Telefone': s.entregadores?.telefone || '',
      'Status Intelipost': s.status_intelipost || '',
      'Status Token': s.status || '',
      'Tokens': s.tokens_creditados || 0,
      'Situação': s.situacao || '',
      'Latitude': s.lat_scan || '',
      'Longitude': s.lng_scan || '',
      'Precisão GPS (m)': s.accuracy_metros ? Math.round(s.accuracy_metros) : '',
      'Distância Endereço (m)': s.distancia_metros ? Math.round(s.distancia_metros) : '',
      'Situação GPS': s.geo_situacao || '',
      'Mensagem GPS': s.geo_mensagem || '',
      'Modo Simulação': s.modo_simulacao ? 'Sim' : 'Não',
    }))
    const hoje = new Date().toISOString().slice(0,10)
    exportCSV(flat, `entregas_${hoje}`)
  }

  const totalTokens = dados?.reduce((s, r) => s + (r.tokens_creditados || 0), 0) || 0
  const entregues   = dados?.filter(r => r.situacao === 'entregue').length || 0
  const falhas      = dados?.filter(r => r.situacao?.startsWith('falha')).length || 0

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--lime)', marginBottom: 14 }}>
          Filtros
        </div>
        <div className="flex-col gap-3">
          <div className="field">
            <label className="label">Data início</label>
            <input className="input" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Data fim</label>
            <input className="input" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--off)' }}>Apenas tokens liberados</span>
            <Toggle checked={apenasLib} onChange={e => setApenasLib(e.target.checked)} />
          </div>
          {erro && <div className="alert alert-err"><span>{erro}</span></div>}
          <button className="btn btn-lime" onClick={gerar} disabled={loading}>
            {loading ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Gerando...</> : 'Gerar relatório'}
          </button>
        </div>
      </div>

      {dados && (
        <>
          {/* Resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { n: dados.length, l: 'Total de scans', c: 'var(--blue)' },
              { n: entregues,    l: 'Entregues',       c: 'var(--teal)' },
              { n: totalTokens,  l: 'Tokens emitidos', c: 'var(--lime)' },
            ].map((k, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', padding: '14px 8px' }}>
                <div style={{ fontFamily: 'var(--fd)', fontSize: 26, fontWeight: 900, color: k.c }}>{k.n}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{k.l}</div>
              </div>
            ))}
          </div>

          <button className="btn btn-outline" style={{ marginBottom: 14 }} onClick={baixarCSV}>
            ⬇ Baixar CSV ({dados.length} registros)
          </button>

          {/* Preview */}
          <div className="card">
            <div style={{ fontFamily: 'var(--fd)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 12 }}>
              Preview — últimos 10
            </div>
            {dados.slice(0, 10).map((s, i) => (
              <div key={s.id} style={{
                padding: '9px 0', borderBottom: i < Math.min(dados.length, 10) - 1 ? '1px solid var(--border)' : 'none'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--off)' }}>{s.numero_pedido}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {s.entregadores?.nome} · {fmtData(s.created_at)}
                    </div>
                    {s.lat_scan
                      ? <div style={{ fontSize: 10, color: 'var(--blue)' }}>📍 {s.lat_scan?.toFixed(4)},{s.lng_scan?.toFixed(4)} ±{Math.round(s.accuracy_metros||0)}m</div>
                      : <div style={{ fontSize: 10, color: 'var(--muted)' }}>📍 GPS não capturado</div>
                    }
                  </div>
                  <span style={{ fontFamily: 'var(--fd)', fontSize: 16, fontWeight: 800, color: s.tokens_creditados > 0 ? 'var(--teal)' : 'var(--red)', flexShrink: 0 }}>
                    {s.tokens_creditados > 0 ? `+${s.tokens_creditados}` : '0'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Admin principal ────────────────────────────────────────────────────────
export default function Admin() {
  const [auth,       setAuth]       = useState(false)
  const [aba,        setAba]        = useState(0)
  const [flags,      setFlags]      = useState([])
  const [wpConfig,   setWpConfig]   = useState(null)
  const [ipConfig,   setIpConfig]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [feedback,   setFeedback]   = useState('')
  const [salvandoWp, setSalvandoWp] = useState(false)
  const [salvandoIp, setSalvandoIp] = useState(false)
  const [testandoIp, setTestandoIp] = useState(false)
  const [resIp,      setResIp]      = useState('')
  const [showKey,    setShowKey]    = useState(false)
  const [showIpKey,  setShowIpKey]  = useState(false)

  function flash(msg) { setFeedback(msg); setTimeout(() => setFeedback(''), 3000) }

  useEffect(() => {
    if (!auth) return
    Promise.all([getAllFeatureFlags(), getWhatsappConfig(), getIntelipostConfig()])
      .then(([f, w, ip]) => {
        setFlags(f)
        setWpConfig(w || { provedor: '360dialog', api_key: '', phone_number_id: '', business_account_id: '', modo_simulacao: true, limite_diario: 500, horario_inicio: '08:00', horario_fim: '20:00' })
        setIpConfig(ip || { api_key: '', base_url: 'https://api.intelipost.com.br/api/v1', modo_simulacao: true, timeout_segundos: 10 })
      })
      .finally(() => setLoading(false))
  }, [auth])

  async function hToggle(nome, val) {
    setFlags(prev => prev.map(f => f.nome === nome ? { ...f, habilitado: val } : f))
    await updateFeatureFlag(nome, val)
    flash(`${FLAG_LABELS[nome]?.label || nome} ${val ? 'ativado' : 'desativado'}`)
  }

  async function hSalvarWp() {
    setSalvandoWp(true)
    await updateWhatsappConfig(wpConfig)
    setSalvandoWp(false); flash('WhatsApp salvo')
  }

  async function hSalvarIp() {
    setSalvandoIp(true)
    await updateIntelipostConfig(ipConfig)
    setSalvandoIp(false); flash('Intelipost salvo')
  }

  async function hTestarIp() {
    if (!ipConfig?.api_key) { setResIp('Informe a API Key antes de testar.'); return }
    setTestandoIp(true); setResIp('')
    try {
      const { ok, mensagem } = await testarIntelipostConexao(ipConfig.api_key)
      setResIp(ok ? '✅ Conexão OK' : `❌ ${mensagem}`)
    } catch { setResIp('❌ Erro de conexão') }
    setTestandoIp(false)
  }

  if (!auth) return <Login onLogin={() => setAuth(true)} />
  if (loading) return <div className="page" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, color: 'var(--lime)' }} /></div>

  const SectionTitle = ({ children }) => (
    <div style={{ fontFamily: 'var(--fd)', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--lime)', marginBottom: 4 }}>{children}</div>
  )

  const SimBar = ({ on, labels, onChange }) => (
    <div style={{
      padding: '11px 14px',
      background: on ? 'rgba(245,158,11,.08)' : 'rgba(0,201,167,.08)',
      border: `1px solid ${on ? 'rgba(245,158,11,.3)' : 'rgba(0,201,167,.3)'}`,
      borderRadius: 'var(--r)', marginBottom: 12,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: on ? '#fbbf24' : 'var(--teal)' }}>
          {on ? '⚠️ Modo Simulação ATIVO' : '✅ Modo Produção'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{on ? labels[0] : labels[1]}</div>
      </div>
      <Toggle checked={!on} onChange={e => onChange(!e.target.checked)} />
    </div>
  )

  return (
    <div className="page">
      {/* Header */}
      <div className="admin-hdr">
        <Logo size="md" />
        {feedback && <div style={{ fontSize: 11, color: 'var(--lime)', fontWeight: 600 }}>{feedback}</div>}
      </div>

      {/* Abas */}
      <div style={{
        display: 'flex', overflowX: 'auto', gap: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--navy-2)',
      }}>
        {ABAS.map((a, i) => (
          <button key={i} onClick={() => setAba(i)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '12px 16px', flexShrink: 0,
            fontSize: 12, fontWeight: 700, fontFamily: 'var(--fb)',
            color: aba === i ? 'var(--lime)' : 'var(--muted)',
            borderBottom: aba === i ? '2px solid var(--lime)' : '2px solid transparent',
          }}>{a}</button>
        ))}
      </div>

      <div className="container" style={{ paddingTop: 20, paddingBottom: 48 }}>

        {/* ── ABA 0: Entregadores ── */}
        {aba === 0 && <AbaEntregadores />}

        {/* ── ABA 1: Feature Flags ── */}
        {aba === 1 && (
          <div className="card">
            <SectionTitle>Feature Flags</SectionTitle>
            <p className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>Ligue ou desligue funcionalidades sem redeploy.</p>
            {flags.length === 0
              ? <p className="text-muted" style={{ fontSize: 13 }}>Execute o SQL de seed no Supabase.</p>
              : flags.map(f => (
                <div key={f.nome} className="flag-row">
                  <div className="flag-info">
                    <strong>{FLAG_LABELS[f.nome]?.label || f.nome}</strong>
                    <span>{FLAG_LABELS[f.nome]?.desc || f.descricao}</span>
                  </div>
                  <Toggle checked={f.habilitado} onChange={e => hToggle(f.nome, e.target.checked)} />
                </div>
              ))
            }
          </div>
        )}

        {/* ── ABA 2: Relatórios ── */}
        {aba === 2 && <AbaRelatorios />}

        {/* ── ABA 3: Intelipost ── */}
        {aba === 3 && ipConfig && (
          <div className="card">
            <SectionTitle>Intelipost API</SectionTitle>
            <p className="text-muted" style={{ fontSize: 12, marginBottom: 14 }}>Configure antes de habilitar o scan de entregas.</p>
            <SimBar on={ipConfig.modo_simulacao} labels={['Nenhuma chamada real à Intelipost', 'Consultando API real']}
              onChange={v => setIpConfig(c => ({ ...c, modo_simulacao: v }))} />
            <div className="flex-col gap-3">
              <div className="field">
                <label className="label">URL Base</label>
                <input className="input" type="text" value={ipConfig.base_url}
                  onChange={e => setIpConfig(c => ({ ...c, base_url: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">API Key</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={showIpKey ? 'text' : 'password'}
                    placeholder="Aguardando chave da Intelipost"
                    value={ipConfig.api_key || ''}
                    onChange={e => setIpConfig(c => ({ ...c, api_key: e.target.value }))}
                    style={{ paddingRight: 72 }} autoComplete="new-password" />
                  <button onClick={() => setShowIpKey(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--fb)', fontWeight: 600 }}>
                    {showIpKey ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
              {resIp && <div className={`alert ${resIp.startsWith('✅') ? 'alert-ok' : 'alert-err'}`}><span>{resIp}</span></div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-outline" onClick={hTestarIp} disabled={testandoIp || !ipConfig.api_key} style={{ flex: 1 }}>
                  {testandoIp ? <><div className="spinner" /> Testando...</> : 'Testar'}
                </button>
                <button className="btn btn-lime" onClick={hSalvarIp} disabled={salvandoIp} style={{ flex: 1 }}>
                  {salvandoIp ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Salvando...</> : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ABA 4: WhatsApp ── */}
        {aba === 4 && wpConfig && (
          <div className="card">
            <SectionTitle>WhatsApp</SectionTitle>
            <p className="text-muted" style={{ fontSize: 12, marginBottom: 14 }}>Configure antes de habilitar os flags de WhatsApp.</p>
            <SimBar on={wpConfig.modo_simulacao} labels={['Mensagens em log — sem disparo real', 'Mensagens sendo enviadas de verdade']}
              onChange={v => setWpConfig(c => ({ ...c, modo_simulacao: v }))} />
            <div className="flex-col gap-3">
              <div className="field">
                <label className="label">Provedor</label>
                <select className="input" value={wpConfig.provedor} onChange={e => setWpConfig(c => ({ ...c, provedor: e.target.value }))}>
                  {['360dialog','Zenvia','Twilio','Take Blip'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">API Key</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={showKey ? 'text' : 'password'}
                    placeholder="••••••••••••••" value={wpConfig.api_key || ''}
                    onChange={e => setWpConfig(c => ({ ...c, api_key: e.target.value }))}
                    style={{ paddingRight: 72 }} autoComplete="new-password" />
                  <button onClick={() => setShowKey(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--fb)', fontWeight: 600 }}>
                    {showKey ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
              <div className="field">
                <label className="label">Phone Number ID</label>
                <input className="input" type="text" placeholder="Ex: 1234567890"
                  value={wpConfig.phone_number_id || ''}
                  onChange={e => setWpConfig(c => ({ ...c, phone_number_id: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">Início</label>
                  <input className="input" type="time" value={wpConfig.horario_inicio}
                    onChange={e => setWpConfig(c => ({ ...c, horario_inicio: e.target.value }))} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">Fim</label>
                  <input className="input" type="time" value={wpConfig.horario_fim}
                    onChange={e => setWpConfig(c => ({ ...c, horario_fim: e.target.value }))} />
                </div>
              </div>
              <button className="btn btn-lime" onClick={hSalvarWp} disabled={salvandoWp}>
                {salvandoWp ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Salvando...</> : 'Salvar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
