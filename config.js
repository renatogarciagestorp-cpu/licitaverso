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
  cloudflareAnalytics: "77af40fc4d7f494ab442d9b51274788c"
};
