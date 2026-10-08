/* COM745 Cypher engine: a small in-browser implementation of the Cypher used in
   the module (Lecture 6, Practical 10 and the Week 4 demonstrations), with
   output laid out like cypher-shell. Written for teaching; not Neo4j.

   Supported: CREATE, MATCH / OPTIONAL MATCH with WHERE, directed, undirected and
   variable-length patterns, shortestPath / allShortestPaths, MERGE (ON CREATE /
   ON MATCH SET), SET, REMOVE, DELETE, DETACH DELETE, WITH, UNWIND, RETURN
   (DISTINCT, ORDER BY, SKIP, LIMIT, aggregation), CASE, list comprehensions,
   pattern predicates, EXISTS { } and COUNT { }, uniqueness constraints and
   indexes, CALL db.labels() / db.relationshipTypes() / db.propertyKeys().
   Results are cross-checked against FalkorDB (another Cypher database) by
   tools/neo4j/crosscheck.py. No eval.

   Usage: var g = new CypherEngine();
          g.run('CREATE (:Person {name: "Ada"})')   -> cypher-shell style text
          g.exec('MATCH (n) RETURN n')              -> [{columns, rows, stats, warnings} | {error}]  */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ values
  function F(v) { this.v = v; }                       // a float (integers are plain JS numbers)
  function Node(id, labels, props) { this.id = id; this.labels = labels; this.props = props; }
  function Rel(id, type, start, end, props) { this.id = id; this.type = type; this.start = start; this.end = end; this.props = props; }
  function Path(nodes, rels) { this.nodes = nodes; this.rels = rels; }
  function CErr(msg, pos) { this.message = msg; this.pos = pos; }
  var isF = function (x) { return x instanceof F; };
  function num(x) { return x instanceof F ? x.v : x; }
  function isNum(x) { return typeof x === 'number' || x instanceof F; }
  function mkNum(v, float) { return float ? new F(v) : v; }
  function isMap(x) { return x !== null && typeof x === 'object' && !Array.isArray(x) && !(x instanceof F) && !(x instanceof Node) && !(x instanceof Rel) && !(x instanceof Path); }

  // ------------------------------------------------------------------ lexer
  var KW = ['MATCH', 'OPTIONAL', 'WHERE', 'RETURN', 'CREATE', 'MERGE', 'ON', 'SET', 'DELETE', 'DETACH', 'REMOVE', 'WITH', 'UNWIND', 'AS',
    'ORDER', 'BY', 'ASC', 'ASCENDING', 'DESC', 'DESCENDING', 'SKIP', 'LIMIT', 'DISTINCT', 'AND', 'OR', 'XOR', 'NOT', 'IN', 'IS', 'NULL',
    'TRUE', 'FALSE', 'STARTS', 'ENDS', 'CONTAINS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'UNION', 'ALL', 'CALL', 'YIELD', 'CONSTRAINT',
    'INDEX', 'FOR', 'REQUIRE', 'UNIQUE', 'IF', 'EXISTS', 'DROP', 'SHOW', 'CONSTRAINTS', 'INDEXES', 'COUNT'];
  var KWS = {}; KW.forEach(function (k) { KWS[k] = 1; });

  function lex(src) {
    var toks = [], i = 0, n = src.length;
    function push(t, v, s, raw) { toks.push({ t: t, v: v, s: s, e: i, raw: raw }); }
    while (i < n) {
      var c = src[i], s = i;
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? n : i + 2; continue; }
      if (c === "'" || c === '"') {
        var q = c, out = ''; i++;
        while (i < n && src[i] !== q) {
          if (src[i] === '\\' && i + 1 < n) {
            var e = src[i + 1]; out += ({ n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' })[e] !== undefined ? ({ n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' })[e] : e; i += 2; continue;
          }
          out += src[i++];
        }
        if (i >= n) throw new CErr('Failed to parse string literal. The query must contain an even number of non-escaped quotes.', s);
        i++; push('str', out, s); continue;
      }
      if (c === '`') { var j = src.indexOf('`', i + 1); if (j < 0) throw new CErr("Invalid input '`'", s); i = j + 1; push('id', src.slice(s + 1, j), s, true); continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var m = /^(\d+\.\d+(?:[eE][-+]?\d+)?|\d+[eE][-+]?\d+|\.\d+(?:[eE][-+]?\d+)?|\d+)/.exec(src.slice(i));
        // "1..3" in a range: take only the integer
        if (/^\d+\.\.\d*/.test(src.slice(i))) m = /^\d+/.exec(src.slice(i));
        i += m[0].length;
        push('num', /[.eE]/.test(m[0]) ? new F(parseFloat(m[0])) : parseInt(m[0], 10), s); continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
        var w = src.slice(s, i);
        push(KWS[w.toUpperCase()] ? 'kw' : 'id', KWS[w.toUpperCase()] ? w.toUpperCase() : w, s); toks[toks.length - 1].text = w; continue;
      }
      if (c === '$') { i++; while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++; push('param', src.slice(s + 1, i), s); continue; }
      var three = src.substr(i, 3), two = src.substr(i, 2);
      if (two === '<>' || two === '<=' || two === '>=' || two === '=~' || two === '->' || two === '<-' || two === '..' || two === '+=' || two === '--') {
        // '--' only inside patterns; let the parser treat it as two '-'
        if (two === '--') { i++; push('sym', '-', s); continue; }
        i += 2; push('sym', two, s); continue;
      }
      if ('()[]{}:,.=<>+-*/%^|;'.indexOf(c) >= 0) { i++; push('sym', c, s); continue; }
      throw new CErr("Invalid input '" + c + "'", s);
    }
    toks.push({ t: 'eof', v: '', s: n, e: n });
    return toks;
  }

  // ------------------------------------------------------------------ parser
  function Parser(src) { this.src = src; this.toks = lex(src); this.p = 0; }
  Parser.prototype = {
    peek: function (k) { return this.toks[this.p + (k || 0)]; },
    next: function () { return this.toks[this.p++]; },
    isKw: function (k, o) { var t = this.peek(o); return t.t === 'kw' && t.v === k; },
    isSym: function (v, o) { var t = this.peek(o); return t.t === 'sym' && t.v === v; },
    eatKw: function (k) { if (this.isKw(k)) { this.p++; return true; } return false; },
    eatSym: function (v) { if (this.isSym(v)) { this.p++; return true; } return false; },
    fail: function (expected, t) {
      t = t || this.peek();
      var shown = t.t === 'eof' ? 'EOF' : this.src.slice(t.s, Math.max(t.e, t.s + 1)).split(/\s/)[0];
      throw new CErr("Invalid input '" + shown + "': expected " + expected, t.s);
    },
    kw: function (k) { if (!this.eatKw(k)) this.fail(k); },
    sym: function (v) { if (!this.eatSym(v)) this.fail("'" + v + "'"); },
    name: function (what) {
      var t = this.peek();
      if (t.t === 'id' || t.t === 'kw') { this.p++; return t.t === 'kw' ? t.text : t.v; }
      this.fail(what || 'an identifier');
    },

    statement: function () {
      var q = this.single(), parts = [q];
      while (this.isKw('UNION')) { this.p++; var all = this.eatKw('ALL'); var nq = this.single(); nq.unionAll = all; parts.push(nq); }
      if (!this.isSym(';') && this.peek().t !== 'eof') this.fail('a clause such as MATCH, RETURN or CREATE');
      return { parts: parts };
    },
    single: function () {
      var clauses = [];
      if (this.isKw('CREATE') && (this.isKw('CONSTRAINT', 1) || this.isKw('INDEX', 1))) return { schema: this.schemaCmd() };
      if (this.isKw('DROP') || this.isKw('SHOW')) return { schema: this.schemaCmd() };
      for (;;) {
        var t = this.peek(); if (t.t !== 'kw') break;
        var c = this.clause(); if (!c) break; clauses.push(c);
      }
      if (!clauses.length) this.fail('a clause such as MATCH, CREATE, MERGE or RETURN');
      return { clauses: clauses };
    },
    schemaCmd: function () {
      var t = this.next();
      if (t.v === 'SHOW') { var w = this.next(); if (!/^(CONSTRAINTS|INDEXES)$/.test(w.v)) this.fail('CONSTRAINTS or INDEXES', w); return { op: 'show', what: w.v }; }
      if (t.v === 'DROP') {
        var w2 = this.next(); if (w2.v !== 'CONSTRAINT' && w2.v !== 'INDEX') this.fail('CONSTRAINT or INDEX', w2);
        var nm = this.name('a name'); var ife = false; if (this.eatKw('IF')) { this.kw('EXISTS'); ife = true; }
        return { op: 'drop', kind: w2.v, name: nm, ifExists: ife };
      }
      var kind = this.next().v, name = null, ine = false;
      if (!this.isKw('FOR') && !this.isKw('IF') && !this.isKw('ON')) name = this.name('a name or FOR');
      if (this.eatKw('IF')) { this.kw('NOT'); this.kw('EXISTS'); ine = true; }
      if (this.isKw('ON')) throw new CErr('Invalid constraint syntax, ON and ASSERT should not be used. Replace ON with FOR and ASSERT with REQUIRE.', this.peek().s);
      this.kw('FOR'); this.sym('('); var v = this.name(); this.sym(':'); var label = this.name('a label'); this.sym(')');
      var prop;
      if (kind === 'CONSTRAINT') {
        this.kw('REQUIRE'); var v2 = this.name(); this.sym('.'); prop = this.name('a property name');
        this.kw('IS'); this.kw('UNIQUE');
      } else {
        this.kw('ON'); this.sym('('); this.name(); this.sym('.'); prop = this.name('a property name'); this.sym(')');
      }
      return { op: 'create', kind: kind, name: name, ifNotExists: ine, label: label, prop: prop, v: v };
    },
    clause: function () {
      var t = this.peek(), s = t.s;
      switch (t.v) {
        case 'MATCH': this.p++; return this.matchClause(false, s);
        case 'OPTIONAL': this.p++; this.kw('MATCH'); return this.matchClause(true, s);
        case 'CREATE': this.p++; return { type: 'CREATE', patterns: this.patterns(), s: s };
        case 'MERGE': this.p++;
          var pat = this.patternPart(), onC = [], onM = [];
          while (this.isKw('ON')) { this.p++; var w = this.next(); if (w.v !== 'CREATE' && w.v !== 'MATCH') this.fail('CREATE or MATCH', w); this.kw('SET'); (w.v === 'CREATE' ? onC : onM).push.apply(w.v === 'CREATE' ? onC : onM, this.setItems()); }
          return { type: 'MERGE', pattern: pat, onCreate: onC, onMatch: onM, s: s };
        case 'SET': this.p++; return { type: 'SET', items: this.setItems(), s: s };
        case 'REMOVE': this.p++; return { type: 'REMOVE', items: this.removeItems(), s: s };
        case 'DETACH': this.p++; this.kw('DELETE'); return { type: 'DELETE', detach: true, exprs: this.exprList(), s: s };
        case 'DELETE': this.p++; return { type: 'DELETE', detach: false, exprs: this.exprList(), s: s };
        case 'WITH': this.p++; return this.projection('WITH', s);
        case 'RETURN': this.p++; return this.projection('RETURN', s);
        case 'UNWIND': this.p++; var e = this.expr(); this.kw('AS'); var vt = this.peek(); return { type: 'UNWIND', expr: e, as: this.name(), asPos: vt.s, s: s };
        case 'CALL': this.p++; return this.callClause(s);
        default: return null;
      }
    },
    callClause: function (s) {
      var nm = this.name(); while (this.eatSym('.')) nm += '.' + this.name();
      this.sym('('); this.sym(')');
      var yields = null;
      if (this.eatKw('YIELD')) { yields = [this.name()]; while (this.eatSym(',')) yields.push(this.name()); }
      return { type: 'CALL', proc: nm, yields: yields, s: s };
    },
    matchClause: function (opt, s) {
      var pats = this.patterns(), where = null;
      if (this.eatKw('WHERE')) where = this.expr();
      return { type: 'MATCH', optional: opt, patterns: pats, where: where, s: s };
    },
    setItems: function () {
      var items = [];
      do {
        var t = this.peek(), v = this.name('a variable');
        if (this.eatSym('.')) { var k = this.name('a property name'); this.sym('='); items.push({ kind: 'prop', v: v, key: k, expr: this.expr(), pos: t.s }); }
        else if (this.eatSym('+=')) items.push({ kind: 'merge', v: v, expr: this.expr(), pos: t.s });
        else if (this.eatSym('=')) items.push({ kind: 'replace', v: v, expr: this.expr(), pos: t.s });
        else if (this.isSym(':')) { var labs = []; while (this.eatSym(':')) labs.push(this.name('a label')); items.push({ kind: 'labels', v: v, labels: labs, pos: t.s }); }
        else this.fail("'.', '=', '+=' or ':'");
      } while (this.eatSym(','));
      return items;
    },
    removeItems: function () {
      var items = [];
      do {
        var t = this.peek(), v = this.name('a variable');
        if (this.eatSym('.')) items.push({ kind: 'prop', v: v, key: this.name('a property name'), pos: t.s });
        else { var labs = []; while (this.eatSym(':')) labs.push(this.name('a label')); if (!labs.length) this.fail("'.' or ':'"); items.push({ kind: 'labels', v: v, labels: labs, pos: t.s }); }
      } while (this.eatSym(','));
      return items;
    },
    exprList: function () { var l = [this.expr()]; while (this.eatSym(',')) l.push(this.expr()); return l; },
    projection: function (kind, s) {
      var distinct = this.eatKw('DISTINCT'), items = [], star = false;
      if (this.eatSym('*')) { star = true; if (this.eatSym(',')) items = this.projItems(); }
      else items = this.projItems();
      var order = null, skip = null, limit = null, where = null;
      if (this.isKw('ORDER')) {
        this.p++; this.kw('BY'); order = [];
        do { var ost = this.peek().s, e = this.expr(), oen = this.toks[this.p - 1].e, desc = false; if (this.eatKw('DESC') || this.eatKw('DESCENDING')) desc = true; else if (this.eatKw('ASC') || this.eatKw('ASCENDING')) desc = false; order.push({ expr: e, desc: desc, text: this.src.slice(ost, oen) }); } while (this.eatSym(','));
      }
      if (this.eatKw('SKIP')) skip = this.expr();
      if (this.eatKw('LIMIT')) limit = this.expr();
      if (kind === 'WITH' && this.eatKw('WHERE')) where = this.expr();
      return { type: kind, distinct: distinct, star: star, items: items, order: order, skip: skip, limit: limit, where: where, s: s };
    },
    projItems: function () {
      var items = [];
      do {
        var st = this.peek().s, e = this.expr(), en = this.toks[this.p - 1].e, alias = null;
        if (this.eatKw('AS')) alias = this.name('an alias');
        items.push({ expr: e, alias: alias, text: this.src.slice(st, en) });
      } while (this.eatSym(','));
      return items;
    },

    // -------------------------------------------------------------- patterns
    patterns: function () { var l = [this.patternPart()]; while (this.eatSym(',')) l.push(this.patternPart()); return l; },
    patternPart: function () {
      var pv = null, sp = null;
      if ((this.peek().t === 'id') && this.isSym('=', 1)) { pv = this.next().v; this.p++; }
      if (this.peek().t === 'id' && /^(shortestPath|allShortestPaths)$/i.test(this.peek().v) && this.isSym('(', 1)) {
        sp = /^all/i.test(this.next().v) ? 'all' : 'one'; this.sym('(');
        var inner = this.chain(); this.sym(')');
        return { v: pv, shortest: sp, chain: inner };
      }
      return { v: pv, chain: this.chain() };
    },
    chain: function () {
      var els = [this.nodePat()];
      while (this.isSym('-') || this.isSym('<-')) { els.push(this.relPat()); els.push(this.nodePat()); }
      return els;
    },
    nodePat: function () {
      var t = this.peek(); if (!this.eatSym('(')) this.fail("'('");
      var v = null, labels = [], props = null;
      if (this.peek().t === 'id' || (this.peek().t === 'kw' && !this.isSym(':') && this.isSym(')', 1))) v = this.name();
      while (this.eatSym(':')) labels.push(this.name('a label'));
      if (this.isSym('{')) props = this.mapLit();
      if (!this.eatSym(')')) this.fail("')'");
      return { kind: 'node', v: v, labels: labels, props: props, pos: t.s };
    },
    relPat: function () {
      var t = this.peek(), left = false, right = false;
      if (this.eatSym('<-')) left = true; else this.sym('-');
      var v = null, types = [], props = null, varLen = null;
      if (this.eatSym('[')) {
        if (this.peek().t === 'id') v = this.next().v;
        if (this.eatSym(':')) { types.push(this.name('a relationship type')); while (this.eatSym('|')) { this.eatSym(':'); types.push(this.name('a relationship type')); } }
        if (this.eatSym('*')) {
          var mn = 1, mx = Infinity;
          if (this.peek().t === 'num') { mn = this.next().v; mx = mn; }
          if (this.eatSym('..')) { mx = this.peek().t === 'num' ? this.next().v : Infinity; }
          else if (this.peek(-1).t !== 'num') { mn = 1; mx = Infinity; }
          varLen = { min: mn, max: mx };
        }
        if (this.isSym('{')) props = this.mapLit();
        this.sym(']');
      }
      if (this.eatSym('->')) right = true; else this.sym('-');
      return { kind: 'rel', v: v, types: types, props: props, varLen: varLen, dir: left && !right ? 'in' : right && !left ? 'out' : 'both', badBoth: left && right, pos: t.s };
    },
    mapLit: function () {
      this.sym('{'); var m = [];
      if (!this.isSym('}')) {
        do { var k = this.name('a property key'); this.sym(':'); m.push([k, this.expr()]); } while (this.eatSym(','));
      }
      this.sym('}');
      return { t: 'map', entries: m };
    },

    // -------------------------------------------------------------- expressions
    expr: function () { return this.orE(); },
    orE: function () { var l = this.xorE(); while (this.eatKw('OR')) l = { t: 'or', a: l, b: this.xorE() }; return l; },
    xorE: function () { var l = this.andE(); while (this.eatKw('XOR')) l = { t: 'xor', a: l, b: this.andE() }; return l; },
    andE: function () { var l = this.notE(); while (this.eatKw('AND')) l = { t: 'and', a: l, b: this.notE() }; return l; },
    notE: function () { if (this.eatKw('NOT')) return { t: 'not', a: this.notE() }; return this.cmpE(); },
    cmpE: function () {
      var l = this.addE();
      for (;;) {
        var t = this.peek();
        if (t.t === 'sym' && /^(=|<>|<|>|<=|>=|=~)$/.test(t.v)) { this.p++; l = { t: 'cmp', op: t.v, a: l, b: this.addE() }; continue; }
        if (this.isKw('IS')) { this.p++; var neg = this.eatKw('NOT'); this.kw('NULL'); l = { t: 'isnull', a: l, neg: neg }; continue; }
        if (this.isKw('IN')) { this.p++; l = { t: 'in', a: l, b: this.addE() }; continue; }
        if (this.isKw('STARTS')) { this.p++; this.kw('WITH'); l = { t: 'str', op: 'starts', a: l, b: this.addE() }; continue; }
        if (this.isKw('ENDS')) { this.p++; this.kw('WITH'); l = { t: 'str', op: 'ends', a: l, b: this.addE() }; continue; }
        if (this.isKw('CONTAINS')) { this.p++; l = { t: 'str', op: 'contains', a: l, b: this.addE() }; continue; }
        return l;
      }
    },
    addE: function () { var l = this.mulE(); for (;;) { if (this.isSym('+') || this.isSym('-')) { var o = this.next().v; l = { t: 'bin', op: o, a: l, b: this.mulE() }; } else return l; } },
    mulE: function () { var l = this.powE(); for (;;) { if (this.isSym('*') || this.isSym('/') || this.isSym('%')) { var o = this.next().v; l = { t: 'bin', op: o, a: l, b: this.powE() }; } else return l; } },
    powE: function () { var l = this.unE(); if (this.eatSym('^')) return { t: 'bin', op: '^', a: l, b: this.powE() }; return l; },
    unE: function () { if (this.eatSym('-')) return { t: 'neg', a: this.unE() }; if (this.eatSym('+')) return this.unE(); return this.postE(); },
    postE: function () {
      var e = this.atom();
      for (;;) {
        if (this.isSym('.') && !this.isSym('.', 1)) { this.p++; var kt = this.peek(); e = { t: 'prop', a: e, key: this.name('a property name'), pos: kt.s }; continue; }
        if (this.isSym('[')) {
          this.p++;
          if (this.eatSym('..')) { var hi = this.isSym(']') ? null : this.expr(); this.sym(']'); e = { t: 'slice', a: e, lo: null, hi: hi }; continue; }
          var ix = this.expr();
          if (this.eatSym('..')) { var hi2 = this.isSym(']') ? null : this.expr(); this.sym(']'); e = { t: 'slice', a: e, lo: ix, hi: hi2 }; continue; }
          this.sym(']'); e = { t: 'index', a: e, i: ix }; continue;
        }
        if (this.isSym(':') && e.t === 'var') { var labs = []; while (this.eatSym(':')) labs.push(this.name('a label')); e = { t: 'haslabel', a: e, labels: labs }; continue; }
        return e;
      }
    },
    looksLikePattern: function () {
      // '(' var? (':' label)* ('{'...)? ')' followed by '-' or '<-'
      var d = 1, k = this.p + 1;
      while (k < this.toks.length && d > 0) { var tk = this.toks[k]; if (tk.t === 'sym' && tk.v === '(') d++; if (tk.t === 'sym' && tk.v === ')') d--; k++; }
      var nt = this.toks[k];
      if (!nt || nt.t !== 'sym' || (nt.v !== '-' && nt.v !== '<-')) return false;
      var inner = this.toks.slice(this.p + 1, k - 1);
      return inner.every(function (x) { return x.t === 'id' || (x.t === 'sym' && x.v === ':') || x.t === 'kw'; }) || (inner.length && inner[inner.length - 1].v === '}');
    },
    atom: function () {
      var t = this.peek();
      if (t.t === 'num') { this.p++; return { t: 'lit', v: t.v }; }
      if (t.t === 'str') { this.p++; return { t: 'lit', v: t.v }; }
      if (t.t === 'param') { this.p++; return { t: 'param', name: t.v, pos: t.s }; }
      if (t.t === 'kw') {
        if (t.v === 'TRUE') { this.p++; return { t: 'lit', v: true }; }
        if (t.v === 'FALSE') { this.p++; return { t: 'lit', v: false }; }
        if (t.v === 'NULL') { this.p++; return { t: 'lit', v: null }; }
        if (t.v === 'CASE') return this.caseE();
        if ((t.v === 'EXISTS' || t.v === 'COUNT') && this.isSym('{', 1)) {
          this.p += 2; this.eatKw('MATCH');
          var pats = this.patterns(), w = null; if (this.eatKw('WHERE')) w = this.expr(); this.sym('}');
          return { t: t.v === 'EXISTS' ? 'existsq' : 'countq', patterns: pats, where: w };
        }
        if ((t.v === 'COUNT' || t.v === 'EXISTS') && this.isSym('(', 1)) { this.p++; return this.call(t.text || t.v, t.s); }
        this.fail('an expression');
      }
      if (t.t === 'sym' && t.v === '(') {
        if (this.looksLikePattern()) { return { t: 'patpred', chain: this.chain(), pos: t.s }; }
        this.p++; var e = this.expr(); this.sym(')'); return e;
      }
      if (t.t === 'sym' && t.v === '[') return this.listE();
      if (t.t === 'sym' && t.v === '{') return this.mapLit();
      if (t.t === 'id') {
        this.p++;
        if (this.isSym('(')) return this.call(t.v, t.s);
        if (this.isSym('.') && this.peek(1).t === 'id' && this.isSym('(', 2)) { // namespaced function e.g. date.truncate
          this.p++; var nm = t.v + '.' + this.next().v; return this.call(nm, t.s);
        }
        return { t: 'var', name: t.v, pos: t.s };
      }
      if (t.t === 'eof') this.fail('an expression');
      this.fail('an expression');
    },
    call: function (name, pos) {
      this.sym('(');
      var distinct = this.eatKw('DISTINCT'), args = [];
      if (this.isSym('*') && name.toLowerCase() === 'count') { this.p++; this.sym(')'); return { t: 'countstar' }; }
      if (!this.isSym(')')) {
        if (/^(shortestPath|allShortestPaths)$/i.test(name)) { var ch = this.chain(); this.sym(')'); return { t: 'sp', all: /^all/i.test(name), chain: ch }; }
        args = this.exprList();
      }
      this.sym(')');
      return { t: 'fn', name: name, lname: name.toLowerCase(), args: args, distinct: distinct, pos: pos };
    },
    caseE: function () {
      this.kw('CASE'); var subj = null, whens = [], els = null;
      if (!this.isKw('WHEN')) subj = this.expr();
      while (this.eatKw('WHEN')) { var w = this.expr(); this.kw('THEN'); whens.push([w, this.expr()]); }
      if (this.eatKw('ELSE')) els = this.expr();
      this.kw('END');
      return { t: 'case', subj: subj, whens: whens, els: els };
    },
    listE: function () {
      this.sym('[');
      // list comprehension [x IN list WHERE p | e]
      if (this.peek().t === 'id' && this.isKw('IN', 1)) {
        var v = this.next().v; this.p++; var src = this.expr(), w = null, m = null;
        if (this.eatKw('WHERE')) w = this.expr();
        if (this.eatSym('|')) m = this.expr();
        this.sym(']'); return { t: 'comp', v: v, src: src, where: w, map: m };
      }
      // pattern comprehension [(a)-->(b) | b.name]
      if (this.isSym('(') && this.looksLikePattern()) {
        var chn = this.chain(), w2 = null; if (this.eatKw('WHERE')) w2 = this.expr(); this.sym('|'); var mp = this.expr(); this.sym(']');
        return { t: 'patcomp', chain: chn, where: w2, map: mp };
      }
      var items = [];
      if (!this.isSym(']')) items = this.exprList();
      this.sym(']');
      return { t: 'list', items: items };
    }
  };

  // ------------------------------------------------------------------ helpers
  var AGG = { count: 1, sum: 1, avg: 1, min: 1, max: 1, collect: 1 };
  function hasAgg(e) {
    if (!e || typeof e !== 'object') return false;
    if (e.t === 'countstar') return true;
    if (e.t === 'fn' && AGG[e.lname]) return true;
    if (e.t === 'comp' || e.t === 'patcomp' || e.t === 'existsq' || e.t === 'countq') return false;
    for (var k in e) { if (k === 'pos') continue; var v = e[k]; if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) { if (Array.isArray(v[i]) ? v[i].some(hasAgg) : hasAgg(v[i])) return true; } } else if (v && typeof v === 'object' && v.t && hasAgg(v)) return true; }
    return false;
  }
  function typeRank(v) {
    if (isMap(v)) return 0; if (v instanceof Node) return 1; if (v instanceof Rel) return 2; if (Array.isArray(v)) return 3; if (v instanceof Path) return 4;
    if (typeof v === 'string') return 5; if (typeof v === 'boolean') return 6; if (isNum(v)) return 7; return 9;
  }
  function orderCmp(a, b) { // ORDER BY: nulls last ascending
    if (a === null && b === null) return 0; if (a === null) return 1; if (b === null) return -1;
    var ra = typeRank(a), rb = typeRank(b); if (ra !== rb) return ra - rb;
    if (isNum(a)) return num(a) - num(b);
    if (typeof a === 'string') return a < b ? -1 : a > b ? 1 : 0;
    if (typeof a === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
    if (Array.isArray(a)) { for (var i = 0; i < Math.min(a.length, b.length); i++) { var c = orderCmp(a[i], b[i]); if (c) return c; } return a.length - b.length; }
    if (a instanceof Node || a instanceof Rel) return a.id - b.id;
    return 0;
  }
  function eq(a, b) { // Cypher =, three-valued
    if (a === null || b === null) return null;
    if (isNum(a) && isNum(b)) return num(a) === num(b);
    if (typeof a !== typeof b && !(isNum(a) && isNum(b))) return (typeof a === 'object' && typeof b === 'object') ? deepEq(a, b) : false;
    if (Array.isArray(a)) { if (!Array.isArray(b) || a.length !== b.length) return false; var r = true; for (var i = 0; i < a.length; i++) { var x = eq(a[i], b[i]); if (x === false) return false; if (x === null) r = null; } return r; }
    if (a instanceof Node || a instanceof Rel) return (b instanceof Node || b instanceof Rel) && a.constructor === b.constructor && a.id === b.id;
    if (isMap(a)) return deepEq(a, b);
    return a === b;
  }
  function deepEq(a, b) {
    if (a instanceof Node || a instanceof Rel || b instanceof Node || b instanceof Rel) return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (isMap(a) && isMap(b)) { var ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false; return ka.every(function (k) { return eq(a[k], b[k]) === true; }); }
    return false;
  }
  function keyOf(v) { // grouping / DISTINCT key
    if (v === null || v === undefined) return 'N';
    if (isNum(v)) return 'n' + num(v);
    if (typeof v === 'string') return 's' + v;
    if (typeof v === 'boolean') return 'b' + v;
    if (v instanceof Node) return 'V' + v.id;
    if (v instanceof Rel) return 'E' + v.id;
    if (v instanceof Path) return 'P' + v.nodes.map(function (n) { return n.id; }).join(',') + '|' + v.rels.map(function (r) { return r.id; }).join(',');
    if (Array.isArray(v)) return '[' + v.map(keyOf).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return k + ':' + keyOf(v[k]); }).join(',') + '}';
  }
  function typeName(v) {
    if (v === null) return 'NULL'; if (typeof v === 'string') return 'String'; if (typeof v === 'boolean') return 'Boolean';
    if (isF(v)) return 'Float'; if (typeof v === 'number') return 'Long'; if (Array.isArray(v)) return 'List'; if (v instanceof Node) return 'Node';
    if (v instanceof Rel) return 'Relationship'; if (v instanceof Path) return 'Path'; return 'Map';
  }
  function cloneVal(v) {
    if (Array.isArray(v)) return v.map(cloneVal);
    return v;
  }
  function checkStorable(v, pos) {
    if (v === null) return;
    if (v instanceof Node || v instanceof Rel || v instanceof Path || isMap(v)) throw new CErr('Property values can only be of primitive types or arrays thereof. Encountered: ' + typeName(v) + '.', pos);
    if (Array.isArray(v)) v.forEach(function (x) { if (x === null || Array.isArray(x) || x instanceof Node || isMap(x)) throw new CErr('Collections containing null values or nested collections can not be stored in properties.', pos); });
  }

  // ------------------------------------------------------------------ engine
  function Engine() {
    this.nodes = []; this.rels = []; this.nextNode = 0; this.nextRel = 0;
    this.constraints = []; this.indexes = [];
    this.everLabels = {}; this.everTypes = {}; this.everKeys = {};
    this.maxVarLen = 12;
    this.relUnique = true;   // Neo4j: a relationship is used at most once per MATCH
  }
  Engine.Node = Node; Engine.Rel = Rel; Engine.Path = Path; Engine.F = F;

  Engine.prototype.snapshot = function () {
    var nmap = {};
    var nodes = this.nodes.map(function (n) { var c = new Node(n.id, n.labels.slice(), Object.assign({}, n.props)); nmap[n.id] = c; return c; });
    var rels = this.rels.map(function (r) { return new Rel(r.id, r.type, nmap[r.start.id], nmap[r.end.id], Object.assign({}, r.props)); });
    return { nodes: nodes, rels: rels, nextNode: this.nextNode, nextRel: this.nextRel, constraints: this.constraints.slice(), indexes: this.indexes.slice() };
  };
  Engine.prototype.restore = function (s) {
    this.nodes = s.nodes; this.rels = s.rels; this.nextNode = s.nextNode; this.nextRel = s.nextRel; this.constraints = s.constraints; this.indexes = s.indexes;
  };
  Engine.prototype.relsOf = function (n) { return this.rels.filter(function (r) { return r.start === n || r.end === n; }); };

  // ---- top level
  Engine.prototype.splitStatements = function (src) {
    var out = [], cur = '', q = null, i = 0;
    while (i < src.length) {
      var c = src[i];
      if (q) { cur += c; if (c === '\\') { cur += src[i + 1] || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { q = c; cur += c; i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') { cur += src[i]; i++; } continue; }
      if (c === ';') { out.push(cur); cur = ''; i++; continue; }
      cur += c; i++;
    }
    out.push(cur);
    return out.filter(function (s) { return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim(); });
  };
  Engine.prototype.exec = function (src) {
    var self = this;
    return this.splitStatements(src).map(function (st) { return self.execOne(st.trim().replace(/^(\s*\/\/[^\n]*\n)+/, '')); });
  };
  Engine.prototype.execOne = function (src) {
    var snap = null, res;
    try {
      var ast = new Parser(src).statement();
      this.checkScopes(ast);
      snap = this.snapshot();
      this.stats = { nodesCreated: 0, nodesDeleted: 0, relsCreated: 0, relsDeleted: 0, propsSet: 0, labelsAdded: 0, labelsRemoved: 0, indexesAdded: 0, indexesRemoved: 0, constraintsAdded: 0, constraintsRemoved: 0 };
      this.warnings = [];
      this.checkUnknown(ast);
      res = this.runQuery(ast);
      res.stats = this.stats; res.warnings = this.warnings; res.src = src;
      this.noteKeys();
      return res;
    } catch (e) {
      if (snap) this.restore(snap);
      if (e instanceof CErr) return { error: this.errText(e, src), src: src };
      return { error: 'Engine error: ' + (e && e.message), src: src };
    }
  };
  Engine.prototype.errText = function (e, src) {
    if (e.pos === undefined || e.pos === null) return e.message;
    var before = src.slice(0, e.pos), line = before.split('\n').length, col = e.pos - before.lastIndexOf('\n');
    var lineText = src.split('\n')[line - 1];
    return e.message + ' (line ' + line + ', column ' + col + ' (offset: ' + e.pos + '))\n"' + lineText + '"\n' + new Array(col + 1).join(' ') + '^';
  };
  Engine.prototype.noteKeys = function () {
    var self = this;
    this.nodes.forEach(function (n) { n.labels.forEach(function (l) { self.everLabels[l] = 1; }); Object.keys(n.props).forEach(function (k) { self.everKeys[k] = 1; }); });
    this.rels.forEach(function (r) { self.everTypes[r.type] = 1; Object.keys(r.props).forEach(function (k) { self.everKeys[k] = 1; }); });
  };
  Engine.prototype.checkUnknown = function (ast) {
    // Neo4j warns (not errors) when a MATCH names a label, type or property that has never existed.
    var self = this, labels = {}, types = {}, keys = {};
    this.noteKeys();
    function walkExpr(e) {
      if (!e || typeof e !== 'object') return;
      if (e.t === 'prop') keys[e.key] = 1;
      if (e.t === 'patpred' || e.t === 'patcomp') walkChain(e.chain);
      if (e.t === 'existsq' || e.t === 'countq') e.patterns.forEach(function (p) { walkChain(p.chain); });
      for (var k in e) { var v = e[k]; if (Array.isArray(v)) v.forEach(function (x) { if (Array.isArray(x)) x.forEach(walkExpr); else walkExpr(x); }); else if (v && typeof v === 'object' && k !== 'chain') walkExpr(v); }
    }
    function walkChain(ch) {
      ch.forEach(function (el) {
        if (el.kind === 'node') el.labels.forEach(function (l) { labels[l] = 1; });
        else el.types.forEach(function (t) { types[t] = 1; });
        if (el.props) el.props.entries.forEach(function (kv) { keys[kv[0]] = 1; });
      });
    }
    ast.parts.forEach(function (q) {
      (q.clauses || []).forEach(function (c) {
        if (c.type === 'MATCH') { c.patterns.forEach(function (p) { walkChain(p.chain); }); walkExpr(c.where); }
        if (c.type === 'RETURN' || c.type === 'WITH') { c.items.forEach(function (it) { walkExpr(it.expr); }); walkExpr(c.where); }
      });
    });
    Object.keys(labels).forEach(function (l) { if (!self.everLabels[l]) self.warnings.push("One of the labels in your query is not available in the database, make sure you didn't misspell it or that the label is available when you run this statement in your application (the missing label name is: " + l + ')'); });
    Object.keys(types).forEach(function (t) { if (!self.everTypes[t]) self.warnings.push("One of the relationship types in your query is not available in the database, make sure you didn't misspell it or that the label is available when you run this statement in your application (the missing relationship type is: " + t + ')'); });
    Object.keys(keys).forEach(function (k) { if (!self.everKeys[k]) self.warnings.push("One of the property names in your query is not available in the database, make sure you didn't misspell it or that the label is available when you run this statement in your application (the missing property name is: " + k + ')'); });
  };

  // ---- scope check (Variable `x` not defined)
  Engine.prototype.checkScopes = function (ast) {
    ast.parts.forEach(function (q) {
      if (!q.clauses) return;
      var scope = {};
      function useExpr(e, local) {
        if (!e || typeof e !== 'object') return;
        local = local || {};
        if (e.t === 'var') { if (!scope[e.name] && !local[e.name]) throw new CErr('Variable `' + e.name + '` not defined', e.pos); return; }
        if (e.t === 'comp') { useExpr(e.src, local); var l2 = Object.assign({}, local); l2[e.v] = 1; useExpr(e.where, l2); useExpr(e.map, l2); return; }
        if (e.t === 'patpred' || e.t === 'patcomp' || e.t === 'existsq' || e.t === 'countq') {
          var chains = e.chain ? [e.chain] : e.patterns.map(function (p) { return p.chain; });
          var l3 = Object.assign({}, local);
          chains.forEach(function (ch) { ch.forEach(function (el) { if (el.v) l3[el.v] = 1; if (el.props) useExpr(el.props, local); }); });
          if (e.t === 'patpred') chains.forEach(function (ch) { ch.forEach(function (el) { if (el.v && !scope[el.v] && !local[el.v] && el.kind === 'node') throw new CErr('PatternExpressions are not allowed to introduce new variables: \'' + el.v + '\'.', el.pos); }); });
          useExpr(e.where, l3); useExpr(e.map, l3); return;
        }
        for (var k in e) { if (k === 'pos') continue; var v = e[k]; if (Array.isArray(v)) v.forEach(function (x) { if (Array.isArray(x)) x.forEach(function (y) { useExpr(y, local); }); else useExpr(x, local); }); else if (v && typeof v === 'object') useExpr(v, local); }
      }
      function bindPattern(p, creating) {
        p.chain.forEach(function (el) { if (el.props) useExpr(el.props); });
        p.chain.forEach(function (el) { if (el.v) scope[el.v] = 1; });
        if (p.v) scope[p.v] = 1;
      }
      q.clauses.forEach(function (c) {
        switch (c.type) {
          case 'MATCH': c.patterns.forEach(function (p) { p.chain.forEach(function (el) { if (el.v) scope[el.v] = 1; }); if (p.v) scope[p.v] = 1; }); c.patterns.forEach(function (p) { p.chain.forEach(function (el) { if (el.props) useExpr(el.props); }); }); useExpr(c.where); break;
          case 'CREATE': c.patterns.forEach(function (p) { bindPattern(p, true); }); break;
          case 'MERGE': bindPattern(c.pattern); c.onCreate.concat(c.onMatch).forEach(function (it) { if (!scope[it.v]) throw new CErr('Variable `' + it.v + '` not defined', it.pos); useExpr(it.expr); }); break;
          case 'SET': case 'REMOVE': c.items.forEach(function (it) { if (!scope[it.v]) throw new CErr('Variable `' + it.v + '` not defined', it.pos); useExpr(it.expr); }); break;
          case 'DELETE': c.exprs.forEach(function (e) { useExpr(e); }); break;
          case 'UNWIND': useExpr(c.expr); scope[c.as] = 1; break;
          case 'CALL': (c.yields || []).forEach(function (y) { scope[y] = 1; }); if (!c.yields) { scope.label = scope.relationshipType = scope.propertyKey = 1; } break;
          case 'WITH': case 'RETURN':
            c.items.forEach(function (it) { useExpr(it.expr); });
            var ns = c.star ? Object.assign({}, scope) : {};
            c.items.forEach(function (it) { var nm = it.alias || (it.expr.t === 'var' ? it.expr.name : null); if (nm) ns[nm] = 1; else if (c.type === 'WITH') throw new CErr('Expression in WITH must be aliased (use AS)', c.s); });
            var orderScope = c.distinct || c.items.some(function (it) { return hasAgg(it.expr); }) ? ns : Object.assign({}, scope, ns);
            var keep = scope; scope = orderScope;
            (c.order || []).forEach(function (o) {
              var nt = o.text.replace(/\s+/g, ''); if (c.items.some(function (it) { return it.text.replace(/\s+/g, '') === nt; })) return;
              try { useExpr(o.expr); } catch (er) {
                var mm = /^Variable `(.*)` not defined$/.exec(er.message);
                if (mm && keep[mm[1]] && orderScope === ns) throw new CErr('In a ' + c.type + ' with DISTINCT or an aggregation, it is not possible to access variables declared before the ' + c.type + ': ' + mm[1], er.pos);
                throw er;
              }
            });
            scope = ns; useExpr(c.where);
            if (c.type === 'RETURN') scope = keep;
            break;
        }
      });
      var last = q.clauses[q.clauses.length - 1];
      if (last.type === 'WITH' || last.type === 'MATCH' || last.type === 'UNWIND' || (last.type === 'CALL' && q.clauses.length > 1)) {
        if (last.type !== 'CALL') throw new CErr('Query cannot conclude with ' + last.type + (last.type === 'MATCH' && last.optional ? '' : '') + ' (must be a RETURN clause, a FINISH clause, an update clause, a unit subquery call, or a procedure call with no YIELD).', last.s);
      }
    });
  };

  // ---- run
  Engine.prototype.runQuery = function (ast) {
    var self = this, results = ast.parts.map(function (q) { return q.schema ? self.schema(q.schema) : self.runSingle(q); });
    if (results.length === 1) return results[0];
    var cols = results[0].columns, rows = [];
    results.forEach(function (r, i) {
      if (r.columns.join() !== cols.join()) throw new CErr('All sub queries in an UNION must have the same return column names');
      rows = rows.concat(r.rows);
    });
    if (!ast.parts.slice(1).every(function (q) { return q.unionAll; })) {
      var seen = {}; rows = rows.filter(function (r) { var k = r.map(keyOf).join('|'); if (seen[k]) return false; seen[k] = 1; return true; });
    }
    return { columns: cols, rows: rows };
  };
  Engine.prototype.schema = function (s) {
    var self = this;
    if (s.op === 'show') {
      var list = s.what === 'CONSTRAINTS' ? this.constraints : this.indexes;
      return { columns: ['name', 'type', 'labelsOrTypes', 'properties'], rows: list.map(function (c) { return [c.name, s.what === 'CONSTRAINTS' ? 'UNIQUENESS' : 'RANGE', [c.label], [c.prop]]; }) };
    }
    if (s.op === 'drop') {
      var arr = s.kind === 'CONSTRAINT' ? this.constraints : this.indexes, i = arr.findIndex(function (c) { return c.name === s.name; });
      if (i < 0) { if (s.ifExists) return { columns: [], rows: [] }; throw new CErr('Unable to drop ' + s.kind.toLowerCase() + ' `' + s.name + '`: No such ' + s.kind.toLowerCase() + ' ' + s.name + '.'); }
      arr.splice(i, 1);
      if (s.kind === 'CONSTRAINT') { this.stats.constraintsRemoved++; this.indexes = this.indexes.filter(function (x) { return x.owner !== s.name; }); }
      else this.stats.indexesRemoved++;
      return { columns: [], rows: [] };
    }
    var name = s.name || (s.kind === 'CONSTRAINT' ? 'constraint_' : 'index_') + (Math.abs(hash(s.label + '.' + s.prop + s.kind)) >>> 0).toString(16).slice(0, 8);
    var existing = (s.kind === 'CONSTRAINT' ? this.constraints : this.indexes).filter(function (c) { return c.label === s.label && c.prop === s.prop; })[0];
    if (existing) {
      if (s.ifNotExists) return { columns: [], rows: [] };
      throw new CErr((s.kind === 'CONSTRAINT' ? 'An equivalent constraint already exists, \'Constraint( name=\'' + existing.name + '\', type=\'UNIQUENESS\', schema=(:' + s.label + ' {' + s.prop + '}) )\'.' : 'An equivalent index already exists, \'Index( name=\'' + existing.name + '\', type=\'RANGE\', schema=(:' + s.label + ' {' + s.prop + '}) )\'.'));
    }
    if (s.kind === 'CONSTRAINT') {
      if (s.prop && this.indexes.some(function (x) { return x.label === s.label && x.prop === s.prop; }))
        throw new CErr('There already exists an index (:' + s.label + ' {' + s.prop + '}). A constraint cannot be created until the index has been dropped.');
      var seen = {};
      this.nodes.forEach(function (n) {
        if (n.labels.indexOf(s.label) < 0 || n.props[s.prop] === undefined) return;
        var k = keyOf(n.props[s.prop]);
        if (seen[k] !== undefined) throw new CErr('Unable to create Constraint( name=\'' + name + '\', type=\'UNIQUENESS\', schema=(:' + s.label + ' {' + s.prop + '}) ):\nBoth Node(' + seen[k] + ') and Node(' + n.id + ') have the label `' + s.label + '` and property `' + s.prop + '` = ' + fmtVal(n.props[s.prop], true));
        seen[k] = n.id;
      });
      this.constraints.push({ name: name, label: s.label, prop: s.prop }); this.stats.constraintsAdded++;
    } else { this.indexes.push({ name: name, label: s.label, prop: s.prop }); this.stats.indexesAdded++; }
    return { columns: [], rows: [] };
  };
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  Engine.prototype.runSingle = function (q) {
    var rows = [{}], self = this, result = null;
    q.clauses.forEach(function (c) {
      switch (c.type) {
        case 'MATCH': rows = self.doMatch(c, rows); break;
        case 'CREATE': rows = rows.map(function (r) { return self.createPatterns(c.patterns, r); }); break;
        case 'MERGE': rows = self.doMerge(c, rows); break;
        case 'SET': rows.forEach(function (r) { self.doSet(c.items, r); }); break;
        case 'REMOVE': rows.forEach(function (r) { self.doRemove(c.items, r); }); break;
        case 'DELETE': self.doDelete(c, rows); break;
        case 'UNWIND': var out = []; rows.forEach(function (r) { var l = self.ev(c.expr, r); if (l === null) return; if (!Array.isArray(l)) l = [l]; l.forEach(function (x) { var nr = Object.assign({}, r); nr[c.as] = x; out.push(nr); }); }); rows = out; break;
        case 'CALL': rows = self.doCall(c, rows); if (c === q.clauses[q.clauses.length - 1]) result = { columns: c.yields || Object.keys(rows[0] || self.procCols(c.proc)), rows: rows.map(function (r) { return (c.yields || self.procCols(c.proc)).map(function (k) { return r[k]; }); }) }; break;
        case 'WITH': rows = self.project(c, rows).rows; break;
        case 'RETURN': result = self.project(c, rows); break;
      }
    });
    if (result) return { columns: result.columns, rows: result.rows };
    return { columns: [], rows: [] };
  };
  Engine.prototype.procCols = function (p) { return { 'db.labels': ['label'], 'db.relationshiptypes': ['relationshipType'], 'db.propertykeys': ['propertyKey'] }[p.toLowerCase()] || ['value']; };
  Engine.prototype.doCall = function (c, rows) {
    var p = c.proc.toLowerCase(), vals, col = this.procCols(c.proc)[0], self = this;
    if (p === 'db.labels') { var s = {}; this.nodes.forEach(function (n) { n.labels.forEach(function (l) { s[l] = 1; }); }); vals = Object.keys(s); }
    else if (p === 'db.relationshiptypes') { var t = {}; this.rels.forEach(function (r) { t[r.type] = 1; }); vals = Object.keys(t); }
    else if (p === 'db.propertykeys') { this.noteKeys(); vals = Object.keys(this.everKeys); }
    else throw new CErr('There is no procedure with the name `' + c.proc + '` registered for this database instance. Please ensure you\'ve spelled the procedure name correctly and that the procedure is properly deployed.', c.s);
    vals.sort();
    var out = [];
    rows.forEach(function (r) { vals.forEach(function (v) { var nr = Object.assign({}, r); nr[(c.yields || [col])[0]] = v; out.push(nr); }); });
    return out;
  };

  // ---- matching
  Engine.prototype.nodeOk = function (n, el, row) {
    for (var i = 0; i < el.labels.length; i++) if (n.labels.indexOf(el.labels[i]) < 0) return false;
    if (el.props) { var self = this; for (var j = 0; j < el.props.entries.length; j++) { var kv = el.props.entries[j]; if (eq(n.props[kv[0]] === undefined ? null : n.props[kv[0]], self.ev(kv[1], row)) !== true) return false; } }
    return true;
  };
  Engine.prototype.relOk = function (r, el, row) {
    if (el.types.length && el.types.indexOf(r.type) < 0) return false;
    if (el.props) { for (var j = 0; j < el.props.entries.length; j++) { var kv = el.props.entries[j]; if (eq(r.props[kv[0]] === undefined ? null : r.props[kv[0]], this.ev(kv[1], row)) !== true) return false; } }
    return true;
  };
  Engine.prototype.steps = function (n, el) { // [{rel, other}] for one hop from n
    var out = [];
    for (var i = 0; i < this.rels.length; i++) {
      var r = this.rels[i];
      if ((el.dir === 'out' || el.dir === 'both') && r.start === n) out.push({ rel: r, other: r.end });
      if ((el.dir === 'in' || el.dir === 'both') && r.end === n && !(el.dir === 'both' && r.start === n && r.end === n)) out.push({ rel: r, other: r.start });
    }
    return out;
  };
  Engine.prototype.matchChain = function (chain, row, used, pathVar) {
    // returns list of {row, used, path:{nodes, rels}}
    var self = this, results = [];
    var first = chain[0];
    var starts;
    if (first.v && row[first.v] !== undefined) { var b = row[first.v]; starts = b instanceof Node ? [b] : b === null ? [] : (function () { throw new CErr('Type mismatch: expected Node but was ' + typeName(b), first.pos); })(); }
    else starts = this.nodes;
    starts.forEach(function (n) {
      if (!self.nodeOk(n, first, row)) return;
      var r0 = row; if (first.v && row[first.v] === undefined) { r0 = Object.assign({}, row); r0[first.v] = n; }
      extend(1, n, r0, used, [n], []);
    });
    function extend(i, cur, r, usedRels, pn, pr) {
      if (i >= chain.length) { results.push({ row: r, used: usedRels, path: new Path(pn, pr) }); return; }
      var rel = chain[i], nxt = chain[i + 1];
      function landing(other, rr, ur, newPn, newPr, relVal) {
        var bound = nxt.v ? rr[nxt.v] : undefined;
        if (bound !== undefined) { if (bound !== other) return; }
        if (!self.nodeOk(other, nxt, rr)) return;
        var r2 = rr;
        if (rel.v && rr[rel.v] === undefined) { r2 = Object.assign({}, r2); r2[rel.v] = relVal; }
        else if (rel.v && rr[rel.v] !== undefined && keyOf(rr[rel.v]) !== keyOf(relVal)) return;
        if (nxt.v && bound === undefined) { r2 = r2 === rr ? Object.assign({}, r2) : r2; r2[nxt.v] = other; }
        extend(i + 2, other, r2, ur, newPn, newPr);
      }
      if (!rel.varLen) {
        self.steps(cur, rel).forEach(function (st) {
          if ((self.relUnique && usedRels[st.rel.id]) || !self.relOk(st.rel, rel, r)) return;
          var ur = Object.assign({}, usedRels); ur[st.rel.id] = 1;
          landing(st.other, r, ur, pn.concat([st.other]), pr.concat([st.rel]), st.rel);
        });
      } else {
        var mx = Math.min(rel.varLen.max, self.maxVarLen), mn = rel.varLen.min;
        (function walk(node, depth, ur, relsSoFar, nodesSoFar) {
          if (depth >= mn) landing(node, r, ur, pn.concat(nodesSoFar), pr.concat(relsSoFar), relsSoFar.slice());
          if (depth >= mx) return;
          self.steps(node, rel).forEach(function (st) {
            if (ur[st.rel.id] || !self.relOk(st.rel, rel, r)) return;  // within one variable-length hop chain relationships never repeat
            var u2 = Object.assign({}, ur); u2[st.rel.id] = 1;
            walk(st.other, depth + 1, u2, relsSoFar.concat([st.rel]), nodesSoFar.concat([st.other]));
          });
        })(cur, 0, usedRels, [], []);
      }
    }
    return results;
  };
  Engine.prototype.shortest = function (part, row) {
    var chain = part.chain;
    if (chain.length !== 3) throw new CErr('shortestPath(...) requires a pattern containing a single relationship', chain[0].pos);
    var a = chain[0], rel = chain[1], b = chain[2], self = this;
    var starts = a.v && row[a.v] !== undefined ? [row[a.v]] : this.nodes.filter(function (n) { return self.nodeOk(n, a, row); });
    var ends = b.v && row[b.v] !== undefined ? [row[b.v]] : this.nodes.filter(function (n) { return self.nodeOk(n, b, row); });
    var mx = rel.varLen ? Math.min(rel.varLen.max, 30) : 1, mn = rel.varLen ? rel.varLen.min : 1;
    var out = [];
    starts.forEach(function (s) {
      ends.forEach(function (e) {
        if (s === e && mn > 0) return;
        // BFS over paths, collecting all shortest
        var frontier = [{ n: s, nodes: [s], rels: [] }], found = [], depth = 0, seenAt = {}; seenAt[s.id] = 0;
        while (frontier.length && depth < mx && !found.length) {
          depth++; var nf = [];
          frontier.forEach(function (p) {
            self.steps(p.n, rel).forEach(function (st) {
              if (!self.relOk(st.rel, rel, row)) return;
              if (p.rels.indexOf(st.rel) >= 0) return;
              if (seenAt[st.other.id] !== undefined && seenAt[st.other.id] < depth) return;
              seenAt[st.other.id] = depth;
              var np = { n: st.other, nodes: p.nodes.concat([st.other]), rels: p.rels.concat([st.rel]) };
              if (st.other === e && depth >= mn) found.push(np); else nf.push(np);
            });
          });
          frontier = nf;
        }
        (part.shortest === 'all' ? found : found.slice(0, 1)).forEach(function (p) {
          var r = Object.assign({}, row);
          if (a.v) r[a.v] = s; if (b.v) r[b.v] = e; if (rel.v) r[rel.v] = p.rels;
          if (part.v) r[part.v] = new Path(p.nodes, p.rels);
          out.push(r);
        });
      });
    });
    return out;
  };
  Engine.prototype.matchPatterns = function (patterns, row) {
    var self = this, acc = [{ row: row, used: {} }];
    patterns.forEach(function (p) {
      var next = [];
      acc.forEach(function (a) {
        if (p.shortest) { self.shortest(p, a.row).forEach(function (r) { next.push({ row: r, used: a.used }); }); return; }
        self.matchChain(p.chain, a.row, a.used).forEach(function (m) {
          var r = m.row; if (p.v) { r = Object.assign({}, r); r[p.v] = m.path; }
          next.push({ row: r, used: m.used });
        });
      });
      acc = next;
    });
    return acc.map(function (a) { return a.row; });
  };
  Engine.prototype.doMatch = function (c, rows) {
    var self = this, out = [];
    rows.forEach(function (row) {
      var ms = self.matchPatterns(c.patterns, row);
      if (c.where) ms = ms.filter(function (r) { return self.ev(c.where, r) === true; });
      if (!ms.length && c.optional) {
        var nr = Object.assign({}, row);
        c.patterns.forEach(function (p) { p.chain.forEach(function (el) { if (el.v && nr[el.v] === undefined) nr[el.v] = null; }); if (p.v) nr[p.v] = null; });
        out.push(nr);
      } else out.push.apply(out, ms);
    });
    return out;
  };

  // ---- writing
  Engine.prototype.propsFrom = function (mapLit, row) {
    var p = {}, self = this;
    if (mapLit) mapLit.entries.forEach(function (kv) { var v = self.ev(kv[1], row); checkStorable(v, kv[1].pos); if (v !== null) { p[kv[0]] = cloneVal(v); } });
    return p;
  };
  Engine.prototype.checkUnique = function (n) {
    var self = this;
    this.constraints.forEach(function (c) {
      if (n.labels.indexOf(c.label) < 0 || n.props[c.prop] === undefined) return;
      self.nodes.forEach(function (o) {
        if (o !== n && o.labels.indexOf(c.label) >= 0 && o.props[c.prop] !== undefined && eq(o.props[c.prop], n.props[c.prop]) === true)
          throw new CErr('Node(' + o.id + ') already exists with label `' + c.label + '` and property `' + c.prop + '` = ' + fmtVal(n.props[c.prop], true));
      });
    });
  };
  Engine.prototype.newNode = function (el, row) {
    var n = new Node(this.nextNode++, el.labels.slice(), this.propsFrom(el.props, row));
    this.nodes.push(n);
    this.stats.nodesCreated++; this.stats.labelsAdded += n.labels.length; this.stats.propsSet += Object.keys(n.props).length;
    this.checkUnique(n);
    return n;
  };
  Engine.prototype.createPatterns = function (patterns, row) {
    var self = this, r = Object.assign({}, row);
    patterns.forEach(function (p) {
      var nodes = [], rels = [];
      p.chain.forEach(function (el, i) {
        if (el.kind === 'node') {
          if (el.v && r[el.v] !== undefined) {
            if (el.labels.length || el.props) throw new CErr("Can't create node `" + el.v + '` with labels or properties here. The variable is already declared in this context', el.pos);
            if (!(r[el.v] instanceof Node)) throw new CErr('Type mismatch: expected Node but was ' + typeName(r[el.v]), el.pos);
            nodes.push(r[el.v]);
          } else { var n = self.newNode(el, r); if (el.v) r[el.v] = n; nodes.push(n); }
        }
      });
      p.chain.forEach(function (el, i) {
        if (el.kind !== 'rel') return;
        if (el.dir === 'both' || el.badBoth) throw new CErr('Only directed relationships are supported in CREATE', el.pos);
        if (el.types.length !== 1) throw new CErr('Exactly one relationship type must be specified for CREATE. Did you forget to prefix your relationship type with a \':\'?', el.pos);
        if (el.varLen) throw new CErr('Variable length relationships cannot be used in CREATE', el.pos);
        if (el.v && r[el.v] !== undefined) throw new CErr("Can't create relationship `" + el.v + '` with a variable that is already declared in this context', el.pos);
        var a = nodes[(i - 1) / 2], b = nodes[(i + 1) / 2];
        var rel = new Rel(self.nextRel++, el.types[0], el.dir === 'out' ? a : b, el.dir === 'out' ? b : a, self.propsFrom(el.props, r));
        self.rels.push(rel); self.stats.relsCreated++; self.stats.propsSet += Object.keys(rel.props).length;
        if (el.v) r[el.v] = rel; rels.push(rel);
      });
      if (p.v) r[p.v] = new Path(nodes, rels);
    });
    return r;
  };
  Engine.prototype.doMerge = function (c, rows) {
    var self = this, out = [];
    rows.forEach(function (row) {
      var ms = self.matchPatterns([c.pattern], row);
      if (ms.length) { ms.forEach(function (r) { self.doSet(c.onMatch, r); out.push(r); }); }
      else {
        c.pattern.chain.forEach(function (el) { if (el.kind === 'rel' && el.dir === 'both') { /* MERGE allows undirected: create left to right */ } });
        var pat = { v: c.pattern.v, chain: c.pattern.chain.map(function (el) { return el.kind === 'rel' && el.dir === 'both' ? Object.assign({}, el, { dir: 'out' }) : el; }) };
        var r = self.createPatterns([pat], row); self.doSet(c.onCreate, r); out.push(r);
      }
    });
    return out;
  };
  Engine.prototype.doSet = function (items, row) {
    var self = this;
    items.forEach(function (it) {
      var t = row[it.v];
      if (t === null) return;
      if (!(t instanceof Node) && !(t instanceof Rel)) throw new CErr('Type mismatch: expected Node or Relationship but was ' + typeName(t), it.pos);
      if (it.kind === 'prop') {
        var v = self.ev(it.expr, row); checkStorable(v, it.pos);
        if (v === null) { if (t.props[it.key] !== undefined) { delete t.props[it.key]; self.stats.propsSet++; } }
        else { t.props[it.key] = cloneVal(v); self.stats.propsSet++; }
        if (t instanceof Node) self.checkUnique(t);
      } else if (it.kind === 'merge' || it.kind === 'replace') {
        var m = self.ev(it.expr, row);
        if (m instanceof Node || m instanceof Rel) m = Object.assign({}, m.props);
        if (!isMap(m)) throw new CErr('Expected ' + fmtVal(m) + ' to be a map, but it was :`' + typeName(m) + '`', it.pos);
        if (it.kind === 'replace') { Object.keys(t.props).forEach(function (k) { if (m[k] === undefined) { delete t.props[k]; self.stats.propsSet++; } }); }
        Object.keys(m).forEach(function (k) { checkStorable(m[k], it.pos); if (m[k] === null) { if (t.props[k] !== undefined) { delete t.props[k]; self.stats.propsSet++; } } else { t.props[k] = cloneVal(m[k]); self.stats.propsSet++; } });
        if (t instanceof Node) self.checkUnique(t);
      } else if (it.kind === 'labels') {
        if (!(t instanceof Node)) throw new CErr('Type mismatch: expected Node but was Relationship', it.pos);
        it.labels.forEach(function (l) { if (t.labels.indexOf(l) < 0) { t.labels.push(l); self.stats.labelsAdded++; } });
        self.checkUnique(t);
      }
    });
  };
  Engine.prototype.doRemove = function (items, row) {
    var self = this;
    items.forEach(function (it) {
      var t = row[it.v]; if (t === null) return;
      if (it.kind === 'prop') { if (t.props[it.key] !== undefined) { delete t.props[it.key]; self.stats.propsSet++; } }
      else it.labels.forEach(function (l) { var i = t.labels.indexOf(l); if (i >= 0) { t.labels.splice(i, 1); self.stats.labelsRemoved++; } });
    });
  };
  Engine.prototype.doDelete = function (c, rows) {
    var self = this, delN = [], delR = [];
    rows.forEach(function (row) {
      c.exprs.forEach(function (e) {
        var v = self.ev(e, row);
        (function add(x) {
          if (x === null) return;
          if (x instanceof Node) { if (delN.indexOf(x) < 0) delN.push(x); }
          else if (x instanceof Rel) { if (delR.indexOf(x) < 0) delR.push(x); }
          else if (x instanceof Path) { x.nodes.forEach(add); x.rels.forEach(add); }
          else if (Array.isArray(x)) x.forEach(add);
          else throw new CErr('Expected a Node, Relationship or Path, but got a ' + typeName(x));
        })(v);
      });
    });
    if (c.detach) delN.forEach(function (n) { self.relsOf(n).forEach(function (r) { if (delR.indexOf(r) < 0) delR.push(r); }); });
    delN.forEach(function (n) {
      var left = self.relsOf(n).filter(function (r) { return delR.indexOf(r) < 0; });
      if (left.length) throw new CErr('Cannot delete node<' + n.id + '>, because it still has relationships. To delete this node, you must first delete its relationships.');
    });
    this.rels = this.rels.filter(function (r) { return delR.indexOf(r) < 0; });
    this.nodes = this.nodes.filter(function (n) { return delN.indexOf(n) < 0; });
    this.stats.relsDeleted += delR.length; this.stats.nodesDeleted += delN.length;
  };

  // ---- projection (WITH / RETURN)
  Engine.prototype.project = function (c, rows) {
    var self = this, items = c.items.slice();
    if (c.star) {
      var vars = {}; rows.forEach(function (r) { Object.keys(r).forEach(function (k) { vars[k] = 1; }); });
      if (!rows.length) { /* columns unknown: keep none */ }
      items = Object.keys(vars).sort().map(function (k) { return { expr: { t: 'var', name: k }, alias: null, text: k }; }).concat(items);
    }
    if (c.type === 'RETURN' && !items.length) throw new CErr('RETURN * is not allowed when there are no variables in scope', c.s);
    var names = items.map(function (it) { return it.alias || (it.expr.t === 'var' ? it.expr.name : it.text); });
    var agg = items.some(function (it) { return hasAgg(it.expr); });
    var out; // [{vals:[], scope:{}}]
    if (agg) {
      var groups = {}, order = [];
      if (!rows.length && items.every(function (it) { return hasAgg(it.expr); })) { groups[''] = []; order.push(''); }
      rows.forEach(function (r) {
        var keyVals = items.map(function (it) { return hasAgg(it.expr) ? null : self.ev(it.expr, r); });
        var k = keyVals.map(keyOf).join('|');
        if (!groups[k]) { groups[k] = []; order.push(k); groups[k].keyVals = keyVals; }
        groups[k].push(r);
      });
      out = order.map(function (k) {
        var g = groups[k];
        var vals = items.map(function (it, i) { return hasAgg(it.expr) ? self.evAgg(it.expr, g) : g.keyVals[i]; });
        var sc = Object.assign({}, g[0] || {}); names.forEach(function (n, i) { sc[n] = vals[i]; });
        if (c.distinct || agg) { sc = {}; names.forEach(function (n, i) { sc[n] = vals[i]; }); if (g[0]) items.forEach(function (it) { if (!hasAgg(it.expr) && it.expr.t === 'var') sc[it.expr.name] = g[0][it.expr.name]; }); }
        return { vals: vals, scope: sc };
      });
    } else {
      out = rows.map(function (r) {
        var vals = items.map(function (it) { return self.ev(it.expr, r); });
        var sc = c.distinct ? {} : Object.assign({}, r); names.forEach(function (n, i) { sc[n] = vals[i]; });
        return { vals: vals, scope: sc };
      });
    }
    if (c.distinct) { var seen = {}; out = out.filter(function (o) { var k = o.vals.map(keyOf).join('|'); if (seen[k]) return false; seen[k] = 1; return true; }); }
    if (c.order) {
      var colOf = c.order.map(function (ob) { var nt = ob.text.replace(/\s+/g, ''); for (var q = 0; q < items.length; q++) if (items[q].text.replace(/\s+/g, '') === nt) return q; return -1; });
      var keyed = out.map(function (o, i) { return { o: o, i: i, k: c.order.map(function (ob, j) { return colOf[j] >= 0 ? o.vals[colOf[j]] : self.ev(ob.expr, o.scope); }) }; });
      keyed.sort(function (a, b) {
        for (var j = 0; j < c.order.length; j++) { var d = orderCmp(a.k[j], b.k[j]); if (c.order[j].desc) d = -d; if (d) return d; }
        return a.i - b.i;
      });
      out = keyed.map(function (x) { return x.o; });
    }
    if (c.skip) { var sk = this.ev(c.skip, {}); out = out.slice(num(sk)); }
    if (c.limit) { var lm = this.ev(c.limit, {}); out = out.slice(0, num(lm)); }
    var newRows = out.map(function (o) { var r = {}; names.forEach(function (n, i) { r[n] = o.vals[i]; }); return r; });
    if (c.type === 'WITH' && c.where) newRows = newRows.filter(function (r) { return self.ev(c.where, r) === true; });
    return { columns: names, rows: c.type === 'RETURN' ? out.map(function (o) { return o.vals; }) : newRows };
  };
  Engine.prototype.evAgg = function (e, group) {
    var self = this;
    if (e.t === 'countstar') return group.length;
    if (e.t === 'fn' && AGG[e.lname]) {
      var vals = group.map(function (r) { return self.ev(e.args[0], r); }).filter(function (v) { return v !== null && v !== undefined; });
      if (e.distinct) { var s = {}; vals = vals.filter(function (v) { var k = keyOf(v); if (s[k]) return false; s[k] = 1; return true; }); }
      switch (e.lname) {
        case 'count': return vals.length;
        case 'collect': return vals;
        case 'sum': if (!vals.length) return 0; var fl = vals.some(isF); return mkNum(vals.reduce(function (a, v) { return a + num(v); }, 0), fl);
        case 'avg': if (!vals.length) return null; return new F(vals.reduce(function (a, v) { return a + num(v); }, 0) / vals.length);
        case 'min': if (!vals.length) return null; return vals.reduce(function (a, v) { return orderCmp(v, a) < 0 ? v : a; });
        case 'max': if (!vals.length) return null; return vals.reduce(function (a, v) { return orderCmp(v, a) > 0 ? v : a; });
      }
    }
    // an expression containing aggregates: evaluate children
    var copy = {};
    for (var k in e) {
      var v = e[k];
      if (Array.isArray(v)) copy[k] = v.map(function (x) { return Array.isArray(x) ? x.map(function (y) { return hasAgg(y) ? { t: 'lit', v: self.evAgg(y, group) } : y; }) : (hasAgg(x) ? { t: 'lit', v: self.evAgg(x, group) } : x); });
      else if (v && typeof v === 'object' && v.t && hasAgg(v)) copy[k] = { t: 'lit', v: self.evAgg(v, group) };
      else copy[k] = v;
    }
    return self.ev(copy, group[0] || {});
  };

  // ---- expressions
  Engine.prototype.ev = function (e, row) {
    var self = this, a, b;
    switch (e.t) {
      case 'lit': return e.v;
      case 'param': throw new CErr('Expected parameter(s): ' + e.name, e.pos);
      case 'var': if (row[e.name] === undefined) throw new CErr('Variable `' + e.name + '` not defined', e.pos); return row[e.name];
      case 'list': return e.items.map(function (x) { return self.ev(x, row); });
      case 'map': var m = {}; e.entries.forEach(function (kv) { m[kv[0]] = self.ev(kv[1], row); }); return m;
      case 'prop':
        a = this.ev(e.a, row);
        if (a === null) return null;
        if (a instanceof Node || a instanceof Rel) return a.props[e.key] === undefined ? null : a.props[e.key];
        if (isMap(a)) return a[e.key] === undefined ? null : a[e.key];
        throw new CErr('Type mismatch: expected a map but was ' + typeName(a) + ' ' + fmtVal(a), e.pos);
      case 'index':
        a = this.ev(e.a, row); b = this.ev(e.i, row);
        if (a === null || b === null) return null;
        if (Array.isArray(a)) { var ix = num(b); if (ix < 0) ix += a.length; return ix >= 0 && ix < a.length ? a[ix] : null; }
        if (a instanceof Node || a instanceof Rel) return a.props[b] === undefined ? null : a.props[b];
        if (isMap(a)) return a[b] === undefined ? null : a[b];
        throw new CErr('Type mismatch: expected a list or map but was ' + typeName(a));
      case 'slice':
        a = this.ev(e.a, row); if (a === null) return null;
        var lo = e.lo ? num(this.ev(e.lo, row)) : 0, hi = e.hi ? num(this.ev(e.hi, row)) : a.length;
        if (lo < 0) lo += a.length; if (hi < 0) hi += a.length; return a.slice(Math.max(0, lo), Math.max(0, hi));
      case 'haslabel': a = this.ev(e.a, row); if (a === null) return null; return e.labels.every(function (l) { return a.labels && a.labels.indexOf(l) >= 0; });
      case 'not': a = this.ev(e.a, row); return a === null ? null : !truth(a);
      case 'and': a = this.ev(e.a, row); if (a === false) return false; b = this.ev(e.b, row); if (b === false) return false; if (a === null || b === null) return null; return truth(a) && truth(b);
      case 'or': a = this.ev(e.a, row); if (a === true) return true; b = this.ev(e.b, row); if (b === true) return true; if (a === null || b === null) return null; return truth(a) || truth(b);
      case 'xor': a = this.ev(e.a, row); b = this.ev(e.b, row); if (a === null || b === null) return null; return truth(a) !== truth(b);
      case 'isnull': a = this.ev(e.a, row); return e.neg ? a !== null : a === null;
      case 'cmp':
        a = this.ev(e.a, row); b = this.ev(e.b, row);
        if (e.op === '=') return eq(a, b);
        if (e.op === '<>') { var q = eq(a, b); return q === null ? null : !q; }
        if (e.op === '=~') { if (a === null || b === null) return null; if (typeof a !== 'string') return null; try { return new RegExp('^(?:' + b + ')$').test(a); } catch (x) { throw new CErr('Invalid Regex: ' + x.message); } }
        if (a === null || b === null) return null;
        if (isNum(a) && isNum(b)) a = num(a), b = num(b);
        else if (typeof a !== typeof b || (typeof a !== 'string' && typeof a !== 'boolean')) return null;
        return e.op === '<' ? a < b : e.op === '>' ? a > b : e.op === '<=' ? a <= b : a >= b;
      case 'in':
        a = this.ev(e.a, row); b = this.ev(e.b, row);
        if (b === null) return null;
        if (!Array.isArray(b)) throw new CErr('Type mismatch: expected List<T> but was ' + typeName(b));
        var sawNull = a === null && b.length > 0;
        for (var i = 0; i < b.length; i++) { var r = eq(a, b[i]); if (r === true) return true; if (r === null) sawNull = true; }
        return sawNull ? null : false;
      case 'str':
        a = this.ev(e.a, row); b = this.ev(e.b, row);
        if (typeof a !== 'string' || typeof b !== 'string') return null;
        return e.op === 'starts' ? a.indexOf(b) === 0 : e.op === 'ends' ? a.slice(a.length - b.length) === b && a.length >= b.length : a.indexOf(b) >= 0;
      case 'neg': a = this.ev(e.a, row); if (a === null) return null; if (!isNum(a)) throw new CErr('Cannot negate ' + typeName(a)); return isF(a) ? new F(-a.v) : -a;
      case 'bin': return arith(e.op, this.ev(e.a, row), this.ev(e.b, row));
      case 'case':
        if (e.subj) { var sv = this.ev(e.subj, row); for (var w = 0; w < e.whens.length; w++) if (eq(sv, this.ev(e.whens[w][0], row)) === true) return this.ev(e.whens[w][1], row); }
        else for (var w2 = 0; w2 < e.whens.length; w2++) if (this.ev(e.whens[w2][0], row) === true) return this.ev(e.whens[w2][1], row);
        return e.els ? this.ev(e.els, row) : null;
      case 'comp':
        var src = this.ev(e.src, row); if (src === null) return null;
        return src.filter(function (x) { var r2 = Object.assign({}, row); r2[e.v] = x; return !e.where || self.ev(e.where, r2) === true; })
                  .map(function (x) { var r2 = Object.assign({}, row); r2[e.v] = x; return e.map ? self.ev(e.map, r2) : x; });
      case 'patpred': return this.matchChain(e.chain, row, {}).length > 0;
      case 'patcomp': return this.matchChain(e.chain, row, {}).filter(function (m) { return !e.where || self.ev(e.where, m.row) === true; }).map(function (m) { return self.ev(e.map, m.row); });
      case 'existsq': case 'countq':
        var ms = this.matchPatterns(e.patterns, row); if (e.where) ms = ms.filter(function (r3) { return self.ev(e.where, r3) === true; });
        return e.t === 'existsq' ? ms.length > 0 : ms.length;
      case 'sp': throw new CErr('shortestPath(...) is only allowed as a top-level element and not inside an expression');
      case 'countstar': throw new CErr('Invalid use of aggregating function count(...) in this context');
      case 'fn': return this.fn(e, row);
    }
    throw new CErr('Unsupported expression');
  };
  function truth(v) { if (typeof v === 'boolean') return v; throw new CErr('Type mismatch: expected Boolean but was ' + typeName(v)); }
  function arith(op, a, b) {
    if (a === null || b === null) return null;
    if (op === '+') {
      if (Array.isArray(a)) return a.concat(Array.isArray(b) ? b : [b]);
      if (Array.isArray(b)) return [a].concat(b);
      if (typeof a === 'string' || typeof b === 'string') {
        if ((typeof a === 'string' || isNum(a)) && (typeof b === 'string' || isNum(b))) return fmtPlain(a) + fmtPlain(b);
        throw new CErr('Type mismatch: expected Integer, Float, String or List<T> but was ' + typeName(typeof a === 'string' ? b : a));
      }
    }
    if (!isNum(a) || !isNum(b)) throw new CErr('Cannot ' + ({ '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', '%': 'modulo', '^': 'raise' })[op] + ' `' + typeName(a) + '` and `' + typeName(b) + '`');
    var fl = isF(a) || isF(b), x = num(a), y = num(b);
    switch (op) {
      case '+': return mkNum(x + y, fl);
      case '-': return mkNum(x - y, fl);
      case '*': return mkNum(x * y, fl);
      case '/': if (!fl) { if (y === 0) throw new CErr('/ by zero'); return Math.trunc(x / y); } return new F(x / y);
      case '%': if (!fl && y === 0) throw new CErr('/ by zero'); return mkNum(x % y, fl);
      case '^': return new F(Math.pow(x, y));
    }
  }
  function fmtPlain(v) { return typeof v === 'string' ? v : fmtNum(v); }
  Engine.prototype.fn = function (e, row) {
    var self = this, n = e.lname;
    if (AGG[n]) throw new CErr('Invalid use of aggregating function ' + n + '(...) in this context', e.pos);
    var args = e.args.map(function (x) { return self.ev(x, row); }), a = args[0];
    function need(k) { if (args.length !== k) throw new CErr('Insufficient parameters for function \'' + e.name + '\'', e.pos); }
    switch (n) {
      case 'id': need(1); return a === null ? null : a.id;
      case 'elementid': need(1); return a === null ? null : (a instanceof Node ? '4:com745:' : '5:com745:') + a.id;
      case 'labels': need(1); if (a === null) return null; if (!(a instanceof Node)) throw new CErr('Type mismatch: expected Node but was ' + typeName(a), e.pos); return a.labels.slice();
      case 'type': need(1); if (a === null) return null; if (!(a instanceof Rel)) throw new CErr('Type mismatch: expected Relationship but was ' + typeName(a), e.pos); return a.type;
      case 'keys': need(1); if (a === null) return null; return Object.keys(a instanceof Node || a instanceof Rel ? a.props : a);
      case 'properties': need(1); if (a === null) return null; return Object.assign({}, a instanceof Node || a instanceof Rel ? a.props : a);
      case 'size': need(1); if (a === null) return null; if (typeof a === 'string' || Array.isArray(a)) return a.length; throw new CErr('Type mismatch: expected String or List<T> but was ' + typeName(a), e.pos);
      case 'length': need(1); if (a === null) return null; if (a instanceof Path) return a.rels.length; throw new CErr('Type mismatch: expected Path but was ' + typeName(a), e.pos);
      case 'nodes': need(1); return a === null ? null : a.nodes.slice();
      case 'relationships': need(1); return a === null ? null : a.rels.slice();
      case 'startnode': return a === null ? null : a.start;
      case 'endnode': return a === null ? null : a.end;
      case 'head': return a === null || !a.length ? null : a[0];
      case 'last': return a === null || !a.length ? null : a[a.length - 1];
      case 'tail': return a === null ? null : a.slice(1);
      case 'reverse': return a === null ? null : typeof a === 'string' ? a.split('').reverse().join('') : a.slice().reverse();
      case 'range': var lo = num(args[0]), hi = num(args[1]), st = args[2] ? num(args[2]) : 1, out = []; for (var i = lo; st > 0 ? i <= hi : i >= hi; i += st) out.push(i); return out;
      case 'coalesce': for (var j = 0; j < args.length; j++) if (args[j] !== null) return args[j]; return null;
      case 'toupper': case 'upper': return a === null ? null : String(a).toUpperCase();
      case 'tolower': case 'lower': return a === null ? null : String(a).toLowerCase();
      case 'trim': return a === null ? null : String(a).trim();
      case 'ltrim': return a === null ? null : String(a).replace(/^\s+/, '');
      case 'rtrim': return a === null ? null : String(a).replace(/\s+$/, '');
      case 'left': return a === null ? null : a.slice(0, num(args[1]));
      case 'right': return a === null ? null : a.slice(Math.max(0, a.length - num(args[1])));
      case 'substring': return a === null ? null : (args.length > 2 ? a.substr(num(args[1]), num(args[2])) : a.slice(num(args[1])));
      case 'replace': return a === null ? null : a.split(args[1]).join(args[2]);
      case 'split': return a === null ? null : a.split(args[1]);
      case 'tostring': return a === null ? null : typeof a === 'string' ? a : typeof a === 'boolean' ? String(a) : fmtNum(a);
      case 'tointeger': if (a === null) return null; if (isNum(a)) return Math.trunc(num(a)); var pi = parseFloat(a); return isNaN(pi) ? null : Math.trunc(pi);
      case 'tofloat': if (a === null) return null; if (isNum(a)) return new F(num(a)); var pf = parseFloat(a); return isNaN(pf) ? null : new F(pf);
      case 'toboolean': return a === null ? null : typeof a === 'boolean' ? a : a === 'true' ? true : a === 'false' ? false : null;
      case 'abs': return a === null ? null : isF(a) ? new F(Math.abs(a.v)) : Math.abs(a);
      case 'round':
        if (a === null) return null;
        var p = args.length > 1 ? num(args[1]) : 0, f = Math.pow(10, p), v = num(a) * f;
        var rv = (v < 0 ? -Math.round(-v) : Math.round(v)) / f; return new F(rv);
      case 'ceil': return a === null ? null : new F(Math.ceil(num(a)));
      case 'floor': return a === null ? null : new F(Math.floor(num(a)));
      case 'sqrt': return a === null ? null : new F(Math.sqrt(num(a)));
      case 'rand': return new F(0.5);
      case 'exists': throw new CErr('The property existence syntax `... exists(variable.property)` is no longer supported. Please use `variable.property IS NOT NULL` instead.', e.pos);
      case 'timestamp': return Date.now();
      case 'datetime': case 'date': return a === null || a === undefined ? new Date().toISOString().slice(0, n === 'date' ? 10 : 23) + (n === 'date' ? '' : 'Z') : a;
    }
    throw new CErr('Unknown function \'' + e.name + '\'', e.pos);
  };

  // ------------------------------------------------------------------ output (cypher-shell)
  function fmtNum(v) {
    if (isF(v)) { var x = v.v; if (!isFinite(x)) return isNaN(x) ? 'NaN' : (x > 0 ? 'Infinity' : '-Infinity'); if (Number.isInteger(x) && Math.abs(x) < 1e16) return x.toFixed(1); return String(x).replace(/e\+?/, 'E'); }
    return String(v);
  }
  function fmtProps(p) {
    var ks = Object.keys(p); if (!ks.length) return '';
    return ' {' + ks.map(function (k) { return (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + k + '`') + ': ' + fmtVal(p[k]); }).join(', ') + '}';
  }
  function fmtNode(n) { return '(' + n.labels.map(function (l) { return ':' + l; }).join('') + fmtProps(n.props).replace(/^ /, n.labels.length ? ' ' : '') + ')'; }
  function fmtRel(r) { return '[:' + r.type + fmtProps(r.props) + ']'; }
  function fmtVal(v, single) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'string') return single ? "'" + v + "'" : '"' + v + '"';
    if (typeof v === 'boolean') return String(v).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
    if (isNum(v)) return fmtNum(v);
    if (Array.isArray(v)) return '[' + v.map(function (x) { return fmtVal(x, single); }).join(', ') + ']';
    if (v instanceof Node) return fmtNode(v);
    if (v instanceof Rel) return fmtRel(v);
    if (v instanceof Path) {
      var s = fmtNode(v.nodes[0]);
      v.rels.forEach(function (r, i) { var a = v.nodes[i]; s += r.start === a ? '-' + fmtRel(r) + '->' : '<-' + fmtRel(r) + '-'; s += fmtNode(v.nodes[i + 1]); });
      return s;
    }
    return '{' + Object.keys(v).map(function (k) { return k + ': ' + fmtVal(v[k], single); }).join(', ') + '}';
  }
  function statsLine(s) {
    var parts = [];
    if (s.nodesCreated) parts.push('Added ' + s.nodesCreated + ' nodes');
    if (s.nodesDeleted) parts.push('Deleted ' + s.nodesDeleted + ' nodes');
    if (s.relsCreated) parts.push('Created ' + s.relsCreated + ' relationships');
    if (s.relsDeleted) parts.push('Deleted ' + s.relsDeleted + ' relationships');
    if (s.propsSet) parts.push('Set ' + s.propsSet + ' properties');
    if (s.labelsAdded) parts.push('Added ' + s.labelsAdded + ' labels');
    if (s.labelsRemoved) parts.push('Removed ' + s.labelsRemoved + ' labels');
    if (s.indexesAdded) parts.push('Added ' + s.indexesAdded + ' indexes');
    if (s.indexesRemoved) parts.push('Removed ' + s.indexesRemoved + ' indexes');
    if (s.constraintsAdded) parts.push('Added ' + s.constraintsAdded + ' constraints');
    if (s.constraintsRemoved) parts.push('Removed ' + s.constraintsRemoved + ' constraints');
    return parts.join(', ');
  }
  function table(cols, rows) {
    var cells = rows.map(function (r) { return r.map(function (v) { return fmtVal(v); }); });
    var w = cols.map(function (c, i) { return Math.max(c.length, cells.reduce(function (m, r) { return Math.max(m, r[i].length); }, 0)); });
    var sep = '+' + w.map(function (x) { return new Array(x + 3).join('-'); }).join('+') + '+';
    function line(vals) { return '| ' + vals.map(function (v, i) { return v + new Array(w[i] - v.length + 1).join(' '); }).join(' | ') + ' |'; }
    var out = [sep, line(cols), sep];
    cells.forEach(function (r) { out.push(line(r)); });
    out.push(sep);
    return out.join('\n');
  }
  Engine.prototype.format = function (r) {
    if (r.error) return r.error;
    var out = [];
    if (r.columns.length) out.push(table(r.columns, r.rows), '');
    out.push(r.rows.length + (r.rows.length === 1 ? ' row' : ' rows'));
    var st = statsLine(r.stats || {}); if (st) out.push(st);
    (r.warnings || []).forEach(function (w) { out.push('Warning: ' + w); });
    return out.join('\n');
  };
  Engine.prototype.run = function (src) {
    var self = this;
    return this.exec(src).map(function (r) { return self.format(r); }).join('\n\n');
  };

  // ------------------------------------------------------------------ JSON view (for checks and the graph view)
  function plain(v) {
    if (v === null || v === undefined) return null;
    if (isF(v)) return v.v;
    if (Array.isArray(v)) return v.map(plain);
    if (v instanceof Node) return { '~node': v.id, labels: v.labels.slice(), props: plainMap(v.props) };
    if (v instanceof Rel) return { '~rel': v.id, type: v.type, start: v.start.id, end: v.end.id, props: plainMap(v.props) };
    if (v instanceof Path) return { '~path': true, nodes: v.nodes.map(plain), rels: v.rels.map(plain) };
    if (typeof v === 'object') return plainMap(v);
    return v;
  }
  function plainMap(m) { var o = {}; Object.keys(m).forEach(function (k) { o[k] = plain(m[k]); }); return o; }
  Engine.plain = plain;
  Engine.fmtVal = fmtVal;
  Engine.statsLine = statsLine;

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.CypherEngine = Engine;
})(this);
