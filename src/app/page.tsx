export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>GitHub-i18n API</h1>
      <p>Backend is running. See 后端API接口文档.md for routes.</p>
      <ul>
        <li>
          <a href="/api/meta/app">GET /api/meta/app</a>
        </li>
        <li>
          <a href="/api/meta/languages">GET /api/meta/languages</a>
        </li>
        <li>
          <a href="/api/auth/signin">Sign in</a>
        </li>
      </ul>
    </main>
  );
}
