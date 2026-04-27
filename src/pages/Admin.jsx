import { useState, useEffect } from 'react'
import {
  getAllFeatureFlags, updateFeatureFlag,
  getWhatsappConfig, updateWhatsappConfig,
  getIntelipostConfig, updateIntelipostConfig, testarIntelipostConexao,
  listarEntregadores, atualizarEntregador, excluirEntregador,
  excluirScan, excluirTodosScansEntregador,
  buscarHistoricoScans, buscarRelatorioEntregas,
  buscarBilhetesPorCiclo, buscarElegiveis,
  realizarSorteio, buscarResultadosSorteios,
  buscarSorteiosConfig, atualizarSorteiosConfig,
  buscarProximosSorteios,
  supabase
} from '../lib/supabase'
import Logo from '../components/Logo'

const PASS = import.meta.env.VITE_ADMIN_PASSWORD || 'cielo2025'
const ABAS = ['Entregadores', 'Feature Flags', 'Sorteios', 'Relatórios', 'Simulação', 'Intelipost', 'WhatsApp']

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

// Link de GPS que abre no Maps nativo (Android/iOS/Desktop)
function GpsLink({ lat, lng, accuracy }) {
  if (!lat || !lng) return <span style={{ fontSize: 10, color: 'var(--muted)' }}>📍 GPS não capturado</span>
  const url = `https://maps.google.com/?q=${lat},${lng}`
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ fontSize: 10, color: 'var(--blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      📍 {lat.toFixed(5)}, {lng.toFixed(5)}
      {accuracy ? ` ±${Math.round(accuracy)}m` : ''}
      <span style={{ fontSize: 9, opacity: .7 }}>↗</span>
    </a>
  )
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
  const [filtroCidade, setFiltroCidade] = useState('')
  const [filtroUF, setFiltroUF] = useState('')

  // Filtra lista localmente
  const listaFiltrada = lista.filter(e => {
    const matchCidade = !filtroCidade || (e.cidade || '').toLowerCase().includes(filtroCidade.toLowerCase())
    const matchUF = !filtroUF || (e.uf || '').toUpperCase() === filtroUF.toUpperCase()
    return matchCidade && matchUF
  })

  function exportarCSV() {
    if (!listaFiltrada.length) return
    const flat = listaFiltrada.map(e => ({
      'Nome':        e.nome,
      'CPF':         (e.cpf || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      'Cidade':      e.cidade || '',
      'UF':          e.uf || '',
      'Telefone':    e.telefone || '',
      'Status':      e.status,
      'Plataforma':  e.plataforma || '',
      'Cadastro':    fmtData(e.created_at),
    }))
    const cols = Object.keys(flat[0])
    const rows = flat.map(r => cols.map(c => `"${String(r[c]).replace(/"/g,'""')}"`).join(';'))
    const csv = [cols.join(';'), ...rows].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `entregadores_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
      msg: `Excluir TODOS os scans e bilhetes de ${e.nome}? Os tokens e bilhetes serão zerados mas o cadastro permanece.`,
      action: async () => {
        await excluirTodosScansEntregador(e.cpf)
        flash('✅ Scans e bilhetes excluídos')
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
            🗑 Excluir scans e bilhetes deste entregador
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
                {s.lat_scan && <GpsLink lat={s.lat_scan} lng={s.lng_scan} accuracy={s.accuracy_metros} />}
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

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="input" type="text" placeholder="Filtrar por cidade..."
          value={filtroCidade} onChange={e => setFiltroCidade(e.target.value)}
          style={{ flex: 1, minWidth: 140, padding: '8px 12px', fontSize: 12 }} />
        <select className="input" value={filtroUF} onChange={e => setFiltroUF(e.target.value)}
          style={{ width: 80, padding: '8px 8px', fontSize: 12 }}>
          <option value="">UF</option>
          {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button className="btn btn-outline" style={{ width: 'auto', padding: '8px 14px', fontSize: 12 }}
          onClick={exportarCSV} disabled={!listaFiltrada.length}>
          ⬇ CSV
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        {listaFiltrada.length} de {lista.length} entregador{lista.length !== 1 ? 'es' : ''}
      </div>

      {listaFiltrada.map((e, i) => (
        <div key={e.id} onClick={() => abrirDetalhes(e)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
            borderBottom: i < listaFiltrada.length - 1 ? '1px solid var(--border)' : 'none',
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

// ── Aba Sorteios ───────────────────────────────────────────────────────────
function AbaSorteios() {
  const [subAba,        setSubAba]        = useState(0) // 0=realizar, 1=bilhetes, 2=elegiveis, 3=historico
  const [proximosSorteios, setProximosSorteios] = useState(null)
  const [config,        setConfig]        = useState(null)
  const [tipoSort,      setTipoSort]      = useState('mensal')
  const [numExtracao,   setNumExtracao]   = useState('')
  const [bilhetesCiclo, setBilhetesCiclo] = useState(null)
  const [elegiveis,     setElegiveis]     = useState(null)
  const [historico,     setHistorico]     = useState(null)
  const [resultado,     setResultado]     = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [erro,          setErro]          = useState('')

  const TIPOS = [
    { id: 'mensal',       label: 'Mensal',        ganhadores: '1 a cada 2.000 bilhetes', cor: 'var(--lime)' },
    { id: 'trimestral',   label: 'Trimestral',    ganhadores: '5 ganhadores',             cor: 'var(--blue)' },
    { id: 'semestral',    label: 'Semestral',     ganhadores: '5 ganhadores',             cor: 'var(--teal)' },
    { id: 'grande_premio',label: 'Grande Prêmio', ganhadores: '1 ganhador',               cor: 'var(--lime)' },
  ]

  const SUB_ABAS = ['Realizar Sorteio', 'Bilhetes', 'Elegíveis', 'Histórico']

  useEffect(() => {
    buscarProximosSorteios().then(d => { if (d?.sorteios) setProximosSorteios(d.sorteios) }).catch(() => {})
    buscarSorteiosConfig().then(c => setConfig(c))
  }, [])

  const sorteioAtual = proximosSorteios?.[tipoSort]

  async function hRealizarSorteio() {
    if (!sorteioAtual) { setErro('Não foi possível calcular o ciclo atual.'); return }
    setLoading(true); setErro(''); setResultado(null)
    try {
      const res = await realizarSorteio({
        tipo: tipoSort,
        ciclo: sorteioAtual.ciclo,
        numeroExtracao: numExtracao ? parseInt(numExtracao) : undefined
      })
      setResultado(res)
    } catch (e) { setErro(e.message) }
    setLoading(false)
  }

  async function hSalvarConfig() {
    if (!config) return
    setLoadingConfig(true)
    try {
      await atualizarSorteiosConfig({
        proporcao_mensal: config.proporcao_mensal,
        max_ganhadores_mensal: config.max_ganhadores_mensal,
        min_ganhadores_mensal: config.min_ganhadores_mensal,
      })
    } catch {}
    setLoadingConfig(false)
  }

  async function carregarBilhetes() {
    setLoading(true); setErro('')
    try { setBilhetesCiclo(await buscarBilhetesPorCiclo()) } catch (e) { setErro(e.message) }
    setLoading(false)
  }

  async function carregarElegiveis() {
    setLoading(true); setErro('')
    try { setElegiveis(await buscarElegiveis(tipoSort)) } catch (e) { setErro(e.message) }
    setLoading(false)
  }

  async function carregarHistorico() {
    setLoading(true)
    try { setHistorico(await buscarResultadosSorteios()) } catch {}
    setLoading(false)
  }

  function fmtCPFlocal(c) {
    return (c || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  function exportarGanhadores(res) {
    if (!res?.ganhadores?.length) return
    const flat = res.ganhadores.map(g => ({
      'Posição': g.posicao,
      'Bilhete': `#${g.bilhete}`,
      'Nome': g.nome,
      'CPF': fmtCPFlocal(g.cpf),
      'Cidade': g.cidade || '',
      'UF': g.uf || '',
      'Telefone': g.telefone || '',
    }))
    const cols = Object.keys(flat[0])
    const rows = flat.map(r => cols.map(c => `"${String(r[c]).replace(/"/g,'""')}"`).join(';'))
    const csv = [cols.join(';'), ...rows].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ganhadores_${res.tipo}_${res.ciclo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cicloBonito = (ciclo) => {
    const [ano, t] = (ciclo || '').split('-')
    if (t?.startsWith('T')) return `Trimestre ${t.replace('T','')} · ${ano}`
    if (t?.startsWith('M')) return `Mês ${t.replace('M','')} · ${ano}`
    if (t?.startsWith('S')) return `Semestre ${t.replace('S','')} · ${ano}`
    return ciclo || '—'
  }

  return (
    <div>
      {/* Sub-abas */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 18, overflowX: 'auto' }}>
        {SUB_ABAS.map((a, i) => (
          <button key={i} onClick={() => {
            setSubAba(i); setErro(''); setResultado(null)
            if (i === 1 && !bilhetesCiclo) carregarBilhetes()
            if (i === 3 && !historico) carregarHistorico()
          }} style={{
            flex: 1, background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 8px', flexShrink: 0,
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--fb)',
            color: subAba === i ? 'var(--lime)' : 'var(--muted)',
            borderBottom: subAba === i ? '2px solid var(--lime)' : '2px solid transparent',
          }}>{a}</button>
        ))}
      </div>

      {erro && <div className="alert alert-err" style={{ marginBottom: 14 }}><span>{erro}</span></div>}

      {/* ── REALIZAR SORTEIO ── */}
      {subAba === 0 && (
        <div>
          {/* Seletor de tipo */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--lime)', marginBottom: 14 }}>
              Tipo de Sorteio
            </div>
            <div className="flex-col gap-3">
              {TIPOS.map(t => {
                const s = proximosSorteios?.[t.id]
                return (
                  <label key={t.id} onClick={() => { setTipoSort(t.id); setResultado(null); setErro('') }} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                    padding: '12px 14px',
                    background: tipoSort === t.id ? 'var(--lime-dim2)' : 'var(--card)',
                    border: `1px solid ${tipoSort === t.id ? 'rgba(197,211,42,.35)' : 'var(--border)'}`,
                    borderRadius: 'var(--r)', transition: 'all .15s'
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                      border: `2px solid ${tipoSort === t.id ? 'var(--lime)' : 'var(--border)'}`,
                      background: tipoSort === t.id ? 'var(--lime)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {tipoSort === t.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--navy)' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: tipoSort === t.id ? 'var(--lime)' : 'var(--off)' }}>{t.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.ganhadores}</span>
                      </div>
                      {s && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                          📅 {s.data} · Ext. {s.extracao} · {s.diasRestantes}d restantes
                        </div>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Número de extração opcional */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 12 }}>
              Extração da Loteria Federal
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="label">
                Número da extração
                <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>(opcional — buscado automaticamente se vazio)</span>
              </label>
              <input className="input" type="number" placeholder={`Ex: ${proximosSorteios?.[tipoSort]?.extracao || '6080'}`}
                value={numExtracao} onChange={e => setNumExtracao(e.target.value)} />
              {sorteioAtual && (
                <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'block' }}>
                  Estimativa para {sorteioAtual.data}: extração {sorteioAtual.extracao}
                </span>
              )}
            </div>
            <button className="btn btn-lime" onClick={hRealizarSorteio} disabled={loading}>
              {loading
                ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Buscando resultado e calculando...</>
                : `🎰 Realizar Sorteio ${TIPOS.find(t => t.id === tipoSort)?.label}`
              }
            </button>
          </div>

          {/* Config proporção mensal */}
          {tipoSort === 'mensal' && config && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--blue)', marginBottom: 12 }}>
                Configuração Sorteio Mensal
              </div>
              <div className="flex-col gap-3">
                <div className="field">
                  <label className="label">1 ganhador a cada X bilhetes</label>
                  <input className="input" type="number" min="100" max="10000"
                    value={config.proporcao_mensal}
                    onChange={e => setConfig(c => ({ ...c, proporcao_mensal: parseInt(e.target.value) || 2000 }))} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">Mínimo de ganhadores</label>
                    <input className="input" type="number" min="1" max="10"
                      value={config.min_ganhadores_mensal}
                      onChange={e => setConfig(c => ({ ...c, min_ganhadores_mensal: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">Máximo de ganhadores</label>
                    <input className="input" type="number" min="1" max="500"
                      value={config.max_ganhadores_mensal}
                      onChange={e => setConfig(c => ({ ...c, max_ganhadores_mensal: parseInt(e.target.value) || 100 }))} />
                  </div>
                </div>
                <button className="btn btn-outline" onClick={hSalvarConfig} disabled={loadingConfig}>
                  {loadingConfig ? 'Salvando...' : 'Salvar configuração'}
                </button>
              </div>
            </div>
          )}

          {/* Resultado do sorteio */}
          {resultado && (
            <div style={{
              background: 'var(--lime-dim2)', border: '1px solid rgba(197,211,42,.3)',
              borderRadius: 'var(--r2)', padding: '20px', marginTop: 4
            }}>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--lime)', marginBottom: 14 }}>
                🎉 Sorteio realizado!
              </div>

              {/* Números da extração */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                {[
                  { l: 'Extração CEF', v: resultado.extracaoCEF },
                  { l: '1º Prêmio', v: resultado.primeiro },
                  { l: '2º Prêmio', v: resultado.segundo },
                  { l: 'Número vencedor', v: `#${resultado.numeroVencedor}` },
                ].map((r, i) => (
                  <div key={i} style={{
                    flex: 1, minWidth: 80, textAlign: 'center',
                    background: 'var(--navy-2)', borderRadius: 'var(--r)', padding: '10px 8px',
                    border: i === 3 ? '1px solid rgba(197,211,42,.4)' : '1px solid var(--border)'
                  }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{r.l}</div>
                    <div style={{ fontFamily: 'var(--fd)', fontSize: i === 3 ? 18 : 16, fontWeight: 900, color: i === 3 ? 'var(--lime)' : 'var(--white)' }}>{r.v}</div>
                  </div>
                ))}
              </div>

              {/* Ganhadores */}
              <div style={{ fontFamily: 'var(--fd)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 10 }}>
                {resultado.ganhadores?.length} ganhador{resultado.ganhadores?.length !== 1 ? 'es' : ''} · {resultado.totalBilhetes} bilhetes no pool
              </div>

              <div className="card" style={{ marginBottom: 12 }}>
                {resultado.ganhadores?.map((g, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: i < resultado.ganhadores.length - 1 ? '1px solid var(--border)' : 'none'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: i === 0 ? 'var(--lime-dim2)' : 'var(--card)',
                        border: `1px solid ${i === 0 ? 'var(--lime)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--fd)', fontSize: 12, fontWeight: 800,
                        color: i === 0 ? 'var(--lime)' : 'var(--muted)'
                      }}>{g.posicao}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--off)' }}>{g.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtCPFlocal(g.cpf)}{g.cidade ? ` · ${g.cidade}/${g.uf}` : ''}</div>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--fd)', fontSize: 16, fontWeight: 900, color: 'var(--blue)' }}>#{g.bilhete}</div>
                  </div>
                ))}
              </div>

              <button className="btn btn-outline" onClick={() => exportarGanhadores(resultado)}>
                ⬇ Exportar ganhadores CSV
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── BILHETES ── */}
      {subAba === 1 && (
        <div>
          <button className="btn btn-lime" onClick={carregarBilhetes} disabled={loading} style={{ marginBottom: 16 }}>
            {loading ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Carregando...</> : '🎟 Atualizar bilhetes'}
          </button>
          {bilhetesCiclo && Object.entries(bilhetesCiclo).map(([ciclo, lista]) => (
            <div key={ciclo} className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'var(--fd)', fontSize: 15, fontWeight: 800, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {cicloBonito(ciclo)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {lista.length} bilhete{lista.length !== 1 ? 's' : ''} · {new Set(lista.map(b => b.cpf_entregador)).size} entregador{new Set(lista.map(b => b.cpf_entregador)).size !== 1 ? 'es' : ''}
                  </div>
                </div>
                <span style={{ fontFamily: 'var(--fd)', fontSize: 24, fontWeight: 900, color: 'var(--blue)' }}>{lista.length}</span>
              </div>
              {lista.slice(0, 10).map((b, i) => (
                <div key={b.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 0', borderBottom: i < Math.min(lista.length, 10) - 1 ? '1px solid var(--border)' : 'none'
                }}>
                  <div>
                    <span style={{ fontFamily: 'var(--fd)', fontSize: 15, fontWeight: 900, color: 'var(--white)', marginRight: 10 }}>#{b.numero}</span>
                    <span style={{ fontSize: 12, color: 'var(--off)' }}>{b.entregadores?.nome}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(b.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
              ))}
              {lista.length > 10 && (
                <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', paddingTop: 8 }}>
                  +{lista.length - 10} bilhetes — use o CSV para ver todos
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── ELEGÍVEIS ── */}
      {subAba === 2 && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {TIPOS.map(t => (
              <button key={t.id} onClick={() => { setTipoSort(t.id); setElegiveis(null) }} style={{
                padding: '6px 12px', borderRadius: 100, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: tipoSort === t.id ? 'var(--lime-dim2)' : 'var(--card)',
                border: `1px solid ${tipoSort === t.id ? 'rgba(197,211,42,.4)' : 'var(--border)'}`,
                color: tipoSort === t.id ? 'var(--lime)' : 'var(--muted)'
              }}>{t.label}</button>
            ))}
          </div>
          <button className="btn btn-lime" onClick={carregarElegiveis} disabled={loading} style={{ marginBottom: 14 }}>
            {loading ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Carregando...</> : 'Buscar elegíveis'}
          </button>
          {elegiveis && (
            <>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                <strong style={{ color: 'var(--lime)', fontSize: 20, fontFamily: 'var(--fd)', fontWeight: 900 }}>{elegiveis.length}</strong>
                {' '}elegível{elegiveis.length !== 1 ? 'is' : ''}
              </div>
              <div className="card">
                {elegiveis.map((e, i) => (
                  <div key={e.cpf} style={{ padding: '12px 0', borderBottom: i < elegiveis.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--off)', marginBottom: 2 }}>{i + 1}. {e.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtCPFlocal(e.cpf)}{e.cidade ? ` · ${e.cidade}/${e.uf}` : ''}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                          {e.bilhetes.slice(0, 5).map(n => (
                            <span key={n} style={{ fontFamily: 'var(--fd)', fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'var(--blue-dim)', border: '1px solid rgba(0,174,239,.2)', padding: '2px 7px', borderRadius: 100 }}>#{n}</span>
                          ))}
                          {e.bilhetes.length > 5 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>+{e.bilhetes.length - 5}</span>}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--fd)', fontSize: 26, fontWeight: 900, color: 'var(--blue)', flexShrink: 0, marginLeft: 10 }}>{e.bilhetes.length}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── HISTÓRICO ── */}
      {subAba === 3 && (
        <div>
          {loading && <div style={{ textAlign: 'center', padding: 30 }}><div className="spinner" style={{ width: 28, height: 28, borderWidth: 3, color: 'var(--lime)', margin: '0 auto' }} /></div>}
          {historico?.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', fontSize: 13 }}>Nenhum sorteio realizado ainda</div>}
          {historico?.map((s, i) => (
            <div key={s.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--lime)' }}>
                    {s.tipo?.replace('_', ' ')} · {cicloBonito(s.ciclo)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {new Date(s.data_sorteio).toLocaleDateString('pt-BR')} · Ext. {s.numero_extracao} · {s.total_ganhadores} ganhador{s.total_ganhadores !== 1 ? 'es' : ''} · {s.total_bilhetes} bilhetes
                  </div>
                </div>
                <button className="btn btn-outline" style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}
                  onClick={() => exportarGanhadores({ ...s, ganhadores: s.ganhadores })}>⬇</button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Número vencedor: <strong style={{ color: 'var(--white)', fontFamily: 'var(--fd)' }}>#{s.numero_vencedor}</strong>
                {' '}(1º: {s.resultado_1premio} · 2º: {s.resultado_2premio})
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

  const TIPOS = [
    { id: 'mensal',       label: 'Mensal',        desc: 'Todos com bilhetes no trimestre atual',          cor: 'var(--blue)' },
    { id: 'trimestral',   label: 'Trimestral',    desc: 'Todos com bilhetes no trimestre atual',          cor: 'var(--teal)' },
    { id: 'semestral',    label: 'Semestral',     desc: 'Com bilhetes + ativos nos últimos 2 meses',      cor: 'var(--yellow, #F59E0B)' },
    { id: 'grande_premio',label: 'Grande Prêmio', desc: 'Com bilhetes + ativos nos últimos 2 meses',      cor: 'var(--lime)' },
  ]

  async function carregarBilhetes() {
    setLoading(true); setErro(''); setBilhetesCiclo(null)
    try {
      const data = await buscarBilhetesPorCiclo()
      setBilhetesCiclo(data)
    } catch (e) { setErro(e.message) }
    setLoading(false)
  }

  async function carregarElegiveis() {
    setLoading(true); setErro(''); setElegiveis(null)
    try {
      const data = await buscarElegiveis(tipoSort)
      setElegiveis(data)
    } catch (e) { setErro(e.message) }
    setLoading(false)
  }

  function baixarCSVElegiveis() {
    if (!elegiveis?.length) return
    const tipo = TIPOS.find(t => t.id === tipoSort)
    const flat = elegiveis.map((e, i) => ({
      'Posição':          i + 1,
      'Nome':             e.nome,
      'CPF':              e.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      'Cidade':           e.cidade || '',
      'UF':               e.uf || '',
      'Telefone':         e.telefone || '',
      'Qtd Bilhetes':     e.bilhetes.length,
      'Números Bilhetes': e.bilhetes.map(n => `#${n}`).join(' | '),
    }))
    const cols = Object.keys(flat[0])
    const rows = flat.map(r => cols.map(c => `"${String(r[c]).replace(/"/g,'""')}"`).join(';'))
    const csv = [cols.join(';'), ...rows].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `elegiveis_${tipoSort}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function baixarCSVBilhetes(ciclo, lista) {
    const flat = lista.map(b => ({
      'Ciclo':       b.ciclo,
      'Número':      `#${b.numero}`,
      'Nome':        b.entregadores?.nome || '',
      'CPF':         b.cpf_entregador?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      'Cidade':      b.entregadores?.cidade || '',
      'UF':          b.entregadores?.uf || '',
      'Telefone':    b.entregadores?.telefone || '',
      'Tokens usados': b.tokens_usados,
      'Data':        new Date(b.created_at).toLocaleDateString('pt-BR'),
    }))
    const cols = Object.keys(flat[0])
    const rows = flat.map(r => cols.map(c => `"${String(r[c]).replace(/"/g,'""')}"`).join(';'))
    const csv = [cols.join(';'), ...rows].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bilhetes_${ciclo}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)

// ── Aba Simulação ──────────────────────────────────────────────────────────
function AbaSimulacao() {
  const [numeroPedido, setNumeroPedido] = useState('')
  const [novoStatus,   setNovoStatus]   = useState('DELIVERED')
  const [loading,      setLoading]      = useState(false)
  const [resultado,    setResultado]    = useState(null)
  const [erro,         setErro]         = useState('')

  const STATUS_OPCOES = [
    { v: 'DELIVERED',        l: 'DELIVERED — Entregue com sucesso',          cor: 'var(--teal)' },
    { v: 'DELIVERY_FAILED',  l: 'DELIVERY_FAILED — Falha na entrega',        cor: 'var(--red)' },
    { v: 'DELIVERY_REFUSED', l: 'DELIVERY_REFUSED — Recusado pelo destinatário', cor: 'var(--red)' },
    { v: 'CANCELLED',        l: 'CANCELLED — Pedido cancelado',              cor: 'var(--muted)' },
  ]

  async function simular() {
    if (!numeroPedido.trim()) { setErro('Digite o número do pedido.'); return }
    setLoading(true); setErro(''); setResultado(null)
    try {
      const { data, error } = await supabase.functions.invoke('simular-status', {
        body: { numeroPedido: numeroPedido.trim(), novoStatus }
      })
      if (error) throw new Error(error.message)
      if (data?.erro) throw new Error(data.erro)
      setResultado(data)
    } catch (e) {
      setErro(e.message || 'Erro ao simular status.')
    }
    setLoading(false)
  }

  return (
    <div>
      {/* Aviso */}
      <div style={{
        background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.35)',
        borderRadius: 'var(--r)', padding: '12px 14px', marginBottom: 18
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 4 }}>
          ⚠️ Ambiente de Homologação
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
          Esta ferramenta simula a mudança de status da Intelipost para testar o fluxo completo de tokens. Use apenas para testes — não utilizar em produção com pedidos reais.
        </div>
      </div>

      <div className="card">
        <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--lime)', marginBottom: 14 }}>
          Simular Mudança de Status
        </div>

        <div className="flex-col gap-3">
          {/* Número do pedido */}
          <div className="field">
            <label className="label">Número do Pedido</label>
            <input className="input" type="text"
              placeholder="Digite o mesmo número usado no scanner"
              value={numeroPedido}
              onChange={e => { setNumeroPedido(e.target.value); setErro(''); setResultado(null) }}
              onKeyDown={e => e.key === 'Enter' && simular()} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              O pedido precisa ter sido escaneado e estar com status "Aguardando confirmação"
            </span>
          </div>

          {/* Novo status */}
          <div className="field">
            <label className="label">Novo Status (simulando Intelipost)</label>
            {STATUS_OPCOES.map(s => (
              <label key={s.v} onClick={() => setNovoStatus(s.v)} style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                padding: '10px 12px', marginBottom: 6,
                background: novoStatus === s.v ? 'var(--lime-dim2)' : 'var(--card)',
                border: `1px solid ${novoStatus === s.v ? 'rgba(197,211,42,.35)' : 'var(--border)'}`,
                borderRadius: 'var(--r)', transition: 'all .15s'
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${novoStatus === s.v ? 'var(--lime)' : 'var(--border)'}`,
                  background: novoStatus === s.v ? 'var(--lime)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {novoStatus === s.v && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--navy)' }} />}
                </div>
                <span style={{ fontSize: 12, color: novoStatus === s.v ? 'var(--lime)' : 'var(--off)' }}>{s.l}</span>
              </label>
            ))}
          </div>

          {erro && <div className="alert alert-err"><span>{erro}</span></div>}

          <button className="btn btn-lime" onClick={simular} disabled={loading || !numeroPedido.trim()}>
            {loading
              ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Simulando...</>
              : '▶ Simular mudança de status'
            }
          </button>
        </div>
      </div>

      {/* Resultado */}
      {resultado && (
        <div style={{
          marginTop: 16,
          background: resultado.tokens > 0
            ? 'rgba(0,201,167,.08)' : 'rgba(255,61,87,.08)',
          border: `1px solid ${resultado.tokens > 0 ? 'rgba(0,201,167,.3)' : 'rgba(255,61,87,.3)'}`,
          borderRadius: 'var(--r2)', padding: '20px'
        }}>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: resultado.tokens > 0 ? 'var(--teal)' : 'var(--red)', marginBottom: 14 }}>
            {resultado.tokens > 0 ? '✅ Tokens creditados!' : '❌ Sem tokens'}
          </div>
          {[
            { k: 'Pedido',          v: resultado.numeroPedido },
            { k: 'Status simulado', v: resultado.statusSimulado },
            { k: 'Situação',        v: resultado.situacao?.replace(/_/g, ' ') },
            { k: 'Tokens',          v: `${resultado.tokens} token(s)` },
            { k: 'GPS',             v: resultado.geoMsg },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '7px 0',
              borderBottom: i < 4 ? '1px solid var(--border)' : 'none'
            }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.k}</span>
              <span style={{ fontSize: 12, color: 'var(--off)', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{r.v}</span>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>
            Verifique no painel do entregador se os tokens foram atualizados. O histórico de entregas também deve refletir a mudança.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Aba Relatórios ─────────────────────────────────────────────────────────
function AbaRelatorios() {
  const [dataInicio,  setDataInicio]  = useState('')
  const [dataFim,     setDataFim]     = useState('')
  const [apenasLib,   setApenasLib]   = useState(false)
  const [filtroPedido,setFiltroPedido]= useState('')
  const [dados,       setDados]       = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [erro,        setErro]        = useState('')

  async function gerar() {
    setLoading(true); setErro(''); setDados(null)
    try {
      const res = await buscarRelatorioEntregas({ dataInicio, dataFim, apenasAtivos: apenasLib })
      setDados(res)
    } catch (e) { setErro(e.message) }
    setLoading(false)
  }

  // Filtra localmente por número do pedido
  const dadosFiltrados = filtroPedido.trim()
    ? (dados || []).filter(s => s.numero_pedido?.toLowerCase().includes(filtroPedido.trim().toLowerCase()))
    : dados

  function baixarCSV() {
    if (!dadosFiltrados?.length) return
    const flat = dadosFiltrados.map(s => ({
      'Data/Hora':              fmtData(s.created_at),
      'Pedido':                 s.numero_pedido,
      'CPF':                    fmtCPF(s.cpf_entregador),
      'Nome':                   s.entregadores?.nome || '',
      'Telefone':               s.entregadores?.telefone || '',
      'Status Intelipost':      s.status_intelipost || '',
      'Status Token':           s.status || '',
      'Tokens':                 s.tokens_creditados || 0,
      'Situação':               s.situacao || '',
      'Latitude':               s.lat_scan || '',
      'Longitude':              s.lng_scan || '',
      'Precisão GPS (m)':       s.accuracy_metros ? Math.round(s.accuracy_metros) : '',
      'Distância Endereço (m)': s.distancia_metros ? Math.round(s.distancia_metros) : '',
      'Situação GPS':           s.geo_situacao || '',
      'Mensagem GPS':           s.geo_mensagem || '',
      'Modo Simulação':         s.modo_simulacao ? 'Sim' : 'Não',
    }))
    const hoje = new Date().toISOString().slice(0,10)
    exportCSV(flat, `entregas_${hoje}`)
  }

  const totalTokens = dadosFiltrados?.reduce((s, r) => s + (r.tokens_creditados || 0), 0) || 0
  const entregues   = dadosFiltrados?.filter(r => r.situacao === 'entregue').length || 0

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--lime)', marginBottom: 14 }}>
          Filtros
        </div>
        <div className="flex-col gap-3">
          <div className="field">
            <label className="label">Número do pedido / pacote</label>
            <input className="input" type="text" placeholder="Ex: EP000123456BR"
              value={filtroPedido} onChange={e => setFiltroPedido(e.target.value)} />
          </div>
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

      {dadosFiltrados && (
        <>
          {/* Resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { n: dadosFiltrados.length, l: 'Total de scans', c: 'var(--blue)' },
              { n: entregues,             l: 'Entregues',       c: 'var(--teal)' },
              { n: totalTokens,           l: 'Tokens emitidos', c: 'var(--lime)' },
            ].map((k, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', padding: '14px 8px' }}>
                <div style={{ fontFamily: 'var(--fd)', fontSize: 26, fontWeight: 900, color: k.c }}>{k.n}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{k.l}</div>
              </div>
            ))}
          </div>

          <button className="btn btn-outline" style={{ marginBottom: 14 }} onClick={baixarCSV} disabled={!dadosFiltrados.length}>
            ⬇ Baixar CSV ({dadosFiltrados.length} registros)
          </button>

          {/* Preview */}
          <div className="card">
            <div style={{ fontFamily: 'var(--fd)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 12 }}>
              Preview — {Math.min(dadosFiltrados.length, 10)} de {dadosFiltrados.length}
            </div>
            {dadosFiltrados.length === 0
              ? <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: 13 }}>Nenhum resultado encontrado</div>
              : dadosFiltrados.slice(0, 10).map((s, i) => (
                <div key={s.id} style={{
                  padding: '9px 0', borderBottom: i < Math.min(dadosFiltrados.length, 10) - 1 ? '1px solid var(--border)' : 'none'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--off)' }}>{s.numero_pedido}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {s.entregadores?.nome} · {fmtData(s.created_at)}
                      </div>
                      <GpsLink lat={s.lat_scan} lng={s.lng_scan} accuracy={s.accuracy_metros} />
                    </div>
                    <span style={{ fontFamily: 'var(--fd)', fontSize: 16, fontWeight: 800, color: s.tokens_creditados > 0 ? 'var(--teal)' : 'var(--red)', flexShrink: 0, marginLeft: 8 }}>
                      {s.tokens_creditados > 0 ? `+${s.tokens_creditados}` : '0'}
                    </span>
                  </div>
                </div>
              ))
            }
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
        <button onClick={() => setAuth(false)} style={{
          background: 'none', border: '1px solid var(--border)',
          color: 'var(--muted)', cursor: 'pointer', padding: '5px 12px',
          borderRadius: 'var(--r)', fontSize: 11, fontFamily: 'var(--fb)', fontWeight: 600,
          flexShrink: 0
        }}>
          Sair
        </button>
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

        {/* ── ABA 2: Sorteios ── */}
        {aba === 2 && <AbaSorteios />}

        {/* ── ABA 3: Relatórios ── */}
        {aba === 3 && <AbaRelatorios />}

        {/* ── ABA 4: Simulação ── */}
        {aba === 4 && <AbaSimulacao />}

        {/* ── ABA 5: Intelipost ── */}
        {aba === 5 && ipConfig && (
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

        {/* ── ABA 6: WhatsApp ── */}
        {aba === 6 && wpConfig && (
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
