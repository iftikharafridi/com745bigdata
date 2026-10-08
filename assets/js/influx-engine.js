/* COM745 InfluxQL engine: a small in-browser implementation of the InfluxDB 1.x
   query language and influx CLI output, written for teaching.

   It implements the statements used in the COM745 materials (CREATE/DROP
   DATABASE, SHOW ..., INSERT line protocol, SELECT with WHERE, GROUP BY
   tags/time(), fill(), ORDER BY, LIMIT, tz(), the common aggregate, selector
   and transformation functions, retention policies, DELETE, DROP).
   Results are cross-checked against a real InfluxDB 1.6.7 server by
   tools/influx/crosscheck.py. HOLT_WINTERS is not implemented.

   Usage:  var e = new InfluxEngine(); e.cli('CREATE DATABASE x')  -> text
           e.query('SELECT ...', db) -> {results:[...]}  (the /query JSON) */
(function (root) {
  'use strict';
  var NS = { ns: 1n, u: 1000n, 'µ': 1000n, ms: 1000000n, s: 1000000000n, m: 60000000000n, h: 3600000000000n, d: 86400000000000n, w: 604800000000000n };
  var KEYWORDS = ['ALL', 'ALTER', 'AND', 'AS', 'ASC', 'BEGIN', 'BY', 'CARDINALITY', 'CREATE', 'CONTINUOUS', 'DATABASE', 'DATABASES', 'DEFAULT', 'DELETE', 'DESC', 'DESTINATIONS', 'DIAGNOSTICS', 'DISTINCT', 'DROP', 'DURATION', 'END', 'EVERY', 'EXACT', 'EXPLAIN', 'FIELD', 'FOR', 'FROM', 'GRANT', 'GRANTS', 'GROUP', 'GROUPS', 'IN', 'INF', 'INSERT', 'INTO', 'KEY', 'KEYS', 'KILL', 'LIMIT', 'MEASUREMENT', 'MEASUREMENTS', 'NAME', 'OFFSET', 'ON', 'OR', 'ORDER', 'PASSWORD', 'POLICY', 'POLICIES', 'PRIVILEGES', 'QUERIES', 'QUERY', 'READ', 'REPLICATION', 'RESAMPLE', 'RETENTION', 'REVOKE', 'SELECT', 'SERIES', 'SET', 'SHARD', 'SHARDS', 'SHOW', 'SLIMIT', 'SOFFSET', 'STATS', 'SUBSCRIPTION', 'SUBSCRIPTIONS', 'TAG', 'TO', 'USER', 'USERS', 'VALUES', 'WHERE', 'WITH', 'WRITE'];
  var KW = {}; KEYWORDS.forEach(function (k) { KW[k] = 1; });

  function QErr(msg) { this.message = msg; }

  // ------------------------------------------------------------------ time
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function daysFromCivil(y, m, d) { // Howard Hinnant
    y -= m <= 2 ? 1 : 0; var era = Math.floor(y / 400); var yoe = y - era * 400;
    var doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; return era * 146097 + doe - 719468;
  }
  function civilFromDays(z) {
    z += 719468; var era = Math.floor(z / 146097); var doe = z - era * 146097;
    var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    var y = yoe + era * 400; var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    var mp = Math.floor((5 * doy + 2) / 153); var d = doy - Math.floor((153 * mp + 2) / 5) + 1; var m = mp + (mp < 10 ? 3 : -9);
    return [y + (m <= 2 ? 1 : 0), m, d];
  }
  function bdiv(a, b) { var q = a / b; if ((a % b !== 0n) && ((a < 0n) !== (b < 0n))) q -= 1n; return q; }
  function bmod(a, b) { return a - bdiv(a, b) * b; }
  function fmtTime(t, offMin) {
    offMin = offMin || 0;
    var lt = t + BigInt(offMin) * 60000000000n;
    var secs = bdiv(lt, 1000000000n), frac = bmod(lt, 1000000000n);
    var days = Number(bdiv(secs, 86400n)), sod = Number(bmod(secs, 86400n));
    var c = civilFromDays(days);
    var s = pad(c[0], 4) + '-' + pad(c[1], 2) + '-' + pad(c[2], 2) + 'T' + pad(Math.floor(sod / 3600), 2) + ':' + pad(Math.floor(sod % 3600 / 60), 2) + ':' + pad(sod % 60, 2);
    if (frac !== 0n) s += '.' + pad(frac.toString(), 9).replace(/0+$/, '');
    if (!offMin) return s + 'Z';
    var a = Math.abs(offMin); return s + (offMin < 0 ? '-' : '+') + pad(Math.floor(a / 60), 2) + ':' + pad(a % 60, 2);
  }
  function parseTimeStr(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(s);
    if (!m) return null;
    var days = daysFromCivil(+m[1], +m[2], +m[3]);
    var t = BigInt(days) * 86400n + BigInt((+(m[4] || 0)) * 3600 + (+(m[5] || 0)) * 60 + (+(m[6] || 0)));
    t = t * 1000000000n + BigInt((m[7] || '').padEnd(9, '0') || '0');
    if (m[8] && m[8] !== 'Z') { var sg = m[8][0] === '-' ? -1 : 1; var hh = +m[8].slice(1, 3), mm = +m[8].slice(4, 6); t -= BigInt(sg * (hh * 60 + mm)) * 60000000000n; }
    return t;
  }
  function tzOffset(tz, t) { // minutes east of UTC at instant t (ns)
    if (!tz) return 0;
    var ms = Number(t / 1000000n);
    var dtf = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var p = {}; dtf.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var loc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((loc - Math.floor(ms / 1000) * 1000) / 60000);
  }
  function fmtDur(ns) { // Go time.Duration.String() for whole seconds
    if (ns === 0n) return '0s';
    var s = ns / 1000000000n; var h = s / 3600n, m = (s % 3600n) / 60n, sec = s % 60n;
    if (h > 0n) return h + 'h' + m + 'm' + sec + 's';
    if (m > 0n) return m + 'm' + sec + 's';
    return sec + 's';
  }

  // ------------------------------------------------------------ formatting
  function fmtNum(v) {
    if (typeof v === 'number') {
      if (Number.isInteger(v) && Math.abs(v) < 1e21) return String(v);
      var s = String(v);
      if (/e/.test(s)) { var m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(s); if (m) return m[1] + 'e' + m[2] + pad(m[3], 2); }
      return s;
    }
    return String(v);
  }
  function cellStr(v) { if (v === null || v === undefined) return ''; if (typeof v === 'boolean') return v ? 'true' : 'false'; return typeof v === 'number' ? fmtNum(v) : String(v); }
  function tabw(rows) { // Go tabwriter (minwidth 0, padding 1): every cell but the last is padded
    var w = [];
    rows.forEach(function (r) { r.forEach(function (c, i) { if (i < r.length - 1) w[i] = Math.max(w[i] || 0, [...c].length); }); });
    return rows.map(function (r) { return r.map(function (c, i) { return i < r.length - 1 ? c + ' '.repeat(w[i] - [...c].length + 1) : c; }).join(''); }).join('\n');
  }

  // ------------------------------------------------------------- tokenizer
  function lex(src) {
    var toks = [], i = 0, n = src.length;
    function push(t, v, p, extra) { var o = { t: t, v: v, p: p }; if (extra) for (var k in extra) o[k] = extra[k]; toks.push(o); }
    while (i < n) {
      var c = src[i], st = i;
      if (/\s/.test(c)) { i++; continue; }
      if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
      if (/[A-Za-z_]/.test(c)) {
        while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
        var w = src.slice(st, i);
        if (KW[w.toUpperCase()]) push('kw', w.toUpperCase(), st, { raw: w });
        else if (/^(true|false)$/i.test(w)) push('bool', w.toLowerCase() === 'true', st);
        else push('id', w, st);
        continue;
      }
      if (c === '"') {
        var s = ''; i++;
        while (i < n && src[i] !== '"') { if (src[i] === '\\' && i + 1 < n) { s += src[i + 1]; i += 2; } else s += src[i++]; }
        if (i >= n) throw new QErr('error parsing query: found ' + src.slice(st) + ', expected identifier at line 1, char ' + (st + 1));
        i++; push('id', s, st, { quoted: true }); continue;
      }
      if (c === "'") {
        var s2 = ''; i++;
        while (i < n && src[i] !== "'") { if (src[i] === '\\' && i + 1 < n) { var e = src[i + 1]; s2 += e === 'n' ? '\n' : e; i += 2; } else s2 += src[i++]; }
        if (i >= n) throw new QErr('error parsing query: found ' + src.slice(st) + ', expected string at line 1, char ' + (st + 1));
        i++; push('str', s2, st); continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        while (i < n && /[0-9]/.test(src[i])) i++;
        var isf = false;
        if (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')) { isf = true; i++; while (i < n && /[0-9]/.test(src[i])) i++; }
        var num = src.slice(st, i);
        var um = /^(ns|ms|u|µ|s|m|h|d|w)(?![A-Za-z0-9_])/.exec(src.slice(i));
        if (!isf && um) { i += um[1].length; push('dur', BigInt(num) * NS[um[1]], st, { raw: num + um[1] }); continue; }
        if (isf) push('num', parseFloat(num), st); else push('int', num, st);
        continue;
      }
      if (c === '/') {
        var pv = toks[toks.length - 1];
        if (pv && ((pv.t === 'kw' && ['FROM', 'BY', 'SELECT'].indexOf(pv.v) >= 0) || (pv.t === 'op' && ['=~', '!~', ',', '(', '.'].indexOf(pv.v) >= 0))) {
          var j = i + 1, rs = '';
          while (j < n && src[j] !== '/') { if (src[j] === '\\' && src[j + 1] === '/') { rs += '/'; j += 2; } else if (src[j] === '\\' && j + 1 < n) { rs += src[j] + src[j + 1]; j += 2; } else rs += src[j++]; }
          if (j >= n) throw new QErr('error parsing query: found ' + src.slice(st) + ', expected regex at line 1, char ' + (st + 1));
          i = j + 1; push('regex', rs, st); continue;
        }
      }
      var two = src.slice(i, i + 2);
      if (['=~', '!~', '!=', '<>', '<=', '>=', '::'].indexOf(two) >= 0) { push('op', two === '<>' ? '!=' : two, st); i += 2; continue; }
      if ('=<>+-*/%(),;.&|^'.indexOf(c) >= 0) { push('op', c, st); i++; continue; }
      throw new QErr('error parsing query: found ' + c + ', expected identifier at line 1, char ' + (st + 1));
    }
    var lastT = toks[toks.length - 1]; push('eof', '', lastT && (lastT.t === 'id' || lastT.t === 'kw') && lastT.p + String(lastT.raw || lastT.v).length === n ? n + 1 : n);
    return toks;
  }

  // ---------------------------------------------------------------- parser
  function Parser(src) { this.src = src; this.toks = lex(src); this.i = 0; this.allowRegex = false; }
  Parser.prototype = {
    peek: function () { return this.toks[this.i]; },
    next: function () { return this.toks[this.i++]; },
    desc: function (t) { if (t.t === 'eof') return 'EOF'; if (t.t === 'kw') return t.v; if (t.t === 'str') return "'" + t.v + "'"; if (t.t === 'dur') return t.raw; return String(t.raw || t.v); },
    fail: function (exp, t) { t = t || this.peek(); throw new QErr('error parsing query: found ' + this.desc(t) + ', expected ' + exp + ' at line 1, char ' + (t.p + 1)); },
    isKw: function (k) { var t = this.peek(); return t.t === 'kw' && t.v === k; },
    acceptKw: function (k) { if (this.isKw(k)) { this.i++; return true; } return false; },
    expectKw: function (k) { if (!this.acceptKw(k)) this.fail(k); },
    isOp: function (o) { var t = this.peek(); return t.t === 'op' && t.v === o; },
    acceptOp: function (o) { if (this.isOp(o)) { this.i++; return true; } return false; },
    ident: function () { var t = this.peek(); if (t.t === 'id') { this.i++; return t.v; } this.fail('identifier'); },
    regexAt: function () { // a regex token, or read /.../ starting at the current '/' directly from source
      var t = this.peek();
      if (t.t === 'regex') { this.i++; var rx; try { rx = new RegExp(t.v); } catch (e) { throw new QErr('error parsing query: ' + e.message); } return { type: 'regex', re: rx, src: t.v }; }
      if (!(t.t === 'op' && t.v === '/')) return null;
      var s = this.src, j = t.p + 1, out = '';
      while (j < s.length && s[j] !== '/') { if (s[j] === '\\' && s[j + 1] === '/') { out += '/'; j += 2; } else { out += s[j]; j++; } }
      if (j >= s.length) this.fail('regex');
      // re-lex the rest
      var rest = lex(s.slice(j + 1)); rest.forEach(function (x) { x.p += j + 1; });
      this.toks = this.toks.slice(0, this.i).concat(rest);
      var re; try { re = new RegExp(out); } catch (e) { throw new QErr('error parsing query: ' + e.message); }
      return { type: 'regex', re: re, src: out };
    },
    statements: function () {
      var out = [];
      while (true) {
        while (this.acceptOp(';')) {}
        if (this.peek().t === 'eof') break;
        out.push(this.statement());
        if (this.peek().t !== 'eof' && !this.isOp(';')) this.fail(';');
      }
      return out;
    },
    statement: function () {
      var t = this.peek();
      if (t.t !== 'kw') this.fail('SELECT, DELETE, SHOW, CREATE, DROP, EXPLAIN, GRANT, REVOKE, ALTER, SET, KILL');
      if (t.v === 'SELECT') return this.select();
      if (t.v === 'SHOW') return this.show();
      if (t.v === 'CREATE') return this.create();
      if (t.v === 'DROP') return this.drop();
      if (t.v === 'DELETE') return this.del();
      if (t.v === 'ALTER') return this.alter();
      this.fail('SELECT, DELETE, SHOW, CREATE, DROP, EXPLAIN, GRANT, REVOKE, ALTER, SET, KILL');
    },
    // ----- expressions
    expr: function () { return this.orExpr(); },
    orExpr: function () { var l = this.andExpr(); while (this.acceptKw('OR')) l = { type: 'bin', op: 'OR', l: l, r: this.andExpr() }; return l; },
    andExpr: function () { var l = this.cmpExpr(); while (this.acceptKw('AND')) l = { type: 'bin', op: 'AND', l: l, r: this.cmpExpr() }; return l; },
    cmpExpr: function () {
      var l = this.addExpr();
      var t = this.peek();
      if (t.t === 'op' && ['=', '!=', '<', '<=', '>', '>=', '=~', '!~'].indexOf(t.v) >= 0) {
        this.i++;
        var r;
        if (t.v === '=~' || t.v === '!~') { r = this.regexAt(); if (!r) this.fail('regex'); }
        else if (this.isOp('/') || this.peek().t === 'regex') { r = this.regexAt(); }
        else r = this.addExpr();
        l = { type: 'bin', op: t.v, l: l, r: r };
      }
      return l;
    },
    addExpr: function () { var l = this.mulExpr(); while (this.isOp('+') || this.isOp('-')) { var o = this.next().v; l = { type: 'bin', op: o, l: l, r: this.mulExpr() }; } return l; },
    mulExpr: function () { var l = this.unary(); while (this.isOp('*') || this.isOp('/') || this.isOp('%')) { var o = this.next().v; l = { type: 'bin', op: o, l: l, r: this.unary() }; } return l; },
    unary: function () {
      if (this.isOp('-')) { this.i++; var t = this.peek(); if (t.t === 'int') { this.i++; return { type: 'int', v: -Number(t.v), raw: '-' + t.v }; } if (t.t === 'num') { this.i++; return { type: 'num', v: -t.v }; } if (t.t === 'dur') { this.i++; return { type: 'dur', v: -t.v }; } return { type: 'bin', op: '*', l: { type: 'int', v: -1 }, r: this.primary() }; }
      return this.primary();
    },
    primary: function () {
      var t = this.peek();
      if (this.acceptOp('(')) { var e = this.expr(); if (!this.acceptOp(')')) this.fail(')'); return { type: 'paren', e: e }; }
      if (t.t === 'op' && t.v === '*') { this.i++; return { type: 'wild' }; }
      if (t.t === 'str') { this.i++; return { type: 'str', v: t.v }; }
      if (t.t === 'num') { this.i++; return { type: 'num', v: t.v }; }
      if (t.t === 'int') { this.i++; return { type: 'int', v: Number(t.v), raw: t.v }; }
      if (t.t === 'dur') { this.i++; return { type: 'dur', v: t.v }; }
      if (t.t === 'bool') { this.i++; return { type: 'bool', v: t.v }; }
      if ((t.t === 'op' && t.v === '/') || t.t === 'regex') { return this.regexAt(); }
      if (t.t === 'kw' && t.v === 'DISTINCT') {
        this.i++;
        if (this.acceptOp('(')) { var da = this.expr(); if (!this.acceptOp(')')) this.fail(')'); return { type: 'call', name: 'distinct', args: [da] }; }
        return { type: 'call', name: 'distinct', args: [this.primary()] };
      }
      if (t.t === 'id') {
        this.i++;
        if (!t.quoted && this.isOp('(')) {
          this.i++; var args = [];
          if (!this.isOp(')')) { do { args.push(this.expr()); } while (this.acceptOp(',')); }
          if (!this.acceptOp(')')) this.fail(')');
          return { type: 'call', name: t.v.toLowerCase(), args: args };
        }
        var ref = { type: 'ref', name: t.v };
        if (this.acceptOp('::')) { var ty = this.peek(); if (ty.t === 'id' || ty.t === 'kw') { this.i++; ref.cast = String(ty.raw || ty.v).toLowerCase(); } }
        return ref;
      }
      this.fail('identifier, string, number, bool');
    },
    sources: function () {
      var out = [];
      do {
        var r = this.regexAt();
        if (r) { out.push(r); continue; }
        var parts = [this.ident()];
        while (this.acceptOp('.')) { if (this.isOp('/') || this.peek().t === 'regex') { var rr = this.regexAt(); rr.db = parts.length > 1 ? parts[0] : null; rr.rp = parts[parts.length - 1]; out.push(rr); parts = null; break; } parts.push(this.ident()); }
        if (!parts) continue;
        var src = { type: 'm', name: parts[parts.length - 1] };
        if (parts.length === 2) src.rp = parts[0];
        if (parts.length === 3) { src.db = parts[0]; src.rp = parts[1]; }
        out.push(src);
      } while (this.acceptOp(','));
      return out;
    },
    select: function () {
      this.expectKw('SELECT');
      var st = { kind: 'select', fields: [], fill: { mode: 'null' }, desc: false };
      do {
        var e = this.expr(), alias = null;
        if (this.acceptKw('AS')) alias = this.ident();
        st.fields.push({ e: e, alias: alias });
      } while (this.acceptOp(','));
      if (this.acceptKw('INTO')) throw new QErr('SELECT INTO is not available in the browser playground');
      this.expectKw('FROM');
      st.sources = this.sources();
      if (this.acceptKw('WHERE')) st.where = this.expr();
      if (this.acceptKw('GROUP')) {
        this.expectKw('BY');
        st.groupTags = [];
        do {
          if (this.acceptOp('*')) { st.groupAll = true; continue; }
          var t = this.peek();
          if (t.t === 'id' && !t.quoted && t.v.toLowerCase() === 'time' && this.toks[this.i + 1].t === 'op' && this.toks[this.i + 1].v === '(') {
            this.i += 2; var iv = this.next(); if (iv.t !== 'dur') this.fail('duration', iv);
            st.interval = iv.v; st.intervalOffset = 0n;
            if (this.acceptOp(',')) { var neg = this.acceptOp('-'); var of = this.next(); if (of.t !== 'dur') this.fail('duration', of); st.intervalOffset = neg ? -of.v : of.v; }
            if (!this.acceptOp(')')) this.fail(')');
            continue;
          }
          var rx = this.regexAt();
          if (rx) { st.groupRegex = (st.groupRegex || []).concat([rx.re]); continue; }
          st.groupTags.push(this.ident());
        } while (this.acceptOp(','));
      }
      var t2 = this.peek();
      if (t2.t === 'id' && t2.v.toLowerCase() === 'fill') {
        this.i++; if (!this.acceptOp('(')) this.fail('(');
        var f = this.next();
        if (f.t === 'id' && ['null', 'none', 'previous', 'linear'].indexOf(f.v.toLowerCase()) >= 0) st.fill = { mode: f.v.toLowerCase() };
        else if (f.t === 'int' || f.t === 'num') st.fill = { mode: 'value', v: Number(f.v) };
        else if (f.t === 'op' && f.v === '-') { var f2 = this.next(); st.fill = { mode: 'value', v: -Number(f2.v) }; }
        else this.fail('null, none, previous, linear or a number', f);
        if (!this.acceptOp(')')) this.fail(')');
      }
      if (this.acceptKw('ORDER')) {
        this.expectKw('BY');
        var o = this.peek(); if (!(o.t === 'id' && o.v.toLowerCase() === 'time')) throw new QErr('error parsing query: only ORDER BY time supported at this time');
        this.i++;
        if (this.acceptKw('DESC')) st.desc = true; else this.acceptKw('ASC');
      }
      var intTok = function (p) { var t = p.next(); if (t.t !== 'int') p.fail('integer', t); return Number(t.v); };
      if (this.acceptKw('LIMIT')) st.limit = intTok(this);
      if (this.acceptKw('OFFSET')) st.offset = intTok(this);
      if (this.acceptKw('SLIMIT')) st.slimit = intTok(this);
      if (this.acceptKw('SOFFSET')) st.soffset = intTok(this);
      var tz = this.peek();
      if (tz.t === 'id' && tz.v.toLowerCase() === 'tz') {
        this.i++; if (!this.acceptOp('(')) this.fail('('); var z = this.next(); if (z.t !== 'str') this.fail('string', z);
        try { new Intl.DateTimeFormat('en-GB', { timeZone: z.v }); } catch (e) { throw new QErr('error parsing query: unable to find time zone ' + z.v); }
        st.tz = z.v; if (!this.acceptOp(')')) this.fail(')');
      }
      return st;
    },
    onDb: function () { if (this.acceptKw('ON')) return this.ident(); return null; },
    show: function () {
      this.expectKw('SHOW');
      var t = this.next();
      if (t.t === 'kw' && t.v === 'DATABASES') return { kind: 'showdbs' };
      if (t.t === 'kw' && t.v === 'MEASUREMENTS') {
        var st = { kind: 'showmeas', db: this.onDb() };
        if (this.acceptKw('WITH')) { this.expectKw('MEASUREMENT'); var op = this.next(); if (op.t !== 'op') this.fail('=~ or =', op); if (op.v === '=~') st.re = this.regexAt().re; else st.eq = this.ident(); }
        if (this.acceptKw('WHERE')) st.where = this.expr();
        if (this.acceptKw('LIMIT')) st.limit = Number(this.next().v);
        return st;
      }
      if (t.t === 'kw' && t.v === 'MEASUREMENT') { this.expectKw('CARDINALITY'); var stc = { kind: 'measCard', db: this.onDb() }; return stc; }
      if (t.t === 'kw' && (t.v === 'TAG' || t.v === 'FIELD')) {
        var isTag = t.v === 'TAG';
        if (isTag && this.acceptKw('VALUES')) {
          var sv = { kind: 'showtagvalues', db: this.onDb() };
          if (this.acceptKw('FROM')) sv.sources = this.sources();
          this.expectKw('WITH'); this.expectKw('KEY');
          if (this.acceptKw('IN')) { if (!this.acceptOp('(')) this.fail('('); sv.keys = []; do { sv.keys.push(this.ident()); } while (this.acceptOp(',')); if (!this.acceptOp(')')) this.fail(')'); }
          else { var o2 = this.next(); if (o2.t !== 'op') this.fail('=, !=, =~ or !~', o2); if (o2.v === '=~' || o2.v === '!~') { sv.keyRe = this.regexAt().re; sv.keyNeg = o2.v === '!~'; } else if (o2.v === '=') sv.keys = [this.ident()]; else { sv.keyNe = this.ident(); } }
          if (this.acceptKw('WHERE')) sv.where = this.expr();
          if (this.acceptKw('LIMIT')) sv.limit = Number(this.next().v);
          return sv;
        }
        this.expectKw('KEYS');
        var sk = { kind: isTag ? 'showtagkeys' : 'showfieldkeys', db: this.onDb() };
        if (this.acceptKw('FROM')) sk.sources = this.sources();
        if (this.acceptKw('WHERE')) sk.where = this.expr();
        if (this.acceptKw('LIMIT')) sk.limit = Number(this.next().v);
        return sk;
      }
      if (t.t === 'kw' && t.v === 'SERIES') {
        if (this.acceptKw('CARDINALITY')) { var c = { kind: 'seriesCard', db: this.onDb() }; if (this.acceptKw('FROM')) c.sources = this.sources(); if (this.acceptKw('WHERE')) c.where = this.expr(); return c; }
        var ss = { kind: 'showseries', db: this.onDb() };
        if (this.acceptKw('FROM')) ss.sources = this.sources();
        if (this.acceptKw('WHERE')) ss.where = this.expr();
        if (this.acceptKw('LIMIT')) ss.limit = Number(this.next().v);
        return ss;
      }
      if (t.t === 'kw' && t.v === 'RETENTION') { this.expectKw('POLICIES'); return { kind: 'showrps', db: this.onDb() }; }
      this.fail('CONTINUOUS, DATABASES, DIAGNOSTICS, FIELD, GRANTS, MEASUREMENT, MEASUREMENTS, QUERIES, RETENTION, SERIES, SHARD, SHARDS, STATS, SUBSCRIPTIONS, TAG, USERS', t);
    },
    rpOpts: function (st, needDur) {
      var seen = false;
      while (true) {
        if (this.acceptKw('DURATION')) { var d = this.next(); if (d.t === 'kw' && d.v === 'INF') st.duration = 0n; else if (d.t === 'dur') st.duration = d.v; else this.fail('duration', d); seen = true; continue; }
        if (this.acceptKw('REPLICATION')) { var r = this.next(); if (r.t !== 'int') this.fail('integer', r); st.replication = Number(r.v); seen = true; continue; }
        if (this.acceptKw('SHARD')) { this.expectKw('DURATION'); var s = this.next(); if (s.t !== 'dur') this.fail('duration', s); st.shard = s.v; seen = true; continue; }
        if (this.acceptKw('DEFAULT')) { st.isDefault = true; seen = true; continue; }
        break;
      }
      return seen;
    },
    create: function () {
      this.expectKw('CREATE');
      if (this.acceptKw('DATABASE')) { var st = { kind: 'createdb', name: this.ident() }; if (this.acceptKw('WITH')) { var o = {}; this.rpOpts(o); if (this.acceptKw('NAME')) o.name = this.ident(); st.rp = o; } return st; }
      if (this.acceptKw('RETENTION')) {
        this.expectKw('POLICY'); var rp = { kind: 'createrp', name: this.ident() }; this.expectKw('ON'); rp.db = this.ident();
        if (!this.isKw('DURATION')) this.fail('DURATION');
        this.rpOpts(rp);
        if (rp.replication === undefined) this.fail('REPLICATION');
        return rp;
      }
      this.fail('CONTINUOUS, DATABASE, USER, RETENTION, SUBSCRIPTION');
    },
    alter: function () {
      this.expectKw('ALTER'); this.expectKw('RETENTION'); this.expectKw('POLICY');
      var st = { kind: 'alterrp', name: this.ident() }; this.expectKw('ON'); st.db = this.ident();
      if (!this.rpOpts(st)) this.fail('DURATION, REPLICATION, SHARD, DEFAULT');
      return st;
    },
    drop: function () {
      this.expectKw('DROP');
      if (this.acceptKw('DATABASE')) return { kind: 'dropdb', name: this.ident() };
      if (this.acceptKw('MEASUREMENT')) return { kind: 'dropmeas', name: this.ident() };
      if (this.acceptKw('RETENTION')) { this.expectKw('POLICY'); var st = { kind: 'droprp', name: this.ident() }; this.expectKw('ON'); st.db = this.ident(); return st; }
      if (this.acceptKw('SERIES')) { var s = { kind: 'dropseries' }; if (this.acceptKw('FROM')) s.sources = this.sources(); if (this.acceptKw('WHERE')) s.where = this.expr(); if (!s.sources && !s.where) this.fail('FROM or WHERE'); return s; }
      this.fail('CONTINUOUS, MEASUREMENT, RETENTION, SERIES, SHARD, SUBSCRIPTION, USER');
    },
    del: function () {
      this.expectKw('DELETE');
      var st = { kind: 'delete' };
      if (this.acceptKw('FROM')) st.sources = this.sources();
      if (this.acceptKw('WHERE')) st.where = this.expr();
      if (!st.sources && !st.where) this.fail('FROM or WHERE');
      return st;
    }
  };

  // ------------------------------------------------------------- line protocol
  function splitUnescaped(s, ch) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '\\' && i + 1 < s.length) { cur += c + s[i + 1]; i++; continue; }
      if (c === '"') q = !q;
      if (c === ch && !q) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur); return out;
  }
  function unesc(s) { return s.replace(/\\([ ,="\\])/g, '$1'); }
  function parseLine(line, precision) {
    var orig = line;
    var bad = function (m) { throw new QErr('unable to parse \'' + orig + '\': ' + m); };
    var parts = splitUnescaped(line, ' ').filter(function (x, i, a) { return x !== '' || false; });
    if (!parts.length || !parts[0]) bad('missing measurement');
    if (parts.length < 2) bad('missing fields');
    var key = splitUnescaped(parts[0], ',');
    var m = unesc(key[0]); if (!m) bad('missing measurement');
    var tags = {};
    for (var i = 1; i < key.length; i++) {
      var kv = splitUnescaped(key[i], '='); if (kv.length !== 2 || !kv[0] || !kv[1]) bad('missing tag value');
      tags[unesc(kv[0])] = unesc(kv[1]);
    }
    var fields = {}, types = {};
    var fs = parts[1], i2 = 0;
    while (i2 < fs.length) {
      var k = '';
      while (i2 < fs.length && fs[i2] !== '=') { if (fs[i2] === '\\' && i2 + 1 < fs.length) { k += fs[i2 + 1]; i2 += 2; continue; } k += fs[i2++]; }
      if (!k) bad('missing fields');
      if (i2 >= fs.length) bad('invalid field format');
      i2++;
      var v = '';
      if (fs[i2] === '"') {
        i2++; var closed = false;
        while (i2 < fs.length) { if (fs[i2] === '\\' && (fs[i2 + 1] === '"' || fs[i2 + 1] === '\\')) { v += fs[i2 + 1]; i2 += 2; continue; } if (fs[i2] === '"') { closed = true; i2++; break; } v += fs[i2++]; }
        if (!closed) bad('unbalanced quotes');
        fields[k] = v; types[k] = 'string';
      } else {
        while (i2 < fs.length && fs[i2] !== ',') v += fs[i2++];
        if (v === '') bad('missing field value');
        if (/^[-+.0-9]/.test(v)) {
          if (/^-?\d+i$/.test(v)) { fields[k] = Number(v.slice(0, -1)); types[k] = 'integer'; }
          else if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) { fields[k] = parseFloat(v); types[k] = 'float'; }
          else bad('invalid number');
        } else if (/^(t|T|true|True|TRUE)$/.test(v)) { fields[k] = true; types[k] = 'boolean'; }
        else if (/^(f|F|false|False|FALSE)$/.test(v)) { fields[k] = false; types[k] = 'boolean'; }
        else bad('invalid boolean');
      }
      if (i2 < fs.length) { if (fs[i2] !== ',') bad('invalid field format'); i2++; if (i2 >= fs.length) bad('invalid field format'); }
    }
    if (parts.length > 3) bad('bad timestamp'); // fields are checked first, as in InfluxDB
    var t = null;
    if (parts.length === 3) { if (!/^-?\d+$/.test(parts[2])) bad('bad timestamp'); t = BigInt(parts[2]) * (NS[precision] || 1n); }
    return { m: m, tags: tags, fields: fields, types: types, t: t };
  }
  function seriesKey(m, tags) {
    var e = function (s) { return s.replace(/([ ,=])/g, '\\$1'); };
    return [e(m)].concat(Object.keys(tags).sort().map(function (k) { return e(k) + '=' + e(tags[k]); })).join(',');
  }

  // ---------------------------------------------------------------- engine
  function Engine(opts) {
    opts = opts || {};
    this.dbs = {};
    this.order = [];
    this.current = null;
    this.precision = opts.precision || 'rfc3339';
    this.nowFn = opts.now || function () { return BigInt(Date.now()) * 1000000n; };
    this.ensureDb('_internal', true);
    this.maxRows = opts.maxRows || 2000;
  }
  function newRp(name, dur, rep, shard) {
    var sgd = shard || (dur === 0n ? 7n * NS.d : dur < 2n * NS.d ? NS.h : dur <= 180n * NS.d ? NS.d : 7n * NS.d);
    return { name: name, duration: dur, replicaN: rep || 1, sgd: sgd, meas: {} };
  }
  Engine.prototype.ensureDb = function (name, internal) {
    if (!this.dbs[name]) {
      this.dbs[name] = { name: name, rps: { autogen: newRp(internal ? 'monitor' : 'autogen', internal ? 7n * NS.d : 0n, 1) }, rpOrder: ['autogen'], def: 'autogen' };
      if (internal) { var r = this.dbs[name].rps.autogen; delete this.dbs[name].rps.autogen; this.dbs[name].rps.monitor = r; this.dbs[name].rpOrder = ['monitor']; this.dbs[name].def = 'monitor'; }
      this.order.push(name);
    }
    return this.dbs[name];
  };
  Engine.prototype.getRp = function (dbname, rpname) {
    var db = this.dbs[dbname]; if (!db) throw new QErr('database not found: ' + dbname);
    var rp = db.rps[rpname || db.def]; if (!rp) throw new QErr('retention policy not found: ' + (rpname || db.def));
    return rp;
  };
  Engine.prototype.write = function (dbname, rpname, lines, precision) {
    var db = this.dbs[dbname];
    if (!db) throw new QErr('database not found: "' + dbname + '"');
    var rp = db.rps[rpname || db.def];
    if (!rp) throw new QErr('retention policy not found: ' + rpname);
    var now = this.nowFn(), dropped = 0, conflict = null, self = this;
    var pts = lines.map(function (l) { return parseLine(l, precision || 'ns'); });
    pts.forEach(function (p) {
      if (p.t === null) p.t = now;
      if (rp.duration !== 0n && p.t < now - rp.duration) { dropped++; return; }
      var M = rp.meas[p.m] || (rp.meas[p.m] = { series: {}, ftypes: {} });
      (db.everKeys || (db.everKeys = new Set())).add(seriesKey(p.m, p.tags)); // the index keeps a series even if the write fails
      // field types are fixed per shard (one shard per shard-group duration)
      var shard = bdiv(p.t, rp.sgd).toString();
      var ST = (M.shardTypes || (M.shardTypes = {}))[shard] || (M.shardTypes[shard] = {});
      for (var k in p.types) {
        var ex = ST[k];
        if (ex && ex !== p.types[k]) { conflict = 'field type conflict: input field "' + k + '" on measurement "' + p.m + '" is type ' + p.types[k] + ', already exists as type ' + ex; dropped++; return; }
      }
      for (var k2 in p.types) { ST[k2] = p.types[k2]; if (!M.ftypes[k2]) M.ftypes[k2] = p.types[k2]; (M.ftypeSet || (M.ftypeSet = {}))[k2 + '\u0000' + p.types[k2]] = [k2, p.types[k2]]; }
      var sk = seriesKey(p.m, p.tags);
      var S = M.series[sk]; if (!S) S = M.series[sk] = { key: sk, tags: p.tags, pts: new Map() };
      var key = p.t.toString();
      var cur = S.pts.get(key);
      if (cur) { for (var f in p.fields) cur.f[f] = p.fields[f]; } else S.pts.set(key, { t: p.t, f: Object.assign({}, p.fields) });
    });
    if (conflict) throw new QErr('partial write: ' + conflict + ' dropped=' + dropped);
    if (dropped) throw new QErr('partial write: points beyond retention policy dropped=' + dropped);
  };

  // --- evaluation helpers
  function isNum(v) { return typeof v === 'number'; }
  function cmp(op, a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    if (a instanceof RegExp || b instanceof RegExp) {
      var re = b instanceof RegExp ? b : a, s = b instanceof RegExp ? a : b;
      if (typeof s !== 'string') return false;
      var m = re.test(s); return op === '=~' ? m : op === '!~' ? !m : false;
    }
    if (typeof a !== typeof b) {
      if (op === '!=') return false;
      return false;
    }
    switch (op) { case '=': return a === b; case '!=': return a !== b; case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; }
    return false;
  }
  function arith(op, a, b) {
    if (a === null || b === null || a === undefined || b === undefined) return null;
    if (!isNum(a) || !isNum(b)) return null;
    switch (op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? 0 : a / b; case '%': return b === 0 ? 0 : a % b; }
    return null;
  }
  function unparen(e) { while (e && e.type === 'paren') e = e.e; return e; }

  // time-range extraction: returns {min, max, rest}
  Engine.prototype.timeLit = function (e) {
    e = unparen(e);
    if (e.type === 'str') { var t = parseTimeStr(e.v); if (t === null) throw new QErr('invalid operation: time and *influxql.StringLiteral are not compatible'); return t; }
    if (e.type === 'int') return BigInt(e.raw || e.v);
    if (e.type === 'num') return BigInt(Math.round(e.v));
    if (e.type === 'dur') return e.v;
    if (e.type === 'call' && e.name === 'now') return this.nowFn();
    if (e.type === 'bin' && (e.op === '+' || e.op === '-')) { var a = this.timeLit(e.l), b = this.timeLit(e.r); return e.op === '+' ? a + b : a - b; }
    throw new QErr('invalid time expression');
  };
  function isTimeRef(e) { e = unparen(e); return e && e.type === 'ref' && e.name.toLowerCase() === 'time'; }
  Engine.prototype.splitTime = function (where) {
    var self = this, min = null, max = null, hasOrTime = false;
    function resolveTimes(e) { // replace time literals with ns values so rows can be tested directly
      e = unparen(e); if (!e || e.type !== 'bin') return;
      if (['=', '<', '<=', '>', '>=', '!='].indexOf(e.op) >= 0 && (isTimeRef(e.l) || isTimeRef(e.r))) { var o = isTimeRef(e.l) ? 'r' : 'l'; e[o] = { type: 'tval', v: self.timeLit(e[o]) }; return; }
      resolveTimes(e.l); resolveTimes(e.r);
    }
    function walk(e) {
      e = unparen(e);
      if (!e) return null;
      if (e.type === 'bin' && e.op === 'AND') { var l = walk(e.l), r = walk(e.r); if (!l) return r; if (!r) return l; return { type: 'bin', op: 'AND', l: l, r: r }; }
      if (e.type === 'bin' && ['=', '<', '<=', '>', '>='].indexOf(e.op) >= 0 && (isTimeRef(e.l) || isTimeRef(e.r))) {
        var op = e.op, other = isTimeRef(e.l) ? e.r : e.l;
        if (!isTimeRef(e.l)) op = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' }[op];
        var t = self.timeLit(other);
        var lo = null, hi = null;
        if (op === '>') lo = t + 1n; else if (op === '>=') lo = t; else if (op === '<') hi = t - 1n; else if (op === '<=') hi = t; else { lo = t; hi = t; }
        if (lo !== null && (min === null || lo > min)) min = lo;
        if (hi !== null && (max === null || hi < max)) max = hi;
        return null;
      }
      if (e.type === 'bin' && e.op === 'OR' && refsTime(e)) { hasOrTime = true; resolveTimes(e); }
      return e;
    }
    function refsTime(e) { e = unparen(e); if (!e) return false; if (isTimeRef(e)) return true; if (e.type === 'bin') return refsTime(e.l) || refsTime(e.r); return false; }
    var rest = walk(where);
    return { min: min, max: max, rest: rest };
  };
  function evalCond(e, row) { // row: {tags, f}
    e = unparen(e);
    if (!e) return true;
    if (e.type === 'bin') {
      if (e.op === 'AND') return evalCond(e.l, row) && evalCond(e.r, row);
      if (e.op === 'OR') return evalCond(e.l, row) || evalCond(e.r, row);
      if (['=', '!=', '<', '<=', '>', '>=', '=~', '!~'].indexOf(e.op) >= 0) {
        var a = evalVal(e.l, row), b = evalVal(e.r, row);
        // a missing tag compares as the empty string
        if (e.op === '!=' && (a === undefined) && typeof b === 'string') return b !== '';
        if (e.op === '=' && (a === undefined) && b === '') return true;
        if ((e.op === '!~') && a === undefined && b instanceof RegExp) return !b.test('');
        if ((e.op === '=~') && a === undefined && b instanceof RegExp) return b.test('');
        return cmp(e.op, a, b);
      }
      var v = evalVal(e, row); return !!v;
    }
    if (e.type === 'bool') return e.v;
    return !!evalVal(e, row);
  }
  function evalVal(e, row) {
    e = unparen(e);
    switch (e.type) {
      case 'str': return e.v; case 'num': return e.v; case 'int': return e.v; case 'bool': return e.v; case 'regex': return e.re;
      case 'dur': return Number(e.v);
      case 'tval': return e.v;
      case 'ref':
        if (!e.cast && e.name.toLowerCase() === 'time' && row.t !== undefined) return row.t;
        if (e.cast === 'tag') return row.tags[e.name];
        if (e.cast === 'field') return row.f ? row.f[e.name] : undefined;
        if (row.f && row.f[e.name] !== undefined) return row.f[e.name];
        if (row.tags[e.name] !== undefined) return row.tags[e.name];
        return undefined;
      case 'bin':
        if (['+', '-', '*', '/', '%'].indexOf(e.op) >= 0) return arith(e.op, evalVal(e.l, row), evalVal(e.r, row));
        return evalCond(e, row);
    }
    return undefined;
  }
  function condRefsFields(e, M) {
    e = unparen(e); if (!e) return false;
    if (e.type === 'ref' && !e.cast && e.name.toLowerCase() === 'time') return true;
    if (e.type === 'ref') return e.cast === 'field' || (e.cast !== 'tag' && !!M.ftypes[e.name]);
    if (e.type === 'bin') return condRefsFields(e.l, M) || condRefsFields(e.r, M);
    return false;
  }

  // ------------------------------------------------- functions catalogue
  var AGG = { count: 1, sum: 1, mean: 1, median: 1, mode: 1, spread: 1, stddev: 1, distinct: 1, integral: 1 };
  var SEL = { min: 1, max: 1, first: 1, last: 1, percentile: 1, top: 1, bottom: 1, sample: 1 };
  var TRANS = { moving_average: 1, difference: 1, non_negative_difference: 1, derivative: 1, non_negative_derivative: 1, cumulative_sum: 1, elapsed: 1 };
  var MATHF = { abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round, sqrt: Math.sqrt, ln: Math.log, log2: Math.log2, log10: Math.log10, exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan };

  function fsum(a) { var s = 0, c = 0; a.forEach(function (x) { var t = s + x; c += Math.abs(s) >= Math.abs(x) ? (s - t) + x : (x - t) + s; s = t; }); return s + c; }
  function aggregate(fn, args, vals, ftype) { // vals: [{t, v, row}] sorted by time
    var nums = vals.map(function (x) { return x.v; });
    switch (fn) {
      case 'count': return { v: nums.length };
      case 'sum': return { v: fsum(nums) };
      case 'mean': return { v: fsum(nums) / nums.length };
      case 'median': { var s = nums.slice().sort(function (a, b) { return a - b; }); var n = s.length; return { v: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }; }
      case 'mode': { var c = new Map(); nums.forEach(function (x) { c.set(x, (c.get(x) || 0) + 1); }); var best = null, bc = 0; Array.from(c.keys()).sort(function (a, b) { return a - b; }).forEach(function (k) { if (c.get(k) > bc) { bc = c.get(k); best = k; } }); return { v: best }; }
      case 'spread': return { v: Math.max.apply(null, nums) - Math.min.apply(null, nums) };
      case 'stddev': { if (nums.length < 2) return { v: null }; var m = fsum(nums) / nums.length; var ss = fsum(nums.map(function (b) { return (b - m) * (b - m); })); return { v: Math.sqrt(ss / (nums.length - 1)) }; }
      case 'min': case 'max': { var best2 = null; vals.forEach(function (x) { if (best2 === null || (fn === 'min' ? x.v < best2.v : x.v > best2.v)) best2 = x; }); return { v: best2.v, t: best2.t, row: best2.row }; }
      case 'first': return { v: vals[0].v, t: vals[0].t, row: vals[0].row };
      case 'last': return { v: vals[vals.length - 1].v, t: vals[vals.length - 1].t, row: vals[vals.length - 1].row };
      case 'percentile': {
        var N = args[1]; var s2 = vals.slice().sort(function (a, b) { return a.v - b.v || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0); });
        var idx = Math.floor(s2.length * N / 100 + 0.5) - 1; if (idx < 0 || idx >= s2.length) return { v: null };
        return { v: s2[idx].v, t: s2[idx].t, row: s2[idx].row };
      }
    }
    throw new QErr('unsupported call: ' + fn);
  }

  // ----------------------------------------------------------------- SELECT
  Engine.prototype.resolveSources = function (sources, dbname) {
    var self = this, out = [];
    sources.forEach(function (s) {
      var db = s.db || dbname;
      if (!db) throw new QErr('database name required');
      var dbo = self.dbs[db]; if (!dbo) throw new QErr('database not found: ' + db);
      var rpn = s.rp || dbo.def; var rp = dbo.rps[rpn];
      if (!rp) throw new QErr('retention policy not found: ' + rpn);
      if (s.type === 'regex') {
        Object.keys(rp.meas).sort().forEach(function (m) { if (s.re.test(m) && Object.keys(rp.meas[m].series).length) out.push({ name: m, M: rp.meas[m], regex: true }); });
      } else if (rp.meas[s.name] && Object.keys(rp.meas[s.name].series).length) out.push({ name: s.name, M: rp.meas[s.name] });
    });
    var seen = {}; return out.filter(function (x) { if (seen[x.name]) return false; seen[x.name] = 1; return true; });
  };
  function collectCalls(e, out) { e = unparen(e); if (!e) return out; if (e.type === 'call') out.push(e); else if (e.type === 'bin') { collectCalls(e.l, out); collectCalls(e.r, out); } return out; }
  function collectRefs(e, out) { e = unparen(e); if (!e) return out; if (e.type === 'ref') out.push(e); else if (e.type === 'bin') { collectRefs(e.l, out); collectRefs(e.r, out); } else if (e.type === 'call') e.args.forEach(function (a) { collectRefs(a, out); }); return out; }
  function exprName(e) {
    e = unparen(e);
    if (e.type === 'ref') return e.name;
    if (e.type === 'call') { return e.name; }
    if (e.type === 'bin') { var a = exprName(e.l), b = exprName(e.r); if (a && b) return a + '_' + b; return a || b; }
    return '';
  }

  Engine.prototype.select = function (st, dbname) {
    var self = this;
    var meas = this.resolveSources(st.sources, dbname);
    var tr = this.splitTime(st.where);
    var anyRegex = st.sources.some(function (s) { return s.type === 'regex'; });
    // classify the projection
    var calls = []; st.fields.forEach(function (f) { collectCalls(f.e, calls); });
    var isAgg = calls.length > 0;
    var hasWild = st.fields.some(function (f) { return unparen(f.e).type === 'wild'; });
    if (st.interval !== undefined && !isAgg) throw new QErr('GROUP BY requires at least one aggregate function');
    if (calls.some(function (c) { return c.name === 'holt_winters' || c.name === 'holt_winters_with_fit'; })) throw new QErr('HOLT_WINTERS is not available in the browser playground: run this query on InfluxDB');
    if (isAgg) {
      var topCalls = st.fields.map(function (f) { return unparen(f.e); });
      var selectors = topCalls.filter(function (e) { return e.type === 'call' && (SEL[e.name] || (TRANS[e.name] && false)); });
      var nonCalls = topCalls.filter(function (e) { return e.type !== 'call' && !(e.type === 'bin' && collectCalls(e, []).length); });
      if (nonCalls.length) {
        var onlySel = topCalls.filter(function (e) { return e.type === 'call'; });
        if (!(onlySel.length === 1 && SEL[onlySel[0].name] && ['top', 'bottom'].indexOf(onlySel[0].name) < 0 || (onlySel.length === 1 && ['top', 'bottom'].indexOf(onlySel[0].name) >= 0))) {
          if (onlySel.length > 1 && onlySel.every(function (e) { return SEL[e.name]; })) throw new QErr('mixing multiple selector functions with tags or fields is not supported');
          throw new QErr('mixing aggregate and non-aggregate queries is not supported');
        }
      }
      calls.forEach(function (c) {
        if (!AGG[c.name] && !SEL[c.name] && !TRANS[c.name] && !MATHF[c.name]) throw new QErr('undefined function ' + c.name + '()');
        if (TRANS[c.name]) {
          var inner = unparen(c.args[0]);
          if (inner && inner.type === 'call' && st.interval === undefined) throw new QErr(c.name + ' aggregate requires a GROUP BY interval');
          if (inner && inner.type !== 'call' && st.interval !== undefined) throw new QErr('aggregate function required inside the call to ' + c.name);
        }
        if (c.name === 'moving_average') { if (c.args.length !== 2) throw new QErr('invalid number of arguments for moving_average, expected 2, got ' + c.args.length); var nn = unparen(c.args[1]); if (nn.type !== 'int' || nn.v < 2) throw new QErr('moving_average window must be greater than 1, got ' + (nn.v)); }
        if (c.name === 'percentile' && c.args.length !== 2) throw new QErr('invalid number of arguments for percentile, expected 2, got ' + c.args.length);
        if ((AGG[c.name] || (SEL[c.name] && c.name !== 'top' && c.name !== 'bottom' && c.name !== 'percentile')) && c.args.length !== 1) throw new QErr('invalid number of arguments for ' + c.name + ', expected 1, got ' + c.args.length);
      });
    }
    var results = [];
    var unionCols = null;
    if (anyRegex && hasWild && !isAgg) {
      var u = {}; meas.forEach(function (x) { Object.keys(x.M.ftypes).forEach(function (k) { u[k] = 1; }); Object.keys(x.M.series).forEach(function (sk) { Object.keys(x.M.series[sk].tags).forEach(function (k) { u[k] = 1; }); }); });
      unionCols = Object.keys(u).sort();
    }
    meas.forEach(function (mm) {
      var M = mm.M;
      var tagKeys = {}; Object.keys(M.series).forEach(function (sk) { Object.keys(M.series[sk].tags).forEach(function (k) { tagKeys[k] = 1; }); });
      // group-by tag keys
      var gkeys = [];
      if (st.groupAll) gkeys = Object.keys(tagKeys).sort();
      else { (st.groupTags || []).forEach(function (k) { if (gkeys.indexOf(k) < 0) gkeys.push(k); }); (st.groupRegex || []).forEach(function (re) { Object.keys(tagKeys).sort().forEach(function (k) { if (re.test(k) && gkeys.indexOf(k) < 0) gkeys.push(k); }); }); gkeys.sort(); }
      // series filter / rows
      var fieldCond = tr.rest && condRefsFields(tr.rest, M);
      // a field written with different types in different shards: InfluxDB reads one type (float > integer > string > boolean)
      var qtype = {}, mixed = false, prec = { float: 4, integer: 3, string: 2, boolean: 1 };
      Object.keys(M.ftypeSet || {}).forEach(function (k) { var ft = M.ftypeSet[k]; if (qtype[ft[0]]) mixed = true; if (!qtype[ft[0]] || prec[ft[1]] > prec[qtype[ft[0]]]) qtype[ft[0]] = ft[1]; });
      var jsType = { float: 'number', integer: 'number', string: 'string', boolean: 'boolean' };
      function keepType(f) { var o = {}; for (var k in f) if (typeof f[k] === jsType[qtype[k]]) o[k] = f[k]; return o; }
      var groups = new Map();
      Object.keys(M.series).sort().forEach(function (sk) {
        var S = M.series[sk];
        if (tr.rest && !fieldCond && !evalCond(tr.rest, { tags: S.tags, f: null })) return;
        var gt = {}; gkeys.forEach(function (k) { gt[k] = S.tags[k] === undefined ? '' : S.tags[k]; });
        var gk = gkeys.map(function (k) { return k + '=' + gt[k]; }).join(',');
        if (!groups.has(gk)) groups.set(gk, { tags: gt, rows: [] });
        var G = groups.get(gk);
        S.pts.forEach(function (p) {
          if (tr.min !== null && p.t < tr.min) return;
          if (tr.max !== null && p.t > tr.max) return;
          var row = { t: p.t, tags: S.tags, f: mixed ? keepType(p.f) : p.f, sk: sk };
          if (fieldCond && !evalCond(tr.rest, row)) return;
          G.rows.push(row);
        });
      });
      var gl = Array.from(groups.keys()).sort();
      if (st.soffset) gl = gl.slice(st.soffset);
      if (st.slimit) gl = gl.slice(0, st.slimit);
      gl.forEach(function (gk) {
        var G = groups.get(gk);
        G.rows.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0); });
        var ser = isAgg ? self.aggSeries(st, mm, M, G, tr, gkeys) : self.rawSeries(st, mm, M, G, gkeys, unionCols, tagKeys);
        if (!ser) return;
        if (gkeys.length) ser.tags = G.tags;
        results.push(ser);
      });
    });
    return results;
  };

  Engine.prototype.rawSeries = function (st, mm, M, G, gkeys, unionCols, tagKeys) {
    // expand projection
    var cols = [], exprs = [];
    var allTags = Object.keys(tagKeys);
    st.fields.forEach(function (f) {
      var e = unparen(f.e);
      if (e.type === 'wild') {
        var keys = unionCols ? unionCols.slice() : Object.keys(M.ftypes).concat(allTags).sort();
        keys.filter(function (k) { return gkeys.indexOf(k) < 0; }).forEach(function (k) { cols.push(k); exprs.push({ type: 'ref', name: k }); });
      } else if (e.type === 'regex') {
        Object.keys(M.ftypes).concat(allTags).sort().forEach(function (k) { if (e.re.test(k) && gkeys.indexOf(k) < 0) { cols.push(k); exprs.push({ type: 'ref', name: k }); } });
      } else { cols.push(f.alias || exprName(e)); exprs.push(e); }
    });
    // de-duplicate names
    var seen = {}; cols = cols.map(function (c) { if (seen[c] === undefined) { seen[c] = 0; return c; } seen[c]++; return c + '_' + seen[c]; });
    // field refs used by the projection
    var fieldRefs = []; exprs.forEach(function (e) { collectRefs(e, []).forEach(function (r) { if (r.cast === 'field' || (r.cast !== 'tag' && M.ftypes[r.name])) fieldRefs.push(r.name); }); });
    if (!fieldRefs.length) return null;
    var values = [];
    G.rows.forEach(function (row) {
      if (!fieldRefs.some(function (k) { return row.f[k] !== undefined; })) return;
      values.push([row.t].concat(exprs.map(function (e) {
        e = unparen(e);
        if (e.type === 'ref') { var v = e.cast === 'tag' ? row.tags[e.name] : e.cast === 'field' ? row.f[e.name] : (row.f[e.name] !== undefined ? row.f[e.name] : row.tags[e.name]); return v === undefined ? null : v; }
        var v2 = evalVal(e, row); return v2 === undefined ? null : v2;
      })));
    });
    if (!values.length) return null;
    if (st.desc) values.reverse();
    if (st.offset) values = values.slice(st.offset);
    if (st.limit) values = values.slice(0, st.limit);
    if (!values.length) return null;
    return { name: mm.name, columns: ['time'].concat(cols), values: values };
  };

  Engine.prototype.aggSeries = function (st, mm, M, G, tr, gkeys) {
    var self = this;
    var interval = st.interval, off = st.intervalOffset || 0n;
    var tzName = st.tz;
    // windows
    var windows;
    if (interval !== undefined) {
      var lo = tr.min, hi = tr.max;
      if (lo === null) { if (!G.rows.length) return null; lo = G.rows[0].t; var all = this.allMin(M); if (all !== null && all < lo) lo = all; }
      if (hi === null) hi = this.nowFn();
      var tzOff = function (t) { return BigInt(tzOffset(tzName, t)) * 60000000000n; };
      var start = function (t) { if (tzName && interval >= NS.d) { var o = tzOff(t); return bdiv(t + o - off, interval) * interval + off - o; } return bdiv(t - off, interval) * interval + off; };
      windows = []; var w = start(lo);
      while (w <= hi) { windows.push(w); w += interval; if (windows.length > 100000) break; }
    }
    var fields = st.fields.map(function (f) { return { e: unparen(f.e), alias: f.alias }; });
    // expand wildcard inside calls: mean(*) -> mean_<field>
    var exp = [];
    fields.forEach(function (f) {
      if (f.e.type === 'call' && f.e.args.length && unparen(f.e.args[0]).type === 'wild') {
        Object.keys(M.ftypes).sort().forEach(function (k) { if (['mean', 'sum', 'median', 'spread', 'stddev', 'mode'].indexOf(f.e.name) >= 0 && (M.ftypes[k] === 'string' || M.ftypes[k] === 'boolean')) return; exp.push({ e: { type: 'call', name: f.e.name, args: [{ type: 'ref', name: k }].concat(f.e.args.slice(1)) }, name: f.e.name + '_' + k }); });
      } else exp.push({ e: f.e, name: f.alias || exprName(f.e) });
    });
    var seen = {}; exp.forEach(function (x) { if (seen[x.name] === undefined) seen[x.name] = 0; else { seen[x.name]++; x.name = x.name + '_' + seen[x.name]; } });
    var calls = exp.map(function (x) { return x.e; }).filter(function (e) { return e.type === 'call'; });
    var singleSelector = calls.length === 1 && SEL[calls[0].name] && interval === undefined;
    // top/bottom: own path
    var tb = exp.filter(function (x) { return x.e.type === 'call' && (x.e.name === 'top' || x.e.name === 'bottom'); });
    if (tb.length) return this.topBottom(st, mm, M, G, tr, exp, windows);
    var trans = exp.filter(function (x) { return x.e.type === 'call' && TRANS[x.e.name]; });
    if (trans.length && interval === undefined) return this.rawTransform(st, mm, M, G, exp);

    function fieldOf(call) { var a = unparen(call.args[0]); if (!a) throw new QErr('invalid number of arguments for ' + call.name + ', expected 1, got 0'); return a; }
    function valsFor(arg, rows) {
      var out = [];
      rows.forEach(function (r) {
        var v;
        if (arg.type === 'ref') v = arg.cast === 'tag' ? undefined : r.f[arg.name];
        else v = evalVal(arg, r);
        if (v !== undefined && v !== null) out.push({ t: r.t, v: v, row: r });
      });
      return out;
    }
    function typeCheck(call, arg) {
      if (arg.type !== 'ref') return;
      var ty = M.ftypes[arg.name];
      if ((ty === 'string' || ty === 'boolean') && ['mean', 'sum', 'median', 'spread', 'stddev', 'mode'].indexOf(call.name) >= 0)
        throw new QErr('unsupported ' + call.name + ' iterator type: *query.' + ty + 'InterruptIterator');
      if (ty === 'string' && ['min', 'max', 'percentile'].indexOf(call.name) >= 0) throw new QErr('unsupported ' + call.name + ' iterator type: *query.stringInterruptIterator');
    }
    function evalCall(call, rows) {
      if (TRANS[call.name]) return null; // handled per window below
      if (MATHF[call.name]) { var inner = unparen(call.args[0]); var r = inner.type === 'call' ? evalCall(inner, rows) : null; return r && r.v !== null ? { v: MATHF[call.name](r.v), t: r.t, row: r.row } : null; }
      var arg = fieldOf(call);
      if (arg.type === 'call') { // e.g. max(mean(x)) not supported outside subqueries
        throw new QErr('expected field argument in ' + call.name + '()');
      }
      typeCheck(call, arg);
      var vals = valsFor(arg, rows);
      if (!vals.length) return null;
      if (call.name === 'distinct') { var u = []; vals.forEach(function (x) { if (u.indexOf(x.v) < 0) u.push(x.v); }); return { multi: u }; }
      var args = call.args.map(function (a) { a = unparen(a); return a.type === 'int' || a.type === 'num' ? a.v : null; });
      return aggregate(call.name, args, vals, M.ftypes[arg.name]);
    }
    function evalTop(e, rows) { // value for a projection entry
      e = unparen(e);
      if (e.type === 'call') return evalCall(e, rows);
      if (e.type === 'bin') { var a = evalTop(e.l, rows), b = evalTop(e.r, rows); var av = e.l.type === 'int' || e.l.type === 'num' ? { v: e.l.v } : a, bv = e.r.type === 'int' || e.r.type === 'num' ? { v: e.r.v } : b; if (!av || !bv) return null; return { v: arith(e.op, av.v, bv.v) }; }
      if (e.type === 'int' || e.type === 'num') return { v: e.v };
      return null;
    }
    var rowsOut = [];
    var wlist = windows || [null];
    var byWin = new Map();
    if (windows) {
      var startFn = function (t) { if (tzName && interval >= NS.d) { var o = BigInt(tzOffset(tzName, t)) * 60000000000n; return bdiv(t + o - off, interval) * interval + off - o; } return bdiv(t - off, interval) * interval + off; };
      G.rows.forEach(function (r) { var k = startFn(r.t).toString(); if (!byWin.has(k)) byWin.set(k, []); byWin.get(k).push(r); });
    }
    var anyData = false;
    wlist.forEach(function (w) {
      var rows = w === null ? G.rows : (byWin.get(w.toString()) || []);
      var selRes = null;
      var vals = exp.map(function (x) {
        var e = x.e;
        if (e.type === 'call' && TRANS[e.name]) return { trans: true };
        if (e.type === 'ref' || e.type === 'wild') return { ref: e };
        var r = evalTop(e, rows);
        if (r && singleSelector && e.type === 'call' && SEL[e.name]) selRes = r;
        return r;
      });
      if (vals.some(function (v) { return v && v.v !== undefined && v.v !== null; }) || vals.some(function (v) { return v && v.multi; })) anyData = true;
      var t;
      if (w !== null) t = w;
      else if (selRes && selRes.t !== undefined) t = selRes.t;
      else t = tr.min !== null ? tr.min : 0n;
      // distinct → several rows
      var multi = vals.filter(function (v) { return v && v.multi; });
      if (multi.length) { multi[0].multi.forEach(function (mv) { rowsOut.push({ t: t, cells: vals.map(function (v) { return v && v.multi ? mv : null; }) }); }); return; }
      rowsOut.push({ t: t, cells: vals.map(function (v, i) {
        if (!v) return null;
        if (v.trans) return null;
        if (v.ref) { if (!selRes) return null; var nm = v.ref.name; var rv = selRes.row ? (selRes.row.f[nm] !== undefined ? selRes.row.f[nm] : selRes.row.tags[nm]) : undefined; return rv === undefined ? null : rv; }
        return v.v === undefined ? null : v.v;
      }), empty: !vals.some(function (v) { return v && !v.trans && !v.ref && v.v !== null && v.v !== undefined; }) });
    });
    if (!anyData && !trans.length) return null;
    // transformations over aggregated windows (moving_average(mean(x),n) etc.)
    if (trans.length) {
      exp.forEach(function (x, ci) {
        if (!(x.e.type === 'call' && TRANS[x.e.name])) return;
        var inner = unparen(x.e.args[0]);
        var series = rowsOut.map(function (r) { var res = evalCall(inner, w2rows(r.t)); return { t: r.t, v: res ? res.v : null }; }).filter(function (p) { return p.v !== null; });
        var out = applyTrans(x.e, series, interval);
        var m = new Map(out.map(function (p) { return [p.t.toString(), p.v]; }));
        rowsOut.forEach(function (r) { r.cells[ci] = m.has(r.t.toString()) ? m.get(r.t.toString()) : null; r.transOnly = true; });
      });
      // rows with no transformation value are dropped
      rowsOut = rowsOut.filter(function (r) { return r.cells.some(function (c) { return c !== null; }); });
      if (!rowsOut.length) return null;
    } else if (windows) {
      // fill
      var f = st.fill.mode;
      if (f === 'none') rowsOut = rowsOut.filter(function (r) { return !r.empty; });
      else if (f === 'value') rowsOut.forEach(function (r) { if (r.empty) r.cells = r.cells.map(function (c) { return c === null ? st.fill.v : c; }); });
      else if (f === 'previous') { var prev = null; rowsOut.forEach(function (r) { if (r.empty && prev) r.cells = r.cells.map(function (c, i) { return c === null ? prev[i] : c; }); if (!r.empty) prev = r.cells; else if (prev) prev = r.cells; }); }
      else if (f === 'linear') {
        exp.forEach(function (x, ci) {
          for (var i = 0; i < rowsOut.length; i++) {
            if (rowsOut[i].cells[ci] !== null) continue;
            var a = i - 1; while (a >= 0 && rowsOut[a].cells[ci] === null) a--;
            var b = i + 1; while (b < rowsOut.length && rowsOut[b].cells[ci] === null) b++;
            if (a < 0 || b >= rowsOut.length) continue;
            var va = rowsOut[a].cells[ci], vb = rowsOut[b].cells[ci];
            rowsOut[i].cells[ci] = va + (vb - va) * (i - a) / (b - a);
          }
        });
      }
    }
    function w2rows(t) { return byWin.get(t.toString()) || []; }
    var values = rowsOut.map(function (r) { return [r.t].concat(r.cells); });
    if (st.desc) values.reverse();
    if (st.offset) values = values.slice(st.offset);
    if (st.limit) values = values.slice(0, st.limit);
    if (!values.length) return null;
    return { name: mm.name, columns: ['time'].concat(exp.map(function (x) { return x.name; })), values: values };
  };
  Engine.prototype.allMin = function (M) { var m = null; Object.keys(M.series).forEach(function (sk) { M.series[sk].pts.forEach(function (p) { if (m === null || p.t < m) m = p.t; }); }); return m; };

  function applyTrans(call, pts, interval) {
    var out = [], name = call.name;
    var arg = function (i) { var a = call.args[i] ? unparen(call.args[i]) : null; return a; };
    if (name === 'moving_average') {
      var n = arg(1).v; var win = [];
      pts.forEach(function (p) { win.push(p.v); if (win.length > n) win.shift(); if (win.length === n) out.push({ t: p.t, v: fsum(win) / n }); });
    } else if (name === 'difference' || name === 'non_negative_difference') {
      for (var i = 1; i < pts.length; i++) { var d = pts[i].v - pts[i - 1].v; if (name === 'difference' || d >= 0) out.push({ t: pts[i].t, v: d }); }
    } else if (name === 'derivative' || name === 'non_negative_derivative') {
      var u = arg(1) ? arg(1).v : (interval !== undefined ? interval : NS.s);
      for (var j = 1; j < pts.length; j++) { var dt = Number(pts[j].t - pts[j - 1].t); if (dt === 0) continue; var dv = (pts[j].v - pts[j - 1].v) / (dt / Number(u)); if (name === 'derivative' || dv >= 0) out.push({ t: pts[j].t, v: dv }); }
    } else if (name === 'cumulative_sum') {
      var s = 0; pts.forEach(function (p) { s += p.v; out.push({ t: p.t, v: s }); });
    } else if (name === 'elapsed') {
      var un = arg(1) ? arg(1).v : 1n;
      for (var k = 1; k < pts.length; k++) out.push({ t: pts[k].t, v: Number((pts[k].t - pts[k - 1].t) / BigInt(un)) });
    }
    return out;
  }
  Engine.prototype.rawTransform = function (st, mm, M, G, exp) {
    var cols = [], colVals = [];
    exp.forEach(function (x) {
      var e = x.e; if (!(e.type === 'call' && TRANS[e.name])) throw new QErr('mixing aggregate and non-aggregate queries is not supported');
      var a = unparen(e.args[0]);
      var pts = G.rows.map(function (r) { var v = a.type === 'ref' ? r.f[a.name] : evalVal(a, r); return { t: r.t, v: v }; }).filter(function (p) { return p.v !== undefined && p.v !== null && typeof p.v === 'number'; });
      colVals.push(applyTrans(e, pts)); cols.push(x.name);
    });
    var times = {}; colVals.forEach(function (c) { c.forEach(function (p) { times[p.t.toString()] = p.t; }); });
    var ts = Object.keys(times).map(function (k) { return times[k]; }).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    if (!ts.length) return null;
    var maps = colVals.map(function (c) { var m = new Map(); c.forEach(function (p) { if (!m.has(p.t.toString())) m.set(p.t.toString(), p.v); }); return m; });
    var values = [];
    // values may repeat a timestamp when several series share it; keep the stream order
    if (colVals.length === 1) values = colVals[0].map(function (p) { return [p.t, p.v]; });
    else values = ts.map(function (t) { return [t].concat(maps.map(function (m) { return m.has(t.toString()) ? m.get(t.toString()) : null; })); });
    if (st.desc) values.reverse();
    if (st.offset) values = values.slice(st.offset);
    if (st.limit) values = values.slice(0, st.limit);
    return { name: mm.name, columns: ['time'].concat(cols), values: values };
  };
  Engine.prototype.topBottom = function (st, mm, M, G, tr, exp, windows) {
    var x = exp.filter(function (q) { return q.e.type === 'call' && (q.e.name === 'top' || q.e.name === 'bottom'); })[0];
    var call = x.e, args = call.args.map(unparen);
    if (args.length < 2) throw new QErr('invalid number of arguments for ' + call.name + ', expected at least 2, got ' + args.length);
    var f = args[0].name, n = args[args.length - 1].v, tagArgs = args.slice(1, -1).map(function (a) { return a.name; });
    var extra = exp.filter(function (q) { return q !== x; });
    var cols = [x.name].concat(tagArgs).concat(extra.map(function (q) { return q.name; }));
    var groupsOf = windows ? (function () { var m = new Map(); G.rows.forEach(function (r) { var w = bdiv(r.t - (st.intervalOffset || 0n), st.interval) * st.interval + (st.intervalOffset || 0n); var k = w.toString(); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return Array.from(m.values()); })() : [G.rows];
    var values = [];
    groupsOf.forEach(function (rows) {
      var cand = rows.filter(function (r) { return typeof r.f[f] === 'number'; }).map(function (r) { return { t: r.t, v: r.f[f], row: r }; });
      if (tagArgs.length) { // best point per distinct tag combination
        var best = new Map();
        cand.forEach(function (c) { var k = tagArgs.map(function (t) { return c.row.tags[t]; }).join('\u0000'); var b = best.get(k); if (!b || (call.name === 'top' ? c.v > b.v : c.v < b.v)) best.set(k, c); });
        cand = Array.from(best.values());
      }
      cand.sort(function (a, b) { var d = call.name === 'top' ? b.v - a.v : a.v - b.v; if (d) return d; return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
      cand.slice(0, n).sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; }).forEach(function (c) {
        values.push([c.t, c.v].concat(tagArgs.map(function (t) { return c.row.tags[t] === undefined ? null : c.row.tags[t]; })).concat(extra.map(function (q) { var nm = q.e.name; var v = c.row.f[nm] !== undefined ? c.row.f[nm] : c.row.tags[nm]; return v === undefined ? null : v; })));
      });
    });
    if (!values.length) return null;
    if (st.desc) values.reverse();
    if (st.limit) values = values.slice(0, st.limit);
    return { name: mm.name, columns: ['time'].concat(cols), values: values };
  };

  // ------------------------------------------------------------------ SHOW
  Engine.prototype.dbFor = function (name) {
    var db = name || this.current;
    if (!db) throw new QErr('database name required');
    if (!this.dbs[db]) throw new QErr('database not found: ' + db);
    return this.dbs[db];
  };
  Engine.prototype.measOf = function (dbo, sources) { // all rps, for SHOW (meta is per database)
    var out = {};
    dbo.rpOrder.forEach(function (rn) {
      var rp = dbo.rps[rn];
      Object.keys(rp.meas).forEach(function (m) {
        if (!Object.keys(rp.meas[m].series).length) return;
        if (sources && !sources.some(function (s) { return s.type === 'regex' ? s.re.test(m) : s.name === m; })) return;
        var o = out[m] || (out[m] = { series: {}, ftypes: {} });
        Object.assign(o.series, rp.meas[m].series);
        Object.assign(o.ftypes, rp.meas[m].ftypes); o.ftypeSet = Object.assign(o.ftypeSet || {}, rp.meas[m].ftypeSet || {});
      });
    });
    return out;
  };
  Engine.prototype.show = function (st) {
    var self = this, res = [];
    if (st.kind === 'showdbs') return [{ name: 'databases', columns: ['name'], values: this.order.map(function (d) { return [d]; }) }];
    if (st.kind === 'showrps') {
      var d = this.dbFor(st.db);
      return [{ columns: ['name', 'duration', 'shardGroupDuration', 'replicaN', 'default'], values: d.rpOrder.map(function (n) { var r = d.rps[n]; return [n, fmtDur(r.duration), fmtDur(r.sgd), r.replicaN, d.def === n]; }) }];
    }
    var dbo = this.dbFor(st.db);
    var ms = this.measOf(dbo, st.sources);
    var names = Object.keys(ms).sort();
    var serFilter = function (S) { return !st.where || evalCond(st.where, { tags: S.tags, f: null }); };
    if (st.kind === 'showmeas') {
      var v = names.filter(function (m) { if (st.re && !st.re.test(m)) return false; if (st.eq && st.eq !== m) return false; if (st.where && !Object.keys(ms[m].series).some(function (k) { return serFilter(ms[m].series[k]); })) return false; return true; });
      if (st.limit) v = v.slice(0, st.limit);
      return v.length ? [{ name: 'measurements', columns: ['name'], values: v.map(function (m) { return [m]; }) }] : [];
    }
    if (st.kind === 'measCard') return [{ columns: ['cardinality estimation'], values: [[names.length]] }];
    if (st.kind === 'showtagkeys') {
      names.forEach(function (m) { var k = {}; Object.keys(ms[m].series).forEach(function (s) { if (serFilter(ms[m].series[s])) Object.keys(ms[m].series[s].tags).forEach(function (t) { k[t] = 1; }); }); var ks = Object.keys(k).sort(); if (st.limit) ks = ks.slice(0, st.limit); if (ks.length) res.push({ name: m, columns: ['tagKey'], values: ks.map(function (x) { return [x]; }) }); });
      return res;
    }
    if (st.kind === 'showfieldkeys') {
      names.forEach(function (m) { var fs = ms[m].ftypeSet || {}; var ks = Object.keys(fs).sort(); if (st.limit) ks = ks.slice(0, st.limit); if (ks.length) res.push({ name: m, columns: ['fieldKey', 'fieldType'], values: ks.map(function (x) { return fs[x]; }) }); });
      return res;
    }
    if (st.kind === 'showtagvalues') {
      names.forEach(function (m) {
        var pairs = {};
        Object.keys(ms[m].series).forEach(function (s) {
          var S = ms[m].series[s]; if (!serFilter(S)) return;
          Object.keys(S.tags).forEach(function (k) {
            var ok = st.keys ? st.keys.indexOf(k) >= 0 : st.keyRe ? (st.keyRe.test(k) !== !!st.keyNeg) : st.keyNe ? k !== st.keyNe : false;
            if (ok) pairs[k + '\u0000' + S.tags[k]] = [k, S.tags[k]];
          });
        });
        var vals = Object.keys(pairs).sort().map(function (k) { return pairs[k]; });
        if (st.limit) vals = vals.slice(0, st.limit);
        if (vals.length) res.push({ name: m, columns: ['key', 'value'], values: vals });
      });
      return res;
    }
    if (st.kind === 'showseries' || st.kind === 'seriesCard') {
      var keys = [];
      names.forEach(function (m) { Object.keys(ms[m].series).forEach(function (s) { if (serFilter(ms[m].series[s])) keys.push(s); }); });
      keys.sort();
      if (st.kind === 'seriesCard') return [{ columns: ['cardinality estimation'], values: [[st.sources || st.where ? keys.length : Math.max(keys.length, dbo.everKeys ? dbo.everKeys.size : 0)]] }];
      if (st.limit) keys = keys.slice(0, st.limit);
      return keys.length ? [{ columns: ['key'], values: keys.map(function (k) { return [k]; }) }] : [];
    }
    throw new QErr('not implemented');
  };

  // ------------------------------------------------------------- execute
  Engine.prototype.exec = function (st, dbname) {
    var self = this;
    switch (st.kind) {
      case 'select': return this.select(st, dbname);
      case 'showdbs': case 'showrps': case 'showmeas': case 'measCard': case 'showtagkeys': case 'showfieldkeys': case 'showtagvalues': case 'showseries': case 'seriesCard':
        if (!st.db && st.kind !== 'showdbs') st.db = dbname; return this.show(st);
      case 'createdb': {
        var d = this.dbs[st.name];
        if (!d) { d = this.ensureDb(st.name); if (st.rp) { var r = newRp(st.rp.name || 'autogen', st.rp.duration !== undefined ? st.rp.duration : 0n, st.rp.replication, st.rp.shard); d.rps = {}; d.rps[r.name] = r; d.rpOrder = [r.name]; d.def = r.name; } }
        return [];
      }
      case 'dropdb': if (this.dbs[st.name]) { delete this.dbs[st.name]; this.order = this.order.filter(function (x) { return x !== st.name; }); if (this.current === st.name) this.current = st.name; } return [];
      case 'createrp': {
        var db = this.dbs[st.db]; if (!db) throw new QErr('database not found: ' + st.db);
        if (st.duration !== 0n && st.duration < NS.h) throw new QErr('retention policy duration must be at least 1h0m0s');
        if (db.rps[st.name]) { var ex = db.rps[st.name]; if (ex.duration !== st.duration || ex.replicaN !== st.replication) throw new QErr('retention policy already exists'); }
        else { db.rps[st.name] = newRp(st.name, st.duration, st.replication, st.shard); db.rpOrder.push(st.name); }
        if (st.isDefault) db.def = st.name;
        return [];
      }
      case 'alterrp': {
        var db2 = this.dbs[st.db]; if (!db2) throw new QErr('database not found: ' + st.db);
        var rp = db2.rps[st.name]; if (!rp) throw new QErr('retention policy not found: ' + st.name);
        if (st.duration !== undefined) { rp.duration = st.duration; }
        if (st.replication !== undefined) rp.replicaN = st.replication;
        if (st.shard !== undefined) rp.sgd = st.shard;
        if (st.isDefault) db2.def = st.name;
        return [];
      }
      case 'droprp': { var db3 = this.dbs[st.db]; if (!db3) throw new QErr('database not found: ' + st.db); if (db3.rps[st.name]) { delete db3.rps[st.name]; db3.rpOrder = db3.rpOrder.filter(function (x) { return x !== st.name; }); if (db3.def === st.name) db3.def = ''; } return []; }
      case 'dropmeas': { var dbo = this.dbFor(dbname); var found = false; dbo.rpOrder.forEach(function (n) { if (dbo.rps[n].meas[st.name]) { delete dbo.rps[n].meas[st.name]; found = true; } }); return []; }
      case 'delete': case 'dropseries': {
        var dbo2 = this.dbFor(dbname);
        var tr = st.where ? this.splitTime(st.where) : { min: null, max: null, rest: null };
        dbo2.rpOrder.forEach(function (n) {
          var rp2 = dbo2.rps[n];
          Object.keys(rp2.meas).forEach(function (m) {
            if (st.sources && !st.sources.some(function (s) { return s.type === 'regex' ? s.re.test(m) : s.name === m; })) return;
            var M = rp2.meas[m];
            if (tr.rest && condRefsFields(tr.rest, M)) throw new QErr((st.kind === 'delete' ? 'shard 1: ' : '') + 'fields not supported in WHERE clause during deletion');
            Object.keys(M.series).forEach(function (sk) {
              var S = M.series[sk];
              if (tr.rest && !evalCond(tr.rest, { tags: S.tags, f: null })) return;
              if (st.kind === 'dropseries') { delete M.series[sk]; return; }
              Array.from(S.pts.keys()).forEach(function (k) { var p = S.pts.get(k); if ((tr.min === null || p.t >= tr.min) && (tr.max === null || p.t <= tr.max)) S.pts.delete(k); });
              if (!S.pts.size) delete M.series[sk];
            });
            if (!Object.keys(M.series).length) delete rp2.meas[m];
          });
        });
        return [];
      }
    }
    throw new QErr('statement not supported in the browser playground');
  };

  // /query-style JSON
  Engine.prototype.query = function (q, dbname, epoch) {
    var out = { results: [] };
    var sts;
    try { sts = new Parser(q).statements(); }
    catch (e) { if (e instanceof QErr) return { error: e.message }; throw e; }
    var self = this;
    sts.forEach(function (st, i) {
      var r = { statement_id: i };
      try {
        var ser = self.exec(st, dbname);
        if (ser.length) r.series = ser.map(function (s) {
          var o = {}; if (s.name !== undefined) o.name = s.name; if (s.tags) o.tags = s.tags; o.columns = s.columns;
          o.values = s.values.map(function (row) { return row.map(function (c, j) { if (j === 0 && s.columns[0] === 'time' && typeof c === 'bigint') return epoch ? Number(c / (NS[epoch] || 1n)) : fmtTime(c, st.tz ? tzOffset(st.tz, c) : 0); return c; }); });
          return o;
        });
      } catch (e) { if (e instanceof QErr) r.error = e.message; else throw e; }
      out.results.push(r);
    });
    return out;
  };

  // ------------------------------------------------------------------- CLI
  Engine.prototype.formatSeries = function (series, tz) {
    var self = this;
    return series.map(function (s) {
      var head = [];
      if (s.name !== undefined) head.push('name: ' + s.name);
      if (s.tags) head.push('tags: ' + Object.keys(s.tags).sort().map(function (k) { return k + '=' + s.tags[k]; }).join(', '));
      var rows = [s.columns.slice(), s.columns.map(function (c) { return '-'.repeat([...c].length); })];
      s.values.forEach(function (v) { rows.push(v.map(function (c, j) {
        if (j === 0 && s.columns[0] === 'time' && typeof c === 'bigint') return self.precision === 'rfc3339' ? fmtTime(c, tz ? tzOffset(tz, c) : 0) : (c / (NS[self.precision] || 1n)).toString();
        return cellStr(c);
      })); });
      return head.concat([tabw(rows)]).join('\n');
    }).join('\n\n');
  };
  /* Run one CLI line as the influx shell would; returns the printed text
     ('' when the shell prints nothing). */
  Engine.prototype.cli = function (line) {
    var s = line.trim();
    if (!s) return '';
    var m;
    if ((m = /^use\s+(?:"([^"]+)"|(\S+))$/i.exec(s))) {
      var name = m[1] || m[2]; var parts = name.split('.');
      if (!this.dbs[parts[0]]) return 'ERR: Database ' + parts[0] + " doesn't exist. Run SHOW DATABASES for a list of existing databases.\nDB does not exist!";
      this.current = parts[0]; this.currentRp = parts[1] || null; return 'Using database ' + parts[0] + (parts[1] ? '\nUsing retention policy ' + parts[1] : '');
    }
    if ((m = /^precision\s+(\S+)$/i.exec(s))) {
      var p = m[1].toLowerCase();
      if (['rfc3339', 'h', 'm', 's', 'ms', 'u', 'ns'].indexOf(p) < 0) return "ERR: Unknown precision \"" + m[1] + "\". Please use rfc3339, h, m, s, ms, u or ns.";
      this.precision = p; return '';
    }
    if (/^(exit|quit)$/i.test(s)) return '';
    if (/^help$/i.test(s)) return 'Usage:\n        connect <host:port>   connects to another node specified by host:port\n        auth                  prompts for username and password\n        pretty                toggles pretty print for the json format\n        chunked               turns on chunked responses from server\n        chunk size <size>     sets the size of the chunked responses.  Set to 0 to reset to the default chunked size\n        use <db_name>         sets current database\n        format <format>       specifies the format of the server responses: json, csv, or column\n        precision <format>    specifies the format of the timestamp: rfc3339, h, m, s, ms, u or ns\n        consistency <level>   sets write consistency level: any, one, quorum, or all\n        history               displays command history\n        settings              outputs the current settings for the shell\n        clear                 clears settings such as database or retention policy.  run \'help clear\' for more info\n        exit/quit/ctrl+d      quits the influx shell\n\n        show databases        show database names\n        show series           show series information\n        show measurements     show measurement information\n        show tag keys         show tag key information\n        show field keys       show field key information\n\n        A full list of influxql commands can be found at:\n        https://docs.influxdata.com/influxdb/latest/query_language/spec/';
    if ((m = /^insert(?:\s+into\s+(\S+))?\s+(.*)$/i.exec(s))) {
      var rp = m[1] || this.currentRp || null, body = m[2];
      if (!this.current) return 'ERR: {"error":"database is required"}\n\nNote: error may be due to not setting a database or retention policy.\nPlease set a database with the command "use <database>" or\nINSERT INTO <database>.<retention-policy> <point>';
      try { this.write(this.current, rp, [body], this.precision === 'rfc3339' ? 'ns' : this.precision); return ''; }
      catch (e) { if (e instanceof QErr) return 'ERR: ' + JSON.stringify({ error: e.message }) + '\n'; throw e; }
    }
    var out = this.query(s, this.current);
    if (out.error) return 'ERR: ' + out.error;
    var self = this, txt = [];
    var sts; try { sts = new Parser(s).statements(); } catch (e) { sts = []; }
    out.results.forEach(function (r, i) {
      if (r.error) {
        var t = 'ERR: ' + r.error;
        if (r.error === 'database name required') t += '\nWarning: It is possible this error is due to not setting a database.\nPlease set a database with the command "use <database>".';
        txt.push(t); return;
      }
      if (!r.series) return;
      var raw = self.exec2cache && self.exec2cache[i];
      txt.push(self.formatSeries(r.series.map(function (s0) { return { name: s0.name, tags: s0.tags, columns: s0.columns, values: s0.values.map(function (row) { return row.map(function (c, j) { if (j === 0 && s0.columns[0] === 'time' && typeof c === 'string' && /^\d{4}-/.test(c)) { var tt = parseTimeStr(c); return tt === null ? c : tt; } return c; }); }) }; }), sts[i] && sts[i].tz));
    });
    return txt.join('\n');
  };
  /* Load an `influx -import` file (# DDL / # DML sections). Returns a summary. */
  Engine.prototype.importText = function (text, precision) {
    var mode = null, db = null, rp = null, n = 0, cmds = 0, failed = 0, self = this, batch = [];
    text.split(/\r?\n/).forEach(function (l) {
      var t = l.trim();
      if (t === '# DDL') { mode = 'ddl'; return; }
      if (t === '# DML') { mode = 'dml'; return; }
      var c = /^# CONTEXT-DATABASE:\s*(\S+)/.exec(t); if (c) { db = c[1]; return; }
      c = /^# CONTEXT-RETENTION-POLICY:\s*(\S+)/.exec(t); if (c) { rp = c[1]; return; }
      if (!t || t[0] === '#') return;
      if (mode === 'ddl') { var r = self.query(t, null); cmds++; return; }
      if (mode === 'dml') { try { self.write(db, rp, [t], precision || 'ns'); n++; } catch (e) { failed++; } }
    });
    return { commands: cmds, inserts: n, failed: failed };
  };

  Engine.fmtTime = fmtTime; Engine.parseTime = parseTimeStr; Engine.QErr = QErr; Engine.parseLine = parseLine; Engine.seriesKey = seriesKey;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.InfluxEngine = Engine;
})(typeof window !== 'undefined' ? window : this);
