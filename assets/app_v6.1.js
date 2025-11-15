/* CON_News v6.1 integrated fetcher and UI enhancements */
(async function(){
  function nowStr(){const d=new Date();return d.toLocaleDateString()+' '+d.toLocaleTimeString();}
  function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function detectType(text){
    const t=(text||'').toLowerCase();
    if(/acident|colis|capot|capotamento|engarrafamento/i.test(t)) return 'Acidente';
    if(/roubo|assalto|arrast/i.test(t)) return 'Roubo';
    if(/furto|subtra/i.test(t)) return 'Furto';
    if(/interdi|bloqueio|obra|manuten|lento|lentidao|lentidão|tránsito|trânsito/i.test(t)) return 'Interdição';
    if(/porto|navio|portu/i.test(t)) return 'Porto';
    if(/sindic/i.test(t)) return 'Sindicato';
    if(/internacional|foreign|overseas|bbc|reuters|cnn/i.test(t)) return 'Internacional';
    return 'Outros';
  }
  function detectRoad(text){ const m=(text||'').match(/BR[-\s]?\d{1,4}|SP[-\s]?\d{1,3}|RODOANEL|SP-021/ig); return m? m[0].toUpperCase().replace(' ','-'):''; }
  function detectRegion(text){
    const t=(text||'').toLowerCase();
    if(/s[oã]o paulo|sao paulo|minas gerais|rio de janeiro|espirito santo/i.test(t)) return 'Sudeste';
    if(/paran[aá]|santa catarina|rio grande do sul|rs\b/i.test(t)) return 'Sul';
    if(/goias|mato grosso do sul|mato grosso|distrito federal|go\./i.test(t)) return 'Centro-Oeste';
    if(/bahia|pernambuco|ceara|maranhao|alagoas|sergipe|piaui/i.test(t)) return 'Nordeste';
    if(/acre|amazonas|roraima|rondonia|amapa/i.test(t)) return 'Norte';
    return 'Outras';
  }

  const loginBtn=document.getElementById('loginBtn'), userInp=document.getElementById('user'), passInp=document.getElementById('pass'), loginMsg=document.getElementById('loginMsg');
  function showApp(){document.getElementById('login-screen').style.display='none';document.getElementById('app').classList.remove('hidden');initApp();}
  loginBtn.addEventListener('click',()=>{const u=userInp.value.trim(),p=passInp.value.trim(); if(u==='adm' && p==='adm'){sessionStorage.setItem('congrl_auth','adm'); showApp(); } else {loginMsg.textContent='Usuário ou senha incorretos'; setTimeout(()=>loginMsg.textContent='',2500);} });
  if(sessionStorage.getItem('congrl_auth')==='adm'){showApp();}

  let allFeeds=[], filtered=[]; let map, markersLayer, chartTypes, chartRegions;

  function updateNow(){ document.getElementById('now').textContent = nowStr(); document.getElementById('newsTime').textContent = nowStr(); }
  setInterval(updateNow,1000);

  function initMap(){ if(map) return; map = L.map('map',{ scrollWheelZoom:false }).setView([-14.2350,-51.9253],4); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution: '© OpenStreetMap contributors' }).addTo(map); markersLayer = L.layerGroup().addTo(map); document.getElementById('expandMap').addEventListener('click', ()=> window.open('map.html','_blank')); }

  const RSS_SOURCES = [
    {id:'g1', name:'G1 - Brasil', url:'https://g1.globo.com/rss/g1/'},
    {id:'g1_sp', name:'G1 - SP', url:'https://g1.globo.com/sp/sao-paulo/rss2.xml'},
    {id:'r7', name:'R7', url:'https://rss.r7.com/rss'},
    {id:'uol', name:'UOL', url:'https://feeds.uol.com.br/feed/noticias.xml'},
    {id:'cnn', name:'CNN', url:'http://rss.cnn.com/rss/edition.rss'},
    {id:'agenciabrasil', name:'Agência Brasil', url:'https://agenciabrasil.ebc.com.br/rss.xml'},
    {id:'prf', name:'PRF', url:'https://www.gov.br/prf/pt-br/assuntos/noticias/rss'},
    {id:'dnit', name:'DNIT', url:'https://www.gov.br/dnit/pt-br/assuntos/noticias.rss'},
    {id:'ccr', name:'CCR - Notícias', url:'https://www.grupoccr.com.br/pt/noticias/rss'}
  ];

  const KEYWORD_QUERIES = [
    'acidente rodovia','acidente carreta','roubo de carga','furto caminhão','interdição rodovia',
    'BR-101','BR-116','BR-381','BR-153','BR-050','BR-365','rodovia interditada','rodoanel','SP-021'
  ];

  async function rss2jsonFetch(rssUrl){
    const API = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl);
    try{ const res = await fetch(API); if(!res.ok) throw new Error('rss2json failed'); return await res.json(); }catch(e){ console.warn('rss2json failed', rssUrl, e); return null; }
  }

  function googleNewsRss(q){ return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=pt-BR&gl=BR&ceid=BR:pt-419'; }

  async function geocode(text){
    if(!text) return null;
    const key = 'geo_cache_v61';
    let cache = JSON.parse(localStorage.getItem(key) || '{}');
    if(cache[text]) return cache[text];
    try{
      const q = encodeURIComponent(text + ' Brasil');
      const url = 'https://nominatim.openstreetmap.org/search?q=' + q + '&format=json&limit=1&addressdetails=0&polygon_geojson=0';
      const res = await fetch(url, { headers:{ 'User-Agent':'CON-News/1.0 (contact)' } });
      if(!res.ok) throw new Error('geocode fail');
      const j = await res.json();
      if(j && j[0]){ const lat = parseFloat(j[0].lat); const lon = parseFloat(j[0].lon); cache[text] = {lat,lon}; localStorage.setItem(key, JSON.stringify(cache)); return cache[text]; }
    }catch(e){ console.warn('geocode error', text, e); }
    return null;
  }

  async function fetchFeeds(){
    const collected = [];
    const promises = RSS_SOURCES.map(s=> rss2jsonFetch(s.url).then(j=>({s,j})).catch(e=>({s,j:null})));
    const results = await Promise.all(promises);
    results.forEach(r=>{ const s = r.s; const j = r.j; if(j && j.items) j.items.forEach(it => collected.push({ title: it.title, link: it.link || it.guid, pubDate: it.pubDate || it.isoDate, source: s.name, snippet: (it.description||it.contentSnippet||'').replace(/<[^>]+>/g,'') })); });

    for(const q of KEYWORD_QUERIES){
      try{ const j = await rss2jsonFetch(googleNewsRss(q)); if(j && j.items) j.items.forEach(it=> collected.push({ title: it.title, link: it.link, pubDate: it.pubDate || it.isoDate, source: 'GoogleNews', snippet: (it.description||'').replace(/<[^>]+>/g,'') })); }catch(e){ console.warn('google news fail', q, e); }
    }

    const map = new Map();
    collected.forEach(it=>{ const key = (it.link || it.title).trim(); if(!map.has(key)) map.set(key, it); });
    const items = Array.from(map.values());
    for(const it of items){
      it.type = detectType(it.title + ' ' + (it.snippet||''));
      it.road = detectRoad(it.title + ' ' + (it.snippet||''));
      it.region = detectRegion(it.title + ' ' + (it.snippet||''));
      if(!it.lat){
        const cityMatch = (it.title + ' ' + (it.snippet||'')).match(/([A-ZÁ-Ú][a-zá-úç]+(?:\s+[A-ZÁ-Ú][a-zá-úç]+){0,2}),?\s*(?:[A-Z]{2})?/);
        const guess = (it.road ? it.road + ' ' : '') + (cityMatch ? cityMatch[0] : '');
        if(guess.trim()){ const g = await geocode(guess.trim()); if(g){ it.lat = g.lat; it.lon = g.lon; } }
      }
    }

    items.sort((a,b)=>(new Date(b.pubDate).getTime()||0)-(new Date(a.pubDate).getTime()||0));
    localStorage.setItem('congrl_cache', JSON.stringify({ items: items, fetched: new Date().toISOString() }));
    localStorage.setItem('congrl_used_sources', JSON.stringify(Array.from(new Set(items.map(i=>i.source||'local')))));
    return items;
  }

  async function loadAndRender(){ allFeeds = await fetchFeeds(); document.getElementById('lastFetch').textContent = 'Última coleta: ' + new Date().toLocaleString(); document.getElementById('totalCount').textContent = 'Total: ' + (allFeeds.length||0); applyFilters(); }

  function applyFilters(){
    const type = document.getElementById('typeFilter').value || '';
    const region = document.getElementById('regionFilter').value || '';
    const road = document.getElementById('roadFilter').value || '';
    const q = document.getElementById('search').value.trim().toLowerCase();
    filtered = allFeeds.filter(it=>{
      if(type && ((it.type||'').toLowerCase() !== type.toLowerCase())) return false;
      if(region && ((it.region||'').toLowerCase() !== region.toLowerCase())) return false;
      if(road){ const r=(it.road||'').toUpperCase(); if(!r.includes(road.toUpperCase())) return false; }
      if(q){ const hay = (it.title+' '+(it.snippet||'')+' '+(it.source||'')).toLowerCase(); if(!hay.includes(q)) return false; }
      return true;
    });
    renderNews(filtered);
    updateStatsAndCharts(filtered);
    updateMapMarkers(filtered);
  }

  function renderNews(list){
    const newsList = document.getElementById('newsList'); newsList.innerHTML='';
    if(!list || list.length===0){ newsList.innerHTML = '<div class="card">Nenhuma notícia encontrada.</div>'; return; }
    list.forEach(it=>{
      const time = it.pubDate ? new Date(it.pubDate) : null;
      const timestr = time ? (time.toLocaleDateString() + ' ' + time.toLocaleTimeString()) : '';
      const div = document.createElement('div'); div.className='news-item';
      const icon = it.type==='Acidente'? '🚗' : it.type==='Interdição'? '🚧' : it.type==='Roubo'? '🚨' : it.type==='Furto'? '🧤' : '🌐';
      const link = `<a href="${it.link||'#'}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>`;
      div.innerHTML = `<div style="flex:1;min-width:220px"><span class="meta">[${it.type}] ${it.road? '— '+it.road : ''}</span> <span style="margin-left:8px">${icon}</span> ${link}</div><div class="meta">${escapeHtml(it.source||'')} • ${timestr}</div>`;
      div.addEventListener('click', ()=>{ if(it.lat && it.lon){ initMap(); map.setView([it.lat,it.lon],11); L.popup().setLatLng([it.lat,it.lon]).setContent(`<strong>${escapeHtml(it.title)}</strong><br><a href='${it.link}' target='_blank'>Abrir fonte</a>`).openOn(map); } });
      newsList.appendChild(div);
    });
  }

  function updateStatsAndCharts(list){
    const typesCount = {}, regionsCount = {};
    list.forEach(f=>{ const t = f.type||'Outros'; typesCount[t] = (typesCount[t]||0) + 1; regionsCount[f.region||'Outras'] = (regionsCount[f.region||'Outras']||0) + 1; });
    document.getElementById('statAcc').textContent = typesCount['Acidente'] || 0;
    document.getElementById('statInt').textContent = (typesCount['Interdição'] || 0) + (typesCount['Trânsito'] || 0);
    document.getElementById('statRoubo').textContent = typesCount['Roubo'] || 0;
    document.getElementById('statFurto').textContent = typesCount['Furto'] || 0;
    if(chartTypes){ chartTypes.data.labels = Object.keys(typesCount); chartTypes.data.datasets[0].data = Object.values(typesCount); chartTypes.update(); }
    if(chartRegions){ chartRegions.data.labels = Object.keys(regionsCount); chartRegions.data.datasets[0].data = Object.values(regionsCount); chartRegions.update(); }
  }

  function updateMapMarkers(list){
    if(!map) initMap(); markersLayer.clearLayers();
    list.forEach(it=>{
      if(!it.lat || !it.lon) return;
      const color = it.type==='Acidente'? '#d32f2f' : it.type==='Interdição'? '#ff9800' : it.type==='Roubo'? '#f44336' : it.type==='Furto'? '#ffb300' : '#607d8b';
      const emoji = it.type==='Acidente'?'🚗':(it.type==='Interdição'?'🚧':(it.type==='Roubo'?'🚨':(it.type==='Furto'?'🧤':'🌐')));
      const icon = L.divIcon({ html:`<div style="background:${color};color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center">${emoji}</div>`, className:'' });
      L.marker([it.lat,it.lon], { icon }).addTo(markersLayer).bindPopup(`<strong>${escapeHtml(it.title)}</strong><br><small>${escapeHtml(it.source||'')}</small><br><a href='${it.link}' target='_blank'>Abrir fonte</a>`);
    });
    const pts = list.filter(i=>i.lat&&i.lon).map(i=>L.latLng(i.lat,i.lon));
    if(pts.length){ try{ const g = L.featureGroup(pts.map(p=>L.marker(p))); map.fitBounds(g.getBounds().pad(0.2)); }catch(e){} }
  }

  function downloadCSV(){
    const source = (filtered && filtered.length>0) ? filtered : allFeeds;
    const rows = [];
    rows.push(['Notícia','Data','Hora','Link','Ocorrência','Rodovia','Região'].join(';'));
    source.forEach(f=>{
      const d = f.pubDate ? new Date(f.pubDate) : new Date();
      const date = d.toLocaleDateString(); const time = d.toLocaleTimeString();
      const title = (f.title||'').replace(/"/g,'""');
      const link = (f.link||'').replace(/"/g,'""');
      const line = [`"${title}"`,`"${date}"`,`"${time}"`,`"${link}"`,`"${f.type||''}"`,`"${f.road||''}"`,`"${f.region||''}"`].join(';');
      rows.push(line);
    });
    const csv = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'news_export.csv'; a.click(); URL.revokeObjectURL(url);
  }

  async function generatePDF(){ try{ const { jsPDF } = window.jspdf; const doc = new jsPDF({unit:'pt', format:'letter'}); doc.setFontSize(14); doc.text('TORRES - Central Operacional News (CON)',40,40); doc.setFontSize(10); doc.text('Relatório gerado em: ' + new Date().toLocaleString(),40,60); let y=90; const source = (filtered && filtered.length>0) ? filtered : allFeeds; source.slice(0,30).forEach((f,i)=>{ doc.setFontSize(11); doc.text((i+1)+'. '+(f.title||''),40,y); y+=14; doc.setFontSize(9); doc.text('Fonte: '+(f.source||'')+'  |  Tipo: '+(f.type||'' )+'  |  Link: '+(f.link||''),40,y); y+=18; if(y>720){ doc.addPage(); y=40; } }); doc.save('CON_report.pdf'); }catch(e){ alert('Erro ao gerar PDF: '+e.message); } }

  async function loadWeather(){ const el = document.getElementById('weather'); try{ const lat=-23.55, lon=-46.63; const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`); if(!res.ok) throw new Error('weather fail'); const data = await res.json(); if(data.current_weather){ const temp = data.current_weather.temperature; const wind = data.current_weather.windspeed; el.innerHTML = `<div>Temperatura: ${temp}°C</div><div>Vento: ${wind} km/h</div>`; } else el.textContent='Previsão indisponível'; }catch(e){ console.warn('weather',e); el.textContent='Erro ao carregar previsão'; } }

  function setupUI(){
    document.getElementById('typeFilter').addEventListener('change', applyFilters);
    document.getElementById('regionFilter').addEventListener('change', applyFilters);
    document.getElementById('roadFilter').addEventListener('change', applyFilters);
    document.getElementById('refreshBtn').addEventListener('click', async ()=>{ document.getElementById('refreshBtn').textContent='Atualizando...'; document.getElementById('refreshBtn').disabled=true; await loadAndRender(); document.getElementById('refreshBtn').disabled=false; document.getElementById('refreshBtn').textContent='Atualizar'; });
    document.getElementById('csvBtn').addEventListener('click', downloadCSV);
    document.getElementById('pdfBtn').addEventListener('click', generatePDF);
    document.getElementById('fontesBtn').addEventListener('click', ()=>{ const used = JSON.parse(localStorage.getItem('congrl_used_sources')||'[]'); const list = document.getElementById('fontesList'); list.innerHTML = used.map(u=>`<div style="padding:6px;border-bottom:1px solid #eee">${u}</div>`).join('') || '<div style="padding:6px">Nenhuma fonte</div>'; document.getElementById('fontesModal').style.display='block'; });
    document.getElementById('fontesBuscaBtn').addEventListener('click', ()=>{ const fixed = ['G1 (RSS)','Google News (RSS)','R7','CNN','UOL','PRF','DNIT','CCR','Arteris']; document.getElementById('fixedSources').innerHTML = fixed.map(f=>`<li>${f}</li>`).join(''); document.getElementById('fontesBuscaModal').style.display='block'; });
    document.getElementById('ajudaBtn').addEventListener('click', ()=>{ document.getElementById('ajudaBody').innerHTML = '<p>Este painel agrega notícias de diversas fontes públicas. Use filtros (Ocorrência, Região, Rodovia) e clique em Atualizar para forçar recarga. O mapa mostra ocorrências com ícones. CSV e PDF geram relatórios.</p>'; document.getElementById('ajudaModal').style.display='block'; });
    document.querySelectorAll('.close, .btn-close').forEach(b=> b.addEventListener('click', e=> document.getElementById(e.target.dataset.for).style.display='none'));
  }

  async function initApp(){
    const roads = ['BR-381','BR-101','BR-376','BR-116','BR-060','BR-153','BR-050','BR-163','SP-021','RODOANEL KM 41'];
    const roadSel = document.getElementById('roadFilter');
    roads.forEach(r=>{ const o=document.createElement('option'); o.value=r; o.textContent=r; roadSel.appendChild(o); });

    const concessions = [
      {"name":"Autopista Fernão Dias","site":"https://www.autopistafernaodias.com.br"},
      {"name":"Autopista Fluminense","site":"https://www.autopistafluminense.com.br"},
      {"name":"Autopista Litoral Sul","site":"https://www.autopistalitoralsul.com.br"},
      {"name":"Autopista Planalto Sul","site":"https://www.autopistaplanaltosul.com.br"},
      {"name":"Autopista Régis Bittencourt","site":"https://www.br116regis.com.br"},
      {"name":"CONCEBRA","site":"https://www.triunfoconcebra.com.br/"},
      {"name":"Via 040","site":"https://eprviamineira.com.br/"},
      {"name":"CCR AutoBAn","site":"https://www.autoban.com.br"}
    ];
    const concesList = document.getElementById('concessList');
    concesList.innerHTML = concessions.map(c=>`<div class="concess" data-site="${c.site}">${c.name}</div>`).join('');
    concesList.addEventListener('click', (e)=>{ const el = e.target.closest('.concess'); if(el && el.dataset.site) window.open(el.dataset.site,'_blank'); });

    const phones = [
      {"name":"Corpo de Bombeiros","site":"https://www.corpodebombeiros.sp.gov.br/#/","tel":"193"},
      {"name":"Polícia Civil","site":"https://www.policiacivil.sp.gov.br/portal/faces/pages_home","tel":"181"},
      {"name":"Polícia Militar","site":"https://www.policiamilitar.sp.gov.br/","tel":"190"},
      {"name":"SAMU","site":"https://samues.com.br/","tel":"192"},
      {"name":"PRF","site":"https://www.prf.gov.br","tel":"191"},
      {"name":"Defesa Civil","site":"https://www.defesacivil.sp.gov.br/","tel":"199"}
    ];
    document.getElementById('phonesList').innerHTML = phones.map(p=>`<div class="concess">${p.site?`<a href="${p.site}" target="_blank">${p.name}${p.tel? ' — '+p.tel:''}</a>`:p.name}</div>`).join('');

    const ctxTypes = document.getElementById('chartTypes').getContext('2d');
    const ctxRegions = document.getElementById('chartRegions').getContext('2d');
    chartTypes = new Chart(ctxTypes, { type:'bar', data:{ labels:[], datasets:[{ label:'Ocorrências', data:[], backgroundColor:'#0d47a1' }] }, options:{ maintainAspectRatio:false } });
    chartRegions = new Chart(ctxRegions, { type:'doughnut', data:{ labels:[], datasets:[{ data:[], backgroundColor:['#0d47a1','#1976d2','#42a5f5','#90caf9','#64b5f6'] }] }, options:{ maintainAspectRatio:false } });

    setupUI();
    initMap();
    loadWeather();
    await loadAndRender();
    setInterval(async ()=>{ await loadAndRender(); }, 1000*60*30);
  }

  setupUI();
  await initApp();
})();