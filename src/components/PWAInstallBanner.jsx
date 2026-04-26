import { useState, useEffect } from 'react'
import { detectarPlataforma, isPWAInstalado } from '../hooks/usePWAInstall'

export default function PWAInstallBanner({ onInstalado }) {
  const [plataforma, setPlataforma] = useState('')
  const [instalado,  setInstalado]  = useState(false)
  const [instalando, setInstalando] = useState(false)
  const [temPrompt,  setTemPrompt]  = useState(false)

  useEffect(() => {
    setPlataforma(detectarPlataforma())
    setInstalado(isPWAInstalado())

    // Verifica se o prompt do Android já está disponível
    const verificar = () => setTemPrompt(!!window.__pwaInstallPrompt)
    verificar()

    // Aguarda até 3s caso o evento ainda não tenha disparado
    const t = setTimeout(verificar, 3000)
    return () => clearTimeout(t)
  }, [])

  // Já instalado — não mostra nada
  if (instalado) return (
    <div className="alert alert-ok" style={{ marginTop: 16 }}>
      <span>✅ Entrega+App já está instalado no seu celular!</span>
    </div>
  )

  // ── Android: botão que aciona o prompt nativo ──────────────────────────────
  if (plataforma === 'android') {
    async function instalarAndroid() {
      const prompt = window.__pwaInstallPrompt
      if (!prompt) return
      setInstalando(true)
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') {
        window.__pwaInstallPrompt = null
        setInstalado(true)
        onInstalado?.()
      }
      setInstalando(false)
    }

    return (
      <div style={{
        background: 'var(--blue-dim)', border: '1px solid rgba(0,174,239,.28)',
        borderRadius: 'var(--r2)', padding: '18px 16px', marginTop: 16
      }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--blue)', marginBottom: 6 }}>
          📲 Instalar na tela inicial
        </div>
        <p style={{ fontSize: 13, color: 'var(--off)', lineHeight: 1.55, marginBottom: 14 }}>
          Adicione o Entrega+App na tela inicial do seu celular para acesso rápido e receber notificações de sorteios.
        </p>
        {temPrompt ? (
          <button className="btn btn-blue" onClick={instalarAndroid} disabled={instalando}>
            {instalando
              ? <><div className="spinner" /> Aguardando...</>
              : '📲 Instalar o app agora'
            }
          </button>
        ) : (
          // Fallback: prompt não disponível ainda (Chrome pode demorar)
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            Toque no menu <strong style={{ color: 'var(--off)' }}>⋮</strong> do Chrome → <strong style={{ color: 'var(--off)' }}>"Adicionar à tela inicial"</strong>
          </div>
        )}
      </div>
    )
  }

  // ── iOS: instrução manual passo a passo ────────────────────────────────────
  if (plataforma === 'ios') {
    return (
      <div style={{
        background: 'var(--blue-dim)', border: '1px solid rgba(0,174,239,.28)',
        borderRadius: 'var(--r2)', padding: '18px 16px', marginTop: 16
      }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--blue)', marginBottom: 6 }}>
          📲 Instalar na tela inicial
        </div>
        <p style={{ fontSize: 13, color: 'var(--off)', lineHeight: 1.55, marginBottom: 14 }}>
          No iPhone/iPad, siga os passos abaixo no <strong style={{ color: 'var(--white)' }}>Safari</strong>:
        </p>
        {[
          { n: '1', txt: 'Toque no ícone de compartilhar', ico: '⬆️' },
          { n: '2', txt: 'Role para baixo e toque em "Adicionar à Tela de Início"', ico: '➕' },
          { n: '3', txt: 'Toque em "Adicionar" no canto superior direito', ico: '✅' },
        ].map(p => (
          <div key={p.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 800, color: 'var(--white)'
            }}>{p.n}</div>
            <div style={{ fontSize: 13, color: 'var(--off)', lineHeight: 1.5, paddingTop: 4 }}>
              {p.ico} {p.txt}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
          ⚠️ Funciona apenas no Safari. Se estiver usando Chrome no iOS, abra entregamaisapp.com.br no Safari.
        </div>
      </div>
    )
  }

  // Desktop ou outro — instrução genérica
  return (
    <div className="alert alert-info" style={{ marginTop: 16 }}>
      <span>💡 Acesse pelo celular para instalar o app na tela inicial e receber notificações.</span>
    </div>
  )
}
