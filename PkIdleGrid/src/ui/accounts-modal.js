// src/ui/accounts-modal.js
// Modal de Gerenciamento de Treinadores e Credenciais Seguras

class AccountsModal {
  constructor() {
    this.modal = document.getElementById('accounts-modal');
    this.accounts = [
      { email: '', senha: '', name: 'Conta 1' },
      { email: '', senha: '', name: 'Conta 2' },
      { email: '', senha: '', name: 'Conta 3' },
      { email: '', senha: '', name: 'Conta 4' }
    ];
    // Promise que resolve após carregar as credenciais do disco.
    // app.js aguarda este promise antes de configurar os webviews.
    this.loadPromise = this._init();
  }

  async _init() {
    if (!this.modal) return;

    // Carrega credenciais salvas com segurança no SO
    try {
      if (window.pkAPI && window.pkAPI.loadCreds) {
        const saved = await window.pkAPI.loadCreds();
        if (Array.isArray(saved) && saved.length > 0) {
          for (let i = 0; i < 4; i++) {
            if (saved[i]) this.accounts[i] = { ...this.accounts[i], ...saved[i] };
          }
        }
      }
    } catch {}

    // Preenche os campos
    this.fillForm();

    // Fechar modal
    const closeBtn = document.getElementById('btn-close-accounts');
    if (closeBtn) closeBtn.onclick = () => this.hide();

    // Salvar
    const saveBtn = document.getElementById('btn-save-accounts');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        this.readForm();
        if (window.pkAPI && window.pkAPI.saveCreds) {
          const ok = await window.pkAPI.saveCreds(this.accounts);
          if (ok) {
            if (window.pkUI) window.pkUI.showToast('✅ Contas salvas com sucesso (criptografadas)!', 'success');
          } else {
            if (window.pkUI) window.pkUI.showToast('⚠️ Erro ao salvar credenciais.', 'warning');
          }
        }
        this.hide();
        this.updateAccountHeaders();
        this.loginAll();
      };
    }

    // Botões de Limpar Cache individual
    for (let i = 0; i < 4; i++) {
      const clearBtn = document.getElementById(`btn-clear-cache-${i}`);
      if (clearBtn) {
        clearBtn.onclick = async () => {
          if (confirm(`Deseja limpar os dados/cookies da Conta ${i + 1}? A senha continuará salva.`)) {
            if (window.pkAPI && window.pkAPI.clearAccount) {
              await window.pkAPI.clearAccount(i);
              if (window.pkUI) window.pkUI.showToast(`Conta ${i + 1} limpa. Recarregando...`, 'info');
              const wv = document.getElementById(`webview-${i}`);
              if (wv) wv.reload();
            }
          }
        };
      }
    }

    this.updateAccountHeaders();
  }

  fillForm() {
    for (let i = 0; i < 4; i++) {
      const acc = this.accounts[i];
      const nameInp = document.getElementById(`acc-name-${i}`);
      const emailInp = document.getElementById(`acc-email-${i}`);
      const passInp = document.getElementById(`acc-pass-${i}`);

      if (nameInp) nameInp.value = acc.name || `Conta ${i + 1}`;
      if (emailInp) emailInp.value = acc.email || '';
      if (passInp) passInp.value = acc.senha || '';
    }
  }

  readForm() {
    for (let i = 0; i < 4; i++) {
      const nameInp = document.getElementById(`acc-name-${i}`);
      const emailInp = document.getElementById(`acc-email-${i}`);
      const passInp = document.getElementById(`acc-pass-${i}`);

      this.accounts[i] = {
        name: (nameInp && nameInp.value) || `Conta ${i + 1}`,
        email: (emailInp && emailInp.value) || '',
        senha: (passInp && passInp.value) || ''
      };
    }
  }

  updateAccountHeaders() {
    for (let i = 0; i < 4; i++) {
      const name = this.accounts[i].name || `Conta ${i + 1}`;
      const headerTitle = document.getElementById(`panel-title-${i}`);
      if (headerTitle) headerTitle.textContent = name;

      const focusTab = document.getElementById(`focus-tab-${i}`);
      if (focusTab) focusTab.textContent = name;

      const sideTab = document.getElementById(`side-tab-${i}`);
      if (sideTab) sideTab.title = name;
    }
  }

  show() {
    this.fillForm();
    this.modal.classList.remove('hidden');
  }

  hide() {
    this.modal.classList.add('hidden');
  }

  // Executa o login completo (igual ao PokeGrid) em todos os webviews
  loginAll() {
    this.readForm();
    let count = 0;
    for (let i = 0; i < 4; i++) {
      const acc = this.accounts[i];
      if (acc.email && acc.senha) {
        this._loginPanel(i, acc);
        count++;
      }
    }

    if (count > 0) {
      if (window.pkUI) window.pkUI.showToast(`🔑 Enviando login para ${count} contas...`, 'info');
    } else {
      if (window.pkUI) window.pkUI.showToast('⚠️ Preencha os emails e senhas em "Treinadores" primeiro.', 'warning');
      this.show();
    }
  }

  // Login via executeJavaScript idêntico ao PokeGrid (usando native setter + Turnstile watcher)
  _loginPanel(index, cred) {
    const wv = document.getElementById(`webview-${index}`);
    if (!wv) return;

    const email = cred.email;
    const senha = cred.senha;

    const script = `(async () => {
      const setVal = (el, val) => {
        const st = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        st.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const findBtn = () => [...document.querySelectorAll('button')].find(x => x.type === 'submit' || /auth-imgbtn/.test(x.className));
      for (let t = 0; t < 40; t++) {
        const inputs = [...document.querySelectorAll('input')];
        const u = inputs.find(i => i.autocomplete === 'username' || i.type === 'email');
        const p = inputs.find(i => i.autocomplete === 'current-password' || i.type === 'password');
        const b = findBtn();
        if (u && p && b) {
          const EMAIL = ${JSON.stringify(email)}, SENHA = ${JSON.stringify(senha)};
          const preenche = () => {
            const ii = [...document.querySelectorAll('input')];
            const uu = ii.find(i => i.autocomplete === 'username' || i.type === 'email');
            const pp = ii.find(i => i.autocomplete === 'current-password' || i.type === 'password');
            if (!uu || !pp) return false;
            if (uu.value !== EMAIL) setVal(uu, EMAIL);
            if (pp.value !== SENHA) setVal(pp, SENHA);
            return uu.value === EMAIL && pp.value === SENHA;
          };
          preenche();
          if (!window.__loginWatch) {
            window.__loginWatch = true;
            let ciclos = 0;
            const w = setInterval(() => {
              const bb = findBtn();
              if (location.pathname.startsWith('/play') || !bb || ++ciclos > 1200) {
                clearInterval(w); window.__loginWatch = false; return;
              }
              const ok = preenche();
              const tk = document.querySelector('input[name=cf-turnstile-response]');
              if (ok && (!tk || tk.value) && !bb.disabled) { clearInterval(w); window.__loginWatch = false; bb.click(); }
            }, 500);
          }
          return 'preenchido';
        }
        await new Promise(r => setTimeout(r, 300));
      }
      return 'sem-form';
    })()`;

    try {
      wv.executeJavaScript(script).catch(() => {});
    } catch {}
  }
}

window.AccountsModal = AccountsModal;
