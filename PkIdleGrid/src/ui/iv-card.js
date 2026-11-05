// Janela de inspeção de IVs, golpes, análise, comparação e histórico.
class IvHoverCard {
  constructor() {
    this.el = document.getElementById('iv-hover-card');
    this.currentData = null;
    this.pinnedData = [];
    this.history = [];
    this.tab = 'ivs';
    this.init();
  }

  init() {
    if (!this.el) return;
    this.el.className = 'hidden fixed z-40 glass-modal rounded-2xl shadow-2xl border border-slate-700/80 select-none overflow-hidden';
    this.el.style.width = '440px';
    this.el.style.maxWidth = 'calc(100vw - 24px)';
    this.el.style.maxHeight = 'min(82vh, 760px)';
    this.el.innerHTML = `<div id="iv-card-header" class="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 cursor-grab active:cursor-grabbing">
      <div class="flex items-center gap-3 min-w-0 pointer-events-none"><div class="w-12 h-12 shrink-0 rounded-xl bg-slate-900 border border-slate-700 p-1"><img id="iv-card-sprite" src="assets/pokeball.svg" class="w-full h-full object-contain" alt=""></div><div class="min-w-0"><div id="iv-card-name" class="text-sm font-bold text-white truncate">Inspeção de Pokémon</div><div id="iv-card-level" class="text-[11px] text-slate-400">Passe o mouse sobre um Pokémon</div></div></div>
      <div class="flex items-center gap-1 shrink-0 pointer-events-auto"><button id="btn-pin-iv-card" class="px-2 py-1 rounded-lg text-xs bg-slate-800 hover:bg-blue-600/30 text-slate-300" title="Fixar para comparar">📌 Fixar</button><button id="btn-close-iv-card" class="px-2 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" title="Fechar">✕</button></div>
    </div>
    <div class="px-4 pt-3"><div class="flex items-center justify-between gap-3 rounded-xl bg-slate-900/80 border border-slate-800 p-3"><div><div class="text-[10px] uppercase tracking-wider text-slate-500">Potencial</div><div id="iv-card-potential" class="text-sm font-bold text-blue-300">Aguardando leitura</div></div><div class="text-right"><div class="text-[10px] uppercase tracking-wider text-slate-500">IV total</div><div id="iv-card-total" class="text-sm font-bold font-mono text-white">--/192</div></div></div></div>
    <div id="iv-card-tabs" class="flex gap-1 overflow-x-auto px-3 py-3 border-b border-slate-800"></div>
    <div id="iv-card-content" class="overflow-y-auto p-4" style="max-height:calc(min(82vh, 760px) - 165px)"></div>`;
    this.el.querySelector('#btn-close-iv-card').onclick = () => this.hide();
    this.el.querySelector('#btn-pin-iv-card').onclick = () => this.togglePin();
    this.initDraggable();
    this.restoreState();
    this.render();
  }

  restoreState() {
    try {
      const saved = JSON.parse(localStorage.getItem('pk_iv_state') || '{}');
      this.pinnedData = Array.isArray(saved.pinned) ? saved.pinned.slice(0, 3) : [];
      this.history = Array.isArray(saved.history) ? saved.history.slice(0, 30) : [];
      if (saved.pos && Number.isFinite(saved.pos.x) && Number.isFinite(saved.pos.y)) {
        this.el.style.left = `${saved.pos.x}px`; this.el.style.top = `${saved.pos.y}px`;
        this.el.style.right = 'auto'; this.el.style.bottom = 'auto';
      } else { this.el.style.right = '24px'; this.el.style.bottom = '24px'; }
    } catch (_) { this.pinnedData = []; this.history = []; }
  }

  persist() {
    try {
      const rect = this.el.getBoundingClientRect();
      localStorage.setItem('pk_iv_state', JSON.stringify({ pinned: this.pinnedData, history: this.history, pos: { x: Math.round(rect.left), y: Math.round(rect.top) } }));
    } catch (_) {}
  }

  initDraggable() {
    const header = this.el.querySelector('#iv-card-header');
    let drag = null;
    header.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      const r = this.el.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
      this.el.style.left = `${r.left}px`; this.el.style.top = `${r.top}px`; this.el.style.right = 'auto'; this.el.style.bottom = 'auto';
      document.body.style.userSelect = 'none';
      const move = ev => {
        if (!drag) return;
        const maxX = Math.max(8, innerWidth - this.el.offsetWidth - 8);
        const maxY = Math.max(8, innerHeight - 70);
        this.el.style.left = `${Math.max(8, Math.min(maxX, drag.left + ev.clientX - drag.x))}px`;
        this.el.style.top = `${Math.max(8, Math.min(maxY, drag.top + ev.clientY - drag.y))}px`;
      };
      const up = () => { drag = null; document.body.style.userSelect = ''; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); this.persist(); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
  }

  toggle() {
    if (!this.el) return;
    this.el.classList.toggle('hidden');
    if (!this.currentData && !this.el.classList.contains('hidden')) this.render();
  }
  hide() { this.el.classList.add('hidden'); }

  showData(payload) {
    if (!payload || !payload.name) return;
    this.currentData = { ...payload };
    const key = this.identity(this.currentData);
    this.history = [this.currentData, ...this.history.filter(item => this.identity(item) !== key)].slice(0, 30);
    this.persist();
    this.render();
    this.el.classList.remove('hidden');
  }

  identity(d) { return `${d.account ?? ''}|${d.name}|${d.level ?? ''}|${d.quality ?? ''}|${d.ivTotal ?? ''}|${d.shiny ? 1 : 0}`; }
  togglePin() {
    if (!this.currentData) return;
    const key = this.identity(this.currentData);
    const index = this.pinnedData.findIndex(item => this.identity(item) === key);
    if (index >= 0) this.pinnedData.splice(index, 1);
    else {
      if (this.pinnedData.length >= 3) this.pinnedData.shift();
      this.pinnedData.push({ ...this.currentData });
      this.tab = 'comparar';
    }
    this.persist(); this.render();
  }

  esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
  getModel(d) {
    const creature = window.pkCatalog?.getCreatureByName(d.name) || null;
    const baseStats = creature?.baseStats || {};
    const raw = d.stats || d.observedStats || {};
    const stats = Array.isArray(raw) ? { hp:raw[0], atk:raw[1], def:raw[2], spa:raw[3], spd:raw[4], speed:raw[5] } : { hp:raw.hp, atk:raw.atk, def:raw.def, spa:raw.spa, spd:raw.spd, speed:raw.speed ?? raw.vel };
    const level = Number(d.level) || 100, quality = Number(d.quality) || 1;
    let ivResult = null;
    if (window.PokeGridIvMath) {
      try { ivResult = window.PokeGridIvMath.normalizeIvs({ level, quality, ivTotal:d.ivTotal, power:d.power, observedStats:stats, species:{ baseStats } }); } catch (_) {}
    }
    return { d, creature, stats, baseStats, iv:ivResult?.values || {}, ranges:ivResult?.ranges || {}, exact:!!ivResult?.exact, total:Number(d.ivTotal) || Object.values(ivResult?.values || {}).reduce((a,b)=>a+(Number(b)||0),0), quality, level };
  }

  render() {
    if (!this.el) return;
    const tabs = [['ivs','IVs'],['analise','Análise'],['golpes','Golpes'],['comparar',`Comparar${this.pinnedData.length ? ` (${this.pinnedData.length})` : ''}`],['historico','Histórico']];
    const tabHost = this.el.querySelector('#iv-card-tabs');
    tabHost.innerHTML = tabs.map(([id,label]) => `<button data-tab="${id}" class="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold ${this.tab===id?'bg-blue-600 text-white':'text-slate-400 hover:text-white hover:bg-slate-800'}">${label}</button>`).join('');
    tabHost.querySelectorAll('[data-tab]').forEach(btn => btn.onclick = () => { this.tab = btn.dataset.tab; this.render(); });
    const d = this.currentData;
    if (!d) { this.el.querySelector('#iv-card-content').innerHTML = '<div class="py-10 text-center text-sm text-slate-500">Passe o mouse ou clique em um Pokémon da bag, time, box ou loja para inspecionar.</div>'; return; }
    const m = this.getModel(d), name = `${d.shiny?'✨ ':''}${this.esc(d.name)}${d.ditto?' (Ditto)':''}`;
    this.el.querySelector('#iv-card-name').innerHTML = name;
    this.el.querySelector('#iv-card-level').textContent = `Nv. ${m.level} · Q ×${m.quality.toFixed(2)}${d.power ? ` · Poder ${d.power}` : ''}${d.account != null ? ` · Conta ${Number(d.account)+1}` : ''}`;
    const sprite = d.sprite || (m.creature?.id ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${d.shiny?'shiny/':''}${m.creature.id}.png` : 'assets/pokeball.svg');
    this.el.querySelector('#iv-card-sprite').src = sprite;
    const pct = Math.round(m.total / 192 * 100);
    const rank = pct >= 95 ? ['Perfeito (S+)', 'text-amber-300'] : pct >= 85 ? ['Excelente (A)', 'text-emerald-400'] : pct >= 70 ? ['Bom (B)', 'text-blue-300'] : ['Comum (C)', 'text-slate-400'];
    const potential = this.el.querySelector('#iv-card-potential'); potential.textContent = rank[0]; potential.className = `text-sm font-bold ${rank[1]}`;
    this.el.querySelector('#iv-card-total').textContent = `${m.total}/192 (${pct}%)${m.exact?' · exato':''}`;
    const pin = this.el.querySelector('#btn-pin-iv-card');
    const pinned = this.pinnedData.some(item => this.identity(item) === this.identity(d));
    pin.textContent = pinned ? '📌 Fixado' : '📌 Fixar'; pin.className = `px-2 py-1 rounded-lg text-xs ${pinned?'bg-blue-600/30 text-blue-300':'bg-slate-800 hover:bg-blue-600/30 text-slate-300'}`;
    const content = this.el.querySelector('#iv-card-content');
    if (this.tab==='ivs') content.innerHTML = this.renderStats(m);
    else if (this.tab==='analise') content.innerHTML = this.renderAnalysis(m);
    else if (this.tab==='golpes') content.innerHTML = this.renderMoves(m);
    else if (this.tab==='comparar') content.innerHTML = this.renderCompare(m);
    else content.innerHTML = this.renderHistory();
    content.querySelectorAll('[data-unpin]').forEach(btn => btn.onclick = () => { this.pinnedData.splice(Number(btn.dataset.unpin),1); this.persist(); this.render(); });
    content.querySelectorAll('[data-history]').forEach(btn => btn.onclick = () => { const item=this.history[Number(btn.dataset.history)]; if(item){this.currentData={...item}; this.tab='ivs'; this.render();} });
  }

  statRows(m, compare = null) {
    const defs=[['hp','HP','text-rose-300'],['atk','Ataque','text-orange-300'],['def','Defesa','text-yellow-300'],['spa','At. Esp.','text-cyan-300'],['spd','Def. Esp.','text-indigo-300'],['speed','Velocidade','text-emerald-300']];
    return defs.map(([key,label,color])=>{
      const iv=Number(m.iv[key]), range=m.ranges[key], stat=Number(m.stats[key])||0;
      const delta=compare ? iv - (Number(compare.iv[key])||0) : null;
      const width=Number.isFinite(iv)?Math.max(0,Math.min(100,iv/32*100)):0;
      return `<div class="grid grid-cols-[62px_1fr_44px_42px] items-center gap-2 py-2 border-b border-slate-800/70 last:border-0"><span class="text-[11px] font-semibold ${color}">${label}</span><div><div class="flex justify-between text-[10px] text-slate-400 mb-1"><span>Stat ${stat||'—'}</span><span>${range&&range[0]!==range[1]?`${range[0]}–${range[1]}`:''}</span></div><div class="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-300" style="width:${width}%"></div></div></div><span class="text-right font-mono text-xs text-white">${Number.isFinite(iv)?`${iv}/32`:'—'}</span>${compare?`<span class="text-right font-mono text-[10px] ${delta>0?'text-emerald-400':delta<0?'text-rose-400':'text-slate-500'}">${delta>0?'+':''}${delta}</span>`:''}</div>`;
    }).join('');
  }
  renderStats(m) { return `<div class="flex justify-between text-[10px] text-slate-500 mb-2"><span>ATRIBUTO</span><span>IV / 32</span></div><div>${this.statRows(m)}</div><div class="mt-3 text-[10px] text-slate-500">${m.exact?'IVs determinados pelos atributos observados.':'Estimativa calculada com nível, qualidade e atributos.'}</div>`; }
  renderAnalysis(m) {
    const defs=[['hp','HP'],['atk','Ataque'],['def','Defesa'],['spa','At. Esp.'],['spd','Def. Esp.'],['speed','Velocidade']];
    const sorted=defs.map(([key,label])=>({key,label,value:Number(m.iv[key])||0})).sort((a,b)=>b.value-a.value);
    const types=(m.creature?[m.creature.type1,m.creature.type2].filter(Boolean):Array.isArray(m.d.tipos)?m.d.tipos:[]);
    return `<div class="grid grid-cols-2 gap-2"><div class="rounded-xl bg-emerald-950/30 border border-emerald-900/60 p-3"><div class="text-[10px] uppercase text-emerald-400 font-bold">Melhores atributos</div><div class="mt-2 space-y-1">${sorted.slice(0,3).map(s=>`<div class="flex justify-between text-xs"><span>${s.label}</span><b class="text-emerald-300">${s.value}/32</b></div>`).join('')}</div></div><div class="rounded-xl bg-rose-950/20 border border-rose-900/50 p-3"><div class="text-[10px] uppercase text-rose-400 font-bold">Menores atributos</div><div class="mt-2 space-y-1">${sorted.slice(-3).reverse().map(s=>`<div class="flex justify-between text-xs"><span>${s.label}</span><b class="text-rose-300">${s.value}/32</b></div>`).join('')}</div></div></div><div class="mt-3 rounded-xl bg-slate-900 border border-slate-800 p-3"><div class="text-[10px] uppercase text-slate-500 font-bold mb-2">Tipo${types.length>1?'s':''}</div><div class="flex gap-2">${types.length?types.map(t=>`<span class="px-2 py-1 rounded-lg bg-slate-800 text-xs">${this.esc(t)}</span>`).join(''):'<span class="text-xs text-slate-500">Não informado</span>'}</div></div><div class="mt-3">${this.statRows(m)}</div>`;
  }
  renderMoves(m) {
    const moves=Array.isArray(m.creature?.attacks)?m.creature.attacks:[];
    if(!moves.length) return '<div class="py-8 text-center text-sm text-slate-500">O catálogo não trouxe golpes para esta espécie.</div>';
    return `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Golpes disponíveis no catálogo</div><div class="space-y-1">${moves.map(move=>{const n=typeof move==='string'?move:(move.name||move.move||'Golpe');const type=typeof move==='object'?(move.type||''):'';const power=typeof move==='object'?(move.power||move.basePower||'—'):'—';return `<div class="flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 border border-slate-800 px-3 py-2"><span class="text-xs text-slate-200">${this.esc(n)}</span><span class="shrink-0 text-[10px] text-slate-400">${this.esc(type)}${type?' · ':''}Poder ${this.esc(power)}</span></div>`}).join('')}</div>`;
  }
  renderCompare(current) {
    const others=this.pinnedData.map((d,index)=>({d,index,m:this.getModel(d)})).filter(item=>this.identity(item.d)!==this.identity(current));
    if(!others.length) return `<div class="py-7 text-center"><div class="text-2xl mb-2">📌</div><div class="text-sm font-semibold text-slate-200">Fixe outro Pokémon para comparar</div><div class="text-xs text-slate-500 mt-1">Fixe este Pokémon e passe o mouse em outro. Você pode manter até 3 fixados.</div>${this.pinnedData.length?`<div class="mt-3">${this.pinnedData.map((p,i)=>`<button data-unpin="${i}" class="text-[10px] px-2 py-1 m-1 rounded bg-slate-800 text-slate-300 hover:bg-rose-900/60">Remover ${this.esc(p.name)} ×</button>`).join('')}</div>`:''}</div>`;
    return `<div class="text-xs text-slate-400 mb-3">Atual: <b class="text-white">${this.esc(current.name)}</b> · diferenças de IV por atributo</div>${others.map(({d,index,m})=>`<section class="mb-4 rounded-xl border border-slate-800 overflow-hidden"><div class="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2"><div class="min-w-0"><div class="text-xs font-bold text-white truncate">${d.shiny?'✨ ':''}${this.esc(d.name)}</div><div class="text-[10px] text-slate-500">${d.account!=null?`Conta ${Number(d.account)+1} · `:''}Nv. ${m.level} · Q ×${m.quality.toFixed(2)}</div></div><div class="text-right text-xs font-mono text-blue-300">${m.total}/192</div><button data-unpin="${index}" class="text-slate-500 hover:text-rose-300" title="Desafixar">×</button></div><div class="px-3 py-1">${this.statRows(current,m)}</div></section>`).join('')}`;
  }
  renderHistory() {
    if(!this.history.length) return '<div class="py-8 text-center text-sm text-slate-500">Os Pokémon inspecionados recentemente aparecem aqui.</div>';
    return `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Leituras recentes · até 30</div><div class="space-y-1">${this.history.map((d,i)=>`<button data-history="${i}" class="w-full flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 hover:bg-slate-800 px-3 py-2 text-left"><span class="truncate text-xs text-slate-200">${d.shiny?'✨ ':''}${this.esc(d.name)} <span class="text-slate-500">Nv. ${Number(d.level)||100}</span></span><span class="shrink-0 text-[10px] font-mono text-blue-300">${Number(d.ivTotal)||'—'}/192</span></button>`).join('')}</div>`;
  }
}

window.IvHoverCard = IvHoverCard;
