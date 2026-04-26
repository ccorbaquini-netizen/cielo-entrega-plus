import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buscarEntregadorPorCPF } from '../lib/supabase'
import Logo from '../components/Logo'

const Ico = ({ d, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const features = [
  { icon: '🏷️', cls: 'fi-lime', title: '10 tokens por entrega',  desc: 'Cada chamado Cielo concluído gera tokens automáticos na sua conta.' },
  { icon: '⚡',  cls: 'fi-blue', title: 'Bônus Frequência',        desc: 'Entregue nos 3 meses do trimestre e ganhe +10 bilhetes extras.' },
  { icon: '🏆', cls: 'fi-teal', title: 'Grande Prêmio Anual',    desc: 'Moto 0km ou PIX até R$ 30.000 — sorteio vinculado à Loteria Federal.' },
]

export default function Landing() {
  const navigate = useNavigate()
  const [jaCad, setJaCad] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cpf = localStorage.getItem('entregador_cpf')
    if (!cpf) { setLoading(false); return }
    buscarEntregadorPorCPF(cpf)
      .then(e => { if (e) setJaCad(true) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, color: 'var(--lime)' }} />
    </div>
  )

  return (
    <div className="page">
      {/* ── HERO ── */}
      <div className="hero" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{
          position: 'absolute', width: 100, height: 100, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,174,239,.18) 0%, transparent 70%)',
          top: '30%', right: '10%', pointerEvents: 'none'
        }} />

        {/* Eyebrow com logo */}
        <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 18 }}>
          <div className="hero-eyebrow" style={{ margin: 0 }}>Programa de Incentivo</div>
          <Logo size="sm" />
        </div>

        <h1 className="hero-title fade-up-2" style={{ textAlign: 'center' }}>
          <span>Entregou</span><br />
          <span>Cielo?</span><br />
          <span className="lime">Ganhe</span><br />
          <span className="blue">Prêmios!</span>
        </h1>

        <span className="hero-rule fade-up-3" style={{ margin: '14px auto 16px' }} />

        <p className="hero-desc fade-up-3" style={{ textAlign: 'center' }}>
          Cada entrega vira tokens. Tokens viram bilhetes.<br />Bilhetes podem mudar sua vida.
        </p>
      </div>

      {/* ── CONTENT ── */}
      <div className="container" style={{ paddingTop: 28, paddingBottom: 36 }}>
        {jaCad && (
          <div className="alert alert-lime slide-in" style={{ marginBottom: 18 }}>
            <Ico d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01 9 11.01" />
            <span>Você já está cadastrado! Acesse seu painel.</span>
          </div>
        )}

        <div className="feat-list fade-up">
          {features.map((f, i) => (
            <div key={i} className="feat-card">
              <div className={`feat-icon ${f.cls}`}>{f.icon}</div>
              <div><h3>{f.title}</h3><p>{f.desc}</p></div>
            </div>
          ))}
        </div>

        <div className="fade-up-2" style={{
          background: 'linear-gradient(90deg, var(--navy-2), var(--navy-3))',
          border: '1px solid var(--border)', borderRadius: 'var(--r)',
          padding: '14px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--lime)', marginBottom: 2 }}>
              Sorteios vinculados à
            </div>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 15, fontWeight: 800, color: 'var(--white)', textTransform: 'uppercase' }}>
              Loteria Federal
            </div>
          </div>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 900, color: 'var(--blue)', letterSpacing: '-.02em' }}>
            100%
          </div>
        </div>

        <div className="flex-col gap-3 fade-up-3">
          {jaCad ? (
            <button className="btn btn-lime" onClick={() => navigate('/painel')}>
              Ver meu painel <Ico d="M9 18l6-6-6-6" />
            </button>
          ) : (
            <>
              <button className="btn btn-lime" onClick={() => navigate('/cadastro')}>
                Quero participar <Ico d="M9 18l6-6-6-6" />
              </button>
              <p className="text-muted text-center">Gratuito · Sem compromisso · Sem exclusividade</p>
            </>
          )}
        </div>

        <div className="legal">
          Campanha promocional Cielo S.A. · Lei 5.768/71<br />
          Participação voluntária · Sem vínculo empregatício
        </div>
      </div>
    </div>
  )
}
