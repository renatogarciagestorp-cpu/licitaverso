#!/usr/bin/env python3
"""Configura os e-mails de login do Supabase (SMTP próprio + textos em português).
Roda no GitHub Actions (workflow supabase-funcoes.yml) com estas variáveis:
  SUPABASE_ACCESS_TOKEN, PROJECT_REF, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
  EMAIL_REMETENTE, SITE_URL
Sem SMTP_USER/SMTP_PASS, aplica só os textos em português."""
import json, os, pathlib, sys, urllib.request

raiz = pathlib.Path(__file__).resolve().parent.parent / "supabase" / "emails"
assuntos = json.loads((raiz / "assuntos.json").read_text(encoding="utf-8"))
ler = lambda n: (raiz / f"{n}.html").read_text(encoding="utf-8")
mapa = {"confirmacao": "confirmation", "recuperacao": "recovery", "troca_email": "email_change",
        "convite": "invite", "link_magico": "magic_link"}

cfg = {}
for pt, en in mapa.items():
    cfg[f"mailer_subjects_{en}"] = assuntos[pt]
    cfg[f"mailer_templates_{en}_content"] = ler(pt)

site = os.environ.get("SITE_URL", "").strip()
if site:
    cfg["site_url"] = site
    cfg["uri_allow_list"] = site.rstrip("/") + "/**"

user, senha = os.environ.get("SMTP_USER", ""), os.environ.get("SMTP_PASS", "")
remetente = os.environ.get("EMAIL_REMETENTE", "")
if user and senha and remetente:
    cfg.update({
        "smtp_host": os.environ.get("SMTP_HOST", "smtp-relay.brevo.com"),
        "smtp_port": os.environ.get("SMTP_PORT", "587"),
        "smtp_user": user, "smtp_pass": senha,
        "smtp_admin_email": remetente, "smtp_sender_name": "Licitaverso",
        "smtp_max_frequency": 30,
        "rate_limit_email_sent": 100,
    })
    print("SMTP próprio será configurado.")
else:
    # No plano gratuito, o Supabase só aceita textos próprios com SMTP próprio configurado.
    print("::warning::BREVO_SMTP_USER, BREVO_SMTP_KEY ou EMAIL_REMETENTE ausentes: e-mails de login ficam no padrão do Supabase até cadastrar a Brevo.")
    sys.exit(0)

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{os.environ['PROJECT_REF']}/config/auth",
    data=json.dumps(cfg).encode(), method="PATCH",
    headers={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"], "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print("Configuração de e-mails aplicada:", r.status)
except urllib.error.HTTPError as e:
    print("::error::Supabase recusou a configuração:", e.code, e.read().decode()[:500])
    sys.exit(1)
