import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { cadastrarEntregador, buscarEntregadorPorCPF } from '../lib/supabase'
import { detectarPlataforma } from '../hooks/usePWAInstall'

/* ── CPF ── */
function validarCPF(cpf) {
  const c = cpf.replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i)
  let r = (s * 10) % 11; if (r >= 10) r = 0; if (r !== +c[9]) return false
  s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i)
  r = (s * 10) % 11; if (r >= 10) r = 0; return r === +c[10]
}
function fmtCPF(v) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
function fmtPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

const STEPS = ['CPF', 'Dados', 'Selfie', 'Termos']

const ChevR = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
const ChevL = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
const CamIco = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
const CheckIco = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>

export default function Register() {
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const [cpf, setCpf] = useState('')
  const [cpfErr, setCpfErr] = useState('')
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [selfieFile, setSelfieFile] = useState(null)
  const [selfieUrl, setSelfieUrl] = useState(null)
  const [termos, setTermos] = useState(false)

  const fileRef = useRef()
  const videoRef = useRef()
  const [camera, setCamera] = useState(false)
  const [stream, setStream] = useState(null)

  /* ── Step handlers ── */
  async function hCPF() {
    if (!validarCPF(cpf)) { setCpfErr('CPF inválido. Verifique e tente novamente.'); return }
    setLoading(true); setCpfErr('')
    try {
      const ex = await buscarEntregadorPorCPF(cpf.replace(/\D/g, ''))
      if (ex) { localStorage.setItem('entregador_cpf', ex.cpf); nav('/painel'); return }
    } catch {}
    setLoading(false); setStep(1)
  }

  function hDados() {
    if (nome.trim().length < 3) { setErro('Digite seu nome completo.'); return }
    if (!cidade.trim()) { setErro('Digite sua cidade.'); return }
    if (!uf) { setErro('Selecione o estado (UF).'); return }
    setErro(''); setStep(2)
  }

  function hFile(e) {
    const f = e.target.files[0]; if (!f) return
    setSelfieFile(f); setSelfieUrl(URL.createObjectURL(f)); pararCamera()
  }

  async function abrirCamera() {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      setStream(ms); setCamera(true)
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = ms }, 80)
    } catch { fileRef.current?.click() }
  }

  function tirarFoto() {
    if (!videoRef.current) return
    const cv = document.createElement('canvas'); cv.width = cv.height = 480
    const ctx = cv.getContext('2d'); const v = videoRef.current
    const sz = Math.min(v.videoWidth, v.videoHeight)
    ctx.drawImage(v, (v.videoWidth - sz) / 2, (v.videoHeight - sz) / 2, sz, sz, 0, 0, 480, 480)
    cv.toBlob(b => {
      const f = new File([b], 'selfie.jpg', { type: 'image/jpeg' })
      setSelfieFile(f); setSelfieUrl(URL.createObjectURL(b)); pararCamera()
    }, 'image/jpeg', .85)
  }

  function pararCamera() {
    stream?.getTracks().forEach(t => t.stop()); setStream(null); setCamera(false)
  }

  async function hFinalizar() {
    if (!termos) { setErro('Aceite o regulamento para continuar.'); return }
    setLoading(true); setErro('')
    try {
      const e = await cadastrarEntregador({ cpf, nome, telefone: tel, cidade, uf, selfieFile, plataforma: detectarPlataforma() })
      localStorage.setItem('entregador_cpf', e.cpf); setStep(4)
    } catch { setErro('Erro ao finalizar. Tente novamente.') }
    setLoading(false)
  }

  function back() { pararCamera(); setErro(''); setStep(s => s - 1) }

  /* ── Shared layout ── */
  return (
    <div className="page">
      {/* Header */}
      <div className="header">
        {step > 0 && step < 4 && (
          <button onClick={back}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, marginRight: 6 }}>
            <ChevL />
          </button>
        )}
        <div>
          <div className="header-logo">
            <span>entrega</span><span className="lime">+</span>
          </div>
          {step < 4 && <div className="header-sub">Etapa {step + 1} de {STEPS.length}</div>}
        </div>
      </div>

      <div className="container" style={{ paddingTop: 22, paddingBottom: 40, flex: 1 }}>
        {step < 4 && (
          <>
            <div className="steps-track">
              {STEPS.map((_, i) => (
                <div key={i} className={`step-seg ${i < step ? 'done' : i === step ? 'active' : ''}`} />
              ))}
            </div>
            <div className="step-lbl">{STEPS[step]}</div>
          </>
        )}

        {/* ── Step 0: CPF ── */}
        {step === 0 && (
          <div className="fade-up">
            <div className="card">
              <div className="card-title">Digite seu CPF</div>
              <div className="card-sub">Seus dados são protegidos pela LGPD e usados exclusivamente no programa.</div>
              <div className="field">
                <label className="label">CPF</label>
                <input className={`input ${cpfErr ? 'err' : ''}`}
                  type="tel" inputMode="numeric" placeholder="000.000.000-00"
                  value={cpf} onChange={e => { setCpf(fmtCPF(e.target.value)); setCpfErr('') }}
                  onKeyDown={e => e.key === 'Enter' && hCPF()} autoFocus />
                {cpfErr && <span className="field-error">{cpfErr}</span>}
              </div>
              <button className="btn btn-lime mt-6"
                onClick={hCPF} disabled={loading || cpf.replace(/\D/g,'').length < 11}>
                {loading ? <><div className="spinner" /> Verificando...</> : <>Continuar <ChevR /></>}
              </button>
            </div>
            <div className="alert alert-info mt-4">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span>Já cadastrado? Vamos te redirecionar direto para o seu painel.</span>
            </div>
          </div>
        )}

        {/* ── Step 1: Dados ── */}
        {step === 1 && (
          <div className="fade-up">
            <div className="card">
              <div className="card-title">Seus dados</div>
              <div className="card-sub">Nome completo é obrigatório para identificar o ganhador nos sorteios.</div>
              <div className="flex-col gap-3">
                <div className="field">
                  <label className="label">Nome completo *</label>
                  <input className="input" type="text" placeholder="Seu nome completo"
                    value={nome} onChange={e => setNome(e.target.value)} autoFocus autoComplete="name" />
                </div>
                <div className="field">
                  <label className="label">WhatsApp <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11, color: 'var(--muted)' }}>(opcional)</span></label>
                  <input className="input" type="tel" inputMode="numeric" placeholder="(11) 99999-9999"
                    value={tel} onChange={e => setTel(fmtPhone(e.target.value))} autoComplete="tel" />
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Para receber avisos de sorteios quando disponível</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">Cidade *</label>
                    <input className="input" type="text" placeholder="Sua cidade"
                      value={cidade} onChange={e => setCidade(e.target.value)} autoComplete="address-level2" />
                  </div>
                  <div className="field" style={{ width: 80 }}>
                    <label className="label">UF *</label>
                    <select className="input" value={uf} onChange={e => setUf(e.target.value)}>
                      <option value="">—</option>
                      {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {erro && <div className="alert alert-err mt-4"><span>{erro}</span></div>}
              <button className="btn btn-lime mt-6" onClick={hDados} disabled={nome.trim().length < 3}>
                Continuar <ChevR />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Selfie ── */}
        {step === 2 && (
          <div className="fade-up">
            <div className="card">
              <div className="card-title">Sua selfie</div>
              <div className="card-sub">Confirma sua identidade e previne fraudes no programa.</div>

              {camera ? (
                <div style={{ position: 'relative', marginBottom: 14 }}>
                  <video ref={videoRef} autoPlay playsInline muted
                    style={{ width: '100%', borderRadius: 12, maxHeight: 280, objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button className="btn btn-lime" onClick={tirarFoto} style={{ flex: 1 }}>Tirar foto</button>
                    <button className="btn btn-outline" onClick={pararCamera} style={{ flex: 1 }}>Cancelar</button>
                  </div>
                </div>
              ) : selfieUrl ? (
                <div className="selfie-wrap" style={{ marginBottom: 12 }}>
                  <img src={selfieUrl} alt="Selfie" className="selfie-preview" />
                  <button className="btn btn-ghost" style={{ width: 'auto' }}
                    onClick={() => { setSelfieUrl(null); setSelfieFile(null) }}>
                    Tirar outra
                  </button>
                </div>
              ) : (
                <div className="selfie-wrap" style={{ marginBottom: 12 }}>
                  <div className="selfie-ph" onClick={abrirCamera}>
                    <CamIco />
                    <span>Toque para a câmera</span>
                  </div>
                  <button className="btn btn-outline" style={{ marginTop: 6 }}
                    onClick={() => fileRef.current?.click()}>
                    Ou escolher da galeria
                  </button>
                </div>
              )}

              <input ref={fileRef} type="file" accept="image/*" capture="user"
                style={{ display: 'none' }} onChange={hFile} />

              {erro && <div className="alert alert-err mt-4"><span>{erro}</span></div>}
              <button className="btn btn-lime mt-6"
                onClick={() => { if (!selfieFile) { setErro('Selfie obrigatória.'); return } setErro(''); setStep(3) }}
                disabled={!selfieFile}>
                Continuar <ChevR />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Termos ── */}
        {step === 3 && (
          <div className="fade-up">
            <div className="card">
              <div className="card-title">Regulamento</div>
              <div className="card-sub">Leia os pontos principais antes de confirmar.</div>

              <div className="terms-box">
                <strong>Participação:</strong> Voluntária, gratuita e sem exclusividade. Você pode trabalhar para outros aplicativos normalmente.<br /><br />
                <strong>Tokens:</strong> Cada entrega Cielo gera 10 tokens. Falha com geolocalização válida: 4 tokens. Endereço não geocodificado: 10 tokens (falha cadastral).<br /><br />
                <strong>Bilhetes:</strong> A cada 10 tokens você converte em 1 bilhete de sorteio. Tokens expiram ao fim de cada trimestre.<br /><br />
                <strong>Sorteios:</strong> Mensais, trimestrais, semestrais e Grande Prêmio Anual — todos vinculados à Loteria Federal.<br /><br />
                <strong>Elegibilidade prêmios maiores:</strong> Para Semestral e Grande Prêmio, mantenha-se ativo nas entregas nos últimos 2 meses.<br /><br />
                <strong>Sem vínculo:</strong> O programa não configura relação de emprego com a Cielo.<br /><br />
                <strong>Privacidade:</strong> Seus dados são usados exclusivamente para o programa, conforme a LGPD.
              </div>

              <label className={`chk-label ${termos ? 'on' : ''}`}
                onClick={() => setTermos(t => !t)}>
                <div className={`chk-box ${termos ? 'on' : ''}`}>
                  {termos && <CheckIco />}
                </div>
                <span className="chk-text">
                  Li e aceito o regulamento do Cielo Entrega+ e autorizo o uso dos meus dados.
                </span>
              </label>

              {erro && <div className="alert alert-err mt-4"><span>{erro}</span></div>}
              <button className="btn btn-lime mt-6" onClick={hFinalizar} disabled={!termos || loading}>
                {loading ? <><div className="spinner" /> Cadastrando...</> : 'Confirmar cadastro'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Sucesso ── */}
        {step === 4 && (
          <div className="fade-up" style={{ paddingTop: 40, textAlign: 'center' }}>
            <div className="ok-icon">
              <CheckIco />
            </div>
            <h2 style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
              Bem-vindo!
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 6 }}>
              Cadastro concluído,
            </p>
            <p style={{ fontFamily: 'var(--fd)', fontSize: 20, fontWeight: 800, color: 'var(--lime)', marginBottom: 28, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {nome.split(' ')[0]}!
            </p>

            <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: 24 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span>Adicione o Cielo Entrega+ à tela inicial do celular para acesso rápido e notificações de sorteios.</span>
            </div>

            <button className="btn btn-lime" onClick={() => nav('/painel')}>
              Ir para meu painel <ChevR />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
