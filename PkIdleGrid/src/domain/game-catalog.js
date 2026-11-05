// src/domain/game-catalog.js
// Catálogo de espécies, golpes, hunts e mapeamento para Viagem Rápida

class GameCatalog {
  constructor() {
    this.creatures = new Map(); // id or slug -> creature info
    this.creaturesByName = new Map(); // lower name -> creature info
    this.hunts = []; // list of map markers / hunts
    this.huntsBySlug = new Map(); // slug -> hunt info
    this.speciesToHunts = new Map(); // speciesName -> [hunts]
    this.items = new Map(); // id -> item
    this.isLoaded = false;
    this.loadCallbacks = [];
  }

  onReady(cb) {
    if (this.isLoaded) cb();
    else this.loadCallbacks.push(cb);
  }

  // Alimenta os dados vindos do jogo (creatures.json e map-markers)
  populateData(data) {
    if (!data) return;

    if (data.creatures && Array.isArray(data.creatures)) {
      data.creatures.forEach(c => {
        if (!c || !c.name) return;
        const lowerName = c.name.toLowerCase().trim();
        const info = {
          id: c.pokeId,
          name: c.name,
          lowerName,
          type1: (c.type1 || '').toUpperCase(),
          type2: (c.type2 || '').toUpperCase(),
          baseHp: +c.baseHp || 0,
          baseAtk: +c.baseAtk || 0,
          baseDef: +c.baseDef || 0,
          baseSpAtk: +c.baseSpAtk || 0,
          baseSpDef: +c.baseSpDef || 0,
          baseSpeed: +c.baseSpeed || 0,
          baseStats: {
            hp: +c.baseHp || 0,
            atk: +c.baseAtk || 0,
            def: +c.baseDef || 0,
            spa: +c.baseSpAtk || 0,
            spd: +c.baseSpDef || 0,
            speed: +c.baseSpeed || 0
          },
          huntLevel: +c.huntLevel || 0,
          evolvesToId: c.evolvesToId,
          evolveLevel: +c.evolveLevel || 0,
          attacks: Array.isArray(c.attacks) ? c.attacks : []
        };
        this.creatures.set(c.pokeId, info);
        this.creaturesByName.set(lowerName, info);
      });
    }

    if (data.markers && Array.isArray(data.markers)) {
      this.hunts = data.markers.map(m => {
        const slug = String(m.slug || m.hunt || m.name || '').toLowerCase().trim();
        const hunt = {
          slug,
          name: String(m.name || m.hunt || m.title || slug).replace(/[_-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).trim(),
          minLevel: +m.level || +m.lvl || +m.minLevel || 0,
          area: m.area || '',
          mobs: Array.isArray(m.mobs) ? m.mobs.map(s => String(s).toLowerCase().trim()) : []
        };
        this.huntsBySlug.set(slug, hunt);
        return hunt;
      });

      // Mapear espécies para hunts
      this.mapSpeciesToHunts();
    }

    this.isLoaded = true;
    while (this.loadCallbacks.length > 0) {
      const cb = this.loadCallbacks.shift();
      try { cb(); } catch {}
    }
  }

  mapSpeciesToHunts() {
    this.speciesToHunts.clear();

    // 1. Mapeamento direto por nome de hunt (ex: hunt "Caterpie" -> Caterpie)
    this.hunts.forEach(hunt => {
      const hLower = hunt.name.toLowerCase();
      for (const [name, creature] of this.creaturesByName) {
        if (hLower.includes(name) || (hunt.mobs && hunt.mobs.includes(name))) {
          if (!this.speciesToHunts.has(name)) this.speciesToHunts.set(name, []);
          const list = this.speciesToHunts.get(name);
          if (!list.some(h => h.slug === hunt.slug)) {
            list.push(hunt);
          }
        }
      }
    });
  }

  getHuntsForPokemon(nameOrId) {
    let name = '';
    if (typeof nameOrId === 'number') {
      const c = this.creatures.get(nameOrId);
      if (c) name = c.lowerName;
    } else {
      name = String(nameOrId || '').toLowerCase().trim();
    }

    // Retorna as hunts mapeadas
    const exact = this.speciesToHunts.get(name) || [];
    if (exact.length > 0) return exact;

    // Busca por similaridade nos nomes das hunts
    const matched = [];
    this.hunts.forEach(h => {
      if (h.name.toLowerCase().includes(name) || (h.slug && h.slug.includes(name))) {
        matched.push(h);
      }
    });
    return matched;
  }

  findPokemon(query) {
    if (!query) return [];
    const q = String(query).toLowerCase().trim();
    const results = [];
    for (const [name, creature] of this.creaturesByName) {
      if (name.includes(q)) {
        results.push(creature);
        if (results.length >= 30) break;
      }
    }
    return results;
  }

  getCreatureByName(name) {
    if (!name) return null;
    return this.creaturesByName.get(String(name).toLowerCase().trim()) || null;
  }
}

// Singleton global
window.pkCatalog = new GameCatalog();

