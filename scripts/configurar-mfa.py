#!/usr/bin/env python3
"""Liga a verificação em duas etapas por aplicativo autenticador (TOTP) no Supabase (Management API). Nada sensível é impresso."""
import json, os, sys, urllib.error, urllib.request
cfg = {"mfa_totp_enroll_enabled": True, "mfa_totp_verify_enabled": True, "mfa_max_enrolled_factors": 10}
req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{os.environ['PROJECT_REF']}/config/auth",
                             data=json.dumps(cfg).encode(), method="PATCH",
                             headers={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"], "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print("::notice::Verificação em duas etapas (TOTP) ligada no Supabase:", r.status)
except urllib.error.HTTPError as e:
    print("::error::Supabase recusou a configuração de MFA:", e.code, e.read().decode()[:300])
    sys.exit(1)
