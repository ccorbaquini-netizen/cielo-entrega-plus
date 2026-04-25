import { useState, useEffect } from 'react'
import {
  getAllFeatureFlags, updateFeatureFlag,
  getWhatsappConfig, updateWhatsappConfig,
  getIntelipostConfig, updateIntelipostConfig, testarIntelipostConexao,
  supabase
} from '../lib/supabase'

const PASS = import.meta.env.VITE_ADMIN_PASSWORD || 'cielo2025'

const FLAG_LABELS = {
  whatsapp_ios:         { label: 'WhatsApp — iOS', desc: 'Disparo para usuários iOS sem push' },
  whatsapp_android:     { label: 'WhatsApp — Android', desc: 'Disparo para Android sem PWA instalado' },
  push_notifications:   { label: 'Push Notifications', desc: 'Notificações push para PWA instalado' },
  bonus_frequencia:     { label: 'Bônus Frequência', desc: 'Cálculo do bônus trimestral' },
  sorteio_mensal:       { label: 'Sorteio Mensal', desc: 'Ciclo de sorteio mensal habilitado' },
  cadastro_aberto:      { label: 'Cadastro Aberto', desc: 'Permite novos cadastros no programa' },
  scan_qrcode_etiqueta: { label: 'Leitura Código de Barras', desc: 'Valida entregas via leitura da etiqueta (Code 128)' },
}

const PROVEDORES = ['360dialog', 'Zenvia', 'Twilio', 'Take Blip']

export default function Admin() {
  const [auth, setAuth] = useState(false)
  const [senha, setSenha] = useState('')
  const [senhaErr, setSenhaErr] = useState(false)

  const [flags, setFlags] = useState([])
  const [wpConfig, setWpConfig] = useState(null)
  const [ipConfig, setIpConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  const [salvandoWp, setSalvandoWp] = useState(false)
  const [salvandoIp, setSalvandoIp] = useState(false)
  const [testandoWp, setTestandoWp] = useState(false)
  const [testandoIp, setTestandoIp] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [resWp, setResWp] = useState('')
  const [resIp, setResIp] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [showIpKey, setShowIpKey] = useState(false)

  function login() {
    if (senha === PASS) setAuth(true)
    else setSenhaErr(true)
  }

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
    const ok = await updateWhatsappConfig(wpConfig)
    setSalvandoWp(false); flash(ok ? 'WhatsApp salvo' : 'Erro ao salvar')
  }

  async function hTestarWp() {
    setTestandoWp(true); setResWp('')
    try {
      const { data, error } = await supabase.functions.invoke('test-whatsapp', { body: { config: wpConfig } })
      setResWp(error ? `Erro: ${error.message}` : `OK — ${data?.message || 'API respondeu'}`)
    } catch { setResWp('Erro de conexão. Verifique as credenciais.') }
    setTestandoWp(false)
  }

  async function hSalvarIp() {
    setSalvandoIp(true)
    const ok = await updateIntelipostConfig(ipConfig)
    setSalvandoIp(false); flash(ok ? 'Intelipost salvo' : 'Erro ao salvar')
  }

  async function hTestarIp() {
    if (!ipConfig?.api_key) { setResIp('Informe a API Key antes de testar.'); return }
    setTestandoIp(true); setResIp('')
    try {
      const { ok, mensagem } = await testarIntelipostConexao(ipConfig.api_key)
      setResIp(ok ? 'Conexão OK — Intelipost respondeu' : `Erro: ${mensagem || 'Verifique a key'}`)
    } catch { setResIp('Erro de conexão.') }
    setTestandoIp(false)
  }

  function flash(msg) { setFeedback(msg); setTimeout(() => setFeedback(''), 3000) }

  const SectionTitle = ({ children }) => (
    <div style={{
      fontFamily: 'var(--fd)', fontSize: 14, fontWeight: 800,
      textTransform: 'uppercase', letterSpacing: '.06em',
      color: 'var(--lime)', marginBottom: 4
    }}>{children}</div>
  )

  /* ── Login ── */
  if (!auth) return (
    <div className="page" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            <span>entrega</span><span style={{ color: 'var(--lime)' }}>+</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Painel de Gestão</div>
        </div>
        <div className="field">
          <label className="label">Senha</label>
          <input className={`input ${senhaErr ? 'err' : ''}`}
            type="password" placeholder="••••••••"
            value={senha} onChange={e => { setSenha(e.target.value); setSenhaErr(false) }}
            onKeyDown={e => e.key === 'Enter' && login()} autoFocus />
          {senhaErr && <span className="field-error">Senha incorreta</span>}
        </div>
        <button className="btn btn-lime mt-6" onClick={login}>Acessar</button>
      </div>
    </div>
  )

  if (loading) return (
    <div className="page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, color: 'var(--lime)' }} />
    </div>
  )

  const SimBar = ({ on, label, onChange }) => (
    <div style={{
      padding: '11px 14px',
      background: on ? 'rgba(245,158,11,.08)' : 'rgba(0,201,167,.08)',
      border: `1px solid ${on ? 'rgba(245,158,11,.3)' : 'rgba(0,201,167,.3)'}`,
      borderRadius: 'var(--r)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 12
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: on ? '#fbbf24' : 'var(--teal)' }}>
          {on ? '⚠️ Modo Simulação ATIVO' : '✅ Modo Produção'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {on ? label[0] : label[1]}
        </div>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={!on} onChange={onChange} />
        <span className="toggle-slider" />
      </label>
    </div>
  )

  return (
    <div className="page">
      <div className="admin-hdr">
        <div>
          <div className="header-logo"><span>entrega</span><span className="lime">+</span></div>
          <div className="header-sub">Painel de Gestão</div>
        </div>
        {feedback && <div style={{ fontSize: 12, color: 'var(--lime)', fontWeight: 600, textAlign: 'right', maxWidth: 180 }}>{feedback}</div>}
      </div>

      <div className="container" style={{ paddingTop: 22, paddingBottom: 48 }}>

        {/* ── Feature Flags ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle>Feature Flags</SectionTitle>
          <p className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
            Ligue ou desligue funcionalidades sem redeploy.
          </p>
          {flags.length === 0
            ? <p className="text-muted" style={{ fontSize: 13 }}>Execute o SQL de seed no Supabase.</p>
            : flags.map(f => (
              <div key={f.nome} className="flag-row">
                <div className="flag-info">
                  <strong>{FLAG_LABELS[f.nome]?.label || f.nome}</strong>
                  <span>{FLAG_LABELS[f.nome]?.desc || f.descricao}</span>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={f.habilitado}
                    onChange={e => hToggle(f.nome, e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>
            ))
          }
        </div>

        {/* ── Intelipost ── */}
        {ipConfig && (
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionTitle>Intelipost API</SectionTitle>
            <p className="text-muted" style={{ fontSize: 12, marginBottom: 14 }}>
              Configure antes de habilitar o scan de entregas.
            </p>

            <SimBar on={ipConfig.modo_simulacao}
              label={['Nenhuma chamada real à Intelipost', 'Consultando API real']}
              onChange={e => setIpConfig(c => ({ ...c, modo_simulacao: !e.target.checked }))} />

            <div className="flex-col gap-3">
              <div className="field">
                <label className="label">URL Base</label>
                <input className="input" type="text"
                  value={ipConfig.base_url} onChange={e => setIpConfig(c => ({ ...c, base_url: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">API Key</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={showIpKey ? 'text' : 'password'}
                    placeholder={ipConfig.api_key ? '••••••••••••••' : 'Aguardando chave — inserir quando disponível'}
                    value={ipConfig.api_key || ''}
                    onChange={e => setIpConfig(c => ({ ...c, api_key: e.target.value }))}
                    style={{ paddingRight: 72 }} autoComplete="new-password" />
                  <button onClick={() => setShowIpKey(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--fb)', fontWeight: 600 }}>
                    {showIpKey ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Header: <code>api-key: SUA_KEY</code> — solicitar ao time Intelipost
                </span>
              </div>
              <div className="field">
                <label className="label">Timeout (segundos)</label>
                <input className="input" type="number" min="5" max="30"
                  value={ipConfig.timeout_segundos}
                  onChange={e => setIpConfig(c => ({ ...c, timeout_segundos: parseInt(e.target.value) }))} />
              </div>

              <div style={{ background: 'rgba(0,0,0,.2)', borderRadius: 'var(--r)', padding: '12px 14px', fontSize: 12, color: 'var(--muted)' }}>
                <div style={{ fontFamily: 'var(--fd)', fontSize: 12, fontWeight: 700, color: 'var(--off)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Endpoints utilizados</div>
                <div style={{ marginBottom: 4 }}><code>GET</code> /shipment_order/<em>{'{numero}'}</em> — completo</div>
                <div><code>GET</code> /shipment_order/read_status/<em>{'{numero}'}</em> — fallback</div>
              </div>

              {resIp && (
                <div className={`alert ${resIp.startsWith('Erro') || resIp.startsWith('Informe') ? 'alert-err' : 'alert-ok'}`}>
                  <span>{resIp}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-outline" onClick={hTestarIp}
                  disabled={testandoIp || !ipConfig.api_key} style={{ flex: 1 }}>
                  {testandoIp ? <><div className="spinner" style={{ color: 'var(--white)' }} /> Testando...</> : 'Testar'}
                </button>
                <button className="btn btn-lime" onClick={hSalvarIp}
                  disabled={salvandoIp} style={{ flex: 1 }}>
                  {salvandoIp ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Salvando...</> : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── WhatsApp ── */}
        {wpConfig && (
          <div className="card">
            <SectionTitle>WhatsApp</SectionTitle>
            <p className="text-muted" style={{ fontSize: 12, marginBottom: 14 }}>
              Configure antes de habilitar os flags de WhatsApp acima.
            </p>

            <SimBar on={wpConfig.modo_simulacao}
              label={['Mensagens em log — sem disparo real', 'Mensagens sendo enviadas de verdade']}
              onChange={e => setWpConfig(c => ({ ...c, modo_simulacao: !e.target.checked }))} />

            <div className="flex-col gap-3">
              <div className="field">
                <label className="label">Provedor</label>
                <select className="input" value={wpConfig.provedor}
                  onChange={e => setWpConfig(c => ({ ...c, provedor: e.target.value }))}>
                  {PROVEDORES.map(p => <option key={p} value={p}>{p}</option>)}
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
                  <label className="label">Horário início</label>
                  <input className="input" type="time" value={wpConfig.horario_inicio}
                    onChange={e => setWpConfig(c => ({ ...c, horario_inicio: e.target.value }))} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">Horário fim</label>
                  <input className="input" type="time" value={wpConfig.horario_fim}
                    onChange={e => setWpConfig(c => ({ ...c, horario_fim: e.target.value }))} />
                </div>
              </div>

              {resWp && (
                <div className={`alert ${resWp.startsWith('Erro') ? 'alert-err' : 'alert-ok'}`}>
                  <span>{resWp}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-outline" onClick={hTestarWp}
                  disabled={testandoWp || !wpConfig.api_key} style={{ flex: 1 }}>
                  {testandoWp ? <><div className="spinner" style={{ color: 'var(--white)' }} /> Testando...</> : 'Testar'}
                </button>
                <button className="btn btn-lime" onClick={hSalvarWp}
                  disabled={salvandoWp} style={{ flex: 1 }}>
                  {salvandoWp ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Salvando...</> : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
