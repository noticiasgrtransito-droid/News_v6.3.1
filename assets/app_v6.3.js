/* app_v6.3 - security + CAD + CSV/PDF fixes */
(async function(){
  'use strict';
  function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isUrlSuspicious(url){
    if(!url) return false;
    try{
      const u = new URL(url, window.location.href);
      const patt = [/\.exe(\?|$)/i, /\.scr(\?|$)/i, /\.bat(\?|$)/i, /javascript:/i, /data:application\/octet-stream/i];
      for(const p of patt) if(p.test(u.href)) return true;
      if(u.search && u.search.length>200) return true;
      return false;
    }catch(e){ return true; }
  }
  window.addEventListener('click', function(e){
    const a = e.target.closest && e.target.closest('a');
    if(!a) return;
    const href = a.getAttribute('href')||a.href||'';
    if(href && !href.startsWith('#') && isUrlSuspicious(href)){
      e.preventDefault();
      const warn = document.getElementById('linkWarn');
      if(warn){
        window._pendingExternal = href;
        const txt = document.getElementById('linkWarnText');
        if(txt) txt.textContent = 'Atenção: o link pode ser suspeito. Deseja prosseguir?';
        warn.style.display = 'block';
      } else {
        if(confirm('Link suspeito. Abrir mesmo assim?')) window.open(href,'_blank','noopener');
      }
    }
  }, true);

  window._con_sanitize_for_csv = function(s){
    if(!s) return '';
    return String(s).replace(/https?:\/\/\S+/gi, function(m){ return "'" + m; });
  };

  const CAD = { previsao_meteorologica:[], desastres_naturais:[], defesa_populacao:[], riscos_rios:[], riscos_mar:[], barragens:[] };
  function insertAlert(cadType, source, location, level, message, timestamp){
    const color = (level==='critical')?'#d32f2f':(level==='moderate'?'#ff9800':'#388e3c');
    CAD[cadType] = CAD[cadType] || [];
    CAD[cadType].unshift({source, location, level, color, message, timestamp: timestamp || new Date().toISOString()});
    if(CAD[cadType].length>80) CAD[cadType].length=80;
    localStorage.setItem('congrl_CAD', JSON.stringify(CAD));
    renderCad();
  }
  function renderCad(){
    const el = document.getElementById('cadList');
    if(!el) return;
    const rows = [];
    Object.keys(CAD).forEach(k=>{
      CAD[k].forEach(item=>{
        rows.push(`<div style="padding:6px;border-left:6px solid ${item.color};margin-bottom:6px"><strong>${escapeHtml(k)}</strong> — ${escapeHtml(item.message)} <br><small>${escapeHtml(item.source)} • ${new Date(item.timestamp).toLocaleString()}</small></div>`);
      });
    });
    el.innerHTML = rows.join('') || '<div>Sem alertas</div>';
  }
  async function fetchRssAsXml(url){
    try{
      const res = await fetch(url);
      const txt = await res.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(txt, "application/xml");
      if(xml.querySelector("parsererror")) throw new Error("XML parse error");
      return xml;
    }catch(e){ return null; }
  }
  async function checkAllAlertSources(){
    try{
      const inmetUrls = ["https://portal.inmet.gov.br/rss/Alertas.xml","https://portal.inmet.gov.br/feed/rss?path=/alertas"];
      for(const u of inmetUrls){
        const xml = await fetchRssAsXml(u);
        if(xml){
          const items = Array.from(xml.querySelectorAll('item')).slice(0,6);
          items.forEach(it=>{
            const title = it.querySelector('title')?it.querySelector('title').textContent:'';
            const desc = it.querySelector('description')?it.querySelector('description').textContent:'';
            const level = /aviso|alerta|perigo|grave/i.test(title+desc)?'critical':'moderate';
            insertAlert('previsao_meteorologica','INMET','',level,title+' — '+desc, it.querySelector('pubDate')?it.querySelector('pubDate').textContent:new Date().toISOString());
          });
        }
      }
      // CEMADEN
      const cem = ["https://www.cemaden.gov.br/feed/","https://www.cemaden.gov.br/index.php/feed/"];
      for(const u of cem){
        const xml = await fetchRssAsXml(u);
        if(xml){
          const items = Array.from(xml.querySelectorAll('item')).slice(0,6);
          items.forEach(it=>{
            const title = it.querySelector('title')?it.querySelector('title').textContent:'';
            const desc = it.querySelector('description')?it.querySelector('description').textContent:'';
            const level = /desliz|inund|enchente|alerta/i.test(title+desc)?'critical':'moderate';
            insertAlert('desastres_naturais','CEMADEN','',level,title+' — '+desc, it.querySelector('pubDate')?it.querySelector('pubDate').textContent:new Date().toISOString());
          });
        }
      }
      // Defesa Civil (SP)
      const dc = ["https://www.defesacivil.sp.gov.br/feed","https://www.defesacivil.sp.gov.br/alertas/rss"];
      for(const u of dc){
        const xml = await fetchRssAsXml(u);
        if(xml){
          const items = Array.from(xml.querySelectorAll('item')).slice(0,6);
          items.forEach(it=>{
            const title = it.querySelector('title')?it.querySelector('title').textContent:'';
            const desc = it.querySelector('description')?it.querySelector('description).textContent:'';
            const level = /evacu|alerta|perigo|emerg/i.test(title+desc)?'critical':'moderate';
            insertAlert('defesa_populacao','Defesa Civil','',level,title+' — '+desc, it.querySelector('pubDate')?it.querySelector('pubDate').textContent:new Date().toISOString());
          });
        }
      }
    }catch(e){ console.warn('checkAllAlertSources error', e); }
  }
  window.CON_V63 = { insertAlert, CAD, renderCad, checkAllAlertSources, sanitizeForCsv: window._con_sanitize_for_csv };
  document.addEventListener('DOMContentLoaded', function(){
    try{
      const stored = JSON.parse(localStorage.getItem('congrl_CAD')||'{}');
      Object.assign(CAD, stored);
      renderCad();
    }catch(e){}
    setInterval(()=>{ checkAllAlertSources().catch(()=>{}); }, 1000*60*30);
  });
})();
