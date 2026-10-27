// Envio de e-mails transacionais pela API da Brevo (BREVO_API_KEY, EMAIL_REMETENTE).

export const SITE = (Deno.env.get("SITE_URL") || "https://renatogarciagestorp-cpu.github.io/licitaverso/").split(",")[0].trim();

export function moldura(titulo: string, paragrafos: string[], botao?: { texto: string; url: string }, rodape?: string, preferencia = "Plano e cobrança") {
  const ps = paragrafos.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3D5058">${p}</p>`).join("");
  const b = botao
    ? `<p style="margin:8px 0 22px"><a href="${botao.url}" style="display:inline-block;background:#0FA36B;color:#06251A;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 22px;border-radius:10px">${botao.texto}</a></p>`
    : "";
  const r = rodape ? `<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#6A7B82">${rodape}</p>` : "";
  return `<div style="margin:0;padding:24px 12px;background:#F6F8F7;font-family:Arial,Helvetica,sans-serif;color:#0B1F2A">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #E3E9E8;border-radius:16px;overflow:hidden">
    <div style="background:#0A1F2A;padding:18px 24px">
      <span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:#0FA36B;color:#06251A;font-weight:bold;text-align:center;line-height:28px;font-size:15px">L</span>
      <span style="color:#ffffff;font-weight:bold;font-size:17px;vertical-align:middle;margin-left:8px">Licitacon</span>
    </div>
    <div style="padding:26px 24px 8px"><h1 style="margin:0 0 14px;font-size:21px;line-height:1.3">${titulo}</h1>${ps}${b}${r}</div>
    <div style="padding:14px 24px;border-top:1px solid #EDF1F0;font-size:12px;color:#7A8B91">Você recebe este aviso porque tem conta no Licitacon. Para deixar de receber, desligue "${preferencia}" em Minha conta → Notificações: <a href="${SITE}index.html?p=conta&tab=notificacoes" style="color:#0F6B7E">${SITE.replace(/^https?:\/\//, "")}</a></div>
  </div>
</div>`;
}

export async function enviarEmail(para: { email: string; nome?: string }, assunto: string, html: string) {
  const chave = Deno.env.get("BREVO_API_KEY");
  const remetente = Deno.env.get("EMAIL_REMETENTE");
  if (!chave || !remetente) throw new Error("BREVO_API_KEY ou EMAIL_REMETENTE não configurados");
  const r = await fetch(Deno.env.get("BREVO_API_URL") || "https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": chave, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Licitacon", email: remetente },
      to: [{ email: para.email, name: para.nome || undefined }],
      subject: assunto,
      htmlContent: html,
    }),
  });
  if (!r.ok) throw new Error(`Brevo respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
