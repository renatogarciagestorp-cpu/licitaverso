// Configuração pública do Licitacon.
// Preencha com os dados do seu projeto Supabase (Project Settings → API):
//   supabaseUrl     → "Project URL"           (ex.: https://abcdxyz.supabase.co)
//   supabaseAnonKey → chave "anon" / "publishable" (é pública por natureza: quem protege os dados
//                     são as regras de acesso do banco; NUNCA coloque aqui a chave "service_role"/"secret").
// Enquanto estiver vazio, o site funciona em modo demonstração (sem contas).
window.LICITAVERSO_CONFIG = {
  supabaseUrl: "https://umnhhztdqersjfrzqcea.supabase.co",
  supabaseAnonKey: "sb_publishable_8nhINIJ76iix1902VoqGcg_cELL4u3e",
  // Medição de visitas (Cloudflare Web Analytics, gratuita e sem cookies). Cole aqui o "token" do
  // trecho que o Cloudflare mostra ao adicionar o site. Só é carregada para quem aceita cookies de análise.
  cloudflareAnalytics: "77af40fc4d7f494ab442d9b51274788c",
  // Verificação contra robôs (Cloudflare Turnstile): a "Site Key" (pública) do widget criado no painel da Cloudflare.
  // A "Secret Key" fica só no Supabase (Authentication → Attack Protection), nunca aqui. Vazio = sem verificação.
  turnstileSiteKey: "0x4AAAAAAF7W9spVgeoyIwVh",
  // Botão "Entrar com o Google": ligar (true) só depois de configurar a credencial do Google no Supabase.
  googleLogin: true
};
