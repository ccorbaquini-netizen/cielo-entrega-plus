import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { buscarEntregadorPorCPF } from '../lib/supabase'

/* ── Count-up hook ── */
function useCountUp(target, duration = 1200) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) return
    let start = null
    const step = ts => {
      if (!start) start = ts
      const prog = Math.min((ts - start) / duration, 1)
      setVal(Math.floor(prog * target))
      if (prog < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])
  return val
}

const prizes = [
  { cls: 'p-lime', period: 'Mensal', desc: 'Vouchers combustível, recarga e manutenção', count: '~62 ganh./mês' },
  { cls: 'p-blue', period: 'Trimestral', desc: 'Smartphone, capacete, kit manutenção e saúde', count: '5 ganhadores' },
  { cls: 'p-teal', period: 'Semestral ★', desc: 'Scooter elétrica, notebook, smartphone premium', count: '5 ganhadores' },
  { cls: 'p-red', period: 'Grande Prêmio', desc: 'Moto 0km ou PIX até R$ 30.000', count: '1 ganhador' },
]

export default function Dashboard() {
  const nav = useNavigate()
  const [entregador, setEntregador] = useState(null)
  const [loading, setLoading] = useState(true)

  const tokens = 0 // will come from DB in Módulo 2
  const bilhetes = 0
  const progPct = Math.min((tokens % 10) / 10 * 100, 100)

  const animTokens = useCountUp(tokens)

  useEffect(() => {
    const cpf = localStorage.getItem('entregador_cpf')
    if (!cpf) { nav('/'); return }
    buscarEntregadorPorCPF(cpf)
      .then(d => { if (!d) { nav('/'); return } setEntregador(d) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, color: 'var(--lime)' }} />
    </div>
  )

  const nome1 = entregador?.nome?.split(' ')[0] || ''

  return (
    <div className="page">
      {/* Header */}
      <div className="header">
        <div style={{ flex: 1 }}>
          <div className="header-logo">
            <span>entrega</span><span className="lime">+</span>
          </div>
          <div className="header-sub">Olá, {nome1}</div>
        </div>
        <div style={{
          fontFamily: 'var(--fd)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--lime)',
          background: 'var(--lime-dim2)', border: '1px solid rgba(197,211,42,.25)',
          padding: '4px 10px', borderRadius: 100
        }}>
          Ativo
        </div>
      </div>

      <div className="container" style={{ paddingTop: 22, paddingBottom: 40 }}>

        {/* ── Token hero ── */}
        <div className="token-hero fade-up">
          <div className="token-eyebrow">Seus Tokens</div>
          <div className="token-number">
            {animTokens}
            <span className="suf">pts</span>
          </div>

          <div className="prog-labels">
            <span>{tokens % 10}/10 para próximo bilhete</span>
            <strong>{bilhetes} bilhetes</strong>
          </div>
          <div className="prog-bar">
            <div className="prog-fill" style={{ width: `${progPct}%` }} />
          </div>

          {tokens >= 10 && (
            <button className="btn btn-lime" style={{ marginTop: 16 }}>
              Converter tokens em bilhetes
            </button>
          )}

          {tokens === 0 && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>
              Leia o código de barras da etiqueta nas suas próximas entregas para acumular tokens.
            </p>
          )}
        </div>

        {/* ── Scanner placeholder (Módulo 2) ── */}
        <div className="fade-up-2" style={{
          background: 'linear-gradient(135deg, var(--navy-2), var(--navy-3))',
          border: '1px solid rgba(0,174,239,.2)',
          borderRadius: 'var(--r2)', padding: '20px',
          marginBottom: 14, textAlign: 'center'
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--blue)', marginBottom: 6 }}>
            Scanner de Entregas
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            Disponível no Módulo 2 — leitura do código de barras da etiqueta com validação de geolocalização.
          </p>
        </div>

        {/* ── Bônus Frequência strip ── */}
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

        {/* ── Prizes ── */}
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
          ★ Semestral e Grande Prêmio: mantenha-se ativo nas entregas nos últimos 2 meses
        </p>

        {/* ── Histórico placeholder ── */}
        <div className="card fade-up-4" style={{ marginTop: 6 }}>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 14 }}>
            Histórico
          </div>
          <div style={{ textAlign: 'center', padding: '22px 0', color: 'var(--muted)', fontSize: 13 }}>
            Nenhuma entrega registrada ainda
          </div>
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
