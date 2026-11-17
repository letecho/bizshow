export default function HomePage() {
  return (
    <main style={{ maxWidth: 880, margin: '48px auto', padding: '0 20px' }}>
      <header style={{ marginBottom: 32 }}>
        <span style={{ background: '#ccfbf1', color: '#0f766e', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
          Multilingual Life Support in Japan
        </span>
        <h1 style={{ fontSize: 28, marginTop: 12 }}>在日外国人向けサービス検索サイト</h1>
        <p style={{ color: '#475569' }}>
          医療・ビザ相談・住居・通信など、多言語対応サービスを地域・言語別に検索できます。
        </p>
      </header>
      <section style={{ background: '#ffffff', padding: 24, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>対応言語 / Supported Languages</h2>
        <ul style={{ display: 'flex', gap: 12, listStyle: 'none', padding: 0 }}>
          <li>🇯🇵 日本語</li>
          <li>🇺🇸 English</li>
          <li>🇨🇳 中文</li>
          <li>🇻🇳 Tiếng Việt</li>
        </ul>
      </section>
    </main>
  );
}
