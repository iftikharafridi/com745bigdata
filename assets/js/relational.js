/* COM745 Relational & MySQL topic: interactive explorers.
   Every explorer works from the shared university dataset (same IDs and
   names as university_seed.sql). Simulations are labelled as such on the
   page; the SQL playground runs a real SQLite engine (sql.js) in the
   browser, with MySQL-style messages for the common errors. */
(function () {
  'use strict';
  var C = window.COM745, esc = C.esc;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function h(tag, attrs, html) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function table(caption, cols, rows, opt) {
    opt = opt || {};
    var t = '<div class="dt"><table>' + (caption ? '<caption>' + caption + '</caption>' : '') + '<thead><tr>';
    cols.forEach(function (c, i) {
      var cls = (opt.pk && opt.pk.indexOf(i) >= 0) ? 'pk' : ((opt.fk && opt.fk.indexOf(i) >= 0) ? 'fk' : '');
      t += '<th' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(c) + (cls === 'pk' ? ' 🔑' : '') + '</th>';
    });
    t += '</tr></thead><tbody>';
    rows.forEach(function (r, ri) {
      var rc = opt.rowClass ? opt.rowClass(r, ri) : '';
      t += '<tr' + (rc ? ' class="' + rc + '"' : '') + (opt.rowAttr ? ' ' + opt.rowAttr(r, ri) : '') + '>';
      r.forEach(function (v, ci) {
        var cc = opt.cellClass ? opt.cellClass(r, ri, ci) : '';
        if (v === null || v === undefined) t += '<td class="null' + (cc ? ' ' + cc : '') + '">NULL</td>';
        else t += '<td' + (cc ? ' class="' + cc + '"' : '') + '>' + esc(v) + '</td>';
      });
      t += '</tr>';
    });
    if (!rows.length) t += '<tr><td colspan="' + cols.length + '" class="null">(no rows)</td></tr>';
    return t + '</tbody></table></div>';
  }
  function seg(name, options, current) {
    return '<div class="seg" role="group" aria-label="' + esc(name) + '">' + options.map(function (o) {
      return '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + (o[0] === current) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function bindSeg(root, sel, fn) {
    root.querySelectorAll(sel + ' button').forEach(function (b) {
      b.addEventListener('click', function () { fn(b.getAttribute('data-v')); });
    });
  }

  /* =================================================================
     1. Data classifier (A1 activity)
     ================================================================= */
  function classifier(el) {
    var items = [
      ['A bank transaction table', 'S', 'Fixed columns; every row has the same shape.'],
      ['A JSON response from an API', 'M', 'Keys label each value, but records can differ in shape.'],
      ['A lecture recording on YouTube', 'U', 'No data model; it needs processing (speech-to-text, vision) before analysis.'],
      ['A tidy student spreadsheet', 'S', 'Rows and columns with one value per cell.'],
      ['An email asking for an extension', 'M', 'Headers (From, To, Date) are structured; the body is free text. Accept "unstructured" with that reasoning.'],
      ['An Instagram photo', 'U', 'Pixels. Its likes and tags are semi-structured metadata stored beside it.'],
      ['A web server log', 'M', 'Consistent fields on each line, but no schema enforced by a database.']
    ];
    var pick = {};
    function render() {
      var html = '<div class="tbl"><table><thead><tr><th>Item</th><th>Your answer</th></tr></thead><tbody>';
      items.forEach(function (it, i) {
        html += '<tr><td>' + esc(it[0]) + '<div class="note" data-fb="' + i + '"></div></td><td>' +
          seg('Kind of data for ' + it[0], [['S', 'Structured'], ['M', 'Semi'], ['U', 'Unstructured']], pick[i]) + '</td></tr>';
      });
      html += '</tbody></table></div><div class="controls"><button type="button" class="btn primary" data-check>Check answers</button><button type="button" class="btn" data-reset>Clear</button><span class="note" data-score></span></div>';
      el.querySelector('.body').innerHTML = html;
      items.forEach(function (it, i) {
        el.querySelectorAll('.body tr')[i + 1].querySelectorAll('.seg button').forEach(function (b) {
          b.addEventListener('click', function () { pick[i] = b.dataset.v; render(); });
        });
      });
      el.querySelector('[data-check]').addEventListener('click', function () {
        var right = 0;
        items.forEach(function (it, i) {
          var fb = el.querySelector('[data-fb="' + i + '"]');
          var ok = pick[i] === it[1];
          if (ok) right++;
          fb.innerHTML = pick[i] ? (ok ? '<b style="color:var(--core)">Yes.</b> ' : '<b style="color:var(--bad)">Look again.</b> ') + esc(it[2]) : 'Not answered yet.';
        });
        el.querySelector('[data-score]').textContent = right + ' of ' + items.length + ' match the model answer.';
      });
      el.querySelector('[data-reset]').addEventListener('click', function () { pick = {}; render(); });
    }
    render();
  }

  /* =================================================================
     2. Keys explorer (A5)
     ================================================================= */
  function keysExplorer(el) {
    var cols = ['StudentID', 'Email', 'NationalNo', 'Forename', 'Surname', 'CourseCode'];
    var rows = [
      [1001, 'ahmed.ali@…', 'NS-58213', 'Ahmed', 'Ali', 'MSCCST'],
      [1002, 'sarah.khan@…', 'NS-58377', 'Sarah', 'Khan', 'MSCCST'],
      [1018, 'emma.brown@…', 'NS-60122', 'Emma', 'Brown', 'MSCDS'],
      [1027, 'john.brown@…', 'NS-61009', 'John', 'Brown', 'MSCCST'],
      [1028, 'john.brown2@…', 'NS-61544', 'John', 'Brown', 'BSCCS'],
      [1013, 'wei.zhang@…', 'NS-59990', 'Wei', 'Zhang', 'MSCDS']
    ];
    // candidate keys come from the business rules, not from today's rows
    var ruleKeys = [['StudentID'], ['Email'], ['NationalNo']];
    var sel = { StudentID: true };
    function render() {
      var chosen = cols.filter(function (c) { return sel[c]; });
      var idx = chosen.map(function (c) { return cols.indexOf(c); });
      var seen = {}, dups = {};
      rows.forEach(function (r, ri) {
        var k = idx.map(function (i) { return r[i]; }).join('|');
        if (seen[k] !== undefined) { dups[ri] = 1; dups[seen[k]] = 1; } else seen[k] = ri;
      });
      var unique = chosen.length && !Object.keys(dups).length;
      var containsRule = ruleKeys.filter(function (rk) { return rk.every(function (c) { return sel[c]; }); });
      var verdict, cls;
      if (!chosen.length) { verdict = 'Tick one or more columns.'; cls = ''; }
      else if (!unique) { verdict = '<b>Not a key.</b> The highlighted rows share the same value(s), so these columns cannot tell them apart.'; cls = 'bad'; }
      else if (containsRule.length && containsRule.some(function (rk) { return rk.length === chosen.length; })) {
        verdict = '<b>Candidate key.</b> Unique by the business rules and minimal: drop any column and it stops being guaranteed unique. ' +
          (sel.StudentID && chosen.length === 1 ? 'This is the one we chose as the <b>primary key</b>.' : 'Not chosen as the PK, so it becomes an <b>alternate key</b>, enforced with UNIQUE.');
        cls = 'good';
      } else if (containsRule.length) {
        verdict = '<b>Super key, but not a candidate key.</b> It is unique, but it is not minimal: ' + esc(containsRule[0].join(', ')) + ' alone is already unique.'; cls = 'warn';
      } else {
        verdict = '<b>Unique today, but not a key.</b> No two of these rows clash right now, but nothing in the business rules guarantees it. The next John Brown on the same course would break it. Keys come from the rules, not from the current data.'; cls = 'warn';
      }
      var html = '<div class="controls">' + cols.map(function (c) {
        return '<label class="ctl" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-c="' + c + '"' + (sel[c] ? ' checked' : '') + '> <span style="font-family:var(--f-mono);color:var(--ink)">' + c + '</span></label>';
      }).join('') + '</div>';
      html += table('Student (sample rows)', cols, rows, {
        cellClass: function (r, ri, ci) { return sel[cols[ci]] ? 'hl' : ''; },
        rowClass: function (r, ri) { return dups[ri] ? 'gone' : ''; }
      });
      html += '<div class="callout ' + cls + '" aria-live="polite">' + verdict + '</div>';
      el.querySelector('.body').innerHTML = html;
      el.querySelectorAll('input[data-c]').forEach(function (cb) {
        cb.addEventListener('change', function () { sel[cb.dataset.c] = cb.checked; render(); });
      });
    }
    render();
  }

  /* =================================================================
     3. ER builder and mapper (A7-A8)
     ================================================================= */
  var ER_PRESETS = {
    delivers: { label: 'Lecturer delivers Module', A: { n: 'LECTURER', key: 'LecturerID', atts: ['Surname', 'Email'] }, B: { n: 'MODULE', key: 'ModuleCode', atts: ['ModuleName', 'Credits'] }, rel: 'DELIVERS', card: '1:N', pA: 'partial', pB: 'total', ratts: [] },
    registers: { label: 'Student registers for Module', A: { n: 'STUDENT', key: 'StudentID', atts: ['Forename', 'Surname'] }, B: { n: 'MODULE', key: 'ModuleCode', atts: ['ModuleName'] }, rel: 'REGISTERS', card: 'M:N', pA: 'partial', pB: 'partial', ratts: ['RegistrationDate', 'Semester'] },
    coordinates: { label: 'Lecturer coordinates Course', A: { n: 'LECTURER', key: 'LecturerID', atts: ['Surname'] }, B: { n: 'COURSE', key: 'CourseCode', atts: ['CourseName', 'AccreditationLevel'] }, rel: 'COORDINATES', card: '1:N', pA: 'partial', pB: 'total', ratts: [] },
    consists: { label: 'Course consists of Module', A: { n: 'COURSE', key: 'CourseCode', atts: ['CourseName'] }, B: { n: 'MODULE', key: 'ModuleCode', atts: ['ModuleName'] }, rel: 'CONSISTS_OF', card: 'M:N', pA: 'total', pB: 'partial', ratts: [] },
    passport: { label: 'Person holds Passport (1:1)', A: { n: 'PERSON', key: 'PersonID', atts: ['Name'] }, B: { n: 'PASSPORT', key: 'PassportNo', atts: ['ExpiryDate'] }, rel: 'HOLDS', card: '1:1', pA: 'partial', pB: 'total', ratts: [] },
    dependent: { label: 'Employee has Dependent (weak entity)', A: { n: 'EMPLOYEE', key: 'EmployeeID', atts: ['Name'] }, B: { n: 'DEPENDENT', key: 'DependentName', atts: ['Relationship'] }, rel: 'HAS', card: '1:N', pA: 'partial', pB: 'total', ratts: [], weak: true }
  };
  function erBuilder(el) {
    var st = JSON.parse(JSON.stringify(ER_PRESETS.delivers));
    st.preset = 'delivers'; st.mv = false; st.der = false;
    function cap(s) { return s.charAt(0) + s.slice(1).toLowerCase(); }
    function svg() {
      var A = st.A, B = st.B, W = 760, H = (st.mv || st.der || st.ratts.length) ? 322 : 236;
      var ax = 70, bx = 540, ey = 140, ew = 150, eh = 50, dx = 380, dy = 165, dw = 74, dh = 38;
      var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Chen ER diagram: ' + esc(A.n + ' ' + st.rel + ' ' + B.n) + '" style="min-width:560px">';
      function ent(x, name, weak) {
        var r = '<rect class="ent" x="' + x + '" y="' + ey + '" width="' + ew + '" height="' + eh + '" rx="2"/>';
        if (weak) r += '<rect class="ent" x="' + (x + 5) + '" y="' + (ey + 5) + '" width="' + (ew - 10) + '" height="' + (eh - 10) + '" rx="1" fill="none"/>';
        return r + '<text class="t" x="' + (x + ew / 2) + '" y="' + (ey + 30) + '" text-anchor="middle" font-weight="700">' + esc(name) + '</text>';
      }
      function att(cx, cy, label, kind) {
        var rx = Math.max(46, label.length * 4.3 + 14), out = '';
        out += '<ellipse class="att" cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="17"' + (kind === 'der' ? ' stroke-dasharray="5 4"' : '') + '/>';
        if (kind === 'mv') out += '<ellipse class="att" cx="' + cx + '" cy="' + cy + '" rx="' + (rx - 5) + '" ry="12" fill="none"/>';
        var cls = (kind === 'key' || kind === 'pkey') ? 'tk' : 'tm';
        out += '<text class="' + cls + '" x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle"' + (kind === 'pkey' ? ' text-decoration="none"' : '') + '>' + esc(label) + '</text>';
        if (kind === 'pkey') out += '<line x1="' + (cx - label.length * 3.4) + '" x2="' + (cx + label.length * 3.4) + '" y1="' + (cy + 7) + '" y2="' + (cy + 7) + '" stroke="var(--ink)" stroke-dasharray="4 3"/>';
        return out;
      }
      function link(x1, y1, x2, y2, dbl) {
        if (!dbl) return '<line class="edge" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
        var dxl = x2 - x1, dyl = y2 - y1, len = Math.sqrt(dxl * dxl + dyl * dyl) || 1, ox = -dyl / len * 3, oy = dxl / len * 3;
        return '<line class="edge" x1="' + (x1 + ox) + '" y1="' + (y1 + oy) + '" x2="' + (x2 + ox) + '" y2="' + (y2 + oy) + '"/>' +
               '<line class="edge" x1="' + (x1 - ox) + '" y1="' + (y1 - oy) + '" x2="' + (x2 - ox) + '" y2="' + (y2 - oy) + '"/>';
      }
      // attributes above each entity
      function attsFor(E, x, isWeak) {
        var list = [[E.key, isWeak ? 'pkey' : 'key']].concat(E.atts.map(function (a) { return [a, 'n']; }));
        var out = '', n = list.length, span = 200, start = x + ew / 2 - span / 2;
        list.forEach(function (a, i) {
          var rx0 = Math.max(46, a[0].length * 4.3 + 14);
          var cx = n === 1 ? x + ew / 2 : start + span * i / (n - 1), cy = 52 + (i % 2) * 34;
          cx = Math.max(rx0 + 6, Math.min(W - rx0 - 6, cx));
          out += '<line class="edge" x1="' + cx + '" y1="' + (cy + 17) + '" x2="' + (x + ew / 2) + '" y2="' + ey + '" stroke-width="1"/>';
          out += att(cx, cy, a[0], a[1]);
        });
        return out;
      }
      s += attsFor(A, ax, false) + attsFor(B, bx, !!st.weak);
      if (st.mv) { s += '<line class="edge" x1="' + (ax + 40) + '" y1="' + (ey + eh) + '" x2="70" y2="262" stroke-width="1"/>' + att(70, 278, 'Phone', 'mv'); }
      if (st.der) { s += '<line class="edge" x1="' + (ax + 110) + '" y1="' + (ey + eh) + '" x2="185" y2="262" stroke-width="1"/>' + att(190, 278, 'Age', 'der'); }
      // relationship
      var parts = st.card.split(':'), cA = parts[0], cB = parts[1];
      s += link(ax + ew, ey + eh / 2, dx - dw, dy, st.pA === 'total');
      s += link(dx + dw, dy, bx, ey + eh / 2, st.pB === 'total');
      s += '<polygon class="rel" points="' + (dx - dw) + ',' + dy + ' ' + dx + ',' + (dy - dh) + ' ' + (dx + dw) + ',' + dy + ' ' + dx + ',' + (dy + dh) + '"/>';
      if (st.weak) s += '<polygon class="rel" fill="none" points="' + (dx - dw + 9) + ',' + dy + ' ' + dx + ',' + (dy - dh + 6) + ' ' + (dx + dw - 9) + ',' + dy + ' ' + dx + ',' + (dy + dh - 6) + '"/>';
      s += '<text class="t" x="' + dx + '" y="' + (dy + 5) + '" text-anchor="middle" font-size="12.5" font-weight="700">' + esc(st.rel) + '</text>';
      s += '<text class="card-lab" x="' + (ax + ew + 14) + '" y="' + (ey + eh / 2 - 8) + '">' + cA + '</text>';
      s += '<text class="card-lab" x="' + (bx - 22) + '" y="' + (ey + eh / 2 - 8) + '">' + cB + '</text>';
      st.ratts.forEach(function (r, i) {
        var cx = dx - 70 + i * 140 - (st.ratts.length === 1 ? -70 : 0), cy = 280;
        s += '<line class="edge" x1="' + cx + '" y1="' + (cy - 17) + '" x2="' + dx + '" y2="' + (dy + dh) + '" stroke-width="1"/>' + att(cx, cy, r, 'n');
      });
      s += ent(ax, A.n, false) + ent(bx, B.n, !!st.weak);
      // legend
      s += '<text class="tm" x="' + (W - 12) + '" y="' + (H - 8) + '" text-anchor="end" font-size="12">double line = total participation (must) · single = partial (may)</text>';
      return s + '</svg>';
    }
    function mapping() {
      var A = st.A, B = st.B, an = cap(A.n), bn = cap(B.n), rules = [1], tables = [], notes = [];
      var tA = { n: an, cols: [[A.key, 'PK']].concat(A.atts.map(function (a) { return [a, '']; })) };
      var tB = { n: bn, cols: [[B.key, 'PK']].concat(B.atts.map(function (a) { return [a, '']; })) };
      var extra = null, card = st.card;
      if (st.weak) {
        rules.push(8);
        tB.cols = [[A.key, 'PK, FK → ' + an]].concat([[B.key, 'PK (partial key)']]).concat(B.atts.map(function (a) { return [a, '']; }));
        notes.push(bn + ' is weak: its own ' + B.key + ' is not unique (two employees can each have a child called Sara), so its key is ' + A.key + ' + ' + B.key + '.');
      } else if (card === '1:N' || card === 'N:1') {
        rules.push(5);
        var oneSide = card === '1:N' ? A : B, manyT = card === '1:N' ? tB : tA, manyPart = card === '1:N' ? st.pB : st.pA;
        manyT.cols.push([oneSide.key, 'FK → ' + cap(oneSide.n) + (manyPart === 'total' ? ', NOT NULL' : ', NULL allowed')]);
        st.ratts.forEach(function (r) { manyT.cols.push([r, '']); });
        notes.push('1:N: the foreign key goes on the N side (' + manyT.n + '). One ' + cap(oneSide.n) + ' value per row fits in one cell; a list on the 1 side would break 1NF.');
        if (manyPart === 'total') notes.push('Total participation on the N side becomes NOT NULL on the foreign key.');
        else notes.push('Partial participation on the N side: the FK may be NULL.');
      } else if (card === '1:1') {
        rules.push(7);
        var host, other;
        if (st.pB === 'total' && st.pA !== 'total') { host = tB; other = A; }
        else if (st.pA === 'total' && st.pB !== 'total') { host = tA; other = B; }
        else { host = tB; other = A; }
        host.cols.push([other.key, 'FK → ' + cap(other.n) + ', UNIQUE' + ((host === tB ? st.pB : st.pA) === 'total' ? ', NOT NULL' : '')]);
        st.ratts.forEach(function (r) { host.cols.push([r, '']); });
        if (st.pA === 'total' && st.pB === 'total') notes.push('Both sides total: the two entities could be merged into one table. Shown here as an FK with UNIQUE.');
        else notes.push('1:1: the FK goes on the side with total participation (' + host.n + '), so it never needs NULL. UNIQUE keeps the relationship one-to-one.');
      } else {
        rules.push(6);
        var rn = cap(st.rel.split('_')[0]) === 'Registers' ? 'Registration' : (an + bn);
        extra = { n: rn, cols: [[A.key, 'PK, FK → ' + an], [B.key, 'PK, FK → ' + bn]].concat(st.ratts.map(function (r) { return [r, '']; })) };
        notes.push('M:N: neither side can hold the FK (it would need a list in one cell), so a new table takes both keys as a composite primary key' + (st.ratts.length ? ', plus the relationship attributes.' : '.'));
      }
      if (st.mv) { rules.push(4); tables.push({ n: an + 'Phone', cols: [[A.key, 'PK, FK → ' + an], ['Phone', 'PK']] }); notes.push('Phone is multivalued: a separate table, keyed by the owner\'s key plus the value.'); }
      if (st.der) { rules.push(3); notes.push('Age is derived (dashed oval): store DateOfBirth instead and calculate Age when needed.'); if (tA.cols.map(function (c) { return c[0]; }).indexOf('DateOfBirth') < 0) tA.cols.push(['DateOfBirth', '']); }
      tables = [tA, tB].concat(extra ? [extra] : []).concat(tables);
      return { tables: tables, rules: rules, notes: notes };
    }
    function ddl(m) {
      var types = { ID: 'INT', Code: 'VARCHAR(10)', No: 'VARCHAR(20)', Date: 'DATE', Credits: 'TINYINT', Level: 'TINYINT', Phone: 'VARCHAR(20)', Semester: 'VARCHAR(20)', DateOfBirth: 'DATE' };
      function ty(c) {
        var k = Object.keys(types).filter(function (t) { return c.slice(-t.length) === t; })[0];
        return k ? types[k] : 'VARCHAR(100)';
      }
      return m.tables.map(function (t) {
        var pk = t.cols.filter(function (c) { return /PK/.test(c[1]); }).map(function (c) { return c[0]; });
        var lines = t.cols.map(function (c) { return '  ' + c[0] + ' ' + ty(c[0]) + (/PK|NOT NULL/.test(c[1]) ? ' NOT NULL' : '') + (/UNIQUE/.test(c[1]) ? ' UNIQUE' : ''); });
        lines.push('  PRIMARY KEY (' + pk.join(', ') + ')');
        t.cols.forEach(function (c) {
          var m2 = /FK → (\w+)/.exec(c[1]);
          if (m2) lines.push('  FOREIGN KEY (' + c[0] + ') REFERENCES ' + m2[1] + ' (' + c[0] + ')');
        });
        return 'CREATE TABLE ' + t.n + ' (\n' + lines.join(',\n') + '\n);';
      }).join('\n\n');
    }
    var RULES = [
      [1, 'Strong entity → one table; its key attribute becomes the PRIMARY KEY.'],
      [2, 'Composite attribute → store only its parts (Name → Forename, Surname).'],
      [3, 'Derived attribute → usually not stored; calculate it (Age from DateOfBirth).'],
      [4, 'Multivalued attribute → new table: owner\'s PK + the value, together the PK.'],
      [5, '1:N relationship → copy the PK of the 1 side into the N side as a FOREIGN KEY.'],
      [6, 'M:N relationship → new table; PK = both foreign keys; relationship attributes go here.'],
      [7, '1:1 relationship → FK on the side with total participation, plus UNIQUE.'],
      [8, 'Weak entity → table with its partial key + the owner\'s PK as FK; PK = both.']
    ];
    function render() {
      var m = mapping();
      var html = '<div class="controls">' +
        '<label class="ctl" for="er-preset">Scenario<select id="er-preset">' + Object.keys(ER_PRESETS).map(function (k) {
          return '<option value="' + k + '"' + (k === st.preset ? ' selected' : '') + '>' + esc(ER_PRESETS[k].label) + '</option>';
        }).join('') + '</select></label>' +
        '<div class="ctl">Cardinality ' + st.A.n.toLowerCase() + ' : ' + st.B.n.toLowerCase() + seg('Cardinality', [['1:1', '1 : 1'], ['1:N', '1 : N'], ['N:1', 'N : 1'], ['M:N', 'M : N']], st.card) + '</div>' +
        '<div class="ctl">' + esc(cap(st.A.n)) + ' participation' + seg('Participation of ' + st.A.n, [['partial', 'may'], ['total', 'must']], st.pA) + '</div>' +
        '<div class="ctl">' + esc(cap(st.B.n)) + ' participation' + seg('Participation of ' + st.B.n, [['partial', 'may'], ['total', 'must']], st.pB) + '</div>' +
        '</div><div class="controls">' +
        '<label class="ctl" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" id="er-mv"' + (st.mv ? ' checked' : '') + '> add multivalued Phone to ' + esc(cap(st.A.n)) + '</label>' +
        '<label class="ctl" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" id="er-der"' + (st.der ? ' checked' : '') + '> add derived Age to ' + esc(cap(st.A.n)) + '</label>' +
        '</div>';
      html += '<div style="overflow-x:auto" class="er">' + svg() + '</div>';
      html += '<div class="grid2 two"><div class="card"><span class="k">Mapped tables</span>' + m.tables.map(function (t) {
        return '<div><b class="mono">' + esc(t.n) + '</b> (' + t.cols.map(function (c) { return '<span class="mono">' + esc(c[0]) + '</span>' + (c[1] ? ' <small style="color:var(--' + (/PK/.test(c[1]) ? 'accent' : 'c2') + ')">' + esc(c[1]) + '</small>' : ''); }).join(', ') + ')</div>';
      }).join('') + '<ul class="list note">' + m.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' +
        '<div class="card"><span class="k">Mapping rules (used ones lit)</span><div class="maprules">' + RULES.map(function (r) {
          return '<div class="maprule' + (m.rules.indexOf(r[0]) >= 0 ? ' on' : '') + '"><b>' + r[0] + '</b>' + esc(r[1]) + '</div>';
        }).join('') + '</div></div></div>';
      html += '<details><summary>Show the MySQL DDL for this design</summary><div class="code" data-lang="sql"><pre>' + esc(ddl(m)) + '</pre></div></details>';
      el.querySelector('.body').innerHTML = html;
      C.decorateCode(el);
      $('#er-preset', el).addEventListener('change', function (e) {
        st = JSON.parse(JSON.stringify(ER_PRESETS[e.target.value])); st.preset = e.target.value; st.mv = false; st.der = false; render();
      });
      var segs = el.querySelectorAll('.seg');
      bindSeg(segs[0].parentNode, '.seg', function (v) { st.card = v; if (st.weak && v !== '1:N') st.weak = false; render(); });
      bindSeg(segs[1].parentNode, '.seg', function (v) { st.pA = v; render(); });
      bindSeg(segs[2].parentNode, '.seg', function (v) { st.pB = v; render(); });
      $('#er-mv', el).addEventListener('change', function (e) { st.mv = e.target.checked; render(); });
      $('#er-der', el).addEventListener('change', function (e) { st.der = e.target.checked; render(); });
    }
    render();
  }

  /* =================================================================
     4. Normaliser: stages UNF -> 3NF and the anomaly lab (A9)
     ================================================================= */
  function normaliser(el) {
    var stage = '1NF';
    var STAGES = {
      'UNF': { note: 'Unnormalised: one cell holds a list of modules. You cannot search, count or join on part of a cell.',
        html: function () { return table('Registrations (spreadsheet)', ['StudentID', 'StudentName', 'Modules'], [[1001, 'Ahmed Ali', 'COM745, COM746'], [1002, 'Sarah Khan', 'COM745'], [1004, 'Priya Patel', 'COM745']]); } },
      '1NF': { note: '1NF: one value per cell; each row identified by (StudentID, ModuleCode). Atomic, but full of repetition: Dr Brown three times.',
        html: function () { return table('RegFlat', ['StudentID', 'StudentName', 'ModuleCode', 'ModuleName', 'LecturerID', 'LecturerName', 'RegDate'], flatBase(), { pk: [0, 2] }); } },
      '2NF': { note: '2NF removes partial dependencies: StudentName depends on StudentID alone; ModuleName and LecturerID on ModuleCode alone. Each moves to a table keyed by what it depends on.',
        html: function () {
          return '<div class="grid2">' + table('Student', ['StudentID', 'StudentName'], [[1001, 'Ahmed Ali'], [1002, 'Sarah Khan'], [1004, 'Priya Patel']], { pk: [0] }) +
            table('Module', ['ModuleCode', 'ModuleName', 'LecturerID', 'LecturerName'], [['COM745', 'Big Data', 1, 'Dr Brown'], ['COM746', 'Database Systems', 2, 'Dr Khan']], { pk: [0] }) +
            table('Registration', ['StudentID', 'ModuleCode', 'RegDate'], regsBase(), { pk: [0, 1] }) + '</div>';
        } },
      '3NF': { note: '3NF removes the transitive dependency ModuleCode → LecturerID → LecturerName: the lecturer gets a table of their own. Every fact now lives in exactly one place.',
        html: function () {
          return '<div class="grid2">' + table('Student', ['StudentID', 'StudentName'], [[1001, 'Ahmed Ali'], [1002, 'Sarah Khan'], [1004, 'Priya Patel']], { pk: [0] }) +
            table('Lecturer', ['LecturerID', 'LecturerName'], [[1, 'Dr Brown'], [2, 'Dr Khan']], { pk: [0] }) +
            table('Module', ['ModuleCode', 'ModuleName', 'LecturerID'], [['COM745', 'Big Data', 1], ['COM746', 'Database Systems', 2]], { pk: [0], fk: [2] }) +
            table('Registration', ['StudentID', 'ModuleCode', 'RegDate'], regsBase(), { pk: [0, 1] }) + '</div>';
        } }
    };
    function flatBase() {
      return [[1001, 'Ahmed Ali', 'COM745', 'Big Data', 1, 'Dr Brown', '2026-09-21'], [1001, 'Ahmed Ali', 'COM746', 'Database Systems', 2, 'Dr Khan', '2026-09-21'],
              [1002, 'Sarah Khan', 'COM745', 'Big Data', 1, 'Dr Brown', '2026-09-22'], [1004, 'Priya Patel', 'COM745', 'Big Data', 1, 'Dr Brown', '2026-09-22']];
    }
    function regsBase() { return [[1001, 'COM745', '2026-09-21'], [1001, 'COM746', '2026-09-21'], [1002, 'COM745', '2026-09-22'], [1004, 'COM745', '2026-09-22']]; }
    var lab;
    function resetLab() {
      lab = { flat: flatBase(), lect: [[1, 'Dr Brown'], [2, 'Dr Khan']], mod: [['COM745', 'Big Data', 1], ['COM746', 'Database Systems', 2]], reg: regsBase(),
              msgF: 'Choose an action. Each one is applied to both designs.', msgN: '', hlF: {}, hlN: {}, gone: null };
    }
    resetLab();
    var ACTIONS = {
      rename: function () {
        lab.flat[0][5] = 'Dr Brown-Wright'; lab.hlF = { 0: 1 };
        lab.msgF = '<b>Update anomaly.</b> Only one row was changed, so lecturer 1 now has two different names. The table contradicts itself.';
        lab.lect[0][1] = 'Dr Brown-Wright'; lab.hlN = { lect0: 1 };
        lab.msgN = '<b>One row changed.</b> The name is stored once, so every query that joins to Lecturer sees the new name.';
      },
      insert: function () {
        lab.msgF = '<b>Insertion anomaly.</b> COM750 has no students, but StudentID is part of the key and cannot be NULL. MySQL: ERROR 1048 Column \'StudentID\' cannot be null.';
        if (!lab.mod.some(function (m) { return m[0] === 'COM750'; })) lab.mod.push(['COM750', 'Artificial Intelligence', 3]);
        lab.hlN = { modnew: 1 };
        lab.msgN = '<b>Inserted.</b> A module can exist before anyone registers for it. (Lecturer 3 would need a Lecturer row first: the foreign key checks that.)';
      },
      remove: function () {
        lab.flat = lab.flat.filter(function (r) { return !(r[0] === 1001 && r[2] === 'COM746'); });
        lab.msgF = '<b>Deletion anomaly.</b> Ahmed was the only student on COM746. Deleting his row also deleted the only record that COM746 exists and that Dr Khan teaches it.';
        lab.reg = lab.reg.filter(function (r) { return !(r[0] === 1001 && r[1] === 'COM746'); });
        lab.msgN = '<b>Only the registration went.</b> COM746 and Dr Khan are still in Module and Lecturer.';
      }
    };
    function render() {
      var s = STAGES[stage];
      var html = '<div class="controls"><div class="ctl">Normal form' + seg('Normal form', [['UNF', 'UNF'], ['1NF', '1NF'], ['2NF', '2NF'], ['3NF', '3NF']], stage) + '</div></div>';
      html += s.html() + '<p class="callout">' + esc(s.note) + '</p>';
      html += '<h4>Anomaly lab: the same three changes, two designs</h4>';
      html += '<div class="controls"><button type="button" class="btn" data-a="rename">Dr Brown changes her name</button><button type="button" class="btn" data-a="insert">Add module COM750 (no students yet)</button><button type="button" class="btn" data-a="remove">Ahmed leaves COM746</button><button type="button" class="btn" data-a="reset">Reset</button></div>';
      html += '<div class="grid2 two"><div class="card"><span class="k">1NF: one wide table</span>' +
        table('', ['StudentID', 'ModuleCode', 'LecturerName'], lab.flat.map(function (r) { return [r[0], r[2], r[5]]; }), { rowClass: function (r, i) { return lab.hlF[i] ? 'hl' : ''; } }) +
        '<p class="note" aria-live="polite">' + lab.msgF + '</p></div>' +
        '<div class="card"><span class="k">3NF: separate tables</span>' +
        table('Lecturer', ['LecturerID', 'LecturerName'], lab.lect, { rowClass: function (r, i) { return lab.hlN['lect' + i] ? 'hl' : ''; } }) +
        table('Module', ['ModuleCode', 'LecturerID'], lab.mod.map(function (m) { return [m[0], m[2]]; }), { rowClass: function (r) { return (lab.hlN.modnew && r[0] === 'COM750') ? 'new' : ''; } }) +
        table('Registration', ['StudentID', 'ModuleCode'], lab.reg.map(function (r) { return [r[0], r[1]]; })) +
        '<p class="note" aria-live="polite">' + lab.msgN + '</p></div></div>';
      el.querySelector('.body').innerHTML = html;
      bindSeg(el, '.seg', function (v) { stage = v; render(); });
      el.querySelectorAll('[data-a]').forEach(function (b) {
        b.addEventListener('click', function () { if (b.dataset.a === 'reset') resetLab(); else ACTIONS[b.dataset.a](); render(); });
      });
    }
    render();
  }

  /* =================================================================
     5. SQL playground: real SQLite (sql.js) in the browser (C1)
     ================================================================= */
  var PG = { db: null, el: null, ready: null };
  var PRESETS = [
    ['All students', 'SELECT StudentID, Forename, Surname, CourseCode, Status\nFROM Student\nORDER BY Surname;'],
    ['Describe a table', 'DESCRIBE Registration;'],
    ['JOIN: students on COM747', "SELECT s.StudentID, s.Forename, s.Surname\nFROM Student s\nJOIN Registration r ON r.StudentID = s.StudentID\nWHERE r.ModuleCode = 'COM747'\nORDER BY s.Surname;"],
    ['Counts incl. empty modules', 'SELECT m.ModuleCode, m.ModuleName, COUNT(r.StudentID) AS Students\nFROM Module m\nLEFT JOIN Registration r ON r.ModuleCode = m.ModuleCode\nGROUP BY m.ModuleCode, m.ModuleName\nORDER BY Students DESC;'],
    ['Who has no modules?', 'SELECT s.StudentID, s.Forename, s.Surname\nFROM Student s\nLEFT JOIN Registration r ON r.StudentID = s.StudentID\nWHERE r.ModuleCode IS NULL;'],
    ['The NULL trap', 'SELECT COUNT(*) FROM Student WHERE Mobile = NULL;\nSELECT COUNT(*) FROM Student WHERE Mobile IS NULL;'],
    ['Break a rule', "-- Each statement breaks one business rule. Read the error numbers.\nINSERT INTO Registration (StudentID, ModuleCode, RegistrationDate, Semester)\nVALUES (9999, 'COM745', '2026-09-30', 'Semester 1');\nUPDATE Module SET Credits = -10 WHERE ModuleCode = 'COM745';\nDELETE FROM Lecturer WHERE LecturerID = 1;"],
    ['Insert, then look', "INSERT INTO Student (StudentID, Forename, Surname, Email, EnrolmentLevel, CourseCode)\nVALUES (1025, 'Noah', 'Taylor', 'noah.taylor@students.example.ac.uk', 7, 'MSCCST');\nSELECT StudentID, Forename, Surname, Status FROM Student WHERE StudentID = 1025;"]
  ];
  function splitSQL(sql) {
    var out = [], buf = '', q = null;
    for (var i = 0; i < sql.length; i++) {
      var ch = sql[i];
      if (q) { buf += ch; if (ch === q) { if (sql[i + 1] === q) { buf += sql[++i]; } else q = null; } continue; }
      if (ch === "'" || ch === '"' || ch === '`') { q = ch; buf += ch; continue; }
      if (ch === '-' && sql[i + 1] === '-') { var j = sql.indexOf('\n', i); i = j < 0 ? sql.length : j; buf += '\n'; continue; }
      if (ch === '/' && sql[i + 1] === '*') { var k = sql.indexOf('*/', i); i = k < 0 ? sql.length : k + 1; continue; }
      if (ch === ';') { if (buf.trim()) out.push(buf.trim()); buf = ''; continue; }
      buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }
  function mysqlError(msg, stmt) {
    var verb = stmt.trim().split(/\s+/)[0].toUpperCase(), m;
    if (/FOREIGN KEY constraint failed/i.test(msg)) {
      return verb === 'DELETE' ? 'ERROR 1451 (23000): Cannot delete or update a parent row: a foreign key constraint fails'
                               : 'ERROR 1452 (23000): Cannot add or update a child row: a foreign key constraint fails';
    }
    if ((m = /UNIQUE constraint failed: (\w+)\.(\w+)/i.exec(msg))) return 'ERROR 1062 (23000): Duplicate entry for key \'' + m[1] + '.' + (m[2] === 'Email' ? 'uq_' + m[1].toLowerCase() + '_email' : 'PRIMARY') + '\'';
    if ((m = /NOT NULL constraint failed: \w+\.(\w+)/i.exec(msg))) return 'ERROR 1048 (23000): Column \'' + m[1] + '\' cannot be null';
    if ((m = /CHECK constraint failed: (\w+)/i.exec(msg))) return 'ERROR 3819 (HY000): Check constraint \'' + m[1] + '\' is violated.';
    if ((m = /no such table: (\w+)/i.exec(msg))) return 'ERROR 1146 (42S02): Table \'university_db.' + m[1] + '\' doesn\'t exist';
    if ((m = /no such column: ([\w.]+)/i.exec(msg))) return 'ERROR 1054 (42S22): Unknown column \'' + m[1] + '\' in \'field list\'';
    if ((m = /ambiguous column name: ([\w.]+)/i.exec(msg))) return 'ERROR 1052 (23000): Column \'' + m[1] + '\' in field list is ambiguous';
    if (/syntax error|incomplete input/i.test(msg)) return 'ERROR 1064 (42000): You have an error in your SQL syntax';
    if (/already exists/i.test(msg)) return 'ERROR 1050 (42S01): ' + msg;
    return 'ERROR: ' + msg;
  }
  // SQLite accepts SELECT columns that are neither grouped nor aggregated; MySQL 8 refuses them.
  function groupByWarning(stmt) {
    var m = /^\s*SELECT\s+([\s\S]+?)\s+FROM\s[\s\S]*?\bGROUP\s+BY\s+([\s\S]+?)(?:\bHAVING\b|\bORDER\b|\bLIMIT\b|$)/i.exec(stmt);
    if (!m) return null;
    var depth = 0, item = '', items = [];
    for (var i = 0; i < m[1].length; i++) {
      var ch = m[1][i];
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && !depth) { items.push(item); item = ''; } else item += ch;
    }
    items.push(item);
    var grouped = m[2].toLowerCase().replace(/\s+/g, '');
    var bad = items.map(function (x) { return x.trim().replace(/\s+as\s+\w+$/i, '').replace(/\s+\w+$/, function (a) { return /^\s+(as)?$/i.test(a) ? a : ''; }); })
      .filter(function (x) { return x && x.indexOf('(') < 0 && x !== '*' && !/^'.*'$/.test(x) && !/^\d+$/.test(x); })
      .filter(function (x) {
        var col = x.toLowerCase().replace(/\s+/g, ''), bare = col.split('.').pop();
        return grouped.split(',').every(function (g) { return g !== col && g.split('.').pop() !== bare; });
      });
    return bad.length ? 'Note: MySQL 8 would refuse this with ERROR 1055, because ' + bad.join(', ') + ' is neither in GROUP BY nor inside an aggregate. SQLite runs it and picks a value from each group.' : null;
  }
  function pgExec(stmt) {
    var db = PG.db, s = stmt.replace(/\s+/g, ' ').trim(), m;
    var up = s.toUpperCase();
    if (/^USE\s+/i.test(s)) return { msg: 'Database changed (the playground holds one database: university_db).' };
    if (/^(CREATE|DROP)\s+(DATABASE|SCHEMA)/i.test(s)) return { msg: 'The playground has one fixed database. Use "Reset data" to start again.' };
    if (up === 'SHOW DATABASES') return { cols: ['Database'], rows: [['university_db']] };
    if (up === 'SHOW TABLES') {
      var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      return { cols: ['Tables_in_university_db'], rows: r.length ? r[0].values : [] };
    }
    if ((m = /^(?:DESCRIBE|DESC|SHOW COLUMNS FROM)\s+(\w+)$/i.exec(s))) {
      var info = db.exec('PRAGMA table_info(' + m[1] + ')');
      if (!info.length) throw new Error('no such table: ' + m[1]);
      var fks = db.exec('PRAGMA foreign_key_list(' + m[1] + ')'), fkc = {};
      if (fks.length) fks[0].values.forEach(function (v) { fkc[v[3]] = 1; });
      return { cols: ['Field', 'Type', 'Null', 'Key', 'Default'], rows: info[0].values.map(function (v) {
        return [v[1], v[2].toLowerCase(), v[3] ? 'NO' : 'YES', v[5] ? 'PRI' : (fkc[v[1]] ? 'MUL' : ''), v[4] === null ? null : String(v[4]).replace(/^'|'$/g, '')];
      }) };
    }
    if ((m = /^SHOW INDEX(?:ES)? FROM (\w+)$/i.exec(s))) {
      var il = db.exec('PRAGMA index_list(' + m[1] + ')');
      return { cols: ['Table', 'Key_name', 'Non_unique', 'Origin'], rows: il.length ? il[0].values.map(function (v) { return [m[1], v[1], v[2] ? 0 : 1, { pk: 'PRIMARY KEY', u: 'UNIQUE', c: 'CREATE INDEX' }[v[3]] || v[3]]; }) : [],
               note: 'SQLite lists indexes differently from MySQL; InnoDB also adds an index for each foreign key.' };
    }
    if (/^START TRANSACTION$/i.test(s)) { db.run('BEGIN'); return { msg: 'Query OK, 0 rows affected' }; }
    if (/^EXPLAIN\s+SELECT/i.test(s)) {
      var q = db.exec('EXPLAIN QUERY PLAN ' + stmt.replace(/^\s*EXPLAIN\s+/i, ''));
      return { cols: ['SQLite query plan'], rows: q.length ? q[0].values.map(function (v) { return [v[3]]; }) : [],
               note: 'SQLite shows its plan in words (SCAN = full scan, SEARCH ... USING INDEX = index lookup). MySQL\'s EXPLAIN shows the same idea as type ALL vs ref.' };
    }
    var res = db.exec(stmt);
    if (res.length) return { cols: res[0].columns, rows: res[0].values, note: groupByWarning(stmt) };
    if (/^\s*(SELECT|WITH)/i.test(stmt)) return { cols: [], rows: [], empty: true };
    var n = db.getRowsModified();
    return { msg: 'Query OK, ' + n + ' row' + (n === 1 ? '' : 's') + ' affected' };
  }
  function pgSchema() {
    var box = $('.schema', PG.el), db = PG.db;
    var tabs = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    var html = '<span class="k" style="font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700">Tables</span>';
    (tabs.length ? tabs[0].values : []).forEach(function (t) {
      var name = t[0];
      var cnt = db.exec('SELECT COUNT(*) FROM "' + name + '"')[0].values[0][0];
      var info = db.exec('PRAGMA table_info("' + name + '")')[0].values;
      var fks = db.exec('PRAGMA foreign_key_list("' + name + '")'), fkc = {};
      if (fks.length) fks[0].values.forEach(function (v) { fkc[v[3]] = v[2]; });
      html += '<details><summary>' + esc(name) + ' <span style="color:var(--muted);font-weight:400">(' + cnt + ')</span></summary><ul>' + info.map(function (c) {
        var cls = c[5] ? 'pk' : (fkc[c[1]] ? 'fk' : '');
        return '<li' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(c[1]) + (c[5] ? ' · PK' : '') + (fkc[c[1]] ? ' → ' + esc(fkc[c[1]]) : '') + '</li>';
      }).join('') + '</ul></details>';
    });
    box.innerHTML = html;
  }
  function pgRun() {
    var sql = $('textarea', PG.el).value, out = $('.result', PG.el);
    C.store.set('pg:last', sql);
    var stmts = splitSQL(sql), html = '';
    if (!stmts.length) { out.innerHTML = '<p class="msg">Type a statement, then press Run (or Ctrl+Enter).</p>'; return; }
    stmts.forEach(function (st) {
      var short = st.split('\n')[0]; if (short.length > 90) short = short.slice(0, 88) + '…';
      html += '<div class="msg">mysql&gt; ' + esc(short) + (st.indexOf('\n') > 0 ? ' …' : '') + '</div>';
      try {
        var r = pgExec(st);
        if (r.msg) html += '<div class="msg okm">' + esc(r.msg) + '</div>';
        else if (r.empty || !r.rows.length) html += '<div class="msg">Empty set</div>';
        else html += table('', r.cols, r.rows.slice(0, 200)) + '<div class="msg">' + r.rows.length + ' row' + (r.rows.length === 1 ? '' : 's') + ' in set' + (r.rows.length > 200 ? ' (first 200 shown)' : '') + '</div>';
        if (r.note) html += '<div class="msg">' + esc(r.note) + '</div>';
      } catch (e) {
        html += '<div class="msg err">' + esc(mysqlError(String(e.message || e), st)) + '</div><div class="msg">SQLite said: ' + esc(String(e.message || e)) + '</div>';
      }
    });
    out.innerHTML = html;
    pgSchema();
  }
  function pgReset() {
    if (PG.db) PG.db.close();
    PG.db = new PG.SQL.Database();
    PG.db.exec(C.UNI_SQLITE.schema);
    PG.db.exec(C.UNI_SQLITE.seed);
    pgSchema();
  }
  function playground(el) {
    PG.el = el;
    el.querySelector('.body').innerHTML =
      '<div class="presets" aria-label="Example queries">' + PRESETS.map(function (p, i) { return '<button type="button" data-p="' + i + '">' + esc(p[0]) + '</button>'; }).join('') + '</div>' +
      '<div class="play"><div class="schema"><span class="note">Loading the database engine…</span></div>' +
      '<div class="result-col" style="display:flex;flex-direction:column;gap:10px;min-width:0">' +
      '<label class="visually-hidden" for="pg-sql">SQL to run</label><textarea id="pg-sql" class="sql" spellcheck="false"></textarea>' +
      '<div class="controls"><button type="button" class="btn primary" data-run disabled>Run (Ctrl+Enter)</button><button type="button" class="btn" data-reset disabled>Reset data</button><span class="note">Changes stay until you reset or reload the page.</span></div>' +
      '<div class="result" aria-live="polite"></div></div></div>';
    var ta = $('textarea', el);
    ta.value = C.store.get('pg:last', PRESETS[2][1]);
    el.querySelectorAll('[data-p]').forEach(function (b) { b.addEventListener('click', function () { ta.value = PRESETS[+b.dataset.p][1]; if (PG.db) pgRun(); }); });
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (PG.db) pgRun(); } });
    $('[data-run]', el).addEventListener('click', pgRun);
    $('[data-reset]', el).addEventListener('click', function () { pgReset(); $('.result', el).innerHTML = '<p class="msg okm">Data reset to the shared university dataset.</p>'; });
    if (typeof window.initSqlJs !== 'function') {
      $('.schema', el).innerHTML = '<p class="msg err">The SQL engine did not load. Check that assets/vendor/sql-asm-1.10.3.js is present.</p>';
      return;
    }
    PG.ready = window.initSqlJs().then(function (SQL) {
      PG.SQL = SQL; pgReset();
      el.querySelectorAll('[data-run],[data-reset]').forEach(function (b) { b.disabled = false; });
      pgRun();
    }).catch(function (e) { $('.schema', el).innerHTML = '<p class="msg err">The SQL engine failed to start: ' + esc(e.message || e) + '</p>'; });
  }
  C.playground = {
    load: function (sql) {
      if (!PG.el) return;
      $('textarea', PG.el).value = sql;
      PG.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (PG.db) pgRun();
    }
  };

  /* =================================================================
     6. JOIN visualiser (C2)
     ================================================================= */
  function joinViz(el) {
    var PAIRS = {
      sr: { L: { n: 'Student', k: 0, cols: ['StudentID', 'Forename'], rows: [[1001, 'Ahmed'], [1002, 'Sarah'], [1003, 'John'], [1004, 'Priya']] },
            R: { n: 'Registration', k: 0, cols: ['StudentID', 'ModuleCode'], rows: [[1001, 'COM745'], [1001, 'COM746'], [1002, 'COM745'], [1002, 'COM747'], [1004, 'COM745']] },
            on: 's.StudentID = r.StudentID', la: 's', ra: 'r' },
      mr: { L: { n: 'Module', k: 0, cols: ['ModuleCode', 'ModuleName'], rows: [['COM745', 'Big Data and Infrastructure'], ['COM748', 'Cloud Computing'], ['COM750', 'Artificial Intelligence']] },
            R: { n: 'Registration', k: 1, cols: ['StudentID', 'ModuleCode'], rows: [[1001, 'COM745'], [1002, 'COM745'], [1007, 'COM748'], [1023, 'COM748']] },
            on: 'm.ModuleCode = r.ModuleCode', la: 'm', ra: 'r' }
    };
    var pair = 'sr', type = 'LEFT', hover = null;
    function compute() {
      var P = PAIRS[pair], out = [], matchedR = {};
      P.L.rows.forEach(function (l, li) {
        var any = false;
        P.R.rows.forEach(function (r, ri) {
          if (l[P.L.k] === r[P.R.k]) { any = true; matchedR[ri] = 1; out.push({ l: li, r: ri }); }
        });
        if (!any && type === 'LEFT') out.push({ l: li, r: null });
      });
      if (type === 'RIGHT') {
        out = out.filter(function (x) { return x.r !== null; });
        P.R.rows.forEach(function (r, ri) { if (!matchedR[ri]) out.push({ l: null, r: ri }); });
      }
      return out;
    }
    function render() {
      var P = PAIRS[pair], res = compute();
      var usedL = {}, usedR = {};
      res.forEach(function (x) { if (x.l !== null) usedL[x.l] = 1; if (x.r !== null) usedR[x.r] = 1; });
      var cols = P.L.cols.map(function (c) { return P.la + '.' + c; }).concat(P.R.cols.map(function (c) { return P.ra + '.' + c; }));
      var rows = res.map(function (x) {
        return (x.l === null ? P.L.cols.map(function () { return null; }) : P.L.rows[x.l]).concat(x.r === null ? P.R.cols.map(function () { return null; }) : P.R.rows[x.r]);
      });
      var sql = 'SELECT *\nFROM ' + P.L.n + ' ' + P.la + '\n' + type + ' JOIN ' + P.R.n + ' ' + P.ra + ' ON ' + P.on + ';';
      var unmatchedL = P.L.rows.filter(function (r, i) { return !usedL[i]; }).length;
      var note = type === 'INNER' ? (unmatchedL ? unmatchedL + ' ' + P.L.n.toLowerCase() + ' row(s) have no match and are dropped (shown struck through on the left).' : 'Every row matched.')
        : type === 'LEFT' ? 'Every ' + P.L.n + ' row is kept. Rows with no match get NULLs on the right: that is how you find "who has none".'
        : 'Every Registration row is kept. The foreign key guarantees each one matches, so RIGHT JOIN finds nothing extra here.';
      var html = '<div class="controls"><div class="ctl">Tables' + seg('Tables', [['sr', 'Student · Registration'], ['mr', 'Module · Registration']], pair) + '</div>' +
        '<div class="ctl">Join type' + seg('Join type', [['INNER', 'INNER'], ['LEFT', 'LEFT'], ['RIGHT', 'RIGHT']], type) + '</div></div>';
      html += '<div class="joinviz">' +
        table(P.L.n + ' ' + P.la, P.L.cols, P.L.rows, { rowClass: function (r, i) { return hover && hover.l === i ? 'hl' : (type !== 'LEFT' && !usedL[i] ? 'gone' : ''); } }) +
        table(P.R.n + ' ' + P.ra, P.R.cols, P.R.rows, { rowClass: function (r, i) { return hover && hover.r === i ? 'hl' : (type === 'INNER' && !usedR[i] ? 'gone' : ''); } }) + '</div>';
      html += '<div class="code" data-lang="sql"><pre>' + esc(sql) + '</pre></div>';
      html += table('Result: ' + rows.length + ' rows (hover or focus a row to see where it came from)', cols, rows, {
        rowAttr: function (r, i) { return 'tabindex="0" data-i="' + i + '"'; },
        rowClass: function (r, i) { return hover && hover.i === i ? 'hl' : ''; }
      });
      html += '<p class="callout">' + esc(note) + '</p>';
      el.querySelector('.body').innerHTML = html;
      C.decorateCode(el);
      var segs = el.querySelectorAll('.seg');
      segs[0].querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { pair = b.dataset.v; hover = null; render(); }); });
      segs[1].querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { type = b.dataset.v; hover = null; render(); }); });
      var srcTables = el.querySelectorAll('.joinviz .dt tbody');
      el.querySelectorAll('tr[data-i]').forEach(function (tr) {
        function on() {
          var x = res[+tr.dataset.i];
          el.querySelectorAll('tr.hl').forEach(function (t) { t.classList.remove('hl'); });
          tr.classList.add('hl');
          if (x.l !== null) srcTables[0].rows[x.l].classList.add('hl');
          if (x.r !== null) srcTables[1].rows[x.r].classList.add('hl');
        }
        tr.addEventListener('mouseenter', on); tr.addEventListener('focus', on);
      });
    }
    render();
  }

  /* =================================================================
     7. Index simulator (C3) - a model, not a measurement
     ================================================================= */
  function indexSim(el) {
    var exp = 5, idx = false, nIdx = 2;
    function fmt(n) { return n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + ' million' : n.toLocaleString('en-GB'); }
    function render() {
      var N = Math.pow(10, exp), fan = 500, depth = Math.max(1, Math.ceil(Math.log(N) / Math.log(fan)));
      var matches = Math.max(1, Math.round(N / 2000));
      var scan = N, seek = depth + matches;
      var w = function (v) { return Math.max(2, Math.log10(v + 1) / Math.log10(1e7 + 1) * 100); };
      var html = '<div class="controls"><label class="ctl" for="ix-n">Rows in Student: <b>' + fmt(N) + '</b><input id="ix-n" type="range" min="2" max="7" step="1" value="' + exp + '"></label>' +
        '<div class="ctl">Index on Surname' + seg('Index on Surname', [['0', 'no index'], ['1', 'idx_student_surname']], idx ? '1' : '0') + '</div>' +
        '<label class="ctl" for="ix-k">Indexes on the table: <b>' + nIdx + '</b><input id="ix-k" type="range" min="0" max="6" step="1" value="' + nIdx + '"></label></div>';
      html += '<div class="code" data-lang="sql"><pre>SELECT * FROM Student WHERE Surname = \'Khan\';</pre></div>';
      html += '<div class="kpis"><div class="kpi"><span>Rows examined</span><b>' + fmt(idx ? seek : scan) + '</b></div><div class="kpi"><span>MySQL EXPLAIN type</span><b>' + (idx ? 'ref' : 'ALL') + '</b></div><div class="kpi"><span>Index levels</span><b>' + (idx ? depth : '–') + '</b></div><div class="kpi"><span>Structures written per INSERT</span><b>' + (1 + nIdx) + '</b></div></div>';
      html += '<svg viewBox="0 0 640 96" role="img" aria-label="Rows examined, log scale"><text class="labm" x="0" y="16">Rows examined (log scale)</text>' +
        '<rect x="0" y="26" width="' + (w(scan) * 5.6) + '" height="24" rx="4" fill="var(--c2)" opacity="' + (idx ? .35 : 1) + '"/><text class="lab" x="' + (w(scan) * 5.6 + 8) + '" y="43">full scan: ' + fmt(scan) + '</text>' +
        '<rect x="0" y="60" width="' + (w(seek) * 5.6) + '" height="24" rx="4" fill="var(--c1)" opacity="' + (idx ? 1 : .35) + '"/><text class="lab" x="' + (w(seek) * 5.6 + 8) + '" y="77">index seek: ' + fmt(seek) + '</text></svg>';
      html += '<p class="note">Model assumptions: a B-tree index with about 500 entries per node, and about 1 in 2,000 students sharing a surname. Real numbers depend on the data and the server; use <code>EXPLAIN</code> on MySQL (Demo 6) to see the real plan. More indexes make lookups on more columns fast, but every INSERT, UPDATE and DELETE must also update each one.</p>';
      el.querySelector('.body').innerHTML = html;
      C.decorateCode(el);
      $('#ix-n', el).addEventListener('input', function (e) { exp = +e.target.value; render(); $('#ix-n', el).focus(); });
      $('#ix-k', el).addEventListener('input', function (e) { nIdx = +e.target.value; render(); $('#ix-k', el).focus(); });
      bindSeg(el, '.seg', function (v) { idx = v === '1'; render(); });
    }
    render();
  }

  /* =================================================================
     8. Transaction simulator (C4)
     ================================================================= */
  function txnSim(el) {
    var st;
    function reset() { st = { db: { Ahmed: 500, Sarah: 200 }, work: null, log: [], msg: 'Ahmed sends Sarah £100. Try it with and without a transaction, and pull the plug halfway.', prop: '' }; }
    reset();
    function view() { return st.work || st.db; }
    var OPS = {
      start: function () { if (st.work) { st.msg = 'A transaction is already open.'; return; } st.work = { Ahmed: st.db.Ahmed, Sarah: st.db.Sarah }; st.log.push('START TRANSACTION;'); st.msg = 'Changes from now on are provisional until COMMIT.'; st.prop = ''; },
      debit: function () { var t = st.work || st.db; t.Ahmed -= 100; st.log.push("UPDATE Account SET Balance = Balance - 100 WHERE Holder = 'Ahmed';"); st.msg = st.work ? 'Debited inside the transaction (not yet permanent).' : 'Autocommit is on and no transaction is open: this change is already permanent.'; st.prop = ''; },
      credit: function () { var t = st.work || st.db; t.Sarah += 100; st.log.push("UPDATE Account SET Balance = Balance + 100 WHERE Holder = 'Sarah';"); st.msg = st.work ? 'Credited inside the transaction.' : 'Autocommit: permanent immediately.'; st.prop = ''; },
      commit: function () { if (!st.work) { st.msg = 'No open transaction to commit.'; return; } st.db = st.work; st.work = null; st.log.push('COMMIT;'); st.msg = 'Both changes are now permanent together.'; st.prop = 'D'; },
      rollback: function () { if (!st.work) { st.msg = 'No open transaction to roll back.'; return; } st.work = null; st.log.push('ROLLBACK;'); st.msg = 'Every change since START TRANSACTION was undone.'; st.prop = 'A'; },
      crash: function () {
        var was = !!st.work; st.work = null; st.log.push('-- power cut, server restarts --');
        var tot = st.db.Ahmed + st.db.Sarah;
        st.msg = was ? 'The open transaction never committed, so its half-done work is discarded on restart. The money is where it was.'
          : (tot !== 700 ? 'Without a transaction, the debit was already permanent but the credit never happened: £100 has vanished. This is what transactions prevent.' : 'Nothing was in progress; committed data survived the crash.');
        st.prop = was ? 'A' : (tot !== 700 ? 'C' : 'D');
      }
    };
    var PROPS = { A: ['Atomicity', 'All of the transaction happens, or none of it does.'], C: ['Consistency', 'A transaction moves the database from one valid state to another (total stays £700).'], I: ['Isolation', 'Other sessions do not see the provisional balances until COMMIT.'], D: ['Durability', 'Once committed, changes survive a crash or power cut.'] };
    function render() {
      var v = view(), tot = v.Ahmed + v.Sarah, dbTot = st.db.Ahmed + st.db.Sarah;
      var html = '<div class="controls">' +
        '<button type="button" class="btn" data-o="start">START TRANSACTION</button><button type="button" class="btn" data-o="debit">Debit Ahmed £100</button>' +
        '<button type="button" class="btn" data-o="credit">Credit Sarah £100</button><button type="button" class="btn primary" data-o="commit">COMMIT</button>' +
        '<button type="button" class="btn" data-o="rollback">ROLLBACK</button><button type="button" class="btn" data-o="crash" style="color:var(--bad);border-color:var(--bad)">Power cut</button><button type="button" class="btn" data-o="reset">Reset</button></div>';
      html += '<div class="grid2 two"><div class="card"><span class="k">What this session sees' + (st.work ? ' (inside the transaction)' : '') + '</span>' +
        table('', ['Holder', 'Balance (£)'], [['Ahmed', v.Ahmed], ['Sarah', v.Sarah], ['Total', tot]], { rowClass: function (r) { return r[0] === 'Total' && tot !== 700 ? 'gone' : ''; } }) + '</div>' +
        '<div class="card"><span class="k">What is permanently stored (and other users see)</span>' +
        table('', ['Holder', 'Balance (£)'], [['Ahmed', st.db.Ahmed], ['Sarah', st.db.Sarah], ['Total', dbTot]], { rowClass: function (r) { return r[0] === 'Total' && dbTot !== 700 ? 'gone' : ''; } }) + '</div></div>';
      html += '<p class="callout' + (st.prop === 'C' ? ' bad' : '') + '" aria-live="polite">' + esc(st.msg) + (st.work ? ' <b>Isolation:</b> the right-hand table is what everyone else still sees.' : '') + '</p>';
      html += '<div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">' + Object.keys(PROPS).map(function (k) {
        var on = st.prop === k || (k === 'I' && st.work);
        return '<div class="card" style="' + (on ? 'border-color:var(--accent);background:var(--accent-soft)' : '') + '"><span class="k">' + PROPS[k][0] + '</span><p class="note">' + PROPS[k][1] + '</p></div>';
      }).join('') + '</div>';
      html += '<div class="console" aria-label="Statements issued">' + (st.log.length ? esc(st.log.join('\n')) : '-- statements you issue appear here') + '</div>';
      el.querySelector('.body').innerHTML = html;
      el.querySelectorAll('[data-o]').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.o === 'reset') reset(); else OPS[b.dataset.o](); render(); }); });
    }
    render();
  }

  var MOUNTS = { classifier: classifier, keys: keysExplorer, er: erBuilder, normaliser: normaliser, playground: playground, join: joinViz, index: indexSim, txn: txnSim };
  C.ready(function () {
    document.querySelectorAll('[data-explorer]').forEach(function (el) {
      var f = MOUNTS[el.getAttribute('data-explorer')];
      if (f) f(el);
    });
    document.querySelectorAll('[data-try]').forEach(function (b) {
      b.addEventListener('click', function () { C.playground.load(b.closest('.task, .card, details').querySelector('pre').textContent); });
    });
  });
})();
