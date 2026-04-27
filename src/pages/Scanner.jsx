import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buscarEntregadorPorCPF, registrarEntrega } from '../lib/supabase'
import Logo from '../components/Logo'

/* ── Estados do fluxo ─────────────────────────────────────────────────────── */
const ST = {
  IDLE:       'idle',        // aguardando scan
  SCANNING:   'scanning',   // câmera ativa
  GEOLOCATING:'geolocating',// buscando GPS
  VALIDATING: 'validating', // consultando API
  SUCCESS:    'success',    // tokens creditados
  ERROR:      'error',      // falha
}

const IcoScan = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M7 7h2v10H7zM11 7h2v10h-2zM15 7h2v10h-2z"/>
  </svg>
)
const IcoCheck = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IcoX = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IcoChev = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

/* ── Geolocalização — solicita permissão explicitamente no iOS ───────────── */
function getGeolocacao() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('GPS não disponível neste dispositivo')); return }

    // iOS exige que a solicitação seja feita diretamente por interação do usuário
    // Usamos watchPosition com clearWatch imediato para forçar o prompt no iOS
    let tentou = false
    const id = navigator.geolocation.watchPosition(
      pos => {
        if (tentou) return
        tentou = true
        navigator.geolocation.clearWatch(id)
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
      },
      err => {
        if (tentou) return
        tentou = true
        navigator.geolocation.clearWatch(id)
        if (err.code === 1) reject(new Error('Permissão de localização negada. Ative nas configurações do celular.'))
        else if (err.code === 2) reject(new Error('GPS indisponível. Verifique se o GPS está ativo.'))
        else reject(new Error('Tempo esgotado ao obter localização.'))
      },
      { timeout: 20000, maximumAge: 0, enableHighAccuracy: true }
    )

    // Timeout de segurança
    setTimeout(() => {
      if (!tentou) {
        tentou = true
        navigator.geolocation.clearWatch(id)
        reject(new Error('Tempo esgotado ao obter localização.'))
      }
    }, 21000)
  })
}

/* ── Token label por situação ────────────────────────────────────────────── */
function getTokenLabel(tokens, situacao) {
  if (situacao === 'entregue')           return { tokens, cor: 'var(--teal)',  label: 'Entrega confirmada' }
  if (situacao === 'falha_sem_geocod')   return { tokens, cor: 'var(--teal)',  label: 'Falha cadastral — não penaliza' }
  if (situacao === 'falha_dentro_raio')  return { tokens, cor: 'var(--blue)',  label: 'Tentativa presencial confirmada' }
  if (situacao === 'falha_fora_raio')    return { tokens: 0, cor: 'var(--red)', label: 'Sem evidência de presença' }
  return { tokens: 0, cor: 'var(--muted)', label: 'Não registrado' }
}

export default function Scanner() {
  const nav = useNavigate()
  const [estado, setEstado] = useState(ST.IDLE)
  const [entregador, setEntregador] = useState(null)
  const [numeroPedido, setNumeroPedido] = useState('')
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')
  const [gpsStatus, setGpsStatus] = useState('') // feedback GPS para o usuário
  const [html5QrCode, setHtml5QrCode] = useState(null)
  const scannerRef = useRef(null)
  const scanActive = useRef(false)

  useEffect(() => {
    const cpf = localStorage.getItem('entregador_cpf')
    if (!cpf) { nav('/'); return }
    buscarEntregadorPorCPF(cpf).then(d => {
      if (!d) { nav('/'); return }
      setEntregador(d)
    })
  }, [])

  /* ── Inicia scanner ──────────────────────────────────────────────────── */
  async function iniciarScanner() {
    setEstado(ST.SCANNING)
    setErro('')

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('scanner-viewport')
      setHtml5QrCode(scanner)
      scanActive.current = true

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 120 }, formatsToSupport: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
        async (decodedText) => {
          if (!scanActive.current) return
          scanActive.current = false
          await pararScanner(scanner)
          setNumeroPedido(decodedText.trim())
          processarEntrega(decodedText.trim())
        },
        () => {} // erros de frame são normais
      )
    } catch (e) {
      setEstado(ST.ERROR)
      setErro('Não foi possível acessar a câmera. Verifique as permissões.')
    }
  }

  async function pararScanner(scanner) {
    try { if (scanner?.isScanning) await scanner.stop() } catch {}
  }

  /* ── Entrada manual (fallback) ───────────────────────────────────────── */
  async function processarManual() {
    if (!numeroPedido.trim()) { setErro('Digite o número do pedido.'); return }
    processarEntrega(numeroPedido.trim())
  }

  /* ── Fluxo principal ─────────────────────────────────────────────────── */
  async function processarEntrega(pedido) {
    setEstado(ST.GEOLOCATING)
    setErro('')
    setGpsStatus('Solicitando permissão de localização...')

    // 1. Geolocalização (best-effort — não bloqueia)
    let geo = null
    try {
      setGpsStatus('Capturando coordenadas GPS...')
      geo = await getGeolocacao()
      setGpsStatus(`GPS obtido · precisão ${Math.round(geo.accuracy)}m`)
    } catch (e) {
      setGpsStatus(`⚠️ ${e.message}`)
    }

    setEstado(ST.VALIDATING)

    try {
      const res = await registrarEntrega({
        numeroPedido: pedido,
        cpf: entregador.cpf,
        lat: geo?.lat || null,
        lng: geo?.lng || null,
        accuracy: geo?.accuracy || null,
      })
      setResultado(res)
      setEstado(ST.SUCCESS)
    } catch (e) {
      setEstado(ST.ERROR)
      setErro(e.message || 'Erro ao processar a entrega. Tente novamente.')
    }
  }

  /* ── Reiniciar ───────────────────────────────────────────────────────── */
  function reiniciar() {
    if (html5QrCode) pararScanner(html5QrCode)
    setHtml5QrCode(null)
    setEstado(ST.IDLE)
    setNumeroPedido('')
    setResultado(null)
    setErro('')
    scanActive.current = false
  }

  /* ── UI ──────────────────────────────────────────────────────────────── */
  return (
    <div className="page">
      {/* Header */}
      <div className="header">
        <button onClick={() => { pararScanner(html5QrCode); nav('/painel') }}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, marginRight: 8 }}>
          <IcoChev />
        </button>
        <div style={{ flex: 1 }}>
          <Logo size="md" />
          <div className="header-sub">Registrar Entrega</div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 24, paddingBottom: 40 }}>

        {/* ── IDLE ── */}
        {estado === ST.IDLE && (
          <div className="fade-up">
            <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '28px 22px' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
                Escanear Etiqueta
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
                Aponte a câmera para o <strong style={{ color: 'var(--off)' }}>código de barras central</strong> da etiqueta (Code 128, o maior da etiqueta).
              </p>
              <button className="btn btn-lime" onClick={iniciarScanner}>
                <IcoScan /> Abrir câmera
              </button>
            </div>

            {/* Entrada manual */}
            <div className="card">
              <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 12 }}>
                Ou digitar manualmente
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label">Número do Pedido</label>
                <input className="input" type="text" placeholder="Ex: EP000123456BR"
                  value={numeroPedido}
                  onChange={e => setNumeroPedido(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && processarManual()}
                  autoCapitalize="characters"
                />
              </div>
              {erro && <div className="alert alert-err" style={{ marginBottom: 12 }}><span>{erro}</span></div>}
              <button className="btn btn-outline" onClick={processarManual} disabled={!numeroPedido.trim()}>
                Validar pedido
              </button>
            </div>

            <div className="alert alert-info" style={{ marginTop: 16 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span>O GPS é capturado automaticamente para validar a presença no endereço em caso de falha de entrega.</span>
            </div>
          </div>
        )}

        {/* ── SCANNING ── */}
        {estado === ST.SCANNING && (
          <div className="fade-up">
            <div style={{
              background: 'var(--navy-2)', borderRadius: 'var(--r2)',
              overflow: 'hidden', marginBottom: 16, position: 'relative'
            }}>
              {/* Viewport do scanner */}
              <div id="scanner-viewport" style={{ width: '100%' }} />

              {/* Overlay de mira */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{
                  width: 280, height: 100,
                  border: '2px solid var(--lime)',
                  borderRadius: 8,
                  boxShadow: '0 0 0 4000px rgba(0,0,0,.5)',
                  position: 'relative'
                }}>
                  {/* Cantos animados */}
                  {['0,0', '0,auto', 'auto,0', 'auto,auto'].map((pos, i) => {
                    const [t, b] = pos.split(',')
                    return (
                      <div key={i} style={{
                        position: 'absolute', width: 20, height: 20,
                        top: t !== 'auto' ? -2 : 'auto', bottom: b !== 'auto' ? -2 : 'auto',
                        left: i < 2 ? -2 : 'auto', right: i >= 2 ? -2 : 'auto',
                        borderTop: t !== 'auto' ? '3px solid var(--lime)' : 'none',
                        borderBottom: b !== 'auto' ? '3px solid var(--lime)' : 'none',
                        borderLeft: i < 2 ? '3px solid var(--lime)' : 'none',
                        borderRight: i >= 2 ? '3px solid var(--lime)' : 'none',
                      }} />
                    )
                  })}
                </div>
              </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Aponte para o código de barras maior da etiqueta
            </p>
            <button className="btn btn-outline" onClick={reiniciar}>Cancelar</button>
          </div>
        )}

        {/* ── GEOLOCATING / VALIDATING ── */}
        {(estado === ST.GEOLOCATING || estado === ST.VALIDATING) && (
          <div className="fade-up" style={{ textAlign: 'center', paddingTop: 40 }}>
            <div className="spinner" style={{ width: 48, height: 48, borderWidth: 4, color: 'var(--lime)', margin: '0 auto 20px' }} />
            <div style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
              {estado === ST.GEOLOCATING ? 'Obtendo localização...' : 'Validando entrega...'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
              {estado === ST.GEOLOCATING
                ? 'Capturando GPS para confirmar presença no endereço.'
                : `Consultando pedido ${numeroPedido} na Intelipost.`}
            </p>
            {gpsStatus && (
              <div style={{
                fontSize: 12, color: 'var(--blue)',
                background: 'var(--blue-dim)', border: '1px solid rgba(0,174,239,.2)',
                borderRadius: 'var(--r)', padding: '8px 14px', display: 'inline-block'
              }}>
                📍 {gpsStatus}
              </div>
            )}
          </div>
        )}

        {/* ── SUCCESS ── */}
        {estado === ST.SUCCESS && resultado && (() => {
          const isPendente  = resultado.pendente
          const isRejeitado = resultado.rejeitado
          const corPrincipal = isPendente ? 'var(--blue)' : resultado.tokens > 0 ? 'var(--teal)' : 'var(--red)'

          return (
            <div className="fade-up" style={{ paddingTop: 20 }}>
              {/* Card de resultado */}
              <div style={{
                background: isPendente
                  ? 'linear-gradient(135deg, var(--navy-2), var(--navy-3))'
                  : isRejeitado
                  ? 'rgba(255,61,87,.08)'
                  : resultado.tokens > 0
                  ? 'linear-gradient(135deg, var(--navy-2), var(--navy-3))'
                  : 'rgba(255,61,87,.08)',
                border: `1px solid ${isPendente ? 'rgba(0,174,239,.3)' : isRejeitado ? 'rgba(255,61,87,.3)' : resultado.tokens > 0 ? 'rgba(197,211,42,.2)' : 'rgba(255,61,87,.3)'}`,
                borderRadius: 'var(--r3)', padding: '28px 22px',
                textAlign: 'center', marginBottom: 16
              }}>
                {/* Ícone */}
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: isPendente ? 'rgba(0,174,239,.15)' : isRejeitado ? 'rgba(255,61,87,.15)' : resultado.tokens > 0 ? 'rgba(0,201,167,.15)' : 'rgba(255,61,87,.15)',
                  border: `2px solid ${corPrincipal}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', fontSize: 26
                }}>
                  {isPendente ? '⏳' : isRejeitado ? '🚫' : resultado.tokens > 0 ? '✅' : '❌'}
                </div>

                {/* Título */}
                <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: corPrincipal, marginBottom: 8 }}>
                  {isPendente  ? 'Entrega Registrada'
                  : isRejeitado ? 'Scan Não Permitido'
                  : resultado.tokens > 0 ? 'Tokens Creditados'
                  : 'Sem Tokens'}
                </div>

                {/* Mensagem principal */}
                {isPendente && (
                  <>
                    <p style={{ fontSize: 14, color: 'var(--off)', lineHeight: 1.65, marginBottom: 16 }}>
                      {resultado.mensagem}
                    </p>
                    {/* GPS status */}
                    <div style={{
                      display: 'inline-block', fontSize: 12,
                      color: resultado.gpsCapturado ? 'var(--teal)' : 'var(--muted)',
                      background: resultado.gpsCapturado ? 'rgba(0,201,167,.1)' : 'rgba(255,255,255,.05)',
                      border: `1px solid ${resultado.gpsCapturado ? 'rgba(0,201,167,.3)' : 'var(--border)'}`,
                      padding: '6px 14px', borderRadius: 100
                    }}>
                      📍 {resultado.gpsMsg}
                    </div>
                    {/* Info sobre tokens pendentes */}
                    <div style={{
                      marginTop: 16, padding: '12px 14px',
                      background: 'rgba(0,174,239,.08)', borderRadius: 'var(--r)',
                      border: '1px solid rgba(0,174,239,.2)'
                    }}>
                      <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                        Os tokens serão creditados automaticamente assim que o status da entrega for atualizado na Intelipost. Verifique seu painel em alguns minutos.
                      </p>
                    </div>
                  </>
                )}

                {isRejeitado && (
                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
                    {resultado.mensagem}
                  </p>
                )}

                {!isPendente && !isRejeitado && resultado.tokens > 0 && (
                  <>
                    <div style={{ fontFamily: 'var(--fd)', fontSize: 64, fontWeight: 900, color: 'var(--white)', lineHeight: 1, margin: '8px 0 4px' }}>
                      +{resultado.tokens}
                    </div>
                    <div style={{ fontFamily: 'var(--fd)', fontSize: 16, fontWeight: 600, color: 'var(--teal)' }}>tokens</div>
                  </>
                )}

                {!isPendente && !isRejeitado && resultado.tokens === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                    {resultado.mensagem || 'Sem tokens para esta entrega.'}
                  </p>
                )}
              </div>

              {/* Detalhes */}
              {!isRejeitado && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: 'var(--fd)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 12 }}>
                    Detalhes
                  </div>
                  {[
                    { k: 'Pedido',           v: resultado.numeroPedido },
                    { k: 'Status Intelipost',v: resultado.statusIntelipost },
                    { k: 'GPS',              v: resultado.gpsMsg || (resultado.geoOk ? '✅ Presença confirmada' : '—') },
                    { k: 'Situação',         v: isPendente ? '⏳ Aguardando confirmação' : resultado.situacao },
                  ].map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none'
                    }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.k}</span>
                      <span style={{ fontSize: 12, color: 'var(--off)', fontWeight: 600, textAlign: 'right', maxWidth: '55%' }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn btn-lime" onClick={reiniciar}>
                  {isPendente || isRejeitado ? 'Escanear outro pedido' : 'Escanear próxima entrega'}
                </button>
                <button className="btn btn-outline" onClick={() => nav('/painel')}>
                  Ir para o painel
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── ERROR ── */}
        {estado === ST.ERROR && (
          <div className="fade-up" style={{ paddingTop: 20 }}>
            <div className="alert alert-err" style={{ marginBottom: 20 }}>
              <IcoX />
              <span>{erro || 'Erro inesperado. Tente novamente.'}</span>
            </div>
            <button className="btn btn-outline" onClick={reiniciar}>Tentar novamente</button>
          </div>
        )}
      </div>
    </div>
  )
}
