// src/ui/sidebar-panel.js
// Painel Lateral deslizante que empurra os jogos (Farm e Capturas lado a lado com os jogos)

class SidebarPanel {
  constructor() {
    this.sidebar = document.getElementById('sidebar-stats');
    this.resizeHandle = document.getElementById('sidebar-resize-handle');
    this.currentView = 'farm'; // 'farm' ou 'captures'
    this.currentAccountTab = 0; // 0..3 ou 4 (Total Σ)
    this.isOpen = false;
    this.width = 360;
    this.accountStats = [null, null, null, null];

    // Capturas vitalícias (persistidas no localStorage)
    this.lifeCatch = this._loadLifeCatch();
    this.seenKeys = {};
    this.lifeCatch.forEach(c => { this.seenKeys[this._keyFor(c)] = 1; });

    // Filtros de Capturas
    this.filterAccount = -1;
    this.filterMinIv = 0;
    this.filterMinQ = 0;
    this.filterShinyOnly = false;
    this.filterQuery = '';
    this.filterPeriod = 0; // 0 = todas, 1 = 1h, 6 = 6h, 24 = 24h
    this.captureSort = 'recent';
    this.storeOpen = false;
    this.storeAccount = 0;
    this.storeData = null;
    this.storeSelectedBallId = null;
    this.storeBallQuantity = 100;

    this.init();
  }

  _keyFor(c) {
    return 'c' + (c.p != null ? c.p : (c.account || 0)) + '_' + c.t + '_' + (c.n || c.name || '');
  }

  _loadLifeCatch() {
    try {
      const raw = localStorage.getItem('pk_lifeCatch');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.slice(-500);
      }
    } catch {}
    return [];
  }

  _saveLifeCatch() {
    try {
      if (this.lifeCatch.length > 500) {
        const removed = this.lifeCatch.splice(0, this.lifeCatch.length - 500);
        // Keep the deduplication index bounded alongside the visible history.
        removed.forEach(c => { delete this.seenKeys[this._keyFor(c)]; });
      }
      localStorage.setItem('pk_lifeCatch', JSON.stringify(this.lifeCatch));
    } catch {}
  }

  init() {
    if (!this.sidebar) return;

    // Fechar Painel Lateral
    const closeBtn = document.getElementById('btn-close-sidebar');
    if (closeBtn) closeBtn.onclick = () => this.toggle(false);

    // Alternar entre Farm e Capturas
    const viewFarmBtn = document.getElementById('side-view-farm');
    const viewCapsBtn = document.getElementById('side-view-caps');
    if (viewFarmBtn) viewFarmBtn.onclick = () => this.setView('farm');
    if (viewCapsBtn) viewCapsBtn.onclick = () => this.setView('captures');

    // Abas de conta no Farm [ C1 ] [ C2 ] [ C3 ] [ C4 ] [ Σ ]
    for (let i = 0; i <= 4; i++) {
      const tab = document.getElementById(`side-tab-${i}`);
      if (tab) {
        tab.onclick = () => {
          this.currentAccountTab = i;
          this.updateTabStyles();
          this.render();
        };
      }
    }

    // Redimensionamento arrastando a borda
    if (this.resizeHandle) {
      let isDragging = false;
      this.resizeHandle.onmousedown = (e) => {
        isDragging = true;
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
      };
      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        this.width = Math.max(280, Math.min(680, e.clientX));
        this.sidebar.style.width = `${this.width}px`;
      });
      window.addEventListener('mouseup', () => {
        if (isDragging) { isDragging = false; document.body.style.cursor = ''; }
      });
    }

    this.updateTabStyles();
  }

  toggle(forceState, targetView) {
    if (targetView) this.currentView = targetView;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : (!this.isOpen || (targetView && targetView !== this.currentView));
    this.isOpen = shouldOpen;

    this.sidebar.style.display = this.isOpen ? 'flex' : 'none';
    if (this.isOpen) {
      this.sidebar.style.width = `${this.width}px`;
      this.updateViewButtons();
      this.render();
    }
    this.updateTopButtons();
  }

  setView(view) {
    this.currentView = view;
    this.updateViewButtons();
    this.render();
    this.updateTopButtons();
  }

  updateViewButtons() {
    const vf = document.getElementById('side-view-farm');
    const vc = document.getElementById('side-view-caps');
    const tabsRow = document.getElementById('side-tabs-row');

    if (vf && vc) {
      vf.className = `flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition ${this.currentView === 'farm' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`;
      vc.className = `flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition ${this.currentView === 'captures' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`;
    }
    if (tabsRow) tabsRow.style.display = this.currentView === 'farm' ? 'flex' : 'none';
  }

  updateTopButtons() {
    const btnFarm = document.getElementById('btn-top-sidebar');
    const btnCaps = document.getElementById('btn-top-captures');
    if (btnFarm) {
      btnFarm.classList.toggle('bg-blue-600', this.isOpen && this.currentView === 'farm');
      btnFarm.classList.toggle('text-white', this.isOpen && this.currentView === 'farm');
      btnFarm.classList.toggle('bg-slate-800', !(this.isOpen && this.currentView === 'farm'));
      btnFarm.classList.toggle('text-slate-200', !(this.isOpen && this.currentView === 'farm'));
    }
    if (btnCaps) {
      btnCaps.classList.toggle('bg-blue-600', this.isOpen && this.currentView === 'captures');
      btnCaps.classList.toggle('text-white', this.isOpen && this.currentView === 'captures');
      btnCaps.classList.toggle('bg-slate-800', !(this.isOpen && this.currentView === 'captures'));
      btnCaps.classList.toggle('text-slate-200', !(this.isOpen && this.currentView === 'captures'));
    }
  }

  // Chamado pelo app.js a cada emissão de __PK_STATS__
  updateAccountStats(index, stats) {
    const previous = this.accountStats[index];
    this.accountStats[index] = stats;
    this.updatePanelHeaderStatus(index, stats);
    // Não reconstrói o painel a cada telemetria quando nada visível mudou.
    const changed = !previous || ['status', 'huntName', 'kills', 'captures', 'gold', 'lootGold', 'capturesGold', 'supplyGold', 'balance', 'gph', 'xph', 'kph'].some(key => previous[key] !== stats[key]);
    if (changed && this.isOpen && this.currentView === 'farm') this.render();
  }

  // Recebe lista de capturas (formato normalizado do app.js ou catchLog)
  addCaptures(list) {
    if (!Array.isArray(list)) return;
    let dirty = false;
    list.forEach(item => {
      // Normaliza para o formato interno
      const c = {
        n: item.name || item.n || '?',
        iv: item.ivTotal != null ? +item.ivTotal : (item.iv != null ? +item.iv : 0),
        q: item.quality != null ? +item.quality : (item.q != null ? +item.q : 0),
        sh: !!(item.shiny || item.sh),
        fx: !!(item.fx),
        t: item.time || item.t || Date.now(),
        p: item.account != null ? item.account : (item.p != null ? item.p : 0),
        stats: item.stats || null,
        level: item.level || null
      };
      const key = this._keyFor(c);
      if (!this.seenKeys[key]) {
        this.seenKeys[key] = 1;
        this.lifeCatch.push(c);
        dirty = true;
      }
    });

    if (dirty) {
      this._saveLifeCatch();
      if (this.isOpen && this.currentView === 'captures') this.render();
    }
  }

  updatePanelHeaderStatus(index, stats) {
    const pill = document.getElementById(`panel-status-${index}`);
    if (!pill || !stats) return;

    let text = '⏳ Conectando...';
    let colorClass = 'bg-slate-800 text-slate-400 border-slate-700';

    if (stats.status === 'hunting') {
      text = `⚔️ ${stats.huntName || stats.huntSlug || 'Hunt'} · ${(stats.kph || 0).toLocaleString()}/h`;
      colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    } else if (stats.status === 'city') {
      text = '🏙️ Na Cidade';
      colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    } else if (stats.status === 'fainted') {
      text = '💀 Time Derrotado';
      colorClass = 'bg-red-500/10 text-red-400 border-red-500/30';
    } else if (stats.status === 'login') {
      text = '🔑 Tela de Login';
      colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    } else if (stats.status === 'connected') {
      text = '✅ Conectado';
      colorClass = 'bg-teal-500/10 text-teal-400 border-teal-500/30';
    } else if (stats.status === 'disconnected') {
      text = '⭕ Desconectada';
      colorClass = 'bg-slate-800 text-slate-500 border-slate-700';
    }

    pill.textContent = text;
    pill.className = `px-2 py-0.5 rounded-full text-[10px] font-medium border ${colorClass} max-w-[200px] truncate`;
  }

  updateTabStyles() {
    for (let i = 0; i <= 4; i++) {
      const tab = document.getElementById(`side-tab-${i}`);
      if (!tab) continue;
      if (i === this.currentAccountTab) {
        tab.className = 'flex-1 py-1 text-center text-xs font-bold rounded-lg bg-blue-600 text-white shadow-sm transition';
      } else {
        tab.className = 'flex-1 py-1 text-center text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition';
      }
    }
  }

  render() {
    const body = document.getElementById('sidebar-body');
    if (!body) return;
    if (this.storeOpen) {
      this.renderStoreView(body);
      return;
    }
    if (this.currentView === 'captures') {
      this.renderCapturesView(body);
    } else {
      this.renderFarmView(body);
    }
  }

  _esc(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  async openRemoteStore(account) {
    this.storeOpen = true;
    this.storeAccount = account;
    this.storeData = null;
    this.render();
    try {
      const webview = document.getElementById(`webview-${account}`);
      if (!webview) throw new Error('Painel indisponível');
      const data = await webview.executeJavaScript(`(async () => {
        const P = window.__poke || {};
        const balls = ((P.ws && P.ws.balls && P.ws.balls.catalog) || []).map(x => ({ id: +x.id || 0, name: x.name || '', priceGold: +x.priceGold || 0, npcPrice: +x.npcPrice || 0, shopPrice: +x.shopPrice || 0, infinite: !!x.infinite }));
        const character = (P.api && P.api['/api/characters/me'] && P.api['/api/characters/me'].character) || {};
        return { balls, gold: +character.gold || 0, ready: !!P.auth };
      })()`);
      this.storeData = data;
    } catch (error) {
      this.storeData = { error: 'Não foi possível ler a loja desta conta. Entre no jogo e tente novamente.' };
    }
    this.render();
  }

  async _storeRequest(action, payload) {
    const webview = document.getElementById(`webview-${this.storeAccount}`);
    if (!webview) return { ok: false, status: 0 };
    return webview.executeJavaScript(`(async () => {
      try {
        const P = window.__poke || {};
        const response = await fetch(${JSON.stringify(action)}, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, P.auth ? { Authorization: P.auth } : {}),
          body: JSON.stringify(${JSON.stringify(payload)})
        });
        const body = await response.json().catch(() => null);
        return { ok: response.ok, status: response.status, body, detail: body && (body.message || body.error || body.detail) };
      } catch (error) { return { ok: false, status: 0 }; }
    })()`);
  }

  renderStoreView(body) {
    const esc = value => this._esc(value);
    if (!this.storeData) {
      body.innerHTML = '<div class="py-12 text-center text-slate-500 text-xs">Carregando loja remota…</div>';
      return;
    }
    if (this.storeData.error) {
      body.innerHTML = `<div class="space-y-3"><button id="store-back" class="text-xs text-blue-400 hover:text-blue-300">← Voltar ao farm</button><p class="py-8 text-center text-slate-400 text-xs">${esc(this.storeData.error)}</p></div>`;
      body.querySelector('#store-back').onclick = () => { this.storeOpen = false; this.render(); };
      return;
    }

    // O catálogo balls do próprio jogo contém as opções aceitas pela compra.
    // Itens do inventário não são uma fonte segura: inclui bolas especiais que
    // não são vendidas na loja por gold.
    const balls = (this.storeData.balls || []).filter(ball => !ball.infinite && ball.id && +ball.priceGold > 0)
      .sort((a, b) => +a.priceGold - +b.priceGold || a.name.localeCompare(b.name, 'pt-BR'));
    const accounts = [0, 1, 2, 3].map(index => {
      const stats = this.accountStats[index];
      return `<option value="${index}"${index === this.storeAccount ? ' selected' : ''}>${esc((stats && stats.name) || `Conta ${index + 1}`)}</option>`;
    }).join('');
    const ballPrice = ball => ball.priceGold || ball.npcPrice || ball.shopPrice || 0;
    if (!balls.some(ball => ball.id === this.storeSelectedBallId)) this.storeSelectedBallId = (balls.find(ball => /ultra/i.test(ball.name)) || balls.find(ball => /super/i.test(ball.name)) || balls[0] || {}).id || null;
    const ballOptions = balls.map(ball => `<option value="${ball.id}" data-price="${ballPrice(ball)}"${ball.id === this.storeSelectedBallId ? ' selected' : ''}>${esc(ball.name)} · $${Math.round(ballPrice(ball)).toLocaleString('pt-BR')}</option>`).join('');
    body.innerHTML = `<div class="space-y-3">
      <div class="flex items-center justify-between gap-2"><button id="store-back" class="text-xs text-blue-400 hover:text-blue-300 shrink-0">← Voltar</button><select id="store-account" aria-label="Conta da loja" class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-white">${accounts}</select><span class="text-[10px] text-slate-500 shrink-0">$${Math.round(this.storeData.gold || 0).toLocaleString('pt-BR')}</span></div>
      <div class="bg-amber-950/25 border border-amber-700/30 rounded-xl p-2.5 text-xs"><b class="text-amber-300">Compra remota</b><p class="text-slate-400 mt-1">Compre Pokébolas para a conta selecionada. A compra exige confirmação.</p></div>
      <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 space-y-2">
        <div class="flex justify-between text-[10px] text-slate-400 uppercase font-bold"><span>Comprar Pokébolas</span><span>${balls.length} ${balls.length === 1 ? 'disponível' : 'disponíveis'}</span></div>
        ${ballOptions ? `<div class="flex gap-1.5"><select id="store-ball" class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-white">${ballOptions}</select><input id="store-ball-qty" type="number" min="1" value="${this.storeBallQuantity}" class="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"><button id="store-buy" class="bg-emerald-600 hover:bg-emerald-500 text-white rounded px-2 py-1 text-xs font-bold">Comprar</button></div>` : '<p class="text-xs text-slate-500">O jogo ainda não enviou o catálogo de bolas compráveis.</p>'}
      </div>
      <p id="store-message" class="text-center text-[11px] text-slate-400"></p>
    </div>`;

    body.querySelector('#store-back').onclick = () => { this.storeOpen = false; this.render(); };
    body.querySelector('#store-account').onchange = event => this.openRemoteStore(+event.target.value);
    const message = body.querySelector('#store-message');
    const ballSelect = body.querySelector('#store-ball');
    const ballQty = body.querySelector('#store-ball-qty');
    if (ballSelect) ballSelect.onchange = () => { this.storeSelectedBallId = +ballSelect.value; };
    if (ballQty) ballQty.oninput = () => { this.storeBallQuantity = Math.max(1, Math.floor(+ballQty.value || 1)); };
    const refresh = () => this.openRemoteStore(this.storeAccount);
    const buy = body.querySelector('#store-buy');
    if (buy) buy.onclick = async () => {
      const ball = body.querySelector('#store-ball'); const quantity = Math.max(1, Math.floor(+body.querySelector('#store-ball-qty').value || 0));
      this.storeSelectedBallId = +ball.value; this.storeBallQuantity = quantity;
      const price = +ball.options[ball.selectedIndex].dataset.price || 0; const total = price * quantity;
      if (!window.confirm(`Comprar ${quantity.toLocaleString('pt-BR')} ${ball.options[ball.selectedIndex].textContent.split(' · ')[0]} por $${total.toLocaleString('pt-BR')}?`)) return;
      message.textContent = 'Comprando…';
      const result = await this._storeRequest('/api/game/balls/buy', { ballId: +ball.value, qty: quantity });
      message.textContent = result && result.ok ? 'Compra concluída.' : `Compra recusada pelo jogo${result && result.status ? ` (${result.status})` : ''}${result && result.detail ? `: ${result.detail}` : '.'}`;
      if (result && result.ok) setTimeout(refresh, 600);
    };
  }

  // ──────────────────────────────────────────────
  // VISTA DE CAPTURAS
  // ──────────────────────────────────────────────
  renderCapturesView(body) {
    const corte = this.filterPeriod > 0 ? Date.now() - this.filterPeriod * 3600e3 : 0;

    const filtered = this.lifeCatch.filter(c => {
      if (this.filterAccount !== -1 && c.p !== this.filterAccount) return false;
      if (this.filterShinyOnly && !c.sh) return false;
      if (this.filterQuery && !String(c.n || '').toLowerCase().includes(this.filterQuery)) return false;
      if (this.filterMinIv > 0 && (c.iv || 0) < this.filterMinIv) return false;
      if (this.filterMinQ > 0 && (c.q || 0) < this.filterMinQ) return false;
      if (corte > 0 && (c.t || 0) < corte) return false;
      return true;
    });
    const sorters = {
      recent: (a, b) => (b.t || 0) - (a.t || 0),
      iv_desc: (a, b) => (b.iv || 0) - (a.iv || 0) || (b.q || 0) - (a.q || 0) || (b.t || 0) - (a.t || 0),
      iv_asc: (a, b) => (a.iv || 0) - (b.iv || 0) || (b.t || 0) - (a.t || 0),
      quality_desc: (a, b) => (b.q || 0) - (a.q || 0) || (b.iv || 0) - (a.iv || 0) || (b.t || 0) - (a.t || 0),
      quality_asc: (a, b) => (a.q || 0) - (b.q || 0) || (b.t || 0) - (a.t || 0),
      name: (a, b) => String(a.n || '').localeCompare(String(b.n || ''), 'pt-BR') || (b.t || 0) - (a.t || 0)
    };
    filtered.sort(sorters[this.captureSort] || sorters.recent);
    const visibleCaptures = filtered.slice(0, 80);

    const ACOR_DOTS = ['#3987e5', '#c07bf5', '#1baf7a', '#eda100'];
    const ACOR_TEXT = ['text-blue-400', 'text-purple-400', 'text-emerald-400', 'text-amber-400'];
    const ACOR_BG = ['bg-blue-500/15 border-blue-500/30', 'bg-purple-500/15 border-purple-500/30', 'bg-emerald-500/15 border-emerald-500/30', 'bg-amber-500/15 border-amber-500/30'];

    // Cabeçalho com quantidade de contas ativas para o select
    const countActive = this.accountStats.filter(s => s && s.name).length;
    const accNames = [0, 1, 2, 3].map(i => {
      const st = this.accountStats[i];
      return st ? st.name : `C${i + 1}`;
    });

    const optContas = `<option value="-1"${this.filterAccount === -1 ? ' selected' : ''}>Todas</option>` +
      [0, 1, 2, 3].map(v =>
        `<option value="${v}"${this.filterAccount === v ? ' selected' : ''}>${accNames[v]}</option>`
      ).join('');

    const optPeriodo = [[0, 'Todas'], [1, '1h'], [6, '6h'], [24, '24h']].map(([v, l]) =>
      `<option value="${v}"${this.filterPeriod === v ? ' selected' : ''}>${l}</option>`
    ).join('');

    const rowsHtml = visibleCaptures.length > 0
      ? visibleCaptures.map((c, idx) => {
          const ivNum = c.iv || 0;
          const qNum = c.q || 0;
          const p = c.p || 0;
          const dot = ACOR_DOTS[p] || '#8b949e';
          const accText = ACOR_TEXT[p] || 'text-slate-400';
          const timeStr = new Date(c.t || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const ivColor = ivNum >= 185 ? 'text-amber-300' : ivNum >= 165 ? 'text-emerald-300' : ivNum >= 140 ? 'text-blue-300' : 'text-slate-400';
          const rareza = qNum >= 1.8 ? 'text-pink-400 font-bold' : qNum >= 1.5 ? 'text-amber-400 font-semibold' : qNum >= 1.2 ? 'text-emerald-400' : 'text-slate-200';
          let st = c.stats;
          let hp = st ? (st.hp || 0) : 0;
          let atk = st ? (st.atk || 0) : 0;
          let def = st ? (st.def || 0) : 0;
          let spa = st ? (st.spa || st.spAtk || 0) : 0;
          let spd = st ? (st.spd || st.spDef || 0) : 0;
          let vel = st ? (st.vel || st.speed || 0) : 0;

          if (!hp && !atk && !def) {
            const cr = window.pkCatalog ? window.pkCatalog.getCreatureByName(c.n) : null;
            const b = cr ? [cr.baseHp, cr.baseAtk, cr.baseDef, cr.baseSpAtk, cr.baseSpDef, cr.baseSpeed] : [60, 60, 60, 60, 60, 60];
            const lv = c.level || 100;
            const q = c.q || 1;
            const avgIv = Math.max(1, Math.min(32, Math.round((c.iv || 96) / 6)));
            const EXP = [.95, .80, .80, .80, .80, .95];
            const proj = (base, idx) => Math.max(1, Math.round((base + 2 * avgIv) * (lv / 100) * Math.pow(q, EXP[idx])));
            hp = proj(b[0], 0);
            atk = proj(b[1], 1);
            def = proj(b[2], 2);
            spa = proj(b[3], 3);
            spd = proj(b[4], 4);
            vel = proj(b[5], 5);
          }
          st = { hp, atk, def, spa, spd, vel };
          c.stats = st;

          return `
            <div class="p-2 rounded-xl border ${c.sh ? 'border-pink-500/50 bg-pink-950/20' : 'border-slate-800/80 bg-slate-950/60'} hover:bg-slate-900 transition text-xs cursor-pointer select-none" data-cap-idx="${idx}">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full shrink-0" style="background:${dot}"></span>
                <span class="${rareza} font-semibold truncate flex-1">${c.sh ? '✨ ' : ''}${c.n}</span>
                <span class="${accText} font-bold shrink-0">C${p + 1}</span>
                <span class="${ivColor} font-mono shrink-0 font-bold">${ivNum}/192</span>
                ${qNum ? `<span class="text-amber-400/90 shrink-0 font-mono text-[11px]">×${Number(qNum).toFixed(2)}</span>` : ''}
                <span class="text-slate-500 shrink-0 text-[10px]">${timeStr}</span>
              </div>
              <div class="flex items-center justify-between text-[10px] font-mono mt-1.5 pt-1.5 border-t border-slate-800/60">
                <span class="text-slate-400">HP <b class="text-emerald-400 font-bold">${st.hp}</b></span>
                <span class="text-slate-400">ATK <b class="text-amber-400 font-bold">${st.atk}</b></span>
                <span class="text-slate-400">DEF <b class="text-blue-400 font-bold">${st.def}</b></span>
                <span class="text-slate-400">SPA <b class="text-purple-400 font-bold">${st.spa}</b></span>
                <span class="text-slate-400">SPD <b class="text-cyan-400 font-bold">${st.spd}</b></span>
                <span class="text-slate-400">VEL <b class="text-pink-400 font-bold">${st.vel || st.speed}</b></span>
              </div>
            </div>
          `;
        }).join('')
      : `<div class="py-10 text-center text-slate-500 text-xs">
           <p class="text-2xl mb-2">🎣</p>
           <p class="font-semibold">Nenhuma captura registrada ainda.</p>
           <p class="text-slate-600 mt-1">As capturas aparecem aqui durante as hunts.</p>
         </div>`;

    body.innerHTML = `
      <div class="space-y-2">
        <!-- Filtros -->
        <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-2 text-xs">
          <div class="flex items-center gap-1.5 flex-wrap">
            <select id="sf-conta" class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none flex-1 min-w-0">${optContas}</select>
            <div class="relative flex-1 min-w-[80px]">
              <input id="sf-nome" type="text" value="${this.filterQuery}" placeholder="🔍 Nome..." class="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none w-full">
            </div>
            <select id="sf-periodo" class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none">${optPeriodo}</select>
             <select id="sf-ordem" aria-label="Ordenar capturas" class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none">
               <option value="recent"${this.captureSort === 'recent' ? ' selected' : ''}>Recentes</option>
               <option value="iv_desc"${this.captureSort === 'iv_desc' ? ' selected' : ''}>Maior IV</option>
               <option value="iv_asc"${this.captureSort === 'iv_asc' ? ' selected' : ''}>Menor IV</option>
               <option value="quality_desc"${this.captureSort === 'quality_desc' ? ' selected' : ''}>Maior qual.</option>
               <option value="quality_asc"${this.captureSort === 'quality_asc' ? ' selected' : ''}>Menor qual.</option>
               <option value="name"${this.captureSort === 'name' ? ' selected' : ''}>Nome A–Z</option>
             </select>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-slate-500 shrink-0">IV≥</span>
            <input id="sf-iv" type="number" min="0" max="192" value="${this.filterMinIv || ''}" placeholder="0" class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none w-16">
            <span class="text-slate-500 shrink-0">×≥</span>
            <input id="sf-q" type="number" min="0" max="2" step="0.1" value="${this.filterMinQ || ''}" placeholder="0" class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none w-16">
            <label class="flex items-center gap-1 cursor-pointer ml-auto">
              <input id="sf-shiny" type="checkbox" ${this.filterShinyOnly ? 'checked' : ''} class="accent-pink-500">
              <span class="text-pink-400 font-bold">✨</span>
            </label>
          </div>
          <div class="text-[10px] text-slate-600 text-right">${filtered.length} captura${filtered.length !== 1 ? 's' : ''} exibida${filtered.length !== 1 ? 's' : ''} · ${this.lifeCatch.length} no histórico</div>
        </div>

        <!-- Lista -->
        <div class="space-y-1">
          ${rowsHtml}
        </div>
      </div>
    `;

    // Eventos dos filtros
    const sfConta = body.querySelector('#sf-conta');
    if (sfConta) sfConta.onchange = (e) => { this.filterAccount = +e.target.value; this.render(); };

    const sfNome = body.querySelector('#sf-nome');
    if (sfNome) sfNome.oninput = (e) => { this.filterQuery = (e.target.value || '').toLowerCase().trim(); this.render(); };

    const sfPeriodo = body.querySelector('#sf-periodo');
    if (sfPeriodo) sfPeriodo.onchange = (e) => { this.filterPeriod = +e.target.value; this.render(); };

    const sfOrdem = body.querySelector('#sf-ordem');
    if (sfOrdem) sfOrdem.onchange = (e) => { this.captureSort = e.target.value; this.render(); };

    const sfIv = body.querySelector('#sf-iv');
    if (sfIv) sfIv.oninput = (e) => { this.filterMinIv = +e.target.value || 0; this.render(); };

    const sfQ = body.querySelector('#sf-q');
    if (sfQ) sfQ.oninput = (e) => { this.filterMinQ = +e.target.value || 0; this.render(); };

    const sfShiny = body.querySelector('#sf-shiny');
    if (sfShiny) sfShiny.onchange = (e) => { this.filterShinyOnly = e.target.checked; this.render(); };

    // Ao clicar na captura, abre e exibe no card de IVs
    body.querySelectorAll('[data-cap-idx]').forEach(el => {
      el.onclick = () => {
        const idx = +el.getAttribute('data-cap-idx');
        const cap = visibleCaptures[idx];
        if (cap && window.pkIvCard) {
          window.pkIvCard.showData({
            name: cap.n,
            shiny: cap.sh,
            level: cap.level || 100,
            quality: cap.q || 1,
            ivTotal: cap.iv,
            stats: cap.stats
          });
        }
      };
    });
  }

  // ──────────────────────────────────────────────
  // VISTA DE FARM
  // ──────────────────────────────────────────────
  renderFarmView(body) {
    const nf = n => n == null ? '–' : Math.round(n).toLocaleString('pt-BR');
    const nc = n => n == null ? '–' : Math.round(n).toLocaleString('pt-BR');
    const sgn = n => (n > 0 ? '+' : '') + nf(n);
    const fmtHM = t => t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '–';
    const fmtSeg = s => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    // ── ABA TOTAL (Σ) ──
    if (this.currentAccountTab === 4) {
      let gph = 0, xph = 0, kph = 0, kills = 0, caps = 0, shF = 0, shC = 0, money = 0, balls = 0, pots = 0;
      const ACOR = ['#3987e5', '#c07bf5', '#1baf7a', '#eda100'];
      let cards = '';

      this.accountStats.forEach((st, i) => {
        const dot = ACOR[i] || '#8b949e';
        const nm = (st && st.name) || `C${i + 1}`;
        if (!st) {
          cards += `<div class="acard p-2 bg-slate-900/70 border border-slate-800 rounded-xl">
            <div class="flex items-center gap-2 mb-1">
              <span class="w-2 h-2 rounded-full shrink-0" style="background:${dot}"></span>
              <span class="text-xs font-bold text-slate-300">${nm}</span>
            </div>
            <span class="text-[10px] text-slate-500">Aguardando...</span>
          </div>`;
          return;
        }
        gph += st.gph || 0; xph += st.xph || 0; kph += st.kph || 0;
        kills += st.kills || 0; caps += st.captures || 0;
        shF += st.shinyFound || 0; shC += st.shinyCap || 0;
        money += st.gold || 0; balls += st.balls || 0; pots += st.potions || 0;
        const gphColor = st.gph < 0 ? 'text-red-400' : 'text-emerald-400';
        cards += `<div class="p-2 bg-slate-900/70 border border-slate-800 rounded-xl">
          <div class="flex items-center gap-2 mb-1">
            <span class="w-2 h-2 rounded-full shrink-0" style="background:${dot}"></span>
            <span class="text-xs font-bold text-slate-200 truncate">${nm}</span>
            <span class="ml-auto text-[10px] text-slate-400">$${nc(st.gold)}</span>
          </div>
          <div class="flex flex-wrap gap-1.5 text-[10px]">
            <span class="${gphColor} font-bold">${sgn(st.gph)}/h</span>
            <span class="text-blue-400">${nc(st.xph)} xp</span>
            <span class="text-white">${nf(st.kph)} k/h</span>
            <span>${nf(st.captures)} cap</span>
            ${st.shinyFound > 0 ? `<span class="text-yellow-400">✨${st.shinyFound}</span>` : ''}
          </div>
        </div>`;
      });

      body.innerHTML = `
        <div class="space-y-3">
          <!-- KPIs Globais -->
          <div class="grid grid-cols-3 gap-1.5">
            <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-2 text-center">
              <div class="text-[9px] text-slate-400 uppercase font-semibold">Gold/h</div>
              <div class="font-black text-sm ${gph < 0 ? 'text-red-400' : 'text-emerald-400'}">${sgn(gph)}</div>
            </div>
            <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-2 text-center">
              <div class="text-[9px] text-slate-400 uppercase font-semibold">XP/h</div>
              <div class="font-black text-sm text-blue-400">${nc(xph)}</div>
            </div>
            <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-2 text-center">
              <div class="text-[9px] text-slate-400 uppercase font-semibold">Kills/h</div>
              <div class="font-black text-sm text-white">${nf(kph)}</div>
            </div>
          </div>
          <!-- Sessão -->
          <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
            <div class="text-[10px] text-slate-400 uppercase font-bold mb-2">Sessão (todas)</div>
            <div class="grid grid-cols-2 gap-1.5 text-[11px]">
              <div class="flex justify-between"><span class="text-slate-400">Kills</span><b class="text-white">${nf(kills)}</b></div>
              <div class="flex justify-between"><span class="text-slate-400">Capturas</span><b class="text-white">${nf(caps)}</b></div>
              <div class="flex justify-between"><span class="text-slate-400">Shinies vistos</span><b class="text-yellow-400">${nf(shF)}</b></div>
              <div class="flex justify-between"><span class="text-slate-400">Shinies cap.</span><b class="text-yellow-400">${nf(shC)}</b></div>
            </div>
          </div>
          <!-- Suprimentos -->
          <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
            <div class="text-[10px] text-slate-400 uppercase font-bold mb-2">Suprimentos</div>
            <div class="flex justify-between text-[11px]">
              <span class="text-slate-400">🏐 Pokébolas</span><b class="text-white">${nc(balls)}</b>
            </div>
            <div class="flex justify-between text-[11px] mt-1">
              <span class="text-slate-400">💊 Poções</span><b class="text-white">${nc(pots)}</b>
            </div>
          </div>
          <!-- Cards por conta -->
          <div class="text-[10px] text-slate-400 uppercase font-bold">Por Conta</div>
          <div class="space-y-1.5">${cards}</div>
        </div>
      `;
      return;
    }

    // ── ABA CONTA INDIVIDUAL ──
    const accIdx = this.currentAccountTab;
    const st = this.accountStats[accIdx];
    const accName = (window.pkAccountsModal && window.pkAccountsModal.accounts[accIdx] && window.pkAccountsModal.accounts[accIdx].name) || `Conta ${accIdx + 1}`;

    if (!st) {
      body.innerHTML = `
        <div class="py-12 text-center text-slate-500">
          <p class="text-2xl mb-2">⏳</p>
          <p class="font-semibold text-sm text-slate-400">${accName}</p>
          <p class="text-xs text-slate-600 mt-1">Nenhum dado ainda. Faça login na conta para acompanhar o farm.</p>
        </div>
      `;
      return;
    }

    const gphColor = st.gph < 0 ? 'text-red-400' : 'text-emerald-400';
    const drops = Array.isArray(st.drops) ? st.drops.slice(0, 5) : [];
    const lastCatch = st.lastCatchT ? fmtHM(st.lastCatchT) : null;
    const balPos = (st.balance || 0) >= 0;

    body.innerHTML = `
      <div class="space-y-2.5">
        <!-- Cabeçalho: Hunt atual -->
        <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
          <div class="flex items-center justify-between mb-0.5">
            <span class="text-[10px] text-slate-400 uppercase font-semibold">Hunt Atual</span>
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${st.status === 'hunting' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}">
              ${st.status === 'hunting' ? '⚔️ Farmando' : st.status === 'city' ? '🏙️ Cidade' : st.status === 'login' ? '🔑 Login' : st.status}
            </span>
          </div>
          <p class="font-bold text-white text-sm truncate">${st.huntName || st.huntSlug || 'Nenhuma'}</p>
          ${st.level ? `<p class="text-[10px] text-slate-400 mt-0.5">${st.name} · Lv. ${st.level} · <span class="text-amber-400">$${nc(st.gold)}</span> · 💎${nc(st.diamonds)}</p>` : ''}
        </div>

        <button id="btn-open-remote-store" class="w-full bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 text-amber-200 rounded-xl px-3 py-2 text-xs font-bold transition">
          🛒 Comprar Pokébolas
        </button>

        <!-- KPIs -->
        <div class="grid grid-cols-3 gap-1.5">
          <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-2 text-center">
            <div class="text-[9px] text-slate-400 uppercase font-semibold">Gold/h</div>
            <div class="font-black text-sm ${gphColor}">${sgn(st.gph)}</div>
          </div>
          <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-2 text-center">
            <div class="text-[9px] text-slate-400 uppercase font-semibold">XP/h</div>
            <div class="font-black text-sm text-blue-400">${nc(st.xph)}</div>
          </div>
          <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-2 text-center">
            <div class="text-[9px] text-slate-400 uppercase font-semibold">Kills/h</div>
            <div class="font-black text-sm text-white">${nf(st.kph)}</div>
          </div>
        </div>

        <!-- Sessão -->
        <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
          <div class="text-[10px] text-slate-400 uppercase font-bold mb-2">
            Sessão ${st.seconds > 0 ? '· ' + fmtSeg(st.seconds) : ''}
          </div>
          <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div class="flex justify-between"><span class="text-slate-400">Kills</span><b class="text-white">${nf(st.kills)}</b></div>
            <div class="flex justify-between"><span class="text-slate-400">XP ganho</span><b class="text-blue-400">${nc(st.xpg)}</b></div>
            <div class="flex justify-between"><span class="text-slate-400">Capturas</span><b class="text-white">${nf(st.captures)}</b></div>
            <div class="flex justify-between"><span class="text-slate-400">Shinies vis.</span><b class="${st.shinyFound > 0 ? 'text-yellow-400' : 'text-white'}">${nf(st.shinyFound)}</b></div>
            ${st.shinyCap > 0 ? `<div class="flex justify-between col-span-2"><span class="text-slate-400">✨ Shinies cap.</span><b class="text-yellow-400">${nf(st.shinyCap)}</b></div>` : ''}
            ${lastCatch ? `<div class="flex justify-between col-span-2"><span class="text-slate-400">Última cap.</span><b class="text-white">${lastCatch} · ${nf(st.sinceCatch)} 🏐</b></div>` : ''}
          </div>
        </div>

        <!-- Finanças -->
        <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
          <div class="text-[10px] text-slate-400 uppercase font-bold mb-2">Finanças</div>
          <div class="space-y-1 text-[11px]">
            <div class="flex justify-between"><span class="text-slate-400">Loot</span><b class="text-emerald-400">+${nc(st.lootGold)}</b></div>
            ${st.capturesGold > 0 ? `<div class="flex justify-between"><span class="text-slate-400">Venda cap.</span><b class="text-emerald-400">+${nc(st.capturesGold)}</b></div>` : ''}
            <div class="flex justify-between"><span class="text-slate-400">Suprimentos <span class="text-slate-600">(${nf(st.ballsUsed)}🏐${st.potsUsed ? ' · ' + nf(st.potsUsed) + '💊' : ''})</span></span><b class="text-red-400">-${nc(st.supplyGold)}</b></div>
            <div class="mt-1 pt-1 border-t border-slate-800 flex justify-between font-bold">
              <span class="${balPos ? 'text-emerald-300' : 'text-red-300'}">Saldo</span>
              <span class="${balPos ? 'text-emerald-400' : 'text-red-400'}">${sgn(st.balance)}</span>
            </div>
          </div>
        </div>

        <!-- Drops -->
        ${drops.length > 0 ? `
        <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
          <div class="text-[10px] text-slate-400 uppercase font-bold mb-2">Top Drops</div>
          <div class="space-y-1">
            ${drops.map(d => `
              <div class="flex justify-between text-[11px]">
                <span class="text-slate-300 truncate max-w-[55%]">${d.name} <span class="text-slate-500">×${nf(d.qty)}</span></span>
                <span class="text-amber-400 font-bold">$${nc(d.gold)}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Suprimentos restantes -->
        <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
          <div class="text-[10px] text-slate-400 uppercase font-bold mb-2">Suprimentos</div>
          <div class="flex justify-between text-[11px]">
            <span class="text-slate-400">🏐 Pokébolas</span><b class="text-white">${nc(st.balls)}</b>
          </div>
          <div class="flex justify-between text-[11px] mt-1">
            <span class="text-slate-400">💊 Poções</span><b class="text-white">${nc(st.potions)}</b>
          </div>
        </div>
      </div>
    `;

    const storeButton = body.querySelector('#btn-open-remote-store');
    if (storeButton) storeButton.onclick = () => this.openRemoteStore(accIdx);
  }
}

window.SidebarPanel = SidebarPanel;
