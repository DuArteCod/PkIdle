// src/ui/pokedex-travel.js
// Modal da Pokédex com Busca e Viagem Rápida para Hunts

class PokedexTravelModal {
  constructor() {
    this.modal = document.getElementById('pokedex-modal');
    this.searchInput = document.getElementById('pokedex-search-input');
    this.resultsContainer = document.getElementById('pokedex-results');
    this.selectedPokemon = null;
    this.targetAccount = 0; // 0, 1, 2, 3 ou -1 (todas)

    this.init();
  }

  init() {
    if (!this.modal) return;

    // Busca com debounce
    let timer = null;
    if (this.searchInput) {
      this.searchInput.oninput = (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.search(e.target.value);
        }, 250);
      };
    }

    // Fechar modal
    const closeBtn = document.getElementById('btn-close-pokedex');
    if (closeBtn) closeBtn.onclick = () => this.hide();

    // Seletor de conta de destino
    const accSelect = document.getElementById('pokedex-target-account');
    if (accSelect) {
      accSelect.onchange = (e) => {
        this.targetAccount = +e.target.value;
      };
    }
  }

  show() {
    this.modal.classList.remove('hidden');
    if (this.searchInput) {
      this.searchInput.focus();
      this.search(this.searchInput.value || 'pikachu');
    }
  }

  hide() {
    this.modal.classList.add('hidden');
  }

  search(query) {
    if (!window.pkCatalog) return;
    const q = (query || '').trim();
    const results = window.pkCatalog.findPokemon(q);
    this.renderResults(results);
  }

  renderResults(list) {
    if (!this.resultsContainer) return;
    this.resultsContainer.innerHTML = '';

    if (!list || list.length === 0) {
      this.resultsContainer.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-500">
          <p class="text-base font-medium">Nenhum Pokémon encontrado.</p>
          <p class="text-xs text-slate-600 mt-1">Deixe as contas conectadas para carregar o catálogo do jogo.</p>
        </div>
      `;
      return;
    }

    list.forEach(pk => {
      const hunts = window.pkCatalog.getHuntsForPokemon(pk.lowerName);
      const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pk.id}.png`;

      const card = document.createElement('div');
      card.className = 'bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between transition duration-150';

      let huntsHtml = '';
      if (hunts.length > 0) {
        huntsHtml = hunts.map(h => `
          <div class="flex items-center justify-between py-1.5 border-b border-slate-700/40 last:border-0 text-xs">
            <div>
              <span class="font-medium text-slate-200">${h.name}</span>
              ${h.minLevel > 0 ? `<span class="ml-1 text-[10px] text-slate-400 font-mono">(Nv. ${h.minLevel})</span>` : ''}
            </div>
            <button class="btn-travel bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded px-2.5 py-1 text-[11px] font-semibold transition flex items-center gap-1"
                    data-slug="${h.slug}" data-name="${h.name}">
              <span>🚀</span> Viajar
            </button>
          </div>
        `).join('');
      } else {
        huntsHtml = `
          <p class="text-xs text-slate-500 italic py-2">Sem hunt direta mapeada ou exclusivo de evento.</p>
        `;
      }

      card.innerHTML = `
        <div>
          <div class="flex items-center gap-3">
            <div class="w-14 h-14 bg-slate-900/90 rounded-lg border border-slate-700/50 flex items-center justify-center p-1">
              <img src="${spriteUrl}" alt="${pk.name}" class="w-full h-full object-contain" onerror="this.src='assets/pokeball.svg'">
            </div>
            <div>
              <h4 class="font-bold text-white text-base leading-tight">${pk.name}</h4>
              <div class="flex items-center gap-1.5 mt-1">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300">${pk.type1}</span>
                ${pk.type2 ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300">${pk.type2}</span>` : ''}
              </div>
            </div>
          </div>

          <div class="mt-3 bg-slate-900/60 rounded-lg p-2.5 border border-slate-800">
            <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Hunts Disponíveis</span>
              <span class="text-slate-500 font-normal">${hunts.length} locais</span>
            </div>
            <div class="flex flex-col max-h-36 overflow-y-auto pr-1">
              ${huntsHtml}
            </div>
          </div>
        </div>
      `;

      // Eventos de clique em "Viajar"
      card.querySelectorAll('.btn-travel').forEach(btn => {
        btn.onclick = () => {
          const slug = btn.getAttribute('data-slug');
          const name = btn.getAttribute('data-name');
          this.executeTravel(slug, name);
        };
      });

      this.resultsContainer.appendChild(card);
    });
  }

  executeTravel(slug, huntName) {
    if (!slug) return;
    const target = this.targetAccount;

    const sendToWebview = (idx) => {
      const wv = document.getElementById(`webview-${idx}`);
      if (wv) {
        try {
          wv.executeJavaScript(`window.__pkTravel(${JSON.stringify(slug)})`).catch(() => {});
        } catch {}
      }
    };

    if (target === -1) {
      // Todas as contas
      for (let i = 0; i < 4; i++) sendToWebview(i);
      window.pkUI.showToast(`🚀 Todas as contas viajando para ${huntName}!`, 'success');
    } else {
      // Conta específica
      sendToWebview(target);
      window.pkUI.showToast(`🚀 Conta ${target + 1} viajando para ${huntName}!`, 'success');
    }

    this.hide();
  }
}

window.PokedexTravelModal = PokedexTravelModal;

