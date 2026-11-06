// Confere, com uma chamada mínima, se cada modelo aceita os parâmetros usados nas funções (escolha automática de ferramenta e esforço).
const chave = Deno.env.get("ANTHROPIC_API_KEY")!;
const ferr = { name: "responder", description: "Devolve a resposta.", input_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } };
for (const modelo of ["claude-haiku-5-5", "claude-sonnet-5-5"]) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: modelo, max_tokens: 2000, output_config: { effort: "low" }, system: "Responda SEMPRE chamando a ferramenta responder.",
      tools: [ferr], tool_choice: { type: "auto" }, messages: [{ role: "user", content: "Diga ok." }] }) });
  const j = await r.json();
  console.log(modelo, r.status, r.ok ? "ferramenta: " + !!(j.content || []).find((c: any) => c.type === "tool_use") + " · uso " + JSON.stringify(j.usage?.output_tokens) : JSON.stringify(j.error));
}
