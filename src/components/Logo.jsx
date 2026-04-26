// Logo "Entrega+App" — mesmo padrão do cartaz, "App" com p minúsculo
export default function Logo({ size = 'md', style = {} }) {
  const sizes = {
    sm: { main: 18 },
    md: { main: 22 },
    lg: { main: 32 },
    xl: { main: 42 },
  }
  const s = sizes[size] || sizes.md
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', lineHeight: 1, ...style }}>
      <span style={{
        fontFamily: 'var(--fd)', fontWeight: 900, fontSize: s.main,
        color: 'var(--white)', letterSpacing: '-.01em', textTransform: 'uppercase'
      }}>Entrega</span>
      <span style={{
        fontFamily: 'var(--fd)', fontWeight: 900, fontSize: s.main,
        color: 'var(--lime)', letterSpacing: '-.01em'
      }}>+</span>
      <span style={{
        fontFamily: 'var(--fd)', fontWeight: 900, fontSize: s.main,
        color: 'var(--blue)', letterSpacing: '-.01em'
      }}>App</span>
    </span>
  )
}
