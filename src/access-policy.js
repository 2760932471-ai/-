export function accessPolicy(env = process.env) {
 const codespaces=env.CODESPACES==='true';
 if(env.WORKSPACE_ACCESS && env.WORKSPACE_ACCESS!=='account') throw new Error('WORKSPACE_ACCESS 可设为 account；本机使用请留空');
 const account=env.WORKSPACE_ACCESS==='account'||(!codespaces&&(env.NODE_ENV==='production'||env.RENDER==='true'));
 const mode=account?'account':codespaces?'codespaces':'local';
 return {mode,authenticationRequired:account,host:mode==='local'||env.ENABLE_CODEX_LOCAL==='1'?'127.0.0.1':'0.0.0.0',
  trustHttpsProxy:env.RENDER==='true'||env.WORKSPACE_TRUST_HTTPS_PROXY==='1'};
}
