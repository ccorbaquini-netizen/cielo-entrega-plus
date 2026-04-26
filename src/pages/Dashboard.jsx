import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { buscarEntregadorPorCPF, buscarTokensNaoConvertidos, buscarHistoricoScans, converterTokensEmBilhetes } from '../lib/supabase'
import Logo from '../components/Logo'

/* ── Count-up animado entre dois valores ── */
function useAnimatedValue(target, duration = 900) {
  const [val, setVal] = useState(target)
  const prevRef = useRef(target)

  useEffect(() => {
    const from = prevRef.current
    const to = target
    prevRef.current = target
    if (from === to) return
    let start = null
    const step = ts => {
      if (!start) start = ts
      const prog = Math.min((ts - start) / duration, 1)
      // ease out cubic
      const ease = 1 - Math.pow(1 - prog, 3)
      setVal(Math.round(from + (to - from) * ease))
      if (prog < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])

  return val
}

const prizes = [
  { cls: 'p-lime', period: 'Mensal',       desc: 'Vouchers combustível, recarga e manutenção',  count: '~62 ganh./mês' },
  { cls: 'p-blue', period: 'Trimestral',   desc: 'Smartphone, capacete, kit manutenção e saúde', count: '5 ganhadores' },
  { cls: 'p-teal', period: 'Semestral ★',  desc: 'Scooter elétrica, notebook, smartphone premium',count: '5 ganhadores' },
  { cls: 'p-red',  period: 'Grande Prêmio',desc: 'Moto 0km ou PIX até R$ 30.000',                count: '1 ganhador' },
]

export default function Dashboard() {
  const nav = useNavigate()
  const [entregador, setEntregador] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tokensDisp, setTokensDisp] = useState(0)   // tokens ainda não convertidos
  const [bilhetes,   setBilhetes]   = useState(0)   // bilhetes já gerados
  const [scans, setScans] = useState([])
  const [convertendo, setConvertendo] = useState(false)
  const [msgConversao, setMsgConversao] = useState('')

  const progPct = Math.min((tokensDisp % 10) / 10 * 100, 100)

  // Animação entre valores (tokens caem, bilhetes sobem)
  const animTokens   = useAnimatedValue(tokensDisp, 800)
  const animBilhetes = useAnimatedValue(bilhetes, 800)

  async function carregarSaldo(cpf) {
    const { tokensDisponiveis, bilhetes: qtdBilhetes } = await buscarTokensNaoConvertidos(cpf)
    setTokensDisp(tokensDisponiveis)
    setBilhetes(qtdBilhetes)
  }

  async function hConverter() {
    if (tokensDisp < 10) return
    setConvertendo(true); setMsgConversao('')
    try {
      const { gerados } = await converterTokensEmBilhetes(entregador.cpf)
      setMsgConversao(`+${gerados} bilhete${gerados > 1 ? 's' : ''} gerado${gerados > 1 ? 's' : ''}!`)
      await carregarSaldo(entregador.cpf)
      setTimeout(() => setMsgConversao(''), 4000)
    } catch (e) {
      setMsgConversao('Erro ao converter. Tente novamente.')
    }
    setConvertendo(false)
  }

  useEffect(() => {
    const cpf = localStorage.getItem('entregador_cpf')
    if (!cpf) { nav('/'); return }
    buscarEntregadorPorCPF(cpf)
      .then(d => { if (!d) { nav('/'); return } setEntregador(d) })
      .finally(() => setLoading(false))
    carregarSaldo(cpf)
    buscarHistoricoScans(cpf).then(s => setScans(s))
  }, [])

  if (loading) return (
    <div className="page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, color: 'var(--lime)' }} />
    </div>
  )

  const nome1     = entregador?.nome?.split(' ')[0] || ''
  const selfieUrl = entregador?.selfie_url || null

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="header">
        {/* Logo */}
        <div style={{ flex: 1 }}>
          <Logo size="md" />
          <div className="header-sub">Olá, {nome1}</div>
        </div>

        {/* Foto + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Foto do entregador */}
          {selfieUrl ? (
            <img
              src={selfieUrl}
              alt={nome1}
              style={{
                width: 38, height: 38, borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--lime)',
                boxShadow: '0 0 10px rgba(197,211,42,.3)',
                flexShrink: 0
              }}
            />
          ) : (
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'var(--card)', border: '2px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, flexShrink: 0
            }}>👤</div>
          )}
          {/* Badge ativo */}
          <div style={{
            fontFamily: 'var(--fd)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
            textTransform: 'uppercase', color: 'var(--lime)',
            background: 'var(--lime-dim2)', border: '1px solid rgba(197,211,42,.25)',
            padding: '4px 10px', borderRadius: 100
          }}>
            Ativo
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 22, paddingBottom: 40 }}>

        {/* ── Token hero ── */}
        <div className="token-hero fade-up">

          {/* Dois contadores, mesmo tamanho de fonte */}
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', marginBottom: 16 }}>
            {/* Tokens */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--lime)', marginBottom: 4 }}>Tokens</div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 56, fontWeight: 900, color: 'var(--white)', lineHeight: 1 }}>
                {animTokens}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>disponíveis</div>
            </div>

            {/* Divisor */}
            <div style={{ width: 1, height: 70, background: 'rgba(255,255,255,.12)', marginTop: 18, flexShrink: 0 }} />

            {/* Bilhetes */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 4 }}>Bilhetes</div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 56, fontWeight: 900, color: 'var(--blue)', lineHeight: 1 }}>
                {animBilhetes}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>gerados</div>
            </div>
          </div>

          {/* Barra de progresso */}
          <div className="prog-labels">
            <span>{tokensDisp % 10}/10 para próximo bilhete</span>
            <strong>{10 - (tokensDisp % 10 || 10) === 10 ? 0 : 10 - (tokensDisp % 10)} faltam</strong>
          </div>
          <div className="prog-bar" style={{ marginBottom: tokensDisp >= 10 ? 14 : 0 }}>
            <div className="prog-fill" style={{ width: `${progPct}%` }} />
          </div>

          {/* Botão de conversão — aparece quando tem pelo menos 10 tokens */}
          {tokensDisp >= 10 && (
            <button className="btn btn-lime" onClick={hConverter} disabled={convertendo} style={{ marginTop: 4 }}>
              {convertendo
                ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Convertendo...</>
                : <>🎟 Converter {Math.floor(tokensDisp / 10)} bilhete{Math.floor(tokensDisp / 10) > 1 ? 's' : ''}</>
              }
            </button>
          )}

          {/* Feedback da conversão */}
          {msgConversao && (
            <div style={{
              textAlign: 'center', marginTop: 10, fontSize: 13, fontWeight: 700,
              color: msgConversao.startsWith('Erro') ? 'var(--red)' : 'var(--teal)',
              animation: 'fadeUp .4s ease both'
            }}>
              {msgConversao}
            </div>
          )}

          {tokensDisp === 0 && bilhetes === 0 && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5, textAlign: 'center' }}>
              Use o scanner para registrar entregas e acumular tokens.
            </p>
          )}
        </div>

        {/* ── Scanner (Módulo 2) ── */}
        <button
          className="btn btn-blue fade-up-2"
          style={{ marginBottom: 14, gap: 10 }}
          onClick={() => nav('/scanner')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h2v10H7zM11 7h2v10h-2zM15 7h2v10h-2z"/>
          </svg>
          Registrar Entrega
        </button>

        {/* ── Bônus Frequência ── */}
        <div className="fade-up-2" style={{
          background: 'var(--lime-dim2)', border: '1px solid rgba(197,211,42,.22)',
          borderRadius: 'var(--r)', padding: '13px 15px', marginBottom: 18,
          display: 'flex', gap: 10, alignItems: 'flex-start'
        }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <div>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--lime)', marginBottom: 2 }}>
              Bônus Frequência
            </div>
            <p style={{ fontSize: 12, color: 'var(--off)', lineHeight: 1.45 }}>
              Entregue nos 3 meses do trimestre e ganhe +10 bilhetes extras!
            </p>
          </div>
        </div>

        {/* ── Prêmios ── */}
        <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 10 }}>
          Prêmios do Programa
        </div>
        <div className="prize-grid fade-up-3">
          {prizes.map((p, i) => (
            <div key={i} className={`prize-card ${p.cls}`}>
              <div className="prize-period">{p.period}</div>
              <div className="prize-desc">{p.desc}</div>
              <div className="prize-count">{p.count}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginBottom: 8, lineHeight: 1.5 }}>
          ★ Semestral e Grande Prêmio: ativo nas entregas nos últimos 2 meses
        </p>

        {/* ── Histórico ── */}
        <div className="card fade-up-4" style={{ marginTop: 6 }}>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 14 }}>
            Histórico de Entregas
          </div>
          {scans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '22px 0', color: 'var(--muted)', fontSize: 13 }}>
              Nenhuma entrega registrada ainda
            </div>
          ) : (
            <div className="flex-col" style={{ gap: 0 }}>
              {scans.map((s, i) => {
                const corStatus = s.tokens_creditados > 0 ? 'var(--teal)' : 'var(--red)'
                const data = new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '11px 0',
                    borderBottom: i < scans.length - 1 ? '1px solid var(--border)' : 'none'
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--off)', marginBottom: 2 }}>
                        {s.numero_pedido}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {data} · {s.situacao?.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, color: corStatus }}>
                      {s.tokens_creditados > 0 ? `+${s.tokens_creditados}` : '0'}
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted)', marginLeft: 3 }}>tok</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button className="btn btn-ghost mt-6"
          style={{ color: 'var(--red)', fontFamily: 'var(--fb)', fontWeight: 600 }}
          onClick={() => { localStorage.removeItem('entregador_cpf'); nav('/') }}>
          Sair da conta
        </button>
      </div>
    </div>
  )
}
