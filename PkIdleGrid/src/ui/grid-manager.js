// src/ui/grid-manager.js
// Gerenciador de layout responsivo, grade 2x2, tela cheia/foco e redimensionamento livre

class GridManager {
  constructor() {
    this.container = document.getElementById('panels-container');
    this.panels = []; // [panel0, panel1, panel2, panel3]
    this.webviews = [];
    this.layoutMode = 'grid-4'; // 'grid-4', 'focus-1', 'split-2'
    this.focusedIndex = 0;
    this.zoomLevels = [1, 1, 1, 1];
    this.mutedStates = [false, false, false, false];

    // Proporção de redimensionamento manual (splitters)
    this.splitX = 50; // 50% largura esquerda
    this.splitY = 50; // 50% altura superior

    this.init();
  }

  init() {
    // Referências aos 4 painéis
    for (let i = 0; i < 4; i++) {
      const panel = document.getElementById(`panel-${i}`);
      const wv = document.getElementById(`webview-${i}`);
      this.panels.push(panel);
      this.webviews.push(wv);

      this.setupPanelControls(i);
    }

    this.setupSplitters();
    this.applyLayout();
  }

  setupPanelControls(index) {
    const panel = this.panels[index];
    const wv = this.webviews[index];

    // Botão Maximizar / Foco
    const maxBtn = panel.querySelector('.btn-maximize');
    if (maxBtn) {
      maxBtn.onclick = () => {
        if (this.layoutMode === 'focus-1' && this.focusedIndex === index) {
          // Já está focado: restaura para a grade 4
          this.setLayoutMode('grid-4');
        } else {
          // Foca nesta conta
          this.focusAccount(index);
        }
      };
    }

    // Botão Zoom Menos
    const zoomOut = panel.querySelector('.btn-zoom-out');
    if (zoomOut) {
      zoomOut.onclick = () => {
        this.zoomLevels[index] = Math.max(0.5, this.zoomLevels[index] - 0.1);
        try { wv.setZoomFactor(this.zoomLevels[index]); } catch {}
        this.updateZoomDisplay(index);
      };
    }

    // Botão Zoom Mais
    const zoomIn = panel.querySelector('.btn-zoom-in');
    if (zoomIn) {
      zoomIn.onclick = () => {
        this.zoomLevels[index] = Math.min(2.0, this.zoomLevels[index] + 0.1);
        try { wv.setZoomFactor(this.zoomLevels[index]); } catch {}
        this.updateZoomDisplay(index);
      };
    }

    // Botão Mudo
    const muteBtn = panel.querySelector('.btn-mute');
    if (muteBtn) {
      muteBtn.onclick = () => {
        this.mutedStates[index] = !this.mutedStates[index];
        try { wv.setAudioMuted(this.mutedStates[index]); } catch {}
        muteBtn.innerHTML = this.mutedStates[index] ? '🔇' : '🔊';
        muteBtn.classList.toggle('text-red-400', this.mutedStates[index]);
      };
    }

    // Botão Recarregar
    const reloadBtn = panel.querySelector('.btn-reload');
    if (reloadBtn) {
      reloadBtn.onclick = () => {
        try { wv.reload(); } catch {}
      };
    }
  }

  updateZoomDisplay(index) {
    const disp = this.panels[index].querySelector('.zoom-display');
    if (disp) {
      disp.textContent = `${Math.round(this.zoomLevels[index] * 100)}%`;
    }
  }

  setupSplitters() {
    const splitV = document.getElementById('splitter-v');
    const splitH = document.getElementById('splitter-h');

    let draggingV = false;
    let draggingH = false;

    if (splitV) {
      splitV.onmousedown = (e) => {
        draggingV = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
      };
    }

    if (splitH) {
      splitH.onmousedown = (e) => {
        draggingH = true;
        document.body.style.cursor = 'row-resize';
        e.preventDefault();
      };
    }

    window.addEventListener('mousemove', (e) => {
      if (!draggingV && !draggingH) return;
      const rect = this.container.getBoundingClientRect();

      if (draggingV) {
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        this.splitX = Math.max(20, Math.min(80, pct));
      }
      if (draggingH) {
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        this.splitY = Math.max(20, Math.min(80, pct));
      }

      this.applyCustomGridSizes();
    });

    window.addEventListener('mouseup', () => {
      if (draggingV || draggingH) {
        draggingV = false;
        draggingH = false;
        document.body.style.cursor = '';
      }
    });
  }

  applyCustomGridSizes() {
    if (this.layoutMode !== 'grid-4') return;
    this.container.style.gridTemplateColumns = `${this.splitX}% 4px calc(${100 - this.splitX}% - 4px)`;
    this.container.style.gridTemplateRows = `${this.splitY}% 4px calc(${100 - this.splitY}% - 4px)`;
  }

  setLayoutMode(mode) {
    this.layoutMode = mode;
    this.applyLayout();
    this.updateActiveModeButtons();
  }

  focusAccount(index) {
    this.focusedIndex = index;
    this.setLayoutMode('focus-1');
  }

  applyLayout() {
    const splitV = document.getElementById('splitter-v');
    const splitH = document.getElementById('splitter-h');
    const tabsBar = document.getElementById('focus-tabs-bar');

    if (this.layoutMode === 'focus-1') {
      // Modo Foco: Apenas 1 conta visível em 100% da tela
      if (splitV) splitV.style.display = 'none';
      if (splitH) splitH.style.display = 'none';
      if (tabsBar) tabsBar.style.display = 'flex';

      this.container.style.display = 'block';
      this.container.style.gridTemplateColumns = 'none';
      this.container.style.gridTemplateRows = 'none';

      this.panels.forEach((p, idx) => {
        if (idx === this.focusedIndex) {
          p.style.display = 'flex';
          p.style.width = '100%';
          p.style.height = '100%';
          p.classList.remove('col-span-1', 'row-span-1');
        } else {
          p.style.display = 'none';
        }
      });

      this.updateFocusTabs();
    } else if (this.layoutMode === 'split-2') {
      // Modo 2 Contas: Lado a Lado (50% / 50%)
      if (splitV) splitV.style.display = 'block';
      if (splitH) splitH.style.display = 'none';
      if (tabsBar) tabsBar.style.display = 'none';

      this.container.style.display = 'grid';
      this.container.style.gridTemplateColumns = '1fr 4px 1fr';
      this.container.style.gridTemplateRows = '1fr';

      this.panels.forEach((p, idx) => {
        if (idx === 0 || idx === 1) {
          p.style.display = 'flex';
          p.style.width = '100%';
          p.style.height = '100%';
        } else {
          p.style.display = 'none';
        }
      });
    } else {
      // Modo Padrão: Grade 2x2 com 4 Contas
      if (splitV) splitV.style.display = 'block';
      if (splitH) splitH.style.display = 'block';
      if (tabsBar) tabsBar.style.display = 'none';

      this.container.style.display = 'grid';
      this.applyCustomGridSizes();

      this.panels.forEach((p) => {
        p.style.display = 'flex';
        p.style.width = '100%';
        p.style.height = '100%';
      });
    }
  }

  updateFocusTabs() {
    for (let i = 0; i < 4; i++) {
      const tab = document.getElementById(`focus-tab-${i}`);
      if (tab) {
        if (i === this.focusedIndex) {
          tab.classList.add('bg-blue-600', 'text-white', 'border-blue-500');
          tab.classList.remove('bg-slate-800', 'text-slate-400', 'border-slate-700');
        } else {
          tab.classList.remove('bg-blue-600', 'text-white', 'border-blue-500');
          tab.classList.add('bg-slate-800', 'text-slate-400', 'border-slate-700');
        }
      }
    }
  }

  updateActiveModeButtons() {
    const btn4 = document.getElementById('mode-btn-grid4');
    const btn1 = document.getElementById('mode-btn-focus');
    const btn2 = document.getElementById('mode-btn-split2');

    const setActive = (btn, active) => {
      if (!btn) return;
      if (active) {
        btn.classList.add('bg-blue-600', 'text-white');
        btn.classList.remove('bg-slate-800', 'text-slate-400');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-slate-800', 'text-slate-400');
      }
    };

    setActive(btn4, this.layoutMode === 'grid-4');
    setActive(btn1, this.layoutMode === 'focus-1');
    setActive(btn2, this.layoutMode === 'split-2');
  }
}

window.GridManager = GridManager;

