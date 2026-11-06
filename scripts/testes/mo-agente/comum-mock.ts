// Substitui _shared/comum.ts no teste do mo-agente: sem banco nem login (usuário administrador fictício, arquivos locais).
export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
export function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
export function erro(mensagem: string, status = 400): Response { return resposta({ erro: mensagem }, status); }
const ARQ: Record<string, string> = JSON.parse(Deno.env.get("TESTE_ARQUIVOS") || "{}");
const cadeia = (final: unknown) => { const q: any = new Proxy({}, { get: (_t, p) => p === "then" ? undefined : p === "maybeSingle" || p === "single" ? async () => ({ data: final, error: null }) : () => q }); return q; };
export function clienteServico(): any {
  return {
    from: (t: string) => cadeia(t === "perfis" ? { admin: true } : null),
    rpc: async (nome: string) => ({ data: nome === "plano_vigente" ? "pro" : null, error: null }),
    storage: { from: () => ({ download: async (c: string) => ARQ[c] ? { data: new Blob([await Deno.readFile(ARQ[c])]), error: null } : { data: null, error: { message: "não achado" } } }) },
  };
}
export async function usuarioDaRequisicao(_req: Request, _admin: unknown) { return { id: "teste" }; }
export function nivelDoToken(_req: Request): string { return "aal2"; }
export function segredoConfere(_req: Request): boolean { return true; }
