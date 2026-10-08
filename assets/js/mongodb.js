/* COM745 MongoDB topic: interactive explorers.
   The query builder, pipeline builder and playground run on the same mongosh
   emulator (mingo) that produced the demo outputs, loaded with the shared
   university dataset from university_mongo.js. */
(function () {
  'use strict';
  var C = window.COM745, esc = C.esc;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function seg(name, options, current) {
    return '<div class="seg" role="group" aria-label="' + esc(name) + '">' + options.map(function (o) {
      return '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + (o[0] === current) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function freshShell() {
    var sh = new window.MShell.Shell();
    sh.run(C.UNI_MONGO.seed);
    sh.current = 'uni_db';
    return sh;
  }
  function fmt(v) { return window.MShell.fmt(v); }
  function docsBox(docs, max) {
    max = max || 4;
    var shown = docs.slice(0, max);
    return '<div class="console" style="white-space:pre;max-height:340px;overflow:auto">' + esc(shown.length ? fmt(shown) : '[]') + (docs.length > max ? '\n… ' + (docs.length - max) + ' more' : '') + '</div>';
  }
  function dt(caption, cols, rows) {
    return '<div class="dt"><table>' + (caption ? '<caption>' + esc(caption) + '</caption>' : '') + '<thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (v) { return v === null ? '<td class="null">NULL</td>' : '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }

  /* =================================================================
     1. Row versus document (A2)
     ================================================================= */
  function rowsVsDoc(el) {
    var sh = freshShell();
    var studs = sh.coll('students').docs, mods = sh.coll('modules').docs;
    var pick = 1001;
    function d10(d) { return d.toISOString().slice(0, 10); }
    function render() {
      var s = studs.filter(function (x) { return x._id === pick; })[0];
      var html = '<div class="controls"><label class="ctl" for="rv-s">Student<select id="rv-s">' + studs.map(function (x) {
        return '<option value="' + x._id + '"' + (x._id === pick ? ' selected' : '') + '>' + x._id + ' ' + esc(x.forename + ' ' + x.surname) + '</option>';
      }).join('') + '</select></label></div>';
      html += '<div class="grid2 two"><div class="card"><span class="k">MySQL: rows in three tables</span>' +
        dt('Student', ['StudentID', 'Forename', 'Surname', 'Mobile', 'CourseCode'], [[s._id, s.forename, s.surname, s.mobile || null, s.course]]) +
        dt('Registration', ['StudentID', 'ModuleCode', 'Semester'], s.registrations.map(function (r) { return [s._id, r.module, r.semester]; })) +
        dt('Module', ['ModuleCode', 'ModuleName'], s.registrations.map(function (r) { var m = mods.filter(function (x) { return x._id === r.module; })[0]; return [m._id, m.name]; })) +
        '<p class="note">' + (s.registrations.length ? 'A JOIN of three tables rebuilds this student.' : 'No registrations: a LEFT JOIN would show NULLs.') + '</p></div>' +
        '<div class="card"><span class="k">MongoDB: one document in students</span><div class="console" style="white-space:pre;overflow:auto;font-size:12.5px">' + esc(fmt(s)) + '</div>' +
        '<p class="note">' + (s.mobile ? '' : 'No mobile: the field is simply absent, not NULL. ') + 'Registrations are embedded; module names stay in the modules collection, referenced by code.</p></div></div>';
      el.querySelector('.body').innerHTML = html;
      $('#rv-s', el).addEventListener('change', function (e) { pick = +e.target.value; render(); });
    }
    render();
  }

  /* =================================================================
     2. Embed or reference? (A3)
     ================================================================= */
  function embedRef(el) {
    var design = 'B';
    var D = {
      A: { name: 'Reference everything (like tables)', shape: "students      { _id: 1001, forename: 'Ahmed', surname: 'Ali', course: 'MSCCST' }\nregistrations { _id: …, student: 1001, module: 'COM745', semester: 'Semester 1' }\nmodules       { _id: 'COM745', name: 'Big Data and Infrastructure', lecturerId: 1 }",
           ops: [['One student with their modules', '3 collections, 1 + 2 + 2 documents ($lookup twice)', 'mid'],
                 ['All students on COM745', '2 collections: registrations, then students ($lookup)', 'mid'],
                 ['Rename module COM745', '1 document in modules', 'good'],
                 ['Register a student on a module', 'Insert 1 document into registrations', 'good'],
                 ['Copies of a module name stored', '1', 'good']],
           note: 'The relational design in documents. Nothing is duplicated, but almost every question needs $lookup: you get MongoDB\'s costs without its main benefit.' },
      B: { name: 'Embed registrations in students (uni_db)', shape: "students { _id: 1001, forename: 'Ahmed', surname: 'Ali', course: 'MSCCST',\n           registrations: [ { module: 'COM745', semester: 'Semester 1' }, … ] }\nmodules  { _id: 'COM745', name: 'Big Data and Infrastructure', lecturerId: 1 }",
           ops: [['One student with their modules', '1 document (module names: one $lookup)', 'good'],
                 ['All students on COM745', '1 collection: filter on registrations.module', 'good'],
                 ['Rename module COM745', '1 document in modules', 'good'],
                 ['Register a student on a module', '$push into 1 student document', 'good'],
                 ['Copies of a module name stored', '1 (students store only the code)', 'good']],
           note: 'Registrations belong to one student, are read with the student and stay small, so they are embedded. Shared data (module names, lecturers) is referenced. This is uni_db.' },
      C: { name: 'Embed student details in modules', shape: "modules { _id: 'COM745', name: 'Big Data and Infrastructure',\n          students: [ { id: 1001, name: 'Ahmed Ali', email: 'ahmed.ali@…' }, … ] }",
           ops: [['One student with their modules', 'Scan every module for the student', 'bad'],
                 ['All students on COM745', '1 document', 'good'],
                 ['Rename module COM745', '1 document', 'good'],
                 ['Register a student on a module', '$push into 1 module document', 'good'],
                 ['Copies of a student\'s name stored', 'one per module they take (Ahmed: 2)', 'bad']],
           note: 'Rosters are instant, but a student\'s details are copied into every module they take. Change Ahmed\'s email and you must update every copy: the Week 1 update anomaly is back.' }
    };
    var COL = { good: 'var(--core)', mid: 'var(--chal)', bad: 'var(--bad)' };
    function render() {
      var d = D[design];
      var html = '<div class="controls"><div class="ctl">Design' + seg('Design', [['A', 'A · reference all'], ['B', 'B · embed registrations'], ['C', 'C · embed students in modules']], design) + '</div></div>';
      html += '<div class="console" style="white-space:pre;overflow-x:auto">' + esc(d.shape) + '</div>';
      html += '<div class="tbl"><table><thead><tr><th>Question or change</th><th>What it costs in design ' + design + '</th></tr></thead><tbody>' + d.ops.map(function (o) {
        return '<tr><td>' + esc(o[0]) + '</td><td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + COL[o[2]] + ';margin-right:8px"></span>' + esc(o[1]) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="callout">' + esc(d.note) + '</p>';
      el.querySelector('.body').innerHTML = html;
      el.querySelectorAll('.seg button').forEach(function (b) { b.addEventListener('click', function () { design = b.dataset.v; render(); }); });
    }
    render();
  }

  /* =================================================================
     3. Query builder (A4): build a filter, see SQL and results
     ================================================================= */
  function queryBuilder(el) {
    var sh = freshShell();
    var FIELDS = {
      course: { sql: 'CourseCode', type: 's', vals: ['MSCCST', 'MSCDS', 'BSCCS'] },
      level: { sql: 'EnrolmentLevel', type: 'n', vals: ['6', '7'] },
      surname: { sql: 'Surname', type: 's', vals: ['Khan', 'Brown', 'Ali'] },
      mobile: { sql: 'Mobile', type: 's', vals: ['07700 900123'] },
      'registrations.module': { sql: 'r.ModuleCode', type: 's', vals: ['COM745', 'COM746', 'COM747', 'COM748', 'COM760'] }
    };
    var OPS = [['eq', '='], ['ne', '≠ ($ne)'], ['gt', '> ($gt)'], ['lt', '< ($lt)'], ['in', 'in list ($in)'], ['exists', 'field exists'], ['missing', 'field missing'], ['regex', 'starts with (regex)']];
    var st = { f: 'course', op: 'eq', v: 'MSCDS', sort: 'surname' };
    function lit(f, v) { return FIELDS[f].type === 'n' ? String(+v) : "'" + v.replace(/'/g, "\\'") + "'"; }
    function build() {
      var f = st.f, k = f.indexOf('.') >= 0 ? "'" + f + "'" : f, v = st.v, cond, sqlw;
      var col = FIELDS[f].sql;
      switch (st.op) {
        case 'eq': cond = lit(f, v); sqlw = col + ' = ' + lit(f, v); break;
        case 'ne': cond = '{ $ne: ' + lit(f, v) + ' }'; sqlw = col + ' <> ' + lit(f, v); break;
        case 'gt': cond = '{ $gt: ' + lit(f, v) + ' }'; sqlw = col + ' > ' + lit(f, v); break;
        case 'lt': cond = '{ $lt: ' + lit(f, v) + ' }'; sqlw = col + ' < ' + lit(f, v); break;
        case 'in': var parts = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean); cond = '{ $in: [' + parts.map(function (x) { return lit(f, x); }).join(', ') + '] }'; sqlw = col + ' IN (' + parts.map(function (x) { return lit(f, x); }).join(', ') + ')'; break;
        case 'exists': cond = '{ $exists: true }'; sqlw = col + ' IS NOT NULL'; break;
        case 'missing': cond = '{ $exists: false }'; sqlw = col + ' IS NULL'; break;
        case 'regex': cond = '/^' + v.replace(/[^A-Za-z0-9 ]/g, '') + '/'; sqlw = col + " LIKE '" + v.replace(/'/g, '') + "%'"; break;
      }
      var mongo = 'db.students.find(\n  { ' + k + ': ' + cond + ' },\n  { forename: 1, surname: 1, ' + (f === 'registrations.module' ? "'registrations.module': 1" : (f === 'surname' ? 'course: 1' : f + ': 1')) + ' }\n).sort({ ' + st.sort + ': 1 })';
      var from = f === 'registrations.module' ? 'Student s JOIN Registration r ON r.StudentID = s.StudentID' : 'Student s';
      var sql = 'SELECT ' + (f === 'registrations.module' ? 'DISTINCT ' : '') + 's.StudentID, s.Forename, s.Surname\nFROM ' + from + '\nWHERE ' + sqlw.replace(/^(?!r\.)/, 's.') + '\nORDER BY s.' + (st.sort === 'surname' ? 'Surname' : 'StudentID') + ';';
      return { mongo: mongo, sql: sql };
    }
    function render() {
      var q = build();
      var r = sh.run(q.mongo)[0];
      var html = '<div class="controls">' +
        '<label class="ctl" for="qb-f">Field<select id="qb-f">' + Object.keys(FIELDS).map(function (f) { return '<option' + (f === st.f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></label>' +
        '<label class="ctl" for="qb-op">Condition<select id="qb-op">' + OPS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === st.op ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>' +
        (st.op === 'exists' || st.op === 'missing' ? '' : '<label class="ctl" for="qb-v">Value' + (st.op === 'in' ? ' (comma-separated)' : '') + '<input id="qb-v" type="text" value="' + esc(st.v) + '" list="qb-vals"></label><datalist id="qb-vals">' + FIELDS[st.f].vals.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>') +
        '<div class="ctl">Sort by' + seg('Sort by', [['surname', 'surname'], ['_id', '_id']], st.sort) + '</div></div>';
      html += '<div class="grid2 two"><div><span class="note">mongosh</span><div class="code" data-lang="mongosh"><pre>' + esc(q.mongo) + '</pre></div></div>' +
        '<div><span class="note">The same question in SQL (Week 1 tables)</span><div class="code" data-lang="sql"><pre>' + esc(q.sql) + '</pre></div></div></div>';
      html += '<div class="output emu"><div class="output-head"><span class="badge b-emu">Run on the MongoDB emulator</span><span>' + (r.error ? '' : (r.text ? (r.text.match(/_id:/g) || []).length + ' document(s)' : 'no documents')) + '</span></div><pre>' + esc(r.error || r.text || '(no documents match)') + '</pre></div>';
      el.querySelector('.body').innerHTML = html;
      C.decorateCode(el);
      $('#qb-f', el).addEventListener('change', function (e) { st.f = e.target.value; st.v = FIELDS[st.f].vals[0]; if (FIELDS[st.f].type !== 'n' && (st.op === 'gt' || st.op === 'lt')) st.op = 'eq'; render(); });
      $('#qb-op', el).addEventListener('change', function (e) { st.op = e.target.value; render(); });
      var v = $('#qb-v', el);
      if (v) v.addEventListener('change', function (e) { st.v = e.target.value; render(); });
      el.querySelectorAll('.seg button').forEach(function (b) { b.addEventListener('click', function () { st.sort = b.dataset.v; render(); }); });
    }
    render();
  }

  /* =================================================================
     4. Aggregation pipeline builder (A6)
     ================================================================= */
  function pipelineBuilder(el) {
    var sh = freshShell();
    var STAGES = [
      { on: true, label: '$match MSc students', sql: 'WHERE', code: "{ $match: { course: { $in: ['MSCCST', 'MSCDS'] } } }" },
      { on: true, label: '$unwind registrations', sql: '(rows from an array)', code: "{ $unwind: '$registrations' }" },
      { on: true, label: '$group by module', sql: 'GROUP BY', code: "{ $group: { _id: '$registrations.module', students: { $sum: 1 } } }" },
      { on: false, label: '$match groups with ≥ 6', sql: 'HAVING', code: "{ $match: { students: { $gte: 6 } } }" },
      { on: true, label: '$sort busiest first', sql: 'ORDER BY', code: "{ $sort: { students: -1, _id: 1 } }" },
      { on: false, label: '$limit 3', sql: 'LIMIT', code: '{ $limit: 3 }' }
    ];
    function render() {
      var active = STAGES.filter(function (s) { return s.on; });
      var html = '<ol class="tasks">';
      var docsSoFar = sh.coll('students').docs.length;
      html += '<li class="task" style="padding:10px 14px"><div><b>db.students</b> <span class="note">· ' + docsSoFar + ' documents in</span></div></li>';
      STAGES.forEach(function (s, i) {
        var res = null, err = null, n = 0;
        if (s.on) {
          var upto = STAGES.slice(0, i + 1).filter(function (x) { return x.on; }).map(function (x) { return x.code; });
          try {
            var docs = sh.coll('students').aggregate(window.MShell.evalNoFunction('[' + upto.join(', ') + ']', {})).toArray();
            n = docs.length; res = docs.length ? fmt(docs.slice(0, 8)) + (docs.length > 8 ? '\n… ' + (docs.length - 8) + ' more' : '') : '';
          } catch (e) { err = String(e.message || e); }
        }
        html += '<li class="task" style="padding:10px 14px;' + (s.on ? '' : 'opacity:.6') + '"><div class="controls" style="justify-content:space-between;align-items:center">' +
          '<label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" data-i="' + i + '"' + (s.on ? ' checked' : '') + '> <code>' + esc(s.code) + '</code></label>' +
          '<span class="btns"><button type="button" data-up="' + i + '" aria-label="Move stage up"' + (i ? '' : ' disabled') + '>↑</button><button type="button" data-down="' + i + '" aria-label="Move stage down"' + (i < STAGES.length - 1 ? '' : ' disabled') + '>↓</button></span></div>' +
          '<span class="note">SQL equivalent: ' + esc(s.sql) + (s.on ? ' · ' + (err ? 'error' : n + ' document' + (n === 1 ? '' : 's') + ' out') : ' · switched off') + '</span>' +
          (s.on ? '<details' + (i === STAGES.length - 1 || s === active[active.length - 1] ? ' open' : '') + '><summary>Show documents</summary><div class="console" style="white-space:pre;max-height:260px;overflow:auto">' + esc(err || res || '[] (nothing passes this stage)') + '</div></details>' : '') + '</li>';
      });
      html += '</ol><div class="code" data-lang="mongosh"><pre>' + esc('db.students.aggregate([\n  ' + active.map(function (s) { return s.code; }).join(',\n  ') + '\n])') + '</pre></div>';
      el.querySelector('.body').innerHTML = html;
      C.decorateCode(el);
      el.querySelectorAll('input[data-i]').forEach(function (cb) { cb.addEventListener('change', function () { STAGES[+cb.dataset.i].on = cb.checked; render(); }); });
      el.querySelectorAll('[data-up]').forEach(function (b) { b.addEventListener('click', function () { var i = +b.dataset.up; var t = STAGES[i - 1]; STAGES[i - 1] = STAGES[i]; STAGES[i] = t; render(); }); });
      el.querySelectorAll('[data-down]').forEach(function (b) { b.addEventListener('click', function () { var i = +b.dataset.down; var t = STAGES[i + 1]; STAGES[i + 1] = STAGES[i]; STAGES[i] = t; render(); }); });
    }
    render();
  }

  /* =================================================================
     5. mongosh playground (C1)
     ================================================================= */
  var PG = { el: null, sh: null };
  var PRESETS = [
    ['show collections', 'show collections'],
    ['One student', 'db.students.findOne({ _id: 1001 })'],
    ['Students on COM745', "db.students.find({ 'registrations.module': 'COM745' }, { forename: 1, surname: 1 })"],
    ['No mobile', 'db.students.countDocuments({ mobile: { $exists: false } })'],
    ['Per course', "db.students.aggregate([\n  { $group: { _id: '$course', students: { $sum: 1 } } },\n  { $sort: { _id: 1 } }\n])"],
    ['Module + lecturer', "db.modules.aggregate([\n  { $lookup: { from: 'lecturers', localField: 'lecturerId', foreignField: '_id', as: 'lec' } },\n  { $project: { name: 1, lecturer: { $first: '$lec.name.surname' } } }\n])"],
    ['The replacement trap', "db.students.update({ _id: 1003 }, { status: 'Withdrawn' })\ndb.students.findOne({ _id: 1003 })"],
    ['Duplicate _id', "db.modules.insertOne({ _id: 'COM745', name: 'Copy' })"],
    ['Add inventory', null]
  ];
  function pgRun() {
    var code = $('textarea', PG.el).value, out = $('.result', PG.el);
    C.store.set('mpg:last', code);
    var res = PG.sh.run(code), html = '';
    if (!res.length) { out.innerHTML = '<p class="msg">Type a command, then press Run (or Ctrl+Enter).</p>'; return; }
    res.forEach(function (r) {
      var first = r.src.split('\n')[0]; if (first.length > 90) first = first.slice(0, 88) + '…';
      html += '<div class="msg">' + esc(r.db + '> ' + first + (r.src.indexOf('\n') > 0 ? ' …' : '')) + '</div>';
      (r.warnings || []).forEach(function (w) { html += '<div class="msg" style="color:var(--chal)">' + esc(w) + '</div>'; });
      if (r.error) html += '<div class="msg err">' + esc(r.error) + '</div>';
      else if (r.text) html += '<div class="console" style="white-space:pre;overflow:auto;max-height:420px">' + esc(r.text) + '</div>';
      if (r.note) html += '<div class="msg">' + esc(r.note) + '</div>';
    });
    out.innerHTML = html;
    pgSchema();
  }
  function pgSchema() {
    var box = $('.schema', PG.el), sh = PG.sh;
    var names = sh._visibleColls(sh.current);
    box.innerHTML = '<span style="font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700">' + esc(sh.current) + '</span>' +
      (names.length ? names.map(function (n) {
        var c = sh.coll(n), keys = {};
        c.docs.slice(0, 50).forEach(function (d) { Object.keys(d).forEach(function (k) { keys[k] = (keys[k] || 0) + 1; }); });
        return '<details><summary>' + esc(n) + ' <span style="color:var(--muted);font-weight:400">(' + c.docs.length + ')</span></summary><ul>' + Object.keys(keys).map(function (k) {
          return '<li' + (k === '_id' ? ' class="pk"' : '') + '>' + esc(k) + (keys[k] < Math.min(50, c.docs.length) ? ' <i>(some)</i>' : '') + '</li>';
        }).join('') + '</ul></details>';
      }).join('') : '<p class="note">No collections yet.</p>');
  }
  function playground(el) {
    PG.el = el;
    el.querySelector('.body').innerHTML =
      '<div class="presets" aria-label="Example commands">' + PRESETS.map(function (p, i) { return '<button type="button" data-p="' + i + '">' + esc(p[0]) + '</button>'; }).join('') + '</div>' +
      '<div class="play"><div class="schema"></div><div style="display:flex;flex-direction:column;gap:10px;min-width:0">' +
      '<label class="visually-hidden" for="mpg-code">mongosh commands to run</label><textarea id="mpg-code" class="sql" spellcheck="false"></textarea>' +
      '<div class="controls"><button type="button" class="btn primary" data-run>Run (Ctrl+Enter)</button><button type="button" class="btn" data-reset>Reset data</button><span class="note">One command per line; a line starting with . continues the one above.</span></div>' +
      '<div class="result" aria-live="polite"></div></div></div>';
    if (!window.MShell) { $('.schema', el).innerHTML = '<p class="msg err">The emulator did not load (assets/vendor/mongo-engine.js).</p>'; return; }
    PG.sh = freshShell();
    var ta = $('textarea', el);
    ta.value = C.store.get('mpg:last', PRESETS[2][1]);
    el.querySelectorAll('[data-p]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = PRESETS[+b.dataset.p];
        ta.value = p[1] === null ? C.UNI_MONGO.inventory + "\ndb.inventory.find({ status: 'A', qty: { $gt: 10, $lt: 30 } })" : p[1];
        pgRun();
      });
    });
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); pgRun(); } });
    $('[data-run]', el).addEventListener('click', pgRun);
    $('[data-reset]', el).addEventListener('click', function () { PG.sh = freshShell(); pgSchema(); $('.result', el).innerHTML = '<p class="msg okm">uni_db reloaded from university_mongo.js.</p>'; });
    pgRun();
  }
  C.mongoPlayground = { load: function (code) { if (!PG.el) return; $('textarea', PG.el).value = code; PG.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); pgRun(); } };

  var MOUNTS = { rowsdoc: rowsVsDoc, embed: embedRef, querybuilder: queryBuilder, pipeline: pipelineBuilder, mplayground: playground };
  C.ready(function () {
    document.querySelectorAll('[data-explorer]').forEach(function (el) { var f = MOUNTS[el.getAttribute('data-explorer')]; if (f) f(el); });
    document.querySelectorAll('[data-try-mongo]').forEach(function (b) {
      b.addEventListener('click', function () { C.mongoPlayground.load(b.closest('.task, .card, details').querySelector('[data-lang=mongosh] pre').textContent); });
    });
  });
})();
