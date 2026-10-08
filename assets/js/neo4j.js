/* COM745 Neo4j topic: interactive explorers.
   The pattern builder and the playground run on the in-browser Cypher engine
   (cypher-engine.js) loaded with university_graph.cypher. The graph drawings use a
   small deterministic force layout. The hop-cost explorer is a simple model whose
   formulas are shown on screen. */
(function () {
  'use strict';
  var C = window.COM745, esc = C.esc;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function seg(name, options, current, key) {
    return '<div class="seg" role="group" aria-label="' + esc(name) + '"' + (key ? ' data-k="' + key + '"' : '') + '>' + options.map(function (o) {
      return '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + (String(o[0]) === String(current)) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function select(id, label, options, current) {
    return '<label class="ctl" for="' + id + '">' + esc(label) + '<select id="' + id + '">' + options.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(current) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('') + '</select></label>';
  }
  function engineOk(el) {
    if (window.CypherEngine && C.GRAPH) return true;
    $('.body', el).innerHTML = '<p class="msg err">The Cypher engine did not load (assets/js/cypher-engine.js).</p>';
    return false;
  }
  function uniEngine() { var g = new window.CypherEngine(); g.exec(C.GRAPH.uni); return g; }

  /* ---------------------------------------------------------------- graph drawing */
  var PALETTE = { Student: 'var(--c3)', Module: 'var(--c2)', Course: 'var(--c1)', Lecturer: 'var(--c4)', Person: 'var(--c3)', Book: 'var(--c2)', Movie: 'var(--c2)' };
  function caption(n) {
    var p = n.props;
    var t = p.code || p.name || p.title || (n.labels[0] || '');
    return String(t).length > 14 ? String(t).slice(0, 13) + '…' : String(t);
  }
  function collectGraph(result) {
    // nodes and relationships found anywhere in the rows
    var nodes = {}, rels = {}, E = window.CypherEngine;
    (function walk(v) {
      if (v === null || v === undefined) return;
      if (v instanceof E.Node) { nodes[v.id] = v; return; }
      if (v instanceof E.Rel) { rels[v.id] = v; nodes[v.start.id] = v.start; nodes[v.end.id] = v.end; return; }
      if (v instanceof E.Path) { v.nodes.forEach(walk); v.rels.forEach(walk); return; }
      if (Array.isArray(v)) { v.forEach(walk); return; }
    })(result.rows);
    return { nodes: Object.keys(nodes).map(function (k) { return nodes[k]; }), rels: Object.keys(rels).map(function (k) { return rels[k]; }) };
  }
  function layout(g, W, H) {
    var n = g.nodes.length, pos = {}, i;
    g.nodes.forEach(function (nd, k) { var a = 2 * Math.PI * k / Math.max(1, n); pos[nd.id] = { x: W / 2 + Math.cos(a) * W * 0.32, y: H / 2 + Math.sin(a) * H * 0.32 }; });
    var area = W * H, kk = Math.sqrt(area / Math.max(1, n)) * 0.75;
    for (i = 0; i < 260; i++) {
      var disp = {}, t = 12 * (1 - i / 260) + 0.5;
      g.nodes.forEach(function (a) { disp[a.id] = { x: 0, y: 0 }; });
      for (var p = 0; p < n; p++) for (var q = p + 1; q < n; q++) {
        var A = g.nodes[p], B = g.nodes[q], dx = pos[A.id].x - pos[B.id].x, dy = pos[A.id].y - pos[B.id].y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, f = kk * kk / d;
        disp[A.id].x += dx / d * f; disp[A.id].y += dy / d * f; disp[B.id].x -= dx / d * f; disp[B.id].y -= dy / d * f;
      }
      g.rels.forEach(function (r) {
        var a = pos[r.start.id], b = pos[r.end.id]; if (!a || !b) return;
        var dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, f = d * d / kk;
        disp[r.start.id].x -= dx / d * f; disp[r.start.id].y -= dy / d * f; disp[r.end.id].x += dx / d * f; disp[r.end.id].y += dy / d * f;
      });
      g.nodes.forEach(function (a) {
        var d = disp[a.id], l = Math.sqrt(d.x * d.x + d.y * d.y) || 1;
        pos[a.id].x = Math.min(W - 34, Math.max(34, pos[a.id].x + d.x / l * Math.min(l, t) + (W / 2 - pos[a.id].x) * 0.01));
        pos[a.id].y = Math.min(H - 30, Math.max(30, pos[a.id].y + d.y / l * Math.min(l, t) + (H / 2 - pos[a.id].y) * 0.01));
      });
    }
    return pos;
  }
  function drawGraph(g, opts) {
    opts = opts || {};
    var W = opts.w || 720, H = opts.h || 420;
    if (!g.nodes.length) return '<p class="note">Nothing to draw: the result has no nodes, relationships or paths. Return whole nodes (RETURN s, m) or a path (MATCH p = … RETURN p) to see a graph.</p>';
    var cap = g.nodes.length > 80;
    if (cap) g = { nodes: g.nodes.slice(0, 80), rels: g.rels.filter(function (r) { return g.nodes.slice(0, 80).indexOf(r.start) >= 0 && g.nodes.slice(0, 80).indexOf(r.end) >= 0; }) };
    var pos = layout(g, W, H), R = 22;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="gview" role="img" aria-label="Graph of ' + g.nodes.length + ' nodes and ' + g.rels.length + ' relationships">';
    s += '<defs><marker id="arr' + (opts.id || '') + '" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>';
    var pairCount = {};
    g.rels.forEach(function (r) {
      var a = pos[r.start.id], b = pos[r.end.id]; if (!a || !b) return;
      var key = [Math.min(r.start.id, r.end.id), Math.max(r.start.id, r.end.id)].join('-'); pairCount[key] = (pairCount[key] || 0) + 1;
      var bend = (pairCount[key] - 1) * 26 * (r.start.id < r.end.id ? 1 : -1) + (pairCount[key] > 1 ? 0 : 0);
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
      var x1 = a.x + ux * R, y1 = a.y + uy * R, x2 = b.x - ux * (R + 2), y2 = b.y - uy * (R + 2);
      var mx = (x1 + x2) / 2 - uy * bend, my = (y1 + y2) / 2 + ux * bend;
      var hl = opts.highlight && opts.highlight[r.id] ? ' hl' : '';
      s += '<path d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' Q' + mx.toFixed(1) + ',' + my.toFixed(1) + ' ' + x2.toFixed(1) + ',' + y2.toFixed(1) + '" class="edge' + hl + '" marker-end="url(#arr' + (opts.id || '') + ')"><title>' + esc(r.type) + '</title></path>';
      if (g.rels.length <= 16) s += '<text x="' + ((x1 + x2) / 2 * 0.5 + mx * 0.5).toFixed(1) + '" y="' + ((y1 + y2) / 2 * 0.5 + my * 0.5 - 3).toFixed(1) + '" class="elabel" text-anchor="middle">' + esc(r.type) + '</text>';
    });
    g.nodes.forEach(function (nd) {
      var p = pos[nd.id], col = PALETTE[nd.labels[0]] || 'var(--muted)';
      var props = Object.keys(nd.props).map(function (k) { return k + ': ' + window.CypherEngine.fmtVal(nd.props[k]); }).join('\n');
      s += '<g class="gnode" data-id="' + nd.id + '"><circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + R + '" style="fill:color-mix(in srgb,' + col + ' 22%,var(--bg));stroke:' + col + '"/>' +
        '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 4).toFixed(1) + '" text-anchor="middle" class="ncap">' + esc(caption(nd)) + '</text><title>' + esc((nd.labels.map(function (l) { return ':' + l; }).join('') || '(no label)') + '\n' + props) + '</title></g>';
    });
    s += '</svg>';
    var labs = {}; g.nodes.forEach(function (n) { (n.labels.length ? n.labels : ['(no label)']).slice(0, 1).forEach(function (l) { labs[l] = (labs[l] || 0) + 1; }); });
    return s + '<div class="glegend">' + Object.keys(labs).map(function (l) { return '<span><i style="background:' + (PALETTE[l] || 'var(--muted)') + '"></i>' + esc(l) + ' (' + labs[l] + ')</span>'; }).join('') +
      '<span class="note">' + g.rels.length + ' relationships' + (cap ? '; first 80 nodes drawn' : '') + '. Hover for properties.</span></div>';
  }
  C.drawGraph = drawGraph;

  /* ---------------------------------------------------------------- A2 anatomy */
  var AN = {
    nodes: [
      { id: 'john', x: 120, y: 80, rx: 78, ry: 34, label: 'John', lab: 'Person', cy: "(john:Person {name: 'John', age: 27})", props: ['name: John', 'age: 27'] },
      { id: 'sally', x: 520, y: 140, rx: 78, ry: 34, label: 'Sally', lab: 'Person', cy: "(sally:Person {name: 'Sally', age: 32})", props: ['name: Sally', 'age: 32'] },
      { id: 'book', x: 320, y: 300, rx: 118, ry: 44, label: 'Graph Databases', lab: 'Book', cy: "(book:Book {title: 'Graph Databases', authors: ['Ian Robinson', 'Jim Webber']})", props: ['title: Graph Databases', 'authors: [Ian Robinson,', 'Jim Webber]'] }
    ],
    rels: [
      { id: 'f1', type: 'FRIEND_OF', d: 'M196,70 Q330,26 446,124', lx: 322, ly: 30, anchor: 'middle', props: ['since: 2013-09-01'], cy: "(john)-[:FRIEND_OF {since: '2013-09-01'}]->(sally)" },
      { id: 'f2', type: 'FRIEND_OF', d: 'M444,158 Q300,170 190,98', lx: 316, ly: 178, anchor: 'middle', props: ['since: 2013-09-01'], cy: "(sally)-[:FRIEND_OF {since: '2013-09-01'}]->(john)" },
      { id: 'h1', type: 'HAS_READ', d: 'M118,114 Q140,240 214,282', lx: 120, ly: 186, anchor: 'end', props: ['on: 2013-03-02', 'rating: 5'], cy: "(john)-[:HAS_READ {on: '2013-03-02', rating: 5}]->(book)" },
      { id: 'h2', type: 'HAS_READ', d: 'M512,174 Q500,244 424,280', lx: 516, ly: 214, anchor: 'start', props: ['on: 2013-09-02', 'rating: 4'], cy: "(sally)-[:HAS_READ {on: '2013-09-02', rating: 4}]->(book)" }
    ]
  };
  function anatomy(el) {
    var mode = 'node', found = {};
    var totals = { node: 3, rel: 4, prop: 12 };
    function render() {
      var nf = Object.keys(found).filter(function (k) { return found[k] === mode; }).length;
      var s = '<svg viewBox="0 0 640 360" class="gview anat" role="img" aria-label="John and Sally are friends; both have read Graph Databases">';
      s += '<defs><marker id="arrA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>';
      AN.rels.forEach(function (r) {
        var on = found[r.id] ? ' found' : '';
        s += '<g class="hit rel' + on + '" data-id="' + r.id + '" tabindex="0" role="button" aria-label="relationship ' + r.type + '">' +
          '<path d="' + r.d + '" class="edgehit"/><path d="' + r.d + '" class="edge" marker-end="url(#arrA)"/>' +
          '<text x="' + r.lx + '" y="' + r.ly + '" text-anchor="' + r.anchor + '" class="elabel big">' + r.type + '</text></g>';
        r.props.forEach(function (p, i) {
          var pid = r.id + 'p' + i;
          s += '<text x="' + r.lx + '" y="' + (r.ly + 15 + i * 14) + '" text-anchor="' + r.anchor + '" class="hit prop' + (found[pid] ? ' found' : '') + '" data-id="' + pid + '" tabindex="0" role="button">' + esc(p) + '</text>';
        });
      });
      AN.nodes.forEach(function (n) {
        var on = found[n.id] ? ' found' : '';
        s += '<g class="hit node' + on + '" data-id="' + n.id + '" tabindex="0" role="button" aria-label="node ' + esc(n.label) + '"><ellipse cx="' + n.x + '" cy="' + n.y + '" rx="' + n.rx + '" ry="' + n.ry + '" class="anode"/></g>';
        var props = n.props.filter(function (p) { return !/^Jim/.test(p); });
        n.props.forEach(function (p, i) {
          var cont = /^Jim/.test(p), pid = n.id + 'p' + (cont ? 1 : i);
          s += '<text x="' + n.x + '" y="' + (n.y - (n.props.length - 1) * 7.5 + i * 15 + 4) + '" text-anchor="middle" class="hit prop nprop' + (found[pid] ? ' found' : '') + '" data-id="' + pid + '" tabindex="0" role="button">' + esc(p) + '</text>';
        });
      });
      s += '</svg>';
      var html = '<div class="controls"><div class="ctl"><span>Find all the</span>' + seg('Find', [['node', 'Nodes'], ['rel', 'Relationships'], ['prop', 'Properties']], mode) + '</div>' +
        '<span class="note" aria-live="polite">' + nf + ' of ' + totals[mode] + ' found</span><button type="button" class="btn" data-reset>Start again</button></div>' +
        '<div class="chartbox">' + s + '</div><div class="result" aria-live="polite"></div>';
      $('.body', el).innerHTML = html;
      el.querySelectorAll('.seg button').forEach(function (b) { b.addEventListener('click', function () { mode = b.dataset.v; render(); }); });
      $('[data-reset]', el).addEventListener('click', function () { found = {}; render(); });
      el.querySelectorAll('.hit').forEach(function (h) {
        function act(e) {
          e.stopPropagation();
          var id = h.getAttribute('data-id'), kind = /p\d$/.test(id) ? 'prop' : (AN.nodes.some(function (n) { return n.id === id; }) ? 'node' : 'rel');
          var names = { node: 'node', rel: 'relationship', prop: 'property' };
          if (kind !== mode) { $('.result', el).innerHTML = '<p class="msg err">That is a ' + names[kind] + ', not a ' + names[mode] + '.</p>'; return; }
          found[id] = kind; render();
          var obj = kind === 'node' ? AN.nodes.filter(function (n) { return n.id === id; })[0] : kind === 'rel' ? AN.rels.filter(function (r) { return r.id === id; })[0] : null, msg;
          if (kind === 'prop') {
            var owner = id.replace(/p\d$/, ''), node = AN.nodes.filter(function (n) { return n.id === owner; })[0];
            msg = node ? 'A property of the ' + node.lab + ' node ' + node.label + '.' : 'A property of a ' + AN.rels.filter(function (r) { return r.id === owner; })[0].type + ' relationship. Relationships can carry properties too: that is what a link table\'s extra columns become.';
          } else msg = kind === 'node' ? 'A node with the label ' + obj.lab + '.' : 'A relationship of type ' + obj.type + ': it has a direction and its own properties.';
          var done = Object.keys(found).filter(function (k) { return found[k] === mode; }).length === totals[mode];
          $('.result', el).innerHTML = '<p class="msg okm">' + esc(msg) + (done ? ' You found them all.' : '') + '</p>' + (obj ? '<div class="code" data-lang="cypher"><pre>' + esc('CREATE ' + obj.cy) + '</pre></div>' : '');
          C.decorateCode(el);
        }
        h.addEventListener('click', act);
        h.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
      });
    }
    render();
  }

  /* ---------------------------------------------------------------- A4 pattern builder */
  var HOPS = {
    Student: [['REGISTERED_ON', 'out', 'Module'], ['ENROLLED_ON', 'out', 'Course']],
    Module: [['REGISTERED_ON', 'in', 'Student'], ['TEACHES', 'in', 'Lecturer'], ['INCLUDES', 'in', 'Course']],
    Course: [['ENROLLED_ON', 'in', 'Student'], ['INCLUDES', 'out', 'Module'], ['COORDINATES', 'in', 'Lecturer']],
    Lecturer: [['TEACHES', 'out', 'Module'], ['COORDINATES', 'out', 'Course']]
  };
  var STARTS = [['Student|Priya Patel', 'Student: Priya Patel'], ['Student|John Smith', 'Student: John Smith'], ['Student|Ryan O\'Neill', 'Student: Ryan O\'Neill'],
    ['Module|COM745', 'Module: COM745'], ['Module|COM750', 'Module: COM750'], ['Course|MSCDS', 'Course: MSCDS'], ['Lecturer|Laura Wilson', 'Lecturer: Laura Wilson'], ['Lecturer|Thomas Harris', 'Lecturer: Thomas Harris']];
  function patternBuilder(el) {
    if (!engineOk(el)) return;
    var eng = uniEngine();
    var st = { start: 'Student|Priya Patel', h1: 'REGISTERED_ON|out|Module', d1: 'as', h2: 'TEACHES|in|Lecturer', d2: 'as', two: true };
    function arrow(type, dir, flip) { var d = flip === 'rev' ? (dir === 'out' ? 'in' : 'out') : flip === 'none' ? 'both' : dir; return d === 'out' ? '-[:' + type + ']->' : d === 'in' ? '<-[:' + type + ']-' : '-[:' + type + ']-'; }
    function render() {
      var sp = st.start.split('|'), lab = sp[0], key = lab === 'Student' || lab === 'Lecturer' ? 'name' : 'code';
      var h1 = st.h1.split('|'); if (!HOPS[lab].some(function (h) { return h.join('|') === st.h1; })) { st.h1 = HOPS[lab][0].join('|'); h1 = HOPS[lab][0]; }
      var lab2 = h1[2];
      if (!HOPS[lab2].some(function (h) { return h.join('|') === st.h2; })) st.h2 = HOPS[lab2].filter(function (h) { return h[0] !== h1[0]; })[0].join('|');
      var h2 = st.h2.split('|'), lab3 = h2[2];
      var q = 'MATCH p = (a:' + lab + ' {' + key + ": '" + sp[1].replace(/'/g, "\\'") + "'})" + arrow(h1[0], h1[1], st.d1) + '(b:' + lab2 + ')' + (st.two ? arrow(h2[0], h2[1], st.d2) + '(c:' + lab3 + ')' : '') + '\nRETURN p';
      var res = eng.exec(q)[0];
      var tq = q.replace('MATCH p = ', 'MATCH ').replace('RETURN p', 'RETURN ' + (st.two ? 'b.' + (lab2 === 'Student' || lab2 === 'Lecturer' ? 'name' : 'code') + ', c.' + (lab3 === 'Student' || lab3 === 'Lecturer' ? 'name' : 'code') : 'b.' + (lab2 === 'Student' || lab2 === 'Lecturer' ? 'name' : 'code')));
      var tres = eng.exec(tq)[0];
      var opts1 = HOPS[lab].map(function (h) { return [h.join('|'), (h[1] === 'out' ? '-[:' + h[0] + ']->' : '<-[:' + h[0] + ']-') + ' ' + h[2]]; });
      var opts2 = HOPS[lab2].map(function (h) { return [h.join('|'), (h[1] === 'out' ? '-[:' + h[0] + ']->' : '<-[:' + h[0] + ']-') + ' ' + h[2]]; });
      var dirs = [['as', 'as stored'], ['rev', 'reversed'], ['none', 'no arrow']];
      var html = '<div class="controls">' + select('pb-s', 'Start at', STARTS, st.start) + select('pb-h1', 'Hop 1', opts1, st.h1) + '<div class="ctl"><span>Direction</span>' + seg('Hop 1 direction', dirs, st.d1, 'd1') + '</div></div>' +
        '<div class="controls"><label class="ctl" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="pb-two"' + (st.two ? ' checked' : '') + '> Second hop</label>' +
        (st.two ? select('pb-h2', 'Hop 2', opts2, st.h2) + '<div class="ctl"><span>Direction</span>' + seg('Hop 2 direction', dirs, st.d2, 'd2') + '</div>' : '') + '</div>';
      html += '<div class="code" data-lang="cypher"><pre>' + esc(q) + '</pre></div>';
      if (res.error) html += '<p class="msg err">' + esc(res.error) + '</p>';
      else {
        var n = res.rows.length;
        html += '<p class="note" aria-live="polite"><b>' + n + (n === 1 ? ' path' : ' paths') + '</b> matched.' + (st.d1 === 'rev' || st.d2 === 'rev' ? ' A reversed arrow asks for relationships stored the other way round: usually none, and no error.' : '') +
          (st.d1 === 'none' || st.d2 === 'none' ? ' Without an arrow, either direction matches.' : '') + '</p>';
        html += '<div class="chartbox">' + drawGraph(collectGraph(res), { id: 'pb', w: 720, h: 360 }) + '</div>';
        if (tres && !tres.error) html += '<details><summary>The same pattern as a table</summary><div class="code" data-lang="cypher"><pre>' + esc(tq) + '</pre></div><div class="console" style="white-space:pre;overflow:auto;max-height:300px">' + esc(eng.format(tres)) + '</div></details>';
      }
      $('.body', el).innerHTML = html;
      C.decorateCode(el);
      $('#pb-s', el).addEventListener('change', function (e) { st.start = e.target.value; st.d1 = st.d2 = 'as'; render(); });
      $('#pb-h1', el).addEventListener('change', function (e) { st.h1 = e.target.value; render(); });
      var h2s = $('#pb-h2', el); if (h2s) h2s.addEventListener('change', function (e) { st.h2 = e.target.value; render(); });
      $('#pb-two', el).addEventListener('change', function (e) { st.two = e.target.checked; render(); });
      el.querySelectorAll('.seg[data-k] button').forEach(function (b) { b.addEventListener('click', function () { st[b.closest('.seg').dataset.k] = b.dataset.v; render(); }); });
    }
    render();
  }

  /* ---------------------------------------------------------------- A6 hop cost */
  function fmtN(n) { return n >= 1e12 ? n.toExponential(1).replace('e+', ' × 10^') : Math.round(n).toLocaleString('en-GB'); }
  function hops(el) {
    var st = { n: 1000, d: 2, f: 50 };
    function render() {
      var N = st.n, d = st.d, f = st.f;
      var reach = 0, frontier = 1; for (var i = 1; i <= d; i++) { frontier *= f; reach += frontier; }
      reach = Math.min(reach, N * f);
      var lookup = Math.max(1, Math.log2(N * f));          // index probe into a join table of N*f rows
      var sql = 0, fr = 1; for (var j = 1; j <= d; j++) { sql += fr * lookup + fr * f; fr *= f; } // each frontier row: one index probe + read its f matches
      var graph = 0, fr2 = 1; for (var k = 1; k <= d; k++) { graph += fr2 * f; fr2 *= f; }        // each frontier node: read its f relationship pointers
      var html = '<div class="controls">' + select('hp-n', 'People in the database', [[1000, '1,000'], [100000, '100,000'], [1000000, '1,000,000'], [100000000, '100,000,000']], st.n) +
        select('hp-f', 'Friends each', [[10, '10'], [50, '50'], [150, '150']], st.f) + '<div class="ctl"><span>Depth (hops)</span>' + seg('Depth', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], st.d, 'd') + '</div></div>';
      var max = Math.max(sql, graph);
      html += '<div class="bars">' +
        '<div class="bar"><span class="k">Relational (one JOIN per hop)</span><div class="track"><div style="width:' + (sql / max * 100).toFixed(1) + '%"></div></div><b>' + fmtN(sql) + '</b></div>' +
        '<div class="bar g"><span class="k">Graph (follow stored relationships)</span><div class="track"><div style="width:' + (graph / max * 100).toFixed(1) + '%"></div></div><b>' + fmtN(graph) + '</b></div></div>';
      html += '<p class="note">Entries touched, bars to scale. Both read the same ' + fmtN(graph) + ' friendship entries; the relational plan also pays an index lookup of about log₂(' + fmtN(N * f) + ') ≈ ' + lookup.toFixed(0) + ' steps for every person it expands, and that grows with the whole table. The graph cost does not change when you change the number of people: that is index-free adjacency. Depth, not size, is what hurts a graph: at depth ' + d + ' it already touches ' + fmtN(graph) + ' entries.</p>';
      html += '<details><summary>The model</summary><pre class="console">frontier(0) = 1 person; frontier(h) = f^h\ngraph cost  = Σ frontier(h-1) × f                       (read each person\'s f relationships)\nSQL cost    = Σ frontier(h-1) × (log₂(N·f) + f)          (B-tree probe into Friendship, then read f rows)\nIgnores caching, hash joins, de-duplication and disk layout: a teaching model, not a benchmark.</pre></details>';
      $('.body', el).innerHTML = html;
      $('#hp-n', el).addEventListener('change', function (e) { st.n = +e.target.value; render(); });
      $('#hp-f', el).addEventListener('change', function (e) { st.f = +e.target.value; render(); });
      el.querySelectorAll('.seg[data-k] button').forEach(function (b) { b.addEventListener('click', function () { st.d = +b.dataset.v; render(); }); });
    }
    render();
  }

  /* ---------------------------------------------------------------- C1 playground */
  var PG = { el: null, g: null, view: 'graph', last: null };
  var PRESETS = [
    ['What is here?', 'CALL db.labels();\nCALL db.relationshipTypes();'],
    ['Priya\'s neighbourhood', "MATCH p = (s:Student {name: 'Priya Patel'})-[*1..2]-(x)\nRETURN p;"],
    ['Who teaches what', 'MATCH (l:Lecturer)-[t:TEACHES]->(m:Module)\nRETURN l, t, m;'],
    ['Course structure', 'MATCH p = (c:Course)-[:INCLUDES]->(m:Module)\nRETURN p;'],
    ['Students per module', 'MATCH (m:Module)\nOPTIONAL MATCH (s:Student)-[:REGISTERED_ON]->(m)\nRETURN m.code, count(s) AS students\nORDER BY m.code;'],
    ['Shortest path', "MATCH p = shortestPath((:Student {name: 'John Smith'})-[*]-(:Lecturer {name: 'Mei Chen'}))\nRETURN p;"],
    ['The typo trap', 'MATCH (s:Student)-[:REGISTERD_ON]->(m:Module)\nRETURN s.name;'],
    ['Blank nodes', "CREATE (a)-[:FRIEND_OF]->(b);\nMATCH (n) WHERE size(keys(n)) = 0 RETURN n;"],
    ['Lecture example', null]
  ];
  function pgRun() {
    var code = $('textarea', PG.el).value, out = $('.result', PG.el);
    C.store.set('cpg:last', code);
    var results = PG.g.exec(code);
    if (!results.length) { out.innerHTML = '<p class="msg">Type Cypher, then press Run (or Ctrl+Enter).</p>'; return; }
    PG.last = results;
    pgShow();
    pgSchema();
  }
  function pgShow() {
    var out = $('.result', PG.el), results = PG.last, html = '';
    if (!results) return;
    var lastData = null;
    results.forEach(function (r) {
      var first = r.src.split('\n')[0]; if (first.length > 100) first = first.slice(0, 98) + '…';
      html += '<div class="msg">' + esc('neo4j@neo4j> ' + first + (r.src.indexOf('\n') > 0 ? ' …' : '')) + '</div>';
      if (r.error) { html += '<div class="msg err" style="white-space:pre-wrap;font-family:var(--f-mono)">' + esc(r.error) + '</div>'; return; }
      lastData = r;
      if (PG.view === 'text' || r !== results[results.length - 1] || !r.columns.length) html += '<div class="console" style="white-space:pre;overflow:auto;max-height:420px">' + esc(PG.g.format(r)) + '</div>';
      else if (PG.view === 'table') html += tableView(r);
      else { var gg = collectGraph(r); html += gg.nodes.length ? '<div class="chartbox">' + drawGraph(gg, { id: 'pg', w: 760, h: 440 }) + '</div><p class="note">' + r.rows.length + ' rows. ' + (r.warnings || []).map(esc).join(' ') + '</p>' : tableView(r); }
    });
    out.innerHTML = html;
  }
  function tableView(r) {
    var fv = window.CypherEngine.fmtVal;
    var stats = window.CypherEngine.statsLine(r.stats || {});
    return '<div class="tbl"><table><thead><tr>' + r.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      r.rows.slice(0, 200).map(function (row) { return '<tr>' + row.map(function (v) { return '<td class="m">' + esc(fv(v)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="note">' + r.rows.length + (r.rows.length === 1 ? ' row' : ' rows') + (stats ? '. ' + esc(stats) : '') + ((r.warnings || []).length ? '<br>Warning: ' + r.warnings.map(esc).join('<br>Warning: ') : '') + '</p>';
  }
  function pgSchema() {
    var box = $('.schema', PG.el), g = PG.g, labs = {}, types = {};
    g.nodes.forEach(function (n) { (n.labels.length ? n.labels : ['(no label)']).forEach(function (l) { labs[l] = (labs[l] || 0) + 1; }); });
    g.rels.forEach(function (r) { types[r.type] = (types[r.type] || 0) + 1; });
    box.innerHTML = '<span style="font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700">Graph</span>' +
      '<details open><summary>Node labels</summary><ul>' + Object.keys(labs).sort().map(function (l) { return '<li class="pk">:' + esc(l) + ' <i>(' + labs[l] + ')</i></li>'; }).join('') + '</ul></details>' +
      '<details open><summary>Relationship types</summary><ul>' + Object.keys(types).sort().map(function (t) { return '<li class="fk">:' + esc(t) + ' <i>(' + types[t] + ')</i></li>'; }).join('') + '</ul></details>' +
      (g.constraints.length ? '<details><summary>Constraints</summary><ul>' + g.constraints.map(function (c) { return '<li>' + esc(c.name) + '</li>'; }).join('') + '</ul></details>' : '');
  }
  function playground(el) {
    PG.el = el;
    el.querySelector('.body').innerHTML =
      '<div class="presets" aria-label="Example queries">' + PRESETS.map(function (p, i) { return '<button type="button" data-p="' + i + '">' + esc(p[0]) + '</button>'; }).join('') + '</div>' +
      '<div class="play"><div class="schema"></div><div style="display:flex;flex-direction:column;gap:10px;min-width:0">' +
      '<label class="visually-hidden" for="cpg-code">Cypher to run</label><textarea id="cpg-code" class="sql" spellcheck="false"></textarea>' +
      '<div class="controls"><button type="button" class="btn primary" data-run>Run (Ctrl+Enter)</button><button type="button" class="btn" data-reset>Reset data</button>' +
      '<div class="ctl" style="flex-direction:row;align-items:center;gap:8px"><span>Show the last result as</span>' + seg('Result view', [['graph', 'Graph'], ['table', 'Table'], ['text', 'Text']], PG.view) + '</div></div>' +
      '<div class="result" aria-live="polite"></div></div></div>';
    if (!engineOk(el)) return;
    PG.g = uniEngine();
    var ta = $('textarea', el);
    ta.value = C.store.get('cpg:last', PRESETS[1][1]);
    el.querySelectorAll('[data-p]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = PRESETS[+b.dataset.p];
        ta.value = p[1] === null ? 'MATCH (n) DETACH DELETE n;\n' + C.GRAPH.books.replace(/^\/\/[^\n]*\n/gm, '').replace('MATCH (n) DETACH DELETE n;', '').trim() + '\nMATCH p = ()-->() RETURN p;' : p[1];
        pgRun();
      });
    });
    el.querySelectorAll('.seg button').forEach(function (b) { b.addEventListener('click', function () { PG.view = b.dataset.v; el.querySelectorAll('.seg button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); pgShow(); }); });
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); pgRun(); } });
    $('[data-run]', el).addEventListener('click', pgRun);
    $('[data-reset]', el).addEventListener('click', function () { PG.g = uniEngine(); PG.last = null; pgSchema(); $('.result', el).innerHTML = '<p class="msg okm">University graph reloaded from university_graph.cypher.</p>'; });
    pgSchema();
    pgRun();
  }
  C.cypherPlayground = {
    load: function (code) {
      if (!PG.el) return;
      if (!PG.g.nodes.some(function (n) { return n.labels.indexOf('Student') >= 0; })) PG.g = uniEngine();
      $('textarea', PG.el).value = code; PG.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); pgRun();
    }
  };

  var MOUNTS = { anatomy: anatomy, patterns: patternBuilder, hops: hops, cplayground: playground };
  C.ready(function () {
    document.querySelectorAll('[data-explorer]').forEach(function (el) { var f = MOUNTS[el.getAttribute('data-explorer')]; if (f) f(el); });
    document.querySelectorAll('[data-try-cypher]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pres = b.closest('.task, .card, details').querySelectorAll('[data-lang=cypher] pre');
        C.cypherPlayground.load(pres[pres.length - 1].textContent);
      });
    });
  });
})();
