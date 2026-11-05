// src/ui/app.js
// Coordenador principal da interface do PkIdleGrid

class PkApp {
  constructor() {
    this.cleanHud = localStorage.getItem('pk_cleanHud') === '1';
    this.hideChat = localStorage.getItem('pk_hideChat') === '1';
    this.init();
  }

  init() {
    // Inicializa subsistemas
    window.pkGrid = new window.GridManager();
    window.pkAccountsModal = new window.AccountsModal();
    window.pkIvCard = new window.IvHoverCard();
    window.pkSidebar = new window.SidebarPanel();

    // Inicializa catálogo de hunts local
    if (window.pkCatalog && window.PK_HUNTS_DATA) {
      window.pkCatalog.populateData({ markers: Object.values(window.PK_HUNTS_DATA) });
    }

    this.setupTopNav();
    this.setupHotkeys();
    this.setupWebviews();

    // Após carregar credenciais salvas no disco, tenta auto-login onde necessário
    if (window.pkAccountsModal && window.pkAccountsModal.loadPromise) {
      window.pkAccountsModal.loadPromise.then(() => {
        this.runAllAutoLogins();
      }).catch(() => {});
    }

    // Aplica estados visuais iniciais do HUD e do Chat
    setTimeout(() => {
      this.applyCleanHud();
      this.applyHideChat();
    }, 800);
  }

  setupTopNav() {
    // Modos de Layout
    const btnGrid4 = document.getElementById('mode-btn-grid4');
    const btnFocus = document.getElementById('mode-btn-focus');
    const btnSplit2 = document.getElementById('mode-btn-split2');

    if (btnGrid4) btnGrid4.onclick = () => window.pkGrid.setLayoutMode('grid-4');
    if (btnFocus) btnFocus.onclick = () => window.pkGrid.setLayoutMode('focus-1');
    if (btnSplit2) btnSplit2.onclick = () => window.pkGrid.setLayoutMode('split-2');

    // Abas de Foco
    for (let i = 0; i < 4; i++) {
      const tab = document.getElementById(`focus-tab-${i}`);
      if (tab) tab.onclick = () => window.pkGrid.focusAccount(i);
    }

    // Logar Equipe
    const loginAllBtn = document.getElementById('btn-top-login-all');
    if (loginAllBtn) loginAllBtn.onclick = () => window.pkAccountsModal.loginAll();

    // Painel Lateral de Farm
    const sidebarBtn = document.getElementById('btn-top-sidebar');
    if (sidebarBtn) sidebarBtn.onclick = () => window.pkSidebar.toggle(undefined, 'farm');

    // Painel Lateral de Capturas
    const capturesBtn = document.getElementById('btn-top-captures');
    if (capturesBtn) capturesBtn.onclick = () => window.pkSidebar.toggle(undefined, 'captures');

    // Limpar Jogo (Clean HUD) com hover reveal (Atalho: F2)
    const cleanBtn = document.getElementById('btn-top-clean-hud');
    if (cleanBtn) {
      cleanBtn.onclick = () => {
        this.cleanHud = !this.cleanHud;
        localStorage.setItem('pk_cleanHud', this.cleanHud ? '1' : '0');
        this.applyCleanHud();
        this.showToast(this.cleanHud ? '✨ Modo Limpar Jogo Ativado (F2)' : 'Modo Limpar Jogo Desativado', 'info');
      };
    }

    // Ocultar Chat do Jogo (Ação Direta na barra superior)
    const hideChatBtn = document.getElementById('btn-top-hide-chat');
    if (hideChatBtn) {
      hideChatBtn.onclick = () => {
        this.hideChat = !this.hideChat;
        localStorage.setItem('pk_hideChat', this.hideChat ? '1' : '0');
        this.applyHideChat();
        this.showToast(this.hideChat ? '💬 Chat do Jogo Ocultado' : '💬 Chat do Jogo Visível', 'info');
      };
    }

    // Janela de IVs e Status (Hover Reader)
    const ivsBtn = document.getElementById('btn-top-ivs');
    if (ivsBtn) {
      ivsBtn.onclick = () => {
        if (window.pkIvCard) window.pkIvCard.toggle();
      };
    }

    // Treinadores
    const accountsBtn = document.getElementById('btn-top-accounts');
    if (accountsBtn) accountsBtn.onclick = () => window.pkAccountsModal.show();

    // Atualizar Tudo
    const reloadAllBtn = document.getElementById('btn-top-reload-all');
    if (reloadAllBtn) {
      reloadAllBtn.onclick = () => {
        for (let i = 0; i < 4; i++) {
          const wv = document.getElementById(`webview-${i}`);
          if (wv) wv.reload();
        }
        this.showToast('🔄 Atualizando todos os painéis...', 'info');
      };
    }
  }

  // Aplica Limpar HUD de forma direta e infalível em todas as telas
  applyCleanHud() {
    const cleanBtn = document.getElementById('btn-top-clean-hud');
    if (cleanBtn) {
      cleanBtn.classList.toggle('bg-blue-600', this.cleanHud);
      cleanBtn.classList.toggle('text-white', this.cleanHud);
      cleanBtn.classList.toggle('font-bold', this.cleanHud);
      cleanBtn.classList.toggle('text-slate-400', !this.cleanHud);
      cleanBtn.classList.toggle('bg-slate-800', !this.cleanHud);
    }

    const script = `(() => {
      const ID = 'pg-clean-hud-style';
      let s = document.getElementById(ID);
      if (!${this.cleanHud}) { if (s) s.remove(); return; }
      if (!s) { s = document.createElement('style'); s.id = ID; document.head.appendChild(s); }
      s.textContent = '.cap-panel:not(:has(.cap-row.shiny)),.kc-stack,.sn-card:has(.sn-xpline),.sn-card:has(.sn-loot){display:none !important}'
        + '.ah-panel,.game-hud-tl,.ha-window,nav.game-dock{opacity:0.2 !important;transition:opacity .18s ease !important}'
        + '.ah-panel:hover,.game-hud-tl:hover,.ha-window:hover,nav.game-dock:hover{opacity:1 !important}';
    })()`;

    for (let i = 0; i < 4; i++) {
      const wv = document.getElementById(`webview-${i}`);
      if (wv) {
        wv.executeJavaScript(script).catch(() => {});
      }
    }
  }

  // Aplica Ocultar Chat de forma direta e infalível em todas as telas
  applyHideChat() {
    const hideChatBtn = document.getElementById('btn-top-hide-chat');
    if (hideChatBtn) {
      hideChatBtn.classList.toggle('bg-blue-600', this.hideChat);
      hideChatBtn.classList.toggle('text-white', this.hideChat);
      hideChatBtn.classList.toggle('font-bold', this.hideChat);
      hideChatBtn.classList.toggle('text-slate-300', !this.hideChat);
      hideChatBtn.classList.toggle('bg-slate-800', !this.hideChat);
    }

    const script = `(() => {
      const achaChat = () => {
        if (['/login', '/register', '/forgot', '/reset', '/verify'].some(p => location.pathname.startsWith(p))) return null;
        const marc = document.querySelector('[data-pgchat]');
        if (marc) return marc;
        const cb = document.querySelector('.chat-box, #chat-container, .chat-panel, .dock-chat, .game-chat, [data-guide="chat"]');
        if (cb) return cb;
        const inp = [...document.querySelectorAll('input, textarea')].find(i => /Falar em|Hablar en|Talk|Message|Chat/i.test(i.placeholder || ''));
        if (!inp) return null;
        let el = inp;
        for (let k = 0; k < 12 && el; k++) {
          const cs = getComputedStyle(el), r = el.getBoundingClientRect();
          if ((cs.position === 'absolute' || cs.position === 'fixed') && r.width >= 150 && r.height >= 100) return el;
          el = el.parentElement;
        }
        return null;
      };
      const c = achaChat();
      if (c) {
        c.dataset.pgchat = '1';
        c.style.display = ${this.hideChat} ? 'none' : '';
      }
      let ID = 'pg-hide-chat-style';
      let s = document.getElementById(ID);
      if (!${this.hideChat}) { if (s) s.remove(); return; }
      if (!s) { s = document.createElement('style'); s.id = ID; document.head.appendChild(s); }
      s.textContent = '.chat-box, #chat-container, .chat-panel, .dock-chat, .game-chat, [data-guide="chat"] { display: none !important; }';
    })()`;

    for (let i = 0; i < 4; i++) {
      const wv = document.getElementById(`webview-${i}`);
      if (wv) {
        wv.executeJavaScript(script).catch(() => {});
      }
    }
  }

  // Executa login automático em todas as contas que estão na tela de login
  runAllAutoLogins() {
    for (let i = 0; i < 4; i++) {
      this.runAutoLogin(i);
    }
  }

  runAutoLogin(i) {
    const wv = document.getElementById(`webview-${i}`);
    if (!wv) return;

    try {
      const url = wv.getURL ? wv.getURL() : '';
      if (url && url.includes('/play')) return;

      const acc = window.pkAccountsModal && window.pkAccountsModal.accounts[i];
      if (acc && acc.email && acc.senha) {
        window.pkAccountsModal._loginPanel(i, acc);
      }
    } catch(e) {}
  }

  setupWebviews() {
    const lastLogin = [0, 0, 0, 0];

    for (let i = 0; i < 4; i++) {
      const wv = document.getElementById(`webview-${i}`);
      if (!wv) continue;

      const attemptLogin = () => {
        try {
          const url = wv.getURL ? wv.getURL() : '';
          if (url && url.includes('/play')) return;
          if (Date.now() - lastLogin[i] < 5000) return;

          const acc = window.pkAccountsModal && window.pkAccountsModal.accounts[i];
          if (acc && acc.email && acc.senha) {
            lastLogin[i] = Date.now();
            window.pkAccountsModal._loginPanel(i, acc);
          }
        } catch(e) {}
      };

      const injectCollector = () => {
        if (!window.__pkCollectorScript) return;
        wv.executeJavaScript(window.__pkCollectorScript(i)).then(() => {
          this.applyCleanHud();
          this.applyHideChat();
          setTimeout(attemptLogin, 600);
        }).catch(() => {});
      };

      wv.addEventListener('dom-ready', () => {
        injectCollector();
        setTimeout(attemptLogin, 800);
      });

      wv.addEventListener('did-navigate', (e) => {
        const url = String(e.url || '');
        if (!url.includes('/play')) {
          setTimeout(attemptLogin, 600);
        }
        injectCollector();
      });

      wv.addEventListener('did-navigate-in-page', (e) => {
        if (!e.isMainFrame) return;
        const url = String(e.url || '');
        if (!url.includes('/play')) {
          setTimeout(attemptLogin, 600);
        }
        injectCollector();
      });

      // Escuta mensagens emitidas pelo coletor via console.log
      wv.addEventListener('console-message', (e) => {
        const msg = e && e.message;
        if (typeof msg !== 'string') return;

        // F2 apertado dentro do jogo → alterna Limpar Jogo
        if (msg === '__PK_F2__') {
          const btn = document.getElementById('btn-top-clean-hud');
          if (btn) btn.click();
          return;
        }

        // Catálogo de espécies e bases do jogo
        if (msg.startsWith('__PK_CATALOG__')) {
          try {
            const cat = JSON.parse(msg.slice(14));
            if (window.pkCatalog) window.pkCatalog.populateData(cat);
          } catch(err) {}
          return;
        }

        // Leitura de IVs sob o mouse (mochila, time, box, mercado/shopping)
        if (msg.startsWith('__PK_IV__')) {
          try {
            const ivData = JSON.parse(msg.slice('__PK_IV__'.length));
            if (window.pkIvCard) window.pkIvCard.showData(ivData);
          } catch(err) {}
          return;
        }

        // Telemetria de status e capturas para a sidebar
        if (msg.startsWith('__PK_STATS__')) {
          try {
            const stats = JSON.parse(msg.slice(12));
            if (window.pkSidebar) {
              const normalized = this._normalizeStats(stats, i);
              window.pkSidebar.updateAccountStats(i, normalized);

              if (stats.catchLog && stats.catchLog.length > 0) {
                window.pkSidebar.addCaptures(
                  stats.catchLog.map(c => ({
                    id: String(c.t) + '_' + String(i),
                    name: c.n || '?',
                    account: i,
                    shiny: !!c.sh,
                    ivTotal: c.iv || null,
                    quality: c.q || null,
                    stats: c.stats || null,
                    time: c.t || Date.now(),
                    level: c.level || 100
                  }))
                );
              }
            }
          } catch(err) {}
        }
      });
    }

    // Watchdog de login periódico: verifica a cada 4s se alguma conta na tela de login precisa ser preenchida
    setInterval(() => {
      for (let i = 0; i < 4; i++) {
        const wv = document.getElementById(`webview-${i}`);
        if (!wv) continue;
        try {
          const url = wv.getURL ? wv.getURL() : '';
          if ((!url || !url.includes('/play')) && Date.now() - lastLogin[i] > 10000) {
            const acc = window.pkAccountsModal && window.pkAccountsModal.accounts[i];
            if (acc && acc.email && acc.senha) {
              lastLogin[i] = Date.now();
              window.pkAccountsModal._loginPanel(i, acc);
            }
          }
        } catch(e) {}
      }
    }, 4000);
  }

  // Normaliza o payload de estatísticas para a SidebarPanel
  _normalizeStats(raw, i) {
    const a = raw.analyzer || raw.a || {};
    let status = raw.status || 'disconnected';
    if (!status || status === 'disconnected') {
      if (raw.huntSlug) status = 'hunting';
      else if (raw.trainer || raw.name) status = 'connected';
      else status = 'login';
    }

    const isConn = status === 'hunting' || status === 'connected' || status === 'city' || !!raw.connected;
    const trainerName = raw.trainer || raw.name || (window.pkAccountsModal && window.pkAccountsModal.accounts[i] && window.pkAccountsModal.accounts[i].name) || `Conta ${i + 1}`;
    const huntName = status === 'city' ? 'Cidade' : (raw.hunt || raw.huntName || (raw.huntSlug ? raw.huntSlug.replace(/[_-]+/g, ' ') : ''));

    return {
      connected: isConn,
      status: status,
      name: trainerName,
      trainer: trainerName,
      level: raw.level || 0,
      gold: raw.gold || 0,
      diamonds: raw.diamonds || 0,
      huntSlug: raw.huntSlug || '',
      huntName: huntName,
      kph: raw.kph != null ? raw.kph : (a.kph || 0),
      xph: raw.xph != null ? raw.xph : (a.xph || 0),
      gph: raw.gph != null ? raw.gph : (a.gph || 0),
      kills: raw.kills != null ? raw.kills : (a.kills || 0),
      xpg: raw.xp != null ? raw.xp : (a.xpg || 0),
      captures: raw.captures != null ? raw.captures : (a.captures || 0),
      shinyFound: raw.shinies != null ? raw.shinies : (a.shinyFound || 0),
      shinyCap: raw.shinyCaptures != null ? raw.shinyCaptures : (a.shinyCap || 0),
      seconds: raw.seconds != null ? raw.seconds : (a.seconds || 0),
      lootGold: raw.lootGold != null ? raw.lootGold : (a.lootGold || 0),
      capturesGold: raw.capturesGold != null ? raw.capturesGold : (a.capturesGold || 0),
      supplyGold: raw.supplyGold != null ? raw.supplyGold : (a.supplyGold || 0),
      ballsUsed: raw.ballsUsed != null ? raw.ballsUsed : (a.ballsUsed || 0),
      potsUsed: raw.potsUsed != null ? raw.potsUsed : (a.potsUsed || 0),
      balance: raw.balance != null ? raw.balance : (a.balance || 0),
      lastCatchT: raw.lastCatchT != null ? raw.lastCatchT : (a.lastCatchT || 0),
      sinceCatch: raw.sinceCatch != null ? raw.sinceCatch : (a.sinceCatch || 0),
      balls: raw.balls || 0,
      potions: raw.potions || 0,
      drops: raw.drops || []
    };
  }

  setupHotkeys() {
    document.addEventListener('keydown', (e) => {
      // F2 alterna Limpar Jogo
      if (e.key === 'F2') {
        e.preventDefault();
        const btn = document.getElementById('btn-top-clean-hud');
        if (btn) btn.click();
      }
      // P alterna Painel Lateral
      if (e.key === 'p' || e.key === 'P') {
        if (!e.target || e.target.tagName !== 'INPUT') {
          window.pkSidebar.toggle();
        }
      }
      // Números 1 a 4 focam conta se segurar Ctrl
      if (e.ctrlKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        window.pkGrid.focusAccount(+e.key - 1);
      }
    });
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
      success: 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200',
      warning: 'bg-amber-950/90 border-amber-500/50 text-amber-200',
      error: 'bg-red-950/90 border-red-500/50 text-red-200',
      info: 'bg-slate-900/90 border-slate-700 text-slate-200'
    };
    const cClass = colors[type] || colors.info;

    toast.className = `px-4 py-2.5 rounded-xl border ${cClass} shadow-xl text-xs font-semibold backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 flex items-center gap-2`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('translate-y-2', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.pkUI = new PkApp();
});
