import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  buscarEntregadorPorCPF,
  buscarTokensNaoConvertidos,
  buscarHistoricoScans,
  buscarBilhetes,
  converterTokensEmBilhetes,
  atualizarFotoPerfil,
  buscarProximosSorteios
} from '../lib/supabase'
import Logo from '../components/Logo'

// ── Count-up animado entre dois valores ──────────────────────────────────────
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
      const ease = 1 - Math.pow(1 - prog, 3)
      setVal(Math.round(from + (to - from) * ease))
      if (prog < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])
  return val
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

function fmtDataCurta(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Retorna o trimestre atual e seus 3 meses
function getTrimestre() {
  const now = new Date()
  const ano = now.getFullYear()
  const mes = now.getMonth() + 1 // 1-12
  const trim = Math.ceil(mes / 3)
  const mesInicio = (trim - 1) * 3 + 1
  const meses = [mesInicio, mesInicio + 1, mesInicio + 2]
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return {
    ciclo: `${ano}-T${trim}`,
    meses: meses.map(m => ({ mes: m, ano, nome: nomes[m - 1], atual: m === mes }))
  }
}

// Verifica quais meses do trimestre têm ao menos 1 scan liberado
function analisarBonusFrequencia(scans) {
  const { meses } = getTrimestre()
  return meses.map(m => {
    const temEntrega = scans.some(s => {
      const d = new Date(s.created_at)
      return d.getMonth() + 1 === m.mes
        && d.getFullYear() === m.ano
        && s.status === 'liberado'
        && (s.tokens_creditados || 0) > 0
    })
    return { ...m, temEntrega }
  })
}

// Prêmios
// Prêmios base (descrição e ganhadores fixos, datas dinâmicas)
const PRIZES_BASE = [
  { id: 'mensal',       cls: 'p-lime', period: 'Mensal',        desc: 'Vouchers combustível, recarga e manutenção',    count: '1 a cada 2.000 bilhetes' },
  { id: 'trimestral',   cls: 'p-blue', period: 'Trimestral',    desc: 'Smartphone, capacete, kit manutenção e saúde',  count: '5 ganhadores' },
  { id: 'semestral',    cls: 'p-teal', period: 'Semestral',    desc: 'Scooter elétrica, notebook, smartphone premium', count: '5 ganhadores' },
  { id: 'grande_premio',cls: 'p-red',  period: 'Grande Prêmio', desc: 'Moto 0km ou PIX até R$ 30.000',                 count: '1 ganhador' },
]

// ── Componente Bônus Frequência ───────────────────────────────────────────────
function BonusFrequencia({ scans }) {
  const analise = analisarBonusFrequencia(scans)
  const concluidos = analise.filter(m => m.temEntrega).length
  const completo = concluidos === 3

  return (
    <div style={{
      background: completo ? 'rgba(197,211,42,.08)' : 'var(--card)',
      border: `1px solid ${completo ? 'rgba(197,211,42,.35)' : 'var(--border)'}`,
      borderRadius: 'var(--r2)', padding: '18px 16px', marginBottom: 16
    }}>
      {/* Título */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{
            fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '.04em',
            color: completo ? 'var(--lime)' : 'var(--off)'
          }}>
            ⚡ Bônus Frequência
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {completo
              ? '+10 bilhetes extras garantidos no fim do trimestre!'
              : `Entregue nos 3 meses do trimestre para ganhar +10 bilhetes extras`
            }
          </div>
        </div>
        {completo && (
          <div style={{
            fontFamily: 'var(--fd)', fontSize: 10, fontWeight: 700,
            letterSpacing: '.08em', textTransform: 'uppercase',
            color: 'var(--lime)', background: 'var(--lime-dim2)',
            border: '1px solid rgba(197,211,42,.3)',
            padding: '4px 10px', borderRadius: 100, flexShrink: 0
          }}>
            Garantido!
          </div>
        )}
      </div>

      {/* 3 meses */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {analise.map((m, i) => (
          <div key={i} style={{
            borderRadius: 'var(--r)',
            border: `1px solid ${m.temEntrega ? 'rgba(0,201,167,.4)' : m.atual ? 'rgba(0,174,239,.3)' : 'var(--border)'}`,
            background: m.temEntrega ? 'rgba(0,201,167,.1)' : m.atual ? 'var(--blue-dim)' : 'rgba(255,255,255,.03)',
            padding: '12px 8px', textAlign: 'center'
          }}>
            {/* Ícone */}
            <div style={{ fontSize: 20, marginBottom: 4 }}>
              {m.temEntrega ? '✅' : m.atual ? '📦' : '⏳'}
            </div>
            {/* Mês */}
            <div style={{
              fontFamily: 'var(--fd)', fontSize: 14, fontWeight: 800,
              color: m.temEntrega ? 'var(--teal)' : m.atual ? 'var(--blue)' : 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '.04em'
            }}>
              {m.nome}
            </div>
            {/* Status */}
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
              {m.temEntrega ? 'Concluído' : m.atual ? 'Em andamento' : 'Aguardando'}
            </div>
          </div>
        ))}
      </div>

      {/* Barra de progresso */}
      {!completo && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{concluidos}/3 meses com entrega</span>
            <span style={{ fontSize: 11, color: 'var(--lime)', fontWeight: 600 }}>
              {3 - concluidos} {3 - concluidos === 1 ? 'falta' : 'faltam'}
            </span>
          </div>
          <div className="prog-bar">
            <div className="prog-fill" style={{ width: `${(concluidos / 3) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Aba Resumo ────────────────────────────────────────────────────────────────
function AbaResumo({ tokensDisp, bilhetes, scans, animTokens, animBilhetes, progPct, convertendo, msgConversao, hConverter, proximosSorteios }) {

  // Monta cards de prêmios com dados dinâmicos de sorteio
  const prizes = PRIZES_BASE.map(p => {
    const s = proximosSorteios?.[p.id]
    return {
      ...p,
      data: s?.data || '—',
      extracao: s?.extracao ? `Ext. ${s.extracao}` : '—',
      diasRestantes: s?.diasRestantes,
    }
  })
  return (
    <>
      {/* Token hero */}
      <div className="token-hero fade-up">
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--lime)', marginBottom: 4 }}>Tokens</div>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 56, fontWeight: 900, color: 'var(--white)', lineHeight: 1 }}>{animTokens}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>disponíveis</div>
          </div>
          <div style={{ width: 1, height: 70, background: 'rgba(255,255,255,.12)', marginTop: 18, flexShrink: 0 }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 4 }}>Bilhetes</div>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 56, fontWeight: 900, color: 'var(--blue)', lineHeight: 1 }}>{animBilhetes}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>gerados</div>
          </div>
        </div>

        <div className="prog-labels">
          <span>{tokensDisp % 10}/10 para próximo bilhete</span>
          <strong>{10 - (tokensDisp % 10 || 10) === 10 ? 0 : 10 - (tokensDisp % 10)} faltam</strong>
        </div>
        <div className="prog-bar" style={{ marginBottom: tokensDisp >= 10 ? 14 : 0 }}>
          <div className="prog-fill" style={{ width: `${progPct}%` }} />
        </div>

        {tokensDisp >= 10 && (
          <button className="btn btn-lime" onClick={hConverter} disabled={convertendo} style={{ marginTop: 4 }}>
            {convertendo
              ? <><div className="spinner" style={{ color: 'var(--navy)' }} /> Convertendo...</>
              : <>🎟 Converter {Math.floor(tokensDisp / 10)} bilhete{Math.floor(tokensDisp / 10) > 1 ? 's' : ''}</>
            }
          </button>
        )}

        {msgConversao && (
          <div style={{
            textAlign: 'center', marginTop: 10, fontSize: 13, fontWeight: 700,
            color: msgConversao.startsWith('Erro') ? 'var(--red)' : 'var(--teal)',
            animation: 'fadeUp .4s ease both'
          }}>{msgConversao}</div>
        )}

        {tokensDisp === 0 && bilhetes === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5, textAlign: 'center' }}>
            Use o scanner para registrar entregas e acumular tokens.
          </p>
        )}
      </div>

      {/* Bônus Frequência */}
      <BonusFrequencia scans={scans} />

      {/* Prêmios */}
      <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 10 }}>
        Prêmios do Programa
      </div>
      <div className="prize-grid fade-up-3">
        {prizes.map((p, i) => (
          <div key={i} className={`prize-card ${p.cls}`}>
            <div className="prize-period">{p.period}</div>
            <div className="prize-desc">{p.desc}</div>
            <div className="prize-count">{p.count}</div>
            {/* Data e extração do próximo sorteio */}
            <div style={{
              marginTop: 6, paddingTop: 6,
              borderTop: '1px solid rgba(255,255,255,.1)',
              display: 'flex', flexDirection: 'column', gap: 2
            }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Próximo sorteio
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.85)' }}>
                📅 {p.data}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>
                {p.extracao}{p.diasRestantes != null ? ` · ${p.diasRestantes}d` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>
        ★ Semestral e Grande Prêmio: ativo nas entregas nos últimos 2 meses
      </p>
    </>
  )
}

// ── Aba Bilhetes ──────────────────────────────────────────────────────────────
function AbaBilhetes({ cpf }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    buscarBilhetes(cpf).then(d => { setLista(d); setLoading(false) })
  }, [cpf])

  // Agrupa por ciclo
  const porCiclo = lista.reduce((acc, b) => {
    if (!acc[b.ciclo]) acc[b.ciclo] = []
    acc[b.ciclo].push(b)
    return acc
  }, {})

  const cicloBonito = (ciclo) => {
    // Ex: "2025-T2" → "Trimestre 2 · 2025"
    const [ano, t] = ciclo.split('-')
    return `Trimestre ${t?.replace('T','')} · ${ano}`
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}><div className="spinner" style={{ width: 28, height: 28, borderWidth: 3, color: 'var(--lime)', margin: '0 auto' }} /></div>

  if (lista.length === 0) return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎟</div>
      <div style={{ fontFamily: 'var(--fd)', fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
        Nenhum bilhete ainda
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Acumule 10 tokens e converta em bilhetes de sorteio na aba Resumo.
      </p>
    </div>
  )

  return (
    <div className="flex-col gap-3">
      {/* Total */}
      <div style={{
        background: 'var(--blue-dim)', border: '1px solid rgba(0,174,239,.25)',
        borderRadius: 'var(--r)', padding: '14px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ fontSize: 13, color: 'var(--off)' }}>Total de bilhetes gerados</span>
        <span style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 900, color: 'var(--blue)' }}>{lista.length}</span>
      </div>

      {/* Por ciclo */}
      {Object.entries(porCiclo).map(([ciclo, bilhetes]) => (
        <div key={ciclo} className="card">
          {/* Cabeçalho do ciclo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--blue)' }}>
                {cicloBonito(ciclo)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {bilhetes.length} bilhete{bilhetes.length > 1 ? 's' : ''} · {bilhetes.length * 10} tokens convertidos
              </div>
            </div>
            <div style={{
              fontFamily: 'var(--fd)', fontSize: 22, fontWeight: 900, color: 'var(--blue)',
              background: 'var(--blue-dim)', border: '1px solid rgba(0,174,239,.2)',
              padding: '4px 14px', borderRadius: 'var(--r)'
            }}>
              {bilhetes.length}
            </div>
          </div>

          {/* Lista de bilhetes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {bilhetes.map((b, i) => (
              <div key={b.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0',
                borderBottom: i < bilhetes.length - 1 ? '1px solid var(--border)' : 'none'
              }}>
                {/* Número do bilhete */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: 'var(--blue-dim)', border: '1px solid rgba(0,174,239,.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16
                  }}>🎟</div>
                  <div>
                    <div style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 900, color: 'var(--white)', letterSpacing: '.04em' }}>
                      #{b.numero}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtDataCurta(b.created_at)}</div>
                  </div>
                </div>
                {/* Tokens usados */}
                <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
                  {b.tokens_usados} tokens
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Aba Histórico ─────────────────────────────────────────────────────────────
function AbaHistorico({ cpf }) {
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(1)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [temMais, setTemMais] = useState(true)
  const POR_PAG = 10

  useEffect(() => {
    buscarHistoricoScans(cpf, POR_PAG).then(d => {
      setScans(d)
      setTemMais(d.length === POR_PAG)
      setLoading(false)
    })
  }, [cpf])

  async function carregarMais() {
    setCarregandoMais(true)
    const novos = await buscarHistoricoScans(cpf, POR_PAG * (pagina + 1))
    setScans(novos)
    setPagina(p => p + 1)
    setTemMais(novos.length === POR_PAG * (pagina + 1))
    setCarregandoMais(false)
  }

  const corToken = (s) => {
    if (s.tokens_creditados > 0) return 'var(--teal)'
    return 'var(--red)'
  }

  const labelSituacao = (sit) => {
    const map = {
      entregue:          '✅ Entregue',
      falha_sem_geocod:  '⚠️ Falha cadastral',
      falha_dentro_raio: '📍 Falha — presença confirmada',
      falha_fora_raio:   '❌ Falha — sem presença',
      cancelado:         '🚫 Cancelado',
      em_transito:       '🚚 Em trânsito',
    }
    return map[sit] || sit?.replace(/_/g, ' ') || '—'
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28, borderWidth: 3, color: 'var(--lime)', margin: '0 auto' }} /></div>

  if (scans.length === 0) return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
      <div style={{ fontFamily: 'var(--fd)', fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
        Nenhuma entrega ainda
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Use o scanner para registrar suas entregas e acompanhar o histórico aqui.
      </p>
    </div>
  )

  return (
    <div>
      {/* Total */}
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        {scans.length} entrega{scans.length !== 1 ? 's' : ''} registrada{scans.length !== 1 ? 's' : ''}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        {scans.map((s, i) => (
          <div key={s.id} style={{
            padding: '13px 0',
            borderBottom: i < scans.length - 1 ? '1px solid var(--border)' : 'none'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                {/* Número do pedido */}
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--off)', marginBottom: 3 }}>
                  {s.numero_pedido}
                </div>
                {/* Data */}
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
                  {fmtData(s.created_at)}
                </div>
                {/* Situação */}
                <div style={{ fontSize: 11, color: s.tokens_creditados > 0 ? 'var(--teal)' : 'var(--muted)' }}>
                  {labelSituacao(s.situacao)}
                </div>
                {/* GPS */}
                {s.lat_scan && (
                  <a href={`https://maps.google.com/?q=${s.lat_scan},${s.lng_scan}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 10, color: 'var(--blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                    📍 Ver no mapa ↗
                  </a>
                )}
              </div>
              {/* Tokens */}
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                <div style={{ fontFamily: 'var(--fd)', fontSize: 22, fontWeight: 900, color: corToken(s) }}>
                  {s.tokens_creditados > 0 ? `+${s.tokens_creditados}` : '0'}
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>tokens</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Botão ver mais */}
      {temMais && (
        <button className="btn btn-outline" onClick={carregarMais} disabled={carregandoMais}>
          {carregandoMais
            ? <><div className="spinner" style={{ color: 'var(--white)' }} /> Carregando...</>
            : 'Ver mais entregas'
          }
        </button>
      )}
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────────────────────
export default function Dashboard() {
  const nav = useNavigate()
  const [entregador,   setEntregador]   = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [tokensDisp,   setTokensDisp]   = useState(0)
  const [bilhetes,     setBilhetes]     = useState(0)
  const [scans,        setScans]        = useState([])
  const [convertendo,  setConvertendo]  = useState(false)
  const [msgConversao, setMsgConversao] = useState('')
  const [abaAtiva,     setAbaAtiva]     = useState(0)
  const [atualizandoFoto, setAtualizandoFoto] = useState(false)
  const [proximosSorteios, setProximosSorteios] = useState(null)
  const fotoRef = useRef()
  const fotoGaleriaRef = useRef()

  async function hAtualizarFoto(e) {
    const arquivo = e.target.files[0]
    if (!arquivo || !entregador) return
    setAtualizandoFoto(true)
    try {
      const url = await atualizarFotoPerfil(entregador.cpf, arquivo)
      setEntregador(prev => ({ ...prev, selfie_url: url }))
    } catch {}
    setAtualizandoFoto(false)
  }

  const progPct    = Math.min((tokensDisp % 10) / 10 * 100, 100)
  const animTokens = useAnimatedValue(tokensDisp, 800)
  const animBilhetes = useAnimatedValue(bilhetes, 800)

  async function carregarSaldo(cpf) {
    const { tokensDisponiveis, bilhetes: qtd } = await buscarTokensNaoConvertidos(cpf)
    setTokensDisp(tokensDisponiveis)
    setBilhetes(qtd)
  }

  async function hConverter() {
    if (tokensDisp < 10) return
    setConvertendo(true); setMsgConversao('')
    try {
      const { gerados } = await converterTokensEmBilhetes(entregador.cpf)
      setMsgConversao(`+${gerados} bilhete${gerados > 1 ? 's' : ''} gerado${gerados > 1 ? 's' : ''}! 🎟`)
      await carregarSaldo(entregador.cpf)
      setTimeout(() => setMsgConversao(''), 4000)
    } catch {
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
    buscarHistoricoScans(cpf, 50).then(s => setScans(s))
    // Busca datas dos próximos sorteios
    buscarProximosSorteios().then(d => { if (d?.sorteios) setProximosSorteios(d.sorteios) }).catch(() => {})
  }, [])

  if (loading) return (
    <div className="page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, color: 'var(--lime)' }} />
    </div>
  )

  const nome1     = entregador?.nome?.split(' ')[0] || ''
  const selfieUrl = entregador?.selfie_url || null

  const ABAS = ['Resumo', 'Bilhetes', 'Histórico']

  return (
    <div className="page">
      {/* Header */}
      <div className="header">
        <div style={{ flex: 1 }}>
          <Logo size="md" />
          <div className="header-sub">Olá, {nome1}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Foto clicável para alterar — abre galeria diretamente */}
          <div style={{ position: 'relative', flexShrink: 0 }}
            onClick={() => fotoGaleriaRef.current?.click()}
            title="Toque para alterar a foto">
            {selfieUrl ? (
              <img src={selfieUrl} alt={nome1} style={{
                width: 38, height: 38, borderRadius: '50%', objectFit: 'cover',
                border: '2px solid var(--lime)', boxShadow: '0 0 10px rgba(197,211,42,.3)',
                cursor: 'pointer', opacity: atualizandoFoto ? .5 : 1
              }} />
            ) : (
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'var(--card)', border: '2px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, cursor: 'pointer'
              }}>👤</div>
            )}
            {/* Ícone de câmera sobre a foto */}
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 16, height: 16, borderRadius: '50%',
              background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, cursor: 'pointer', border: '1.5px solid var(--navy)'
            }}>📷</div>
          </div>
          {/* Input câmera (com capture) */}
          <input ref={fotoRef} type="file" accept="image/*" capture="user"
            style={{ display: 'none' }} onChange={hAtualizarFoto} />
          {/* Input galeria (SEM capture) — abre seletor de arquivos */}
          <input ref={fotoGaleriaRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={hAtualizarFoto} />
          <div style={{
            fontFamily: 'var(--fd)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
            textTransform: 'uppercase', color: 'var(--lime)',
            background: 'var(--lime-dim2)', border: '1px solid rgba(197,211,42,.25)',
            padding: '4px 10px', borderRadius: 100
          }}>Ativo</div>
        </div>
      </div>

      {/* Botão scanner */}
      <div style={{ padding: '12px 20px 0', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <button className="btn btn-blue" style={{ gap: 10 }} onClick={() => nav('/scanner')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h2v10H7zM11 7h2v10h-2zM15 7h2v10h-2z"/>
          </svg>
          Registrar Entrega
        </button>
      </div>

      {/* Abas */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border)',
        marginTop: 16, paddingLeft: 20, paddingRight: 20,
        maxWidth: 480, margin: '16px auto 0', width: '100%'
      }}>
        {ABAS.map((a, i) => (
          <button key={i} onClick={() => setAbaAtiva(i)} style={{
            flex: 1, background: 'none', border: 'none', cursor: 'pointer',
            paddingBottom: 12, paddingTop: 4,
            fontSize: 13, fontWeight: 700, fontFamily: 'var(--fb)',
            color: abaAtiva === i ? 'var(--lime)' : 'var(--muted)',
            borderBottom: abaAtiva === i ? '2px solid var(--lime)' : '2px solid transparent',
            transition: 'color .15s, border-color .15s'
          }}>{a}</button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="container" style={{ paddingTop: 18, paddingBottom: 40 }}>
        {abaAtiva === 0 && (
          <AbaResumo
            tokensDisp={tokensDisp} bilhetes={bilhetes} scans={scans}
            animTokens={animTokens} animBilhetes={animBilhetes}
            progPct={progPct} convertendo={convertendo}
            msgConversao={msgConversao} hConverter={hConverter}
            proximosSorteios={proximosSorteios}
          />
        )}
        {abaAtiva === 1 && entregador && <AbaBilhetes cpf={entregador.cpf} />}
        {abaAtiva === 2 && entregador && <AbaHistorico cpf={entregador.cpf} />}

        {/* Sair */}
        <button className="btn btn-ghost mt-6"
          style={{ color: 'var(--red)', fontFamily: 'var(--fb)', fontWeight: 600 }}
          onClick={() => { localStorage.removeItem('entregador_cpf'); nav('/') }}>
          Sair da conta
        </button>
      </div>
    </div>
  )
}
