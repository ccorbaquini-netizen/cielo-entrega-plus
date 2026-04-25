import { useEffect, useRef } from 'react'
import { registrarInstalacaoPWA } from '../lib/supabase'

// Detecta instalação do PWA e registra no Supabase
export function usePWAInstall() {
  const deferredPrompt = useRef(null)

  useEffect(() => {
    // Captura o evento de prompt de instalação (Android/Chrome)
    const handleBeforeInstall = (e) => {
      e.preventDefault()
      deferredPrompt.current = e
      // Armazena para uso no banner de instalação (Módulo 3)
      window.__pwaInstallPrompt = e
    }

    // Confirma que o PWA foi instalado
    const handleInstalled = () => {
      const cpf = localStorage.getItem('entregador_cpf')
      if (cpf) registrarInstalacaoPWA(cpf)
      window.__pwaInstallPrompt = null
      deferredPrompt.current = null
    }

    // Detecta se está rodando em modo standalone (já instalado)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    if (isStandalone) {
      const cpf = localStorage.getItem('entregador_cpf')
      if (cpf) registrarInstalacaoPWA(cpf)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])
}

// Detecta plataforma do usuário
export function detectarPlataforma() {
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'web'
}

// Verifica se está em modo standalone (PWA instalado)
export function isPWAInstalado() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}
