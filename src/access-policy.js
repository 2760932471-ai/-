// Codespaces authenticates access at its private forwarded port. Old app tokens
// must not override that mode. Keep the port Private in the Codespaces Ports panel.
export function accessPolicy(env = process.env) {
  const codespaces = env.CODESPACES === 'true';
  const token = codespaces ? '' : (env.PLATFORM_TOKEN || '');
  const mode = codespaces ? 'codespaces' : token ? 'token' : 'local';
  return {
    mode,
    authenticationRequired: !!token,
    host: env.ENABLE_CODEX_LOCAL === '1' || mode === 'local' ? '127.0.0.1' : '0.0.0.0',
    accepts: authorization => !token || authorization === `Bearer ${token}`,
  };
}
