#!/usr/bin/env python3
"""Liga o login com Google no Supabase (Management API), se os segredos GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET existirem.
Os valores nunca são impressos."""
import json, os, sys, urllib.error, urllib.request

cid, seg = os.environ.get("GOOGLE_CLIENT_ID", "").strip(), os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
if not cid or not seg:
    print("::notice::GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes: login com Google continua desligado.")
    sys.exit(0)
cfg = {"external_google_enabled": True, "external_google_client_id": cid, "external_google_secret": seg}
site = os.environ.get("SITE_URL", "").strip()
if site:
    cfg["site_url"] = site
    cfg["uri_allow_list"] = site.rstrip("/") + "/**"
req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{os.environ['PROJECT_REF']}/config/auth",
                             data=json.dumps(cfg).encode(), method="PATCH",
                             headers={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"], "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print("::notice::Login com Google ligado no Supabase:", r.status)
except urllib.error.HTTPError as e:
    print("::error::Supabase recusou a configuração do Google:", e.code, e.read().decode()[:300])
    sys.exit(1)
