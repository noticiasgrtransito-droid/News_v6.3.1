
CON_News_v6.1_INTEL_EXPAND
=========================
Pronto para GitHub Pages.

O que mudou (v6.1):
- Fontes fixas ampliadas: G1, G1-SP, R7, UOL, CNN, Agência Brasil, PRF, DNIT, CCR.
- Mapa: marcadores coloridos por tipo (Acidente, Interdição, Roubo, Furto, Outros).
- Cards com ícones visuais e total de notícias + timestamp abaixo do mapa.
- Geocoding: usa Nominatim (OpenStreetMap) com cache local em localStorage para tentar localizar itens que mencionem rodovia/cidade.
- CSV export com colunas: Notícia;Data;Hora;Link;Ocorrência;Rodovia;Região
- Login padrão: adm / adm

Observações importantes:
- O frontend usa https://api.rss2json.com para converter RSS -> JSON. Esse serviço é útil para desenvolvimento, mas tem limites.
- Para produção (recomendado): crie um Cloudflare Worker como proxy para consultar feeds (remover limites e problemas de CORS).
- Mapas e geocoding: Nominatim impõe limites; a implementação usa cache para reduzir chamadas repetidas.

Deploy rápido:
1. Suba todo o conteúdo deste ZIP em um repositório GitHub.
2. Ative o GitHub Pages (branch main, pasta /).
3. Abra o site e clique em "Atualizar" para buscar feeds ao vivo. Aguarde alguns segundos.
