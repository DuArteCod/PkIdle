// src/game/collector.js
// Coletor otimizado injetado em cada webview do jogo (Zero CPU overhead, ultraleve)

// Carrega os dados das hunts do catálogo global sem travar o renderer do navegador
var huntsData = (typeof window !== 'undefined' && window.PK_HUNTS_DATA) ? window.PK_HUNTS_DATA : {};
var creaturesData = (typeof window !== 'undefined' && window.PK_CREATURES_TO_HUNTS) ? window.PK_CREATURES_TO_HUNTS : {};

if (typeof require !== 'undefined') {
  try {
    const fs = require('fs');
    const path = require('path');
    const huntsPath = path.join(__dirname, '../domain/hunts-data.json');
    if (fs.existsSync(huntsPath)) huntsData = JSON.parse(fs.readFileSync(huntsPath, 'utf8'));
    const creaturesPath = path.join(__dirname, '../domain/creatures-to-hunts.json');
    if (fs.existsSync(creaturesPath)) creaturesData = JSON.parse(fs.readFileSync(creaturesPath, 'utf8'));
  } catch (e) {}
}

// Função que roda dentro de cada webview do jogo
function collectorFunction(accountIndex, embeddedHunts, embeddedCreatures) {
  if (window.__pkCollectorActive) return;
  window.__pkCollectorActive = true;

  var ACC_INDEX = Number(accountIndex) || 0;
  var huntMap = embeddedHunts || {};
  var creatureToSlug = embeddedCreatures || {};

  // Modo Leve nativo do jogo (economiza RAM e GPU nos 4 painéis)
  try {
    var k = 'pokeweb:settings';
    var curSett = null;
    try { curSett = JSON.parse(localStorage.getItem(k) || '{}'); } catch(x) {}
    if (!curSett || typeof curSett !== 'object') curSett = {};
    if (curSett.lite !== true || curSett.fps !== 30) {
      curSett.lite = true;
      curSett.fps = 30;
      localStorage.setItem(k, JSON.stringify(curSett));
    }
  } catch(e) {}

  // Limitador de taxa de quadros. A hunt acontece no servidor; 15 FPS deixa a
  // interface responsiva e evita que quatro painéis disputem a GPU sem necessidade.
  if (!window.__eco) {
    var sEco = window.__eco = {
      native: window.requestAnimationFrame.bind(window),
      cancel: window.cancelAnimationFrame.bind(window),
      fps: 15,
      last: 0,
      seq: 1e9,
      map: new Map()
    };
    window.requestAnimationFrame = function(cb) {
      var id = ++sEco.seq;
      var run = function(ts) { sEco.map.delete(id); cb(ts); };
      if (!sEco.fps) sEco.map.set(id, { r: sEco.native(run) });
      else sEco.map.set(id, {
        t: setTimeout(function() {
          if (sEco.map.has(id)) {
            sEco.last = performance.now();
            sEco.map.set(id, { r: sEco.native(run) });
          }
        }, Math.max(0, 1000 / sEco.fps - (performance.now() - sEco.last)))
      });
      return id;
    };
    window.cancelAnimationFrame = function(id) {
      var h = sEco.map.get(id);
      if (!h) return id < 1e9 ? sEco.cancel(id) : undefined;
      sEco.map.delete(id);
      if (h.t) clearTimeout(h.t);
      else sEco.cancel(h.r);
    };
  }

  var nL = function(v) {
    var m = String(v == null ? '' : v).match(/[0-9]+([.,][0-9]+)?/);
    return m ? +m[0].replace(',', '.') : 0;
  };

  var mk = function() {
    return {
      start: Date.now(),
      kills: 0,
      xp: 0,
      balls: 0,
      captures: 0,
      drops: {},
      shinyN: 0,
      shinySeen: {},
      shinyCapN: 0,
      faintN: 0,
      sellG: 0,
      supGold: 0,
      supN: 0,
      supBase: null,
      slug: ''
    };
  };

  var P = {
    ws: {},
    api: {},
    sess: mk(),
    prev: null,
    knownPokes: {},
    pokesBaselined: false,
    basesByName: {},
    sock: null,
    vSlug: null,
    vT: 0,
    oT: 0,
    tU: Date.now()
  };
  window.__poke = P;

  var tU = function() {
    P.tU = Math.max(Date.now(), (P.tU || 0) + 1);
    return P.tU;
  };

  var naoCap = function(pk) {
    var c = P.choco;
    if (!c || Date.now() - c.t > 60000 || (+pk.speciesId || +pk.pokeId || 0) !== c.sid) return false;
    P.choco = null;
    return true;
  };

  // Intercepta e autentica fetch para carregar /api/characters/me e itens
  var OF = window.fetch;
  window.fetch = function() {
    var a = arguments;
    try {
      var u = (a[0] && a[0].url) || a[0];
      if (typeof u === 'string') {
        var key = u.split('?')[0];
        if (key === '/api/characters/me' || key === '/game/creatures.json' || key === '/game/items.json') {
          var p = OF.apply(this, a);
          p.then(function(r) {
            var c = r.clone();
            c.json().then(function(j) {
              if (key === '/api/characters/me' && j && j.character) {
                P.api['/api/characters/me'] = j;
              } else if (key === '/game/creatures.json' && j && j.creatures) {
                P.api['/game/creatures.json'] = j;
                j.creatures.forEach(function(cr) {
                  if (cr && cr.name) {
                    var k = String(cr.name).toLowerCase().trim();
                    P.basesByName[k] = [+cr.baseHp || 60, +cr.baseAtk || 60, +cr.baseDef || 60, +cr.baseSpAtk || 60, +cr.baseSpDef || 60, +cr.baseSpeed || 60];
                  }
                });
                if (!P.catalogAnnounced) {
                  P.catalogAnnounced = true;
                  try { console.log('__PK_CATALOG__' + JSON.stringify(j)); } catch(e) {}
                }
              } else if (key === '/game/items.json') {
                P.api['/game/items.json'] = j;
              }
            }).catch(function() {});
          }).catch(function() {});
          return p;
        }
      }
    } catch(e) {}
    return OF.apply(this, a);
  };

  // Busca inicial com token de autenticação da sessão se existir
  var fetchAuth = function() {
    try {
      var tk = null;
      try { tk = JSON.parse(sessionStorage.getItem('pokeweb:tokens') || localStorage.getItem('pokeweb:tokens') || 'null'); } catch(x) {}
      var h = tk && tk.accessToken ? { headers: { Authorization: 'Bearer ' + tk.accessToken } } : undefined;
       if (h) P.auth = h.headers.Authorization;
      fetch('/api/characters/me', h).then(function(r) { return r.json(); }).then(function(j) {
        if (j && j.character) P.api['/api/characters/me'] = j;
      }).catch(function() {});
      // Os catálogos são estáticos durante a execução. Baixá-los e serializá-los a
      // cada 30 s em cada conta era uma fonte importante de CPU e memória.
      if (!P.api['/game/creatures.json']) fetch('/game/creatures.json').then(function(r) { return r.json(); }).then(function(j) {
        if (j && j.creatures) {
          P.api['/game/creatures.json'] = j;
          j.creatures.forEach(function(cr) {
            if (cr && cr.name) {
              var k = String(cr.name).toLowerCase().trim();
              P.basesByName[k] = [+cr.baseHp || 60, +cr.baseAtk || 60, +cr.baseDef || 60, +cr.baseSpAtk || 60, +cr.baseSpDef || 60, +cr.baseSpeed || 60];
            }
          });
          if (!P.catalogAnnounced) {
            P.catalogAnnounced = true;
            try { console.log('__PK_CATALOG__' + JSON.stringify(j)); } catch(e) {}
          }
        }
      }).catch(function() {});
      if (!P.api['/game/items.json']) fetch('/game/items.json').then(function(r) { return r.json(); }).then(function(j) {
        if (j && j.items) P.api['/game/items.json'] = j;
      }).catch(function() {});
      // O jogo só manda o inventário quando solicitado em algumas telas. Pedir a
      // lista junto da atualização já existente mantém o cálculo de suprimentos
      // correto sem criar outro temporizador.
      try {
        if (P.sock && P.sock.readyState === 1) P.sock.send(JSON.stringify({ type: 'inv-get' }));
      } catch (e) {}
    } catch(e) {}
  };
  setTimeout(fetchAuth, 800);
  setInterval(fetchAuth, 30000);

  // Cálculo preciso de atributos sem zeros (HP, ATK, DEF, SPA, SPD, VEL)
  var getPkStats = function(pk) {
    var s = pk.stats || (pk.pokemon && pk.pokemon.stats) || (pk.poke && pk.poke.stats) || {};
    var hp = +s.hp || +pk.hp || +pk.maxHp || +pk.hpMax || 0;
    var atk = +s.atk || +pk.atk || 0;
    var def = +s.def || +pk.def || 0;
    var spa = +s.spAtk || +s.spa || +pk.spAtk || +pk.spa || 0;
    var spd = +s.spDef || +s.spd || +pk.spDef || +pk.spd || 0;
    var vel = +s.speed || +s.vel || +pk.speed || +pk.vel || 0;

    if (!hp && !atk && !def && !spa && !spd && !vel) {
      var nm = String(pk.name || '').toLowerCase().replace(/\s*✨$/, '').replace(/\s*\(ditto\)/i, '').trim();
      var b = (P.basesByName && P.basesByName[nm]) || [60, 60, 60, 60, 60, 60];
      var lv = +pk.level || 100;
      var q = +pk.quality || 1;
      var ivTot = +pk.ivTotal || 96;
      var avgIv = Math.max(1, Math.min(32, Math.round(ivTot / 6)));
      var EXP = [.95, .80, .80, .80, .80, .95];
      var proj = function(base, idx) {
        return Math.max(1, Math.round((base + 2 * avgIv) * (lv / 100) * Math.pow(q, EXP[idx])));
      };
      hp = proj(b[0], 0);
      atk = proj(b[1], 1);
      def = proj(b[2], 2);
      spa = proj(b[3], 3);
      spd = proj(b[4], 4);
      vel = proj(b[5], 5);
    }
    return { hp: hp, atk: atk, def: def, spa: spa, spd: spd, vel: vel };
  };

  // Tratador ultra-eficiente de mensagens do WebSocket (Sem emitStats síncrono!)
  var onSocketMessage = function(e) {
    try {
      if (typeof e.data !== 'string') return;
      var m = JSON.parse(e.data);
      if (!m || !m.type) return;

      if (m.type === 'pokes-chunk') {
        var g = +m.gen, q = +m.seq, tt = +m.total;
        var C = P.pkC;
        if (!C || C.gen !== g) C = P.pkC = { gen: g, total: tt, parts: {} };
        C.parts[q] = Array.isArray(m.list) ? m.list : [];
        if (!(C.total >= 1) || Object.keys(C.parts).length < C.total) return;
        var L = [];
        for (var k = 0; k < C.total; k++) L.push.apply(L, C.parts[k] || []);
        P.pkC = null;
        m = { type: 'pokes', list: L };
      }

      P.ws[m.type] = m;
      var S = P.sess;

      if (m.type === 'field-init') {
        var sl = m.slug || '';
        P.fiT = Date.now();
        if (P.lastSlug !== sl) {
          P.prev = P.sess;
          P.sess = mk();
          P.sess.slug = sl;
          P.lastSlug = sl;
        }
      } else if (m.type === 'field-none' || m.type === 'field-teleport-city') {
        P.ws['field-init'] = null;
        P.vSlug = null;
        S.saiuT = Date.now();
      } else if (m.type === 'field-kill') {
        S.kills = (S.kills || 0) + 1;
        S.lastKillT = Date.now();
        S.xp = (S.xp || 0) + (m.xpGained || 0);
        (m.loot || []).forEach(function(l) {
          var d = S.drops[l.itemId] || (S.drops[l.itemId] = { name: l.name, qty: 0 });
          d.qty += (l.qty || 0);
        });
        if (m.shiny) {
          S.shinyN = (S.shinyN || 0) + 1;
          var SL = P.shinyLog = P.shinyLog || [];
          SL.push({ n: m.speciesName || m.name || '', sid: m.speciesId || m.pokeId || 0, def: 1, t: tU() });
          if (SL.length > 30) SL.shift();
        }
      } else if (m.type === 'catch-result') {
        S.balls = (S.balls || 0) + 1;
        S.sinceCatch = (S.sinceCatch || 0) + 1;
        var ballCatalog = (P.ws.balls && P.ws.balls.catalog) || [];
        var usedBall = ballCatalog.find(function(ball) { return ball && ball.id === m.ballId; });
        if (usedBall && !usedBall.infinite) S.supGold = (S.supGold || 0) + (+usedBall.priceGold || +usedBall.npcPrice || 0);
        if (m.success) {
          S.captures = (S.captures || 0) + 1;
          S.lastCatchT = Date.now();
          S.sinceCatch = 0;
        }
      } else if (m.type === 'inventory') {
        // Estima o gasto de cura pela queda no inventário. Itens infinitos ou com
        // validade não representam dinheiro gasto pela hunt.
        var itemDoc = P.api['/game/items.json'];
        var itemCatalog = {};
        (itemDoc && itemDoc.items || []).forEach(function(item) { itemCatalog[item.id] = item; });
        var currentSupplies = {};
        (m.items || []).forEach(function(item) {
          var info = itemCatalog[item.itemId] || {};
          if ((info.category === 'heal' || info.category === 'potion') && !item.infinite && !item.expiresAt) currentSupplies[item.itemId] = +item.quantity || 0;
        });
        if (S.supBase) Object.keys(S.supBase).forEach(function(id) {
          var used = (S.supBase[id] || 0) - (currentSupplies[id] || 0);
          if (used > 0) {
            var supply = itemCatalog[id] || {};
            S.supGold = (S.supGold || 0) + used * (+supply.priceGold || +supply.npcPrice || 0);
            S.supN = (S.supN || 0) + used;
          }
        });
        S.supBase = currentSupplies;
      } else if (m.type === 'poke-delta') {
        var pk = m.poke;
        if (pk) {
          var LP = P.ws.pokes && P.ws.pokes.list;
          if (LP) {
            var ix = LP.findIndex(function(x) { return x.id === pk.id; });
            if (ix >= 0) Object.assign(LP[ix], pk);
            else LP.push(pk);
          }
          if (P.pokesBaselined && !P.knownPokes[pk.id] && !naoCap(pk)) {
            S.sellG = (S.sellG || 0) + (pk.sellValue || 0);
            if (pk.shiny) {
              S.shinyCapN = (S.shinyCapN || 0) + 1;
              var SL2 = P.shinyLog = P.shinyLog || [];
              SL2.push({ n: pk.name || '', sid: pk.speciesId || pk.pokeId || 0, cap: 1, t: tU() });
              if (SL2.length > 30) SL2.shift();
            }
            var CL = P.catchLog = P.catchLog || [];
            CL.push({
              id: pk.id,
              n: pk.name || '?',
              iv: nL(pk.ivTotal),
              q: nL(pk.quality),
              sh: !!pk.shiny,
              t: tU(),
              account: ACC_INDEX,
              level: pk.level || 1,
              stats: getPkStats(pk)
            });
            if (CL.length > 80) CL.shift();
          }
          P.knownPokes[pk.id] = 1;
        }
      } else if (m.type === 'pokes') {
        (m.list || []).forEach(function(pk) {
          if (!pk) return;
          if (P.pokesBaselined && !P.knownPokes[pk.id] && !naoCap(pk)) {
            S.sellG = (S.sellG || 0) + (pk.sellValue || 0);
            if (pk.shiny) {
              S.shinyCapN = (S.shinyCapN || 0) + 1;
              var SL3 = P.shinyLog = P.shinyLog || [];
              SL3.push({ n: pk.name || '', sid: pk.speciesId || pk.pokeId || 0, cap: 1, t: tU() });
              if (SL3.length > 30) SL3.shift();
            }
            var CL2 = P.catchLog = P.catchLog || [];
            CL2.push({
              id: pk.id,
              n: pk.name || '?',
              iv: nL(pk.ivTotal),
              q: nL(pk.quality),
              sh: !!pk.shiny,
              t: tU(),
              account: ACC_INDEX,
              level: pk.level || 1,
              stats: getPkStats(pk)
            });
            if (CL2.length > 80) CL2.shift();
          }
          P.knownPokes[pk.id] = 1;
        });
        if (!P.pokesBaselined) P.pokesBaselined = true;
      }
    } catch(err) {}
  };

  // Interceptação 100% segura do WebSocket nativo com preservação dos atributos estáticos
  var OW = window.WebSocket;
  window.WebSocket = function() {
    var s = Reflect.construct(OW, arguments);
    try {
      if (typeof location !== 'undefined') {
        var uw = new URL(String(arguments[0]), location.href);
        if (uw.host !== location.host || !uw.pathname.startsWith('/ws')) {
          return s;
        }
      }
    } catch(err) {
      return s;
    }

    P.sock = s;
    s.addEventListener('open', function() {
      P.oT = Date.now();
      P.pkC = null;
    });

    s.addEventListener('close', function(e) {
      if (P.sock === s) P.wc = e.code;
    });

    var origSend = s.send;
    s.send = function(d) {
      try {
        if (typeof d === 'string' && (d.indexOf('"type":"leave-hunt"') !== -1 || d.indexOf('"type":"set-city"') !== -1)) {
          var v = P.vSlug;
          var fi = P.ws['field-init'];
          if (v && d.indexOf('"type":"set-city"') !== -1 && Date.now() - (P.oT || 0) < 3000 && fi && fi.slug === v && P.fiT >= P.vT) {
            d = JSON.stringify({ type: 'enter-hunt', slug: v, resume: true });
          } else {
            P.ws['field-init'] = null;
            P.vSlug = null;
          }
        }
      } catch(x) {}
      return origSend.call(this, d);
    };

    s.addEventListener('message', onSocketMessage);
    return s;
  };

  window.WebSocket.prototype = OW.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function(k) {
    try { window.WebSocket[k] = OW[k]; } catch(x) {}
  });

  function isCityName(name) {
    if (!name) return false;
    var low = String(name).toLowerCase();
    return /pallet|viridian city|pewter|cerulean|vermilion|lavender|celadon|fuchsia|saffron|cinnabar|goldenrod|shopping|cassino|arena|cidade|town|city/i.test(low);
  }

  // Telemetria em tempo real
  window.__pkGetStats = function() {
    var me = P.api['/api/characters/me'];
    var ch = (me && me.character) || {};
    var fi = P.ws['field-init'];
    var S = P.sess;

    var domTrainer = '';
    var domLevel = 0;
    var domHunt = '';

    var nameEl = document.querySelector('.phud-name b, .phud-name, .trainer-name');
    if (nameEl) domTrainer = (nameEl.innerText || nameEl.textContent || '').trim();

    var lvlEl = document.querySelector('.phud-tlevel, .phud-level, .phud-lv');
    if (lvlEl) {
      var m = String(lvlEl.innerText || lvlEl.textContent || '').match(/\d+/);
      if (m) domLevel = +m[0];
    }

    var locEl = document.querySelector('.phud-tloc, .hunt-title, .dock-hunt-name, .field-name');
    if (locEl) {
      var rawLoc = (locEl.innerText || locEl.textContent || '').trim();
      var parts = rawLoc.split(/[·•]/).map(function(p) { return p.trim(); }).filter(Boolean);
      domHunt = parts[parts.length - 1] || rawLoc;
    }

    var trainer = ch.name || domTrainer || '';
    var level = ch.level || domLevel || 0;

    var huntSlug = fi ? (fi.slug || '') : '';
    if (!huntSlug && domHunt && !isCityName(domHunt)) {
      huntSlug = getSlugForPokemon(domHunt) || domHunt.toLowerCase().replace(/\s+/g, '_');
    }

    var isCity = false;
    if (!huntSlug) {
      isCity = true;
    } else if (domHunt && isCityName(domHunt)) {
      isCity = true;
    } else if (huntMap[huntSlug] && huntMap[huntSlug].level === 0) {
      isCity = true;
    }

    var huntInfo = huntMap[huntSlug];
    var huntName = isCity ? 'Cidade' : (huntInfo ? huntInfo.name : (domHunt || huntSlug.replace(/[_-]+/g, ' ')));

    var isLoginPage = (typeof location !== 'undefined' && location.pathname.indexOf('/login') !== -1) || !!document.querySelector('input[type="password"]');

    var status = 'disconnected';
    if (isLoginPage) {
      status = 'login';
    } else if (huntSlug && !isCity) {
      status = 'hunting';
    } else if (isCity) {
      status = 'city';
    } else if (trainer || document.querySelector('.phud') || document.querySelector('.game-hud-tl')) {
      status = 'connected';
    } else {
      status = 'connected';
    }

    var itemDoc = P.api['/game/items.json'];
    var itemCatalog = {};
    (itemDoc && itemDoc.items || []).forEach(function(item) { itemCatalog[item.id] = item; });
    var lootGold = 0;
    var drops = Object.keys(S.drops || {}).map(function(id) {
      var drop = S.drops[id] || {};
      var item = itemCatalog[id] || {};
      var gold = (+drop.qty || 0) * (+item.npcPrice || +item.priceGold || 0);
      lootGold += gold;
      return { id: +id || 0, name: drop.name || item.name || 'Item', qty: +drop.qty || 0, gold: gold };
    }).sort(function(a, b) { return b.gold - a.gold || b.qty - a.qty; });
    var balance = lootGold + (+S.sellG || 0) - (+S.supGold || 0);
    var dur = Math.max(1, (Date.now() - (S.start || Date.now())) / 1000);
    var kph = Math.round(((S.kills || 0) / dur) * 3600);
    var xph = Math.round(((S.xp || 0) / dur) * 3600);

    return {
      account: ACC_INDEX,
      status: status,
      connected: status === 'hunting' || status === 'connected' || status === 'city',
      trainer: trainer,
      name: trainer,
      level: level,
      gold: ch.gold || 0,
      diamonds: ch.diamonds || 0,
      kills: S.kills || 0,
      kph: kph,
      xp: S.xp || 0,
      xph: xph,
      gph: Math.round(balance / Math.max(dur, 60) * 3600),
      captures: S.captures || 0,
      lootGold: lootGold,
      capturesGold: S.sellG || 0,
      supplyGold: S.supGold || 0,
      ballsUsed: S.balls || 0,
      potsUsed: S.supN || 0,
      balance: balance,
      lastCatchT: S.lastCatchT || 0,
      sinceCatch: S.sinceCatch || 0,
      drops: drops,
      shinies: S.shinyN || 0,
      shinyCaptures: S.shinyCapN || 0,
      hunt: huntName,
      huntName: huntName,
      huntSlug: isCity ? '' : huntSlug,
      catchLog: (P.catchLog || []).slice()
    };
  };

  // Emissão periódica limpa com console.clear (Zero acúmulo de memória)
  function emitStats() {
    try {
      var data = window.__pkGetStats();
      console.clear();
      console.log('__PK_STATS__' + JSON.stringify(data));
    } catch(err) {}
  }
  setInterval(emitStats, 5000);
  setTimeout(emitStats, 1000);

  // Mapeamento de nome de Pokémon para slug da hunt
  function getSlugForPokemon(name) {
    if (!name) return null;
    var low = String(name).toLowerCase()
      .replace(/\s*lv\.?\s*\d+/gi, '')
      .replace(/\s*\(.*?\)/g, '')
      .replace(/[^a-z0-9\s_-]/g, '')
      .trim();
    if (!low || low.length < 2) return null;

    if (creatureToSlug[low]) return creatureToSlug[low];
    if (huntMap[low]) return low;

    var clean = low.replace(/[^a-z0-9]/g, '');
    if (creatureToSlug[clean]) return creatureToSlug[clean];

    var dashed = low.replace(/\s+/g, '-');
    if (huntMap[dashed]) return dashed;
    var under = low.replace(/\s+/g, '_');
    if (huntMap[under]) return under;

    for (var s in huntMap) {
      var hname = (huntMap[s].name || '').toLowerCase();
      if (hname === low || s === low) return s;
    }
    return null;
  }

  // Viagem rápida direta para hunt
  window.__pkTravel = function(target) {
    if (!target) return false;
    var slug = getSlugForPokemon(target) || String(target).toLowerCase().trim();
    var hInfo = huntMap[slug];
    var huntName = (hInfo && hInfo.name) ? hInfo.name : slug.replace(/[_-]+/g, ' ');

    // Fecha Pokédex e modais
    var dexWin = document.querySelector('.dex-window');
    if (dexWin) {
      var dexClose = dexWin.querySelector('.win-close, [data-close], button:has(svg), button.close');
      if (dexClose) dexClose.click();
      else dexWin.style.display = 'none';
    }

    var popups = document.querySelectorAll('.win-window, .dex-detail');
    popups.forEach(function(w) {
      if (w.querySelector('.pk-win-travel-btn, .dex-detail, [data-pokemon]')) {
        var c = w.querySelector('.win-close, [data-close], button.close');
        if (c) c.click();
        else w.style.display = 'none';
      }
    });

    // Se o mapa do jogo estiver aberto, fecha
    var mapWin = document.querySelector('.map-window');
    if (mapWin && window.getComputedStyle(mapWin).display !== 'none') {
      var mapClose = mapWin.querySelector('.win-close, [data-close], button:has(svg), button.close');
      if (mapClose) mapClose.click();
      else mapWin.style.display = 'none';
    }

    // Viagem via WebSocket (enter-hunt nativo do jogo com slug)
    if (P.sock && P.sock.readyState === 1) {
      try {
        P.sock.send(JSON.stringify({ type: 'leave-hunt' }));
      } catch(e) {}

      setTimeout(function() {
        try {
          P.sock.send(JSON.stringify({ type: 'enter-hunt', slug: slug, resume: false }));
          P.vSlug = slug;
          P.vT = Date.now();
        } catch(e) {}

        // Atualiza renderização de canvas do jogo
        try {
          window.dispatchEvent(new Event('resize'));
        } catch(e) {}
      }, 150);

      showInGameToast('🚀 Viajando para ' + huntName + '...', 'success');
      return true;
    } else {
      showInGameToast('⚠️ Conectando...', 'warn');
      return false;
    }
  };

  function showInGameToast(msg, type) {
    try {
      var old = document.querySelector('.pk-ingame-toast');
      if (old) old.remove();
      var t = document.createElement('div');
      t.className = 'pk-ingame-toast ' + (type || 'info');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function() { t.classList.add('pk-show'); }, 20);
      setTimeout(function() {
        t.classList.remove('pk-show');
        setTimeout(function() { t.remove(); }, 300);
      }, 2500);
    } catch(e) {}
  }

  // Integração nativa e ultraleve com a Pokédex in-game
  function initPokedexIntegration() {
    if (!document.getElementById('__pk-dex-style')) {
      var st = document.createElement('style');
      st.id = '__pk-dex-style';
      st.textContent = 
        '.pk-dex-bar { display:flex !important; align-items:center !important; justify-content:space-between !important; ' +
        'background:#0f172a !important; border:1px solid #10b981 !important; border-radius:8px !important; ' +
        'padding:6px 12px !important; margin:6px 8px !important; font-family:system-ui,sans-serif !important; ' +
        'font-size:11px !important; color:#ecfdf5 !important; z-index:999 !important; box-shadow:0 4px 14px rgba(0,0,0,0.4) !important; }' +
        '.pk-travel-btn-act { background:#10b981 !important; color:#ffffff !important; border:none !important; ' +
        'border-radius:6px !important; padding:6px 14px !important; font-size:11px !important; font-weight:800 !important; ' +
        'cursor:pointer !important; display:inline-flex !important; align-items:center !important; gap:6px !important; ' +
        'box-shadow:0 2px 8px rgba(16,185,129,0.5) !important; transition:background 0.15s, transform 0.1s !important; }' +
        '.pk-travel-btn-act:hover { background:#059669 !important; transform:translateY(-1px) !important; }' +
        '.pk-travel-btn-act:active { transform:translateY(1px) !important; }' +
        '.pk-ingame-toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%) translateY(20px); ' +
        'background:#1e293b; color:#fff; border:1px solid #334155; padding:8px 16px; border-radius:8px; ' +
        'font-size:12px; font-weight:bold; z-index:999999; opacity:0; transition:all 0.3s ease; pointer-events:none; }' +
        '.pk-ingame-toast.pk-show { transform:translateX(-50%) translateY(0); opacity:1; }' +
        '.pk-ingame-toast.success { background:#065f46; border-color:#10b981; }' +
        '.pk-ingame-toast.error { background:#7f1d1d; border-color:#ef4444; }';
      document.head.appendChild(st);
    }

    setInterval(function() {
      var dexWin = document.querySelector('.dex-window');
      if (dexWin && !dexWin.querySelector('.pk-dex-bar')) {
        var ctr = dexWin.querySelector('.dex-controls') || dexWin;
        var bar = document.createElement('div');
        bar.className = 'pk-dex-bar';
        bar.innerHTML = '<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:bold;">' +
          '<input type="checkbox" id="__pk_ft_check" checked style="accent-color:#10b981;width:15px;height:15px;cursor:pointer;"> ' +
          '⚡ <b>Viagem Rápida Direta:</b> Clique em qualquer Pokémon para viajar</label>' +
          '<div class="pk-bar-dest" style="margin-left:auto;display:inline-flex;align-items:center;gap:8px;"></div>';
        if (ctr.firstChild) {
          ctr.insertBefore(bar, ctr.firstChild);
        } else {
          ctr.appendChild(bar);
        }

        if (!dexWin.__pkBound) {
          dexWin.__pkBound = true;
          dexWin.addEventListener('click', function(e) {
            var cell = e.target.closest('.dex-cell');
            if (!cell) return;

            var nameEl = cell.querySelector('.dex-cell-name') || cell.querySelector('.name') || cell;
            var rawName = (nameEl ? (nameEl.innerText || nameEl.textContent) : '') || cell.getAttribute('title') || '';
            var cleanName = rawName.replace(/^\d+[\s.-]*/, '').replace(/\s*(?:lv|lvl|nv|nível|level)\.?\s*\d+$/i, '').trim();
            var slug = getSlugForPokemon(cleanName);
            var hInfo = slug ? huntMap[slug] : null;

            var bar = dexWin.querySelector('.pk-dex-bar');
            if (bar && slug && hInfo) {
              var dest = bar.querySelector('.pk-bar-dest');
              if (dest) {
                dest.innerHTML = '<span style="color:#38bdf8;font-weight:bold;">' + cleanName + '</span>' +
                  '<button class="pk-travel-btn-act" type="button">🚀 Viajar: ' + hInfo.name + ' (Nv. ' + hInfo.level + ')</button>';
                dest.querySelector('button').onclick = function(ev) {
                  ev.stopPropagation();
                  window.__pkTravel(slug);
                };
              }
            }

            var chk = dexWin.querySelector('#__pk_ft_check');
            if (chk && chk.checked && slug) {
              e.stopPropagation();
              e.preventDefault();
              window.__pkTravel(slug);
            }
          }, true);
        }
      }

      // Detalhes de Pokémon abertos
      var pWins = document.querySelectorAll('.win-window:not([data-pk-btn-ready]), .dex-detail:not([data-pk-btn-ready])');
      pWins.forEach(function(w) {
        w.setAttribute('data-pk-btn-ready', '1');
        var titleEl = w.querySelector('.win-title, h1, h2, h3, .name, .poke-name');
        if (titleEl) {
          var raw = titleEl.innerText || titleEl.textContent || '';
          var clean = raw.replace(/^\d+[\s.-]*/, '').replace(/\s*(?:lv|lvl|nv|nível|level)\.?\s*\d+$/i, '').trim();
          var slug = getSlugForPokemon(clean);
          var hInfo = slug ? huntMap[slug] : null;
          if (slug && hInfo && !w.querySelector('.pk-win-travel-btn')) {
            var btn = document.createElement('button');
            btn.className = 'pk-travel-btn-act pk-win-travel-btn';
            btn.type = 'button';
            btn.style.cssText = 'margin:6px 8px;width:calc(100% - 16px);justify-content:center;box-sizing:border-box;';
            btn.innerHTML = '🚀 Viagem Rápida: ' + hInfo.name + ' (Nv. ' + hInfo.level + ')';
            btn.onclick = function(ev) {
              ev.stopPropagation();
              window.__pkTravel(slug);
            };
            var container = w.querySelector('.win-header, .win-body, .poke-info') || w;
            container.insertBefore(btn, container.firstChild);
          }
        }
      });
    }, 600);
  }

  if (document.body) initPokedexIntegration();
  else document.addEventListener('DOMContentLoaded', initPokedexIntegration);

  // Limpar HUD (Clean HUD 100% via CSS puro)
  window.__pkSetCleanHud = function(enable) {
    var ID = 'pg-clean-hud-style';
    var s = document.getElementById(ID);
    if (!enable) {
      if (s) s.remove();
      return;
    }
    if (!s) {
      s = document.createElement('style');
      s.id = ID;
      document.head.appendChild(s);
    }
    s.textContent = 
      '.cap-panel:not(:has(.cap-row.shiny)), .kc-stack, .sn-card:has(.sn-xpline), .sn-card:has(.sn-loot) { display: none !important; } ' +
      '.ah-panel, .game-hud-tl, .ha-window, nav.game-dock { opacity: 0.2 !important; transition: opacity 0.18s ease !important; } ' +
      '.ah-panel:hover, .game-hud-tl:hover, .ha-window:hover, nav.game-dock:hover { opacity: 1 !important; }';
  };

  // Ocultar Chat do Jogo (100% via CSS puro)
  window.__pkSetHideChat = function(hide) {
    var ID = 'pg-hide-chat-style';
    var s = document.getElementById(ID);
    if (!hide) {
      if (s) s.remove();
      return;
    }
    if (!s) {
      s = document.createElement('style');
      s.id = ID;
      document.head.appendChild(s);
    }
    s.textContent = 
      '.chat-box, #chat-container, .chat-panel, .dock-chat, .game-chat, [data-guide="chat"] { display: none !important; }';
  };

  // Atalho F2 in-game
  if (!window.__pgF2Bound) {
    window.__pgF2Bound = true;
    window.addEventListener('keydown', function(e) {
      if (e.key === 'F2') {
        e.preventDefault();
        if (!e.repeat) console.log('__PK_F2__');
      }
    }, true);
  }

  // Leitor de IVs no Hover e Clique (Mochila, Time, Box, Mercado/Shopping, Janelas de Detalhe)
  function initIvReader() {
    var TIPOS = ['NORMAL', 'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'ICE', 'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL', 'FAIRY'];
    var tx = function(el) { return (el ? String(el.textContent || '') : '').replace(/\s+/g, ' ').trim(); };
    var inteiro = function(s) { var m = String(s || '').match(/\d+/); return m ? parseInt(m[0], 10) : null; };
    var decimal = function(s) { var m = String(s || '').match(/\d+[.,]\d+/); return m ? parseFloat(m[0].replace(',', '.')) : null; };

    var tipos = function(el) {
      return (el ? Array.prototype.slice.call(el.querySelectorAll('.pp-type, .mkt2-type-badge')) : []).map(function(b) {
        return String(b.getAttribute('title') || b.textContent || '').toUpperCase();
      }).filter(function(x) { return TIPOS.indexOf(x) !== -1; }).slice(0, 2);
    };

    var NV = /\s*(?:lv|lvl|nv|nível|level)\.?\s*\d+$/i;
    var nome = function(s) {
      var n = String(s || ''), shiny = false, ditto = false;
      for (var k = 0; k < 2; k++) {
        if (/✨$/.test(n)) { shiny = true; n = n.replace(/\s*✨$/, ''); }
        n = n.replace(NV, '');
      }
      var m = /\s*(?:⚠️?\s*)?\(Ditto[^)]*\)$/i.exec(n);
      if (m) { ditto = true; n = n.slice(0, m.index); }
      if (/\bditto\b/i.test(n)) ditto = true;
      return { nome: n.trim().slice(0, 40), shiny: shiny, ditto: ditto };
    };

    var seis = function(v) {
      return (v && v.length === 6 && v.every(function(x) { return x != null; })) ? { hp: v[0], atk: v[1], def: v[2], spa: v[3], spd: v[4], vel: v[5] } : null;
    };

    function leTip(tipEl) {
      if (!tipEl) return null;
      var grid = tipEl.querySelector('.inv-tip-poke-grid, .inv-tip-grid, .poke-grid');
      var nm = tipEl.querySelector('.inv-tip-name, .poke-name, .name, h4, h3, .title');
      if (!grid || !nm) return null;

      var top = tipEl.querySelector('.inv-tip-poke-top, .inv-tip-top, .poke-top');
      var bElements = grid.querySelectorAll('b');
      var statEls = (bElements && bElements.length === 6) ? bElements : grid.children;
      var stats = seis(Array.prototype.slice.call(statEls).slice(0, 6).map(function(c) {
        return inteiro(tx(c.querySelector ? (c.querySelector('b') || c) : c));
      }));
      if (!stats) return null;

      var nivel = null, qualidade = null, ivTotal = null;
      if (top) {
        Array.prototype.slice.call(top.children).forEach(function(c, k) {
          var b = c.querySelector('b');
          var sm = tx(c.querySelector('small') || c);
          var full = tx(c);
          if (k === 0) nivel = inteiro(tx(b || c));
          else if (sm && (sm.indexOf('×') !== -1 || sm.indexOf('x') !== -1)) qualidade = decimal(sm);
          else if (sm && sm.indexOf('/') !== -1) ivTotal = inteiro(tx(b || c));
          else if (full.indexOf('×') !== -1 || full.indexOf('x') !== -1) qualidade = decimal(full);
          else if (full.indexOf('/') !== -1) ivTotal = inteiro(full);
        });
      }

      if (!nivel) {
        var mNv = String(nm.textContent || '').match(/(?:lv|lvl|nv|nível|level)\.?\s*(\d+)/i);
        if (mNv) nivel = parseInt(mNv[1], 10);
      }

      var chip = function(c) { return !!tipEl.querySelector('.inv-tip-chips .' + c); };
      var n = nome(tx(nm));
      var pw = tipEl.querySelector('.inv-tip-poke-power b, .poke-power b');

      var sprUrl = '';
      try {
        var hoveredImg = document.querySelector(':hover img.poke-icon-img, :hover img[src*="/assets/pokemon/"], :hover img[src*="/assets/pokeitems/"], :hover canvas');
        if (hoveredImg && hoveredImg.src) sprUrl = hoveredImg.src;
      } catch(e) {}

      return {
        account: ACC_INDEX,
        name: n.nome,
        shiny: n.shiny || chip('shiny'),
        ditto: n.ditto,
        tipos: tipos(tipEl.querySelector('.inv-tip-types')),
        level: nivel || 100,
        quality: qualidade || 1,
        ivTotal: ivTotal,
        stats: stats,
        power: pw ? inteiro(tx(pw)) : null,
        sprite: sprUrl,
        source: 'tooltip'
      };
    }

    function leMercado() {
      var corpo = document.querySelector('aside.mkt2-details .mkt2-details-body');
      if (!corpo) return null;
      var statCells = corpo.querySelectorAll('.mkt2-stats .mkt2-statcell b');
      if (!statCells || statCells.length < 6) return null;

      var stats = seis(Array.prototype.slice.call(statCells).map(function(b) {
        return inteiro(tx(b));
      }));
      if (!stats) return null;

      var nivel = null, qualidade = null, ivTotal = null, poder = null, tp = [];
      corpo.querySelectorAll('.mkt2-statlist .mkt2-stat').forEach(function(c) {
        var tps = c.querySelector('.mkt2-stat-types');
        var b = c.querySelector('b');
        if (tps) { tp = tipos(tps); return; }
        if (!b) return;
        var v = tx(b), sm = tx(b.querySelector('small'));
        if (sm && sm.indexOf('×') !== -1) qualidade = decimal(sm);
        else if (v.indexOf('/') !== -1) ivTotal = inteiro(v);
        else if (v.indexOf('⚡') !== -1) poder = inteiro(v);
        else if (tx(c.querySelector('span')).indexOf('⚡') !== -1) nivel = inteiro(v);
      });

      var n = nome(tx(corpo.querySelector('.mkt2-details-name')));
      var heroImg = corpo.querySelector('.mkt2-hero img');
      return {
        account: ACC_INDEX,
        name: n.nome,
        shiny: n.shiny || !!corpo.querySelector('.mkt2-hero-shiny'),
        ditto: n.ditto,
        tipos: tp,
        level: nivel || 100,
        quality: qualidade || 1,
        ivTotal: ivTotal,
        stats: stats,
        power: poder,
        sprite: heroImg ? heroImg.src : '',
        source: 'mercado'
      };
    }

    function leDetalhes() {
      var m = leMercado();
      if (m) return m;

      var wins = document.querySelectorAll('.win-window, .dex-detail, [role="dialog"]');
      for (var w = 0; w < wins.length; w++) {
        var win = wins[w];
        if (window.getComputedStyle(win).display === 'none') continue;
        var grid = win.querySelector('.inv-tip-poke-grid, .inv-tip-grid, .mkt2-stats, .poke-stats, .stats-grid');
        var nm = win.querySelector('.win-title, .dex-detail-name, .inv-tip-name, .poke-name, h3, h4');
        if (!grid || !nm) continue;

        var statCells = grid.querySelectorAll('b, span.val, .stat-val');
        if (!statCells || statCells.length < 6) {
          if (grid.children && grid.children.length === 6) statCells = grid.children;
          else continue;
        }

        var stats = seis(Array.prototype.slice.call(statCells).slice(0, 6).map(function(c) {
          return inteiro(tx(c.querySelector ? (c.querySelector('b') || c) : c));
        }));
        if (!stats) continue;

        var n = nome(tx(nm));
        var nivel = inteiro(tx(win.querySelector('.level, .poke-level, .win-subtitle') || '100'));
        var ivEl = win.querySelector('.iv-total, [title*="IV"]');

        return {
          account: ACC_INDEX,
          name: n.nome,
          shiny: n.shiny,
          ditto: n.ditto,
          tipos: tipos(win.querySelector('.types, .poke-types, .inv-tip-types')),
          level: nivel || 100,
          quality: 1,
          ivTotal: ivEl ? inteiro(tx(ivEl)) : null,
          stats: stats,
          power: null,
          sprite: '',
          source: 'window'
        };
      }
      return null;
    }

    var ultimo = '';
    var manda = function(data, force) {
      if (!data || !data.name) return;
      var j = JSON.stringify(data);
      if (!force && j === ultimo) return;
      ultimo = j;
      console.log('__PK_IV__' + j);
    };

    // 1. MutationObserver capturando .inv-tip adicionado ao DOM
    var tipNode = null;
    var tipObs = null;
    try {
      new MutationObserver(function(muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          for (var k = 0; k < m.addedNodes.length; k++) {
            var n = m.addedNodes[k];
            if (n.nodeType === 1) {
              var targetTip = (n.classList && n.classList.contains('inv-tip')) ? n : (n.querySelector ? n.querySelector('.inv-tip') : null);
              if (targetTip) {
                if (tipObs) tipObs.disconnect();
                tipNode = targetTip;
                tipObs = new MutationObserver(function() {
                  try { manda(leTip(tipNode), false); } catch(x) {}
                });
                tipObs.observe(tipNode, { childList: true, subtree: true, characterData: true });
                try { manda(leTip(tipNode), true); } catch(x) {}
              }
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch(e) {}

    // 2. Mouseover listener: backup direto ao passar mouse em slots
    document.addEventListener('mouseover', function() {
      try {
        var tip = document.querySelector('.inv-tip');
        if (tip) manda(leTip(tip), false);
      } catch(x) {}
    }, { passive: true });

    // 3. Click listener: ao clicar em itens, pokemons na mochila, mercado ou janelas
    document.addEventListener('click', function(e) {
      setTimeout(function() {
        try {
          var tip = document.querySelector('.inv-tip');
          if (tip) manda(leTip(tip), true);
          else manda(leDetalhes(), true);
        } catch(x) {}
      }, 60);
    }, true);
  }

  if (document.body) initIvReader();
  else document.addEventListener('DOMContentLoaded', initIvReader);
}

// Exporta o script a ser injetado via executeJavaScript
window.__pkCollectorScript = function(accountIndex) {
  return "(" + collectorFunction.toString() + ")(" + Number(accountIndex) + ", " + JSON.stringify(huntsData) + ", " + JSON.stringify(creaturesData) + ");";
};
