/* COM745 NoSQL concepts: replication explorer, family chooser, quiz. */
(function () {
  'use strict';
  var C = window.COM745, esc = C.esc;
  function seg(name, options, current) {
    return '<div class="seg" role="group" aria-label="' + esc(name) + '">' + options.map(function (o) {
      return '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + (o[0] === current) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  /* ---------------- replication and consistency (simulation) ---------------- */
  function replication(el) {
    var st;
    function reset() {
      st = { t: 0, lag: 2, read: 'any', wc: 'w1', latest: 1,
             nodes: [{ id: 1, v: 100, ver: 1, up: true }, { id: 2, v: 100, ver: 1, up: true }, { id: 3, v: 100, ver: 1, up: true }],
             pending: [], log: ['t=0s  all three nodes hold balance £100 (version 1)'], last: null };
    }
    reset();
    function deliver() {
      st.pending = st.pending.filter(function (p) {
        var n = st.nodes[p.node - 1];
        if (p.at <= st.t && n.up) { if (p.ver > n.ver) { n.v = p.v; n.ver = p.ver; st.log.push('t=' + st.t + 's  node ' + p.node + ' receives version ' + p.ver + ' (£' + p.v + ')'); } return false; }
        return true;
      });
    }
    function advance(s) { for (var i = 0; i < s; i++) { st.t++; deliver(); } }
    function write() {
      var p = st.nodes[0];
      if (!p.up) { st.last = { bad: true, msg: 'Write refused: node 1 (the primary) is offline. No node may accept writes, or the copies could diverge.' }; st.log.push('t=' + st.t + 's  WRITE failed: no primary'); return; }
      var nv = p.v + 50, ver = st.latest + 1;
      st.latest = ver; p.v = nv; p.ver = ver;
      st.log.push('t=' + st.t + 's  client 1 writes £' + nv + ' to node 1 (version ' + ver + ')');
      [2, 3].forEach(function (k) { st.pending.push({ node: k, v: nv, ver: ver, at: st.t + st.lag }); });
      if (st.wc === 'maj') {
        var replicasUp = st.nodes.slice(1).some(function (n) { return n.up; });
        if (!replicasUp) { st.last = { bad: true, msg: 'Write concern "majority": no replica is reachable, so the write cannot be confirmed. The client waits and eventually times out, although node 1 has the change.' }; st.log.push('t=' + st.t + 's  waiting for a majority… timed out'); return; }
        advance(st.lag);
        st.last = { good: true, msg: 'Write concern "majority": the client waited ' + st.lag + ' s until a second node had the change. Slower, but the write survives losing node 1.' };
        st.log.push('t=' + st.t + 's  write acknowledged by a majority');
      } else {
        st.last = { good: true, msg: 'Write concern w:1: acknowledged at once by node 1. Fast, but nodes 2 and 3 will not have it for ' + st.lag + ' s.' };
        st.log.push('t=' + st.t + 's  write acknowledged by node 1 only');
      }
    }
    function read(k) {
      var target = st.read === 'primary' ? 1 : k, n = st.nodes[target - 1];
      if (!n.up) {
        st.last = { bad: true, msg: (st.read === 'primary' ? 'Read from primary: node 1 is offline, so the read is refused. Consistency was chosen over availability.' : 'Node ' + k + ' is offline and does not answer.') };
        st.log.push('t=' + st.t + 's  READ node ' + target + ' failed'); return;
      }
      var stale = n.ver < st.latest;
      st.last = stale ? { bad: true, msg: 'Stale read: node ' + target + ' answered £' + n.v + ' (version ' + n.ver + '), but the latest value is version ' + st.latest + '. It is eventually consistent: wait ' + st.lag + ' s and read again.' }
                      : { good: true, msg: 'Node ' + target + ' answered £' + n.v + ' (version ' + n.ver + '): the latest value.' + (st.read === 'primary' && k !== 1 ? ' (Redirected to the primary.)' : '') };
      st.log.push('t=' + st.t + 's  client 2 reads node ' + target + ': £' + n.v + (stale ? '  STALE' : ''));
    }
    function render() {
      var html = '<div class="controls">' +
        '<label class="ctl" for="rp-lag">Replication lag: <b>' + st.lag + ' s</b><input id="rp-lag" type="range" min="0" max="5" value="' + st.lag + '"></label>' +
        '<div class="ctl">Write concern' + seg('Write concern', [['w1', 'w:1 (fast)'], ['maj', 'majority (safe)']], st.wc) + '</div>' +
        '<div class="ctl">Read from' + seg('Read preference', [['any', 'the node I ask'], ['primary', 'primary only']], st.read) + '</div></div>';
      html += '<div class="controls"><button type="button" class="btn primary" data-a="write">Client 1: add £50</button><button type="button" class="btn" data-a="wait">Wait 1 s</button>' +
        '<button type="button" class="btn" data-a="r1">Read node 1</button><button type="button" class="btn" data-a="r2">Read node 2</button><button type="button" class="btn" data-a="r3">Read node 3</button><button type="button" class="btn" data-a="reset">Reset</button></div>';
      html += '<div class="grid3">' + st.nodes.map(function (n) {
        var stale = n.ver < st.latest;
        return '<div class="card" style="' + (!n.up ? 'opacity:.55;border-style:dashed' : (stale ? 'border-color:var(--chal)' : 'border-color:var(--core)')) + '"><span class="k">Node ' + n.id + (n.id === 1 ? ' · primary' : ' · replica') + '</span>' +
          '<div class="kpi" style="min-width:0"><span>Balance</span><b>£' + n.v + '</b></div><span class="note">version ' + n.ver + (n.up ? (stale ? ' · behind' : ' · up to date') : ' · offline') + '</span>' +
          '<button type="button" class="btn" data-n="' + n.id + '">' + (n.up ? 'Take offline' : 'Bring online') + '</button></div>';
      }).join('') + '</div>';
      if (st.last) html += '<p class="callout ' + (st.last.bad ? 'warn' : 'good') + '" aria-live="polite">' + esc(st.last.msg) + '</p>';
      html += '<div class="console" style="max-height:200px;overflow:auto" aria-label="Event log">' + esc(st.log.slice(-12).join('\n')) + '</div>';
      html += '<p class="note">Model only: real databases add elections (a replica becomes primary when the primary fails), read concerns and timeouts. MongoDB replica sets use exactly these ideas: w:1 or w:"majority", and read preference primary or nearest.</p>';
      el.querySelector('.body').innerHTML = html;
      el.querySelector('#rp-lag').addEventListener('input', function (e) { st.lag = +e.target.value; render(); el.querySelector('#rp-lag').focus(); });
      var segs = el.querySelectorAll('.seg');
      segs[0].querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { st.wc = b.dataset.v; render(); }); });
      segs[1].querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { st.read = b.dataset.v; render(); }); });
      el.querySelectorAll('[data-a]').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = b.dataset.a;
          if (a === 'write') write(); else if (a === 'wait') { advance(1); st.last = { good: true, msg: 'Time passes: t = ' + st.t + ' s.' }; }
          else if (a === 'reset') reset(); else read(+a.slice(1));
          render();
        });
      });
      el.querySelectorAll('[data-n]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = st.nodes[+b.dataset.n - 1]; n.up = !n.up;
          st.log.push('t=' + st.t + 's  node ' + n.id + (n.up ? ' back online' : ' goes offline'));
          if (n.up) deliver();
          st.last = null; render();
        });
      });
    }
    render();
  }

  /* ---------------- which family? ---------------- */
  function family(el) {
    var F = [['rel', 'Relational'], ['doc', 'Document'], ['kv', 'Key-value'], ['wide', 'Wide-column'], ['ts', 'Time-series'], ['graph', 'Graph']];
    var S = [
      ['Readings every second from 2,000 campus energy meters, queried as averages per hour and per building.', ['ts'], 'Time-stamped, append-only, queried by time window and tag (building): what a TSDB is built for (Week 3).'],
      ['A product catalogue where every product type has different attributes (a laptop has RAM, a hoodie has a size).', ['doc'], 'Each product is one self-contained document; fields vary freely between documents.'],
      ['"Students who took your modules also took…" recommendations.', ['graph'], 'Following relationships several hops deep is cheap in a graph and expensive as repeated JOINs (Week 4).'],
      ['The student fees ledger: payments must never be lost or double-counted.', ['rel'], 'Strict ACID transactions and constraints matter more than scale here.'],
      ['The web portal\'s session store: read and written by session id thousands of times a second.', ['kv'], 'One key, one value, no queries on the contents: the simplest and fastest model.'],
      ['Billions of click events written constantly across many servers, read back by user and day.', ['wide', 'ts'], 'Wide-column stores (Cassandra, HBase) are designed for huge write volumes partitioned by key; a TSDB is also defensible.'],
      ['Finding rings of accounts that pass money between each other in a loop (fraud detection).', ['graph'], 'Cycles and paths are graph patterns (Practical 9 discusses exactly this).'],
      ['The timetable: rooms, staff, modules and sessions with many rules that must hold together.', ['rel', 'graph'], 'Highly related data with integrity rules: relational. A graph is arguable for exploring clashes.']
    ];
    var pick = {};
    function render() {
      var html = '<ol class="tasks">' + S.map(function (s, i) {
        return '<li class="task"><div class="task-q"><span class="num">' + (i + 1) + '</span><span>' + esc(s[0]) + '</span></div>' +
          '<div class="seg" role="group" aria-label="Family for scenario ' + (i + 1) + '" data-i="' + i + '" style="flex-wrap:wrap">' + F.map(function (f) {
            return '<button type="button" data-v="' + f[0] + '" aria-pressed="' + (pick[i] === f[0]) + '">' + f[1] + '</button>';
          }).join('') + '</div><p class="note" data-fb="' + i + '"></p></li>';
      }).join('') + '</ol><div class="controls"><button type="button" class="btn primary" data-check>Check</button><button type="button" class="btn" data-clear>Clear</button><span class="note" data-score></span></div>';
      el.querySelector('.body').innerHTML = html;
      el.querySelectorAll('.seg').forEach(function (sg) {
        sg.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { pick[+sg.dataset.i] = b.dataset.v; render(); }); });
      });
      el.querySelector('[data-check]').addEventListener('click', function () {
        var right = 0;
        S.forEach(function (s, i) {
          var ok = s[1].indexOf(pick[i]) >= 0; if (ok) right++;
          el.querySelector('[data-fb="' + i + '"]').innerHTML = pick[i] ? (ok ? '<b style="color:var(--core)">Good choice.</b> ' : '<b style="color:var(--bad)">Consider ' + s[1].map(function (k) { return F.filter(function (f) { return f[0] === k; })[0][1]; }).join(' or ') + '.</b> ') + esc(s[2]) : 'Not answered.';
        });
        el.querySelector('[data-score]').textContent = right + ' of ' + S.length + ' match a suggested answer.';
      });
      el.querySelector('[data-clear]').addEventListener('click', function () { pick = {}; render(); });
    }
    render();
  }

  C.QUIZ = C.QUIZ || {};
  C.QUIZ.nosql = [
    { q: 'Today, "NoSQL" is best read as…', opts: ['No SQL allowed', 'Not only SQL: non-relational databases, often with SQL-like languages', 'A single product'], a: 1,
      why: ['Many NoSQL databases have SQL-like query languages.', 'The 2009 meaning: non-relational, often distributed databases.', 'It is a family of very different systems.'] },
    { q: 'Adding more ordinary servers that share the data is called…', opts: ['Scaling up', 'Scaling out', 'Normalising'], a: 1,
      why: ['Scaling up is a bigger single machine.', 'Horizontal scaling: partitioning (sharding) and replication across nodes.', 'Normalisation is about design, not capacity.'] },
    { q: 'A client writes to node 1 and immediately reads the old value from node 2. This is…', opts: ['A deletion anomaly', 'A stale read under eventual consistency', 'A deadlock'], a: 1,
      why: ['Anomalies are about redundant storage in one table.', 'The write has not reached node 2 yet; it will converge.', 'Nothing is blocked.'] },
    { q: 'Which family suits campus sensor readings arriving every second?', opts: ['Graph', 'Time-series', 'Key-value'], a: 1,
      why: ['Graphs model relationships, not streams of measurements.', 'Time-stamped, append-only data queried by time window: Week 3.', 'A key-value store cannot aggregate over time windows.'] },
    { q: 'In BASE, the E stands for…', opts: ['Eventually consistent', 'Encrypted', 'Exact'], a: 0,
      why: ['Basically Available, Soft state, Eventually consistent.', 'Encryption is unrelated.', 'The point is that copies are not always exact.'] },
    { q: 'Write concern "majority" compared with w:1 is…', opts: ['Faster and less safe', 'Slower and safer', 'The same'], a: 1,
      why: ['That describes w:1.', 'The client waits for a second node, so the write survives losing the primary.', 'The explorer shows the difference in waiting time.'] }
  ];

  C.ready(function () {
    var M = { replication: replication, family: family };
    document.querySelectorAll('[data-explorer]').forEach(function (el) { var f = M[el.getAttribute('data-explorer')]; if (f) f(el); });
  });
})();
