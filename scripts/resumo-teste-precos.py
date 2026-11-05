# Resume a resposta da função pesquisa-precos no teste de acesso às fontes (workflow teste-fontes-precos).
import json, sys
try:
    j = json.load(open(sys.argv[1]))
    if 'fontes' in j:
        print(' | '.join(f"{x['status']} {x['ms']}ms {x['url'].split('?')[0][-60:]}" for x in j['fontes'])
              + ' || AMOSTRA ' + json.dumps(j.get('amostra'), ensure_ascii=False)[:900]
              + ' || PNCP ' + json.dumps(j.get('pncp'), ensure_ascii=False)[:900])
    else:
        print(json.dumps(j, ensure_ascii=False)[:600])
except Exception:
    print(open(sys.argv[1]).read()[:300])
