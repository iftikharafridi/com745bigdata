/* COM745 site behaviour: menu from schedule.js, theme, search, copy,
   SQL highlighting, quizzes, self-check and task progress.
   Works from GitHub Pages, Blackboard and straight from disk (file://):
   no fetch, no build step. Progress is kept only in this browser. */
(function () {
  'use strict';
  var C = window.COM745 = window.COM745 || {};
  var ROOT = document.body.getAttribute('data-root') || '';
  var PAGE = document.body.getAttribute('data-page') || '';

  /* ---------- safe storage ---------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('com745:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('com745:' + k, JSON.stringify(v)); } catch (e) { /* storage blocked: progress is simply not kept */ } }
  };
  C.store = store;

  /* ---------- theme ---------- */
  var THEMES = ['auto', 'light', 'dark'];
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    document.querySelectorAll('.theme-btn').forEach(function (b) {
      b.textContent = 'Theme: ' + t;
      b.setAttribute('aria-label', 'Colour theme: ' + t + '. Click to change.');
    });
  }
  var theme = store.get('theme', 'auto');
  applyTheme(theme);
  function cycleTheme() {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set('theme', theme); applyTheme(theme);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  C.esc = esc;

  /* ---------- menu ---------- */
  function sectionLinks() {
    var main = document.querySelector('.main');
    if (!main) return '';
    var out = '';
    main.querySelectorAll('[data-nav]').forEach(function (el) {
      if (!el.id) return;
      var lvl = el.classList.contains('part') ? ' class="lvl1"' : '';
      out += '<li><a href="#' + el.id + '"' + lvl + '>' + esc(el.getAttribute('data-nav')) + '</a></li>';
    });
    return out ? '<ul class="side-secs">' + out + '</ul>' : '';
  }
  function buildMenu() {
    var html = '';
    html += '<div class="side-tools"><button type="button" class="theme-btn"></button></div>';
    html += '<div class="search"><label class="visually-hidden" for="SEARCHID">Search topics, commands and terms</label>' +
            '<input id="SEARCHID" type="search" placeholder="Search: JOIN, 3NF, ERROR 1452…" autocomplete="off">' +
            '<div class="search-res" hidden></div></div>';
    html += '<nav class="side-links" aria-label="Site">' +
      link('index.html', 'Home and schedule', 'home') +
      link('demos.html', 'Demonstration library', 'demos') +
      link('labs.html', 'Datasets and lab setup', 'labs') + '</nav>';
    var groups = {};
    var order = [];
    (C.WEEKS || []).forEach(function (w) {
      if (!groups[w.group]) { groups[w.group] = []; order.push(w.group); }
      groups[w.group].push(w);
    });
    var secsDone = false;
    order.forEach(function (g) {
      html += '<div class="side-group">' + esc(g) + '</div><ul class="side-list">';
      groups[g].forEach(function (w) {
        html += '<li><div class="side-week"><span class="wn">' + w.week + '</span><span><span class="wtitle">Week ' + w.week + ' · w/c ' + esc(w.wc) + '</span>' +
          (w.note ? '<span class="wnote">' + esc(w.note) + '</span>' : '') + '</span></div><ul class="side-topics">';
        w.topics.forEach(function (id) {
          var t = (C.TOPICS || {})[id];
          if (!t) return;
          var cur = (PAGE === id);
          if (t.status === 'ready') {
            html += '<li><a class="side-topic" href="' + ROOT + t.page + '"' + (cur ? ' aria-current="page"' : '') + '>' + esc(t.short) + '</a>';
          } else {
            html += '<li><span class="side-topic planned" title="Planned: ' + esc(t.sources) + '">' + esc(t.short) + '</span>';
          }
          if (cur && !secsDone) { html += sectionLinks(); secsDone = true; }
          html += '</li>';
        });
        html += '</ul></li>';
      });
      html += '</ul>';
    });
    return html;
    function link(href, label, id) {
      return '<a href="' + ROOT + href + '"' + (PAGE === id ? ' aria-current="page"' : '') + '>' + label + '</a>';
    }
  }
  function mountMenus() {
    var side = document.querySelector('.side');
    var panel = document.querySelector('.mnav-panel');
    var menu = buildMenu();
    if (side) side.innerHTML = '<a class="side-brand" href="' + ROOT + 'index.html">COM745 Big Data</a><div class="side-sub">Big Data and Infrastructure · 2026/27</div>' + menu.replace(/SEARCHID/g, 'search-side');
    if (panel) panel.innerHTML = menu.replace(/SEARCHID/g, 'search-mobile');
    document.querySelectorAll('.theme-btn').forEach(function (b) { b.addEventListener('click', cycleTheme); });
    applyTheme(theme);
    document.querySelectorAll('.search').forEach(initSearch);
    // close the mobile menu after choosing a section
    if (panel) panel.addEventListener('click', function (e) { if (e.target.closest('a')) { var d = panel.closest('details'); if (d) d.open = false; } });
  }

  /* ---------- search ---------- */
  function searchIndex() {
    var idx = [];
    Object.keys(C.TOPICS || {}).forEach(function (id) {
      var t = C.TOPICS[id];
      idx.push({ t: t.title, s: t.status === 'ready' ? 'Topic' : 'Topic (planned)', u: t.status === 'ready' ? ROOT + t.page : null, k: t.sources });
    });
    (C.SEARCH || []).forEach(function (e) { idx.push({ t: e.t, s: e.s, u: ROOT + e.u, k: e.k || '' }); });
    document.querySelectorAll('.main [data-nav]').forEach(function (el) {
      if (el.id && !(C.SEARCH || []).length) idx.push({ t: el.getAttribute('data-nav'), s: 'This page', u: '#' + el.id, k: '' });
    });
    return idx;
  }
  function initSearch(box) {
    var input = box.querySelector('input'), res = box.querySelector('.search-res');
    var idx = null, active = -1;
    function render() {
      idx = idx || searchIndex();
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) { res.hidden = true; return; }
      var words = q.split(/\s+/);
      var hits = idx.filter(function (e) {
        var hay = (e.t + ' ' + e.k + ' ' + e.s).toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) >= 0; });
      }).slice(0, 12);
      active = -1;
      res.innerHTML = hits.length ? hits.map(function (h) {
        return h.u ? '<a href="' + esc(h.u) + '">' + esc(h.t) + '<small>' + esc(h.s) + '</small></a>'
                   : '<div class="none">' + esc(h.t) + ' <small>(' + esc(h.s) + ')</small></div>';
      }).join('') : '<div class="none">No matches. Try a command (SELECT), an error number (1452) or a term (foreign key).</div>';
      res.hidden = false;
    }
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      var links = res.querySelectorAll('a');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!links.length) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach(function (a, i) { a.classList.toggle('act', i === active); });
      } else if (e.key === 'Enter' && links.length) {
        e.preventDefault(); (links[active >= 0 ? active : 0]).click(); res.hidden = true;
      } else if (e.key === 'Escape') { res.hidden = true; }
    });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) res.hidden = true; });
    res.addEventListener('click', function (e) { if (e.target.closest('a')) res.hidden = true; });
  }

  /* ---------- SQL highlighting (small, readable, no library) ---------- */
  var KW = ('SELECT FROM WHERE AND OR NOT IN IS NULL AS JOIN INNER LEFT RIGHT OUTER CROSS ON GROUP BY ORDER HAVING LIMIT DISTINCT ' +
    'INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE DATABASE SCHEMA DROP ALTER ADD CONSTRAINT PRIMARY KEY FOREIGN REFERENCES ' +
    'UNIQUE CHECK DEFAULT INDEX VIEW USE SHOW TABLES DESCRIBE DESC ASC BETWEEN LIKE EXISTS IF START TRANSACTION COMMIT ROLLBACK ' +
    'EXPLAIN UNION ALL CASE WHEN THEN ELSE END COLUMN CASCADE INT INTEGER TINYINT VARCHAR CHAR DATE DATETIME DECIMAL TEXT BOOLEAN COUNT SUM AVG MIN MAX CONCAT').split(' ');
  var KWSET = {}; KW.forEach(function (k) { KWSET[k] = 1; });
  function highlightSQL(src) {
    var out = '', i = 0, n = src.length;
    while (i < n) {
      var ch = src[i];
      if (src.substr(i, 2) === '--' || ch === '#') {
        var j = src.indexOf('\n', i); if (j < 0) j = n;
        out += '<span class="tok-c">' + esc(src.slice(i, j)) + '</span>'; i = j; continue;
      }
      if (src.substr(i, 2) === '/*') {
        var k = src.indexOf('*/', i); k = k < 0 ? n : k + 2;
        out += '<span class="tok-c">' + esc(src.slice(i, k)) + '</span>'; i = k; continue;
      }
      if (ch === "'") {
        var m = i + 1;
        while (m < n) { if (src[m] === "'" && src[m + 1] === "'") { m += 2; continue; } if (src[m] === "'") break; m++; }
        out += '<span class="tok-s">' + esc(src.slice(i, m + 1)) + '</span>'; i = m + 1; continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        var w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0];
        out += KWSET[w.toUpperCase()] ? '<span class="tok-k">' + w + '</span>' : esc(w);
        i += w.length; continue;
      }
      if (/[0-9]/.test(ch) && !/[A-Za-z_]/.test(src[i - 1] || '')) {
        var num = /^[0-9.]+/.exec(src.slice(i))[0];
        out += '<span class="tok-n">' + num + '</span>'; i += num.length; continue;
      }
      out += esc(ch); i++;
    }
    return out;
  }
  C.highlightSQL = highlightSQL;
  // Cypher: // comments, '…' and "…" strings, keywords, :Labels and :TYPES
  var CKW = {}; ('MATCH OPTIONAL WHERE RETURN CREATE MERGE ON SET DELETE DETACH REMOVE WITH UNWIND AS ORDER BY ASC DESC SKIP LIMIT DISTINCT AND OR XOR NOT IN IS NULL TRUE FALSE ' +
    'STARTS ENDS CONTAINS CASE WHEN THEN ELSE END UNION ALL CALL YIELD CONSTRAINT INDEX FOR REQUIRE UNIQUE IF EXISTS DROP SHOW LOAD CSV HEADERS FROM').split(' ').forEach(function (k) { CKW[k] = 1; });
  function highlightCypher(src) {
    var out = '', i = 0, n = src.length;
    while (i < n) {
      var ch = src[i];
      if (src.substr(i, 2) === '//') { var j = src.indexOf('\n', i); if (j < 0) j = n; out += '<span class="tok-c">' + esc(src.slice(i, j)) + '</span>'; i = j; continue; }
      if (ch === "'" || ch === '"') {
        var m = i + 1; while (m < n && src[m] !== ch) { if (src[m] === '\\') m++; m++; }
        out += '<span class="tok-s">' + esc(src.slice(i, m + 1)) + '</span>'; i = m + 1; continue;
      }
      if (ch === ':' && /[A-Za-z_`]/.test(src[i + 1] || '')) {
        var lw = /^:`?[A-Za-z_][A-Za-z0-9_]*`?/.exec(src.slice(i))[0];
        out += '<span class="tok-n">' + esc(lw) + '</span>'; i += lw.length; continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        var w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0];
        out += CKW[w.toUpperCase()] && w === w.toUpperCase() ? '<span class="tok-k">' + w + '</span>' : esc(w);
        i += w.length; continue;
      }
      out += esc(ch); i++;
    }
    return out;
  }
  C.highlightCypher = highlightCypher;
  // mongosh / JavaScript: strings, numbers, $operators, comments, shell words
  function highlightJS(src) {
    var out = '', i = 0, n = src.length;
    while (i < n) {
      var ch = src[i];
      if (src.substr(i, 2) === '//') { var j = src.indexOf('\n', i); if (j < 0) j = n; out += '<span class="tok-c">' + esc(src.slice(i, j)) + '</span>'; i = j; continue; }
      if (src.substr(i, 2) === '/*') { var k = src.indexOf('*/', i); k = k < 0 ? n : k + 2; out += '<span class="tok-c">' + esc(src.slice(i, k)) + '</span>'; i = k; continue; }
      if (ch === "'" || ch === '"') {
        var m = i + 1; while (m < n && src[m] !== ch) { if (src[m] === '\\') m++; m++; }
        out += '<span class="tok-s">' + esc(src.slice(i, m + 1)) + '</span>'; i = m + 1; continue;
      }
      if (ch === '$' && /[A-Za-z]/.test(src[i + 1] || '')) { var op = /^\$[A-Za-z]+/.exec(src.slice(i))[0]; out += '<span class="tok-k">' + op + '</span>'; i += op.length; continue; }
      if (/[A-Za-z_]/.test(ch)) {
        var w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0];
        out += /^(use|show|db|true|false|null|ObjectId|ISODate|print|printjson)$/.test(w) ? '<span class="tok-k">' + w + '</span>' : esc(w);
        i += w.length; continue;
      }
      if (/[0-9]/.test(ch)) { var num = /^[0-9.]+/.exec(src.slice(i))[0]; out += '<span class="tok-n">' + num + '</span>'; i += num.length; continue; }
      out += esc(ch); i++;
    }
    return out;
  }
  C.highlightJS = highlightJS;
  function decorateCode(scope) {
    (scope || document).querySelectorAll('.code').forEach(function (box) {
      if (box.dataset.ready) return;
      box.dataset.ready = '1';
      var pre = box.querySelector('pre');
      if (!pre) return;
      if (box.dataset.lang === 'sql' || box.dataset.lang === 'influxql' || pre.classList.contains('sql')) pre.innerHTML = highlightSQL(pre.textContent);
      else if (box.dataset.lang === 'mongosh' || box.dataset.lang === 'js') pre.innerHTML = highlightJS(pre.textContent);
      else if (box.dataset.lang === 'cypher') pre.innerHTML = highlightCypher(pre.textContent);
      if (box.dataset.lang) { var l = document.createElement('span'); l.className = 'lang'; l.textContent = box.dataset.lang; box.appendChild(l); }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'copy'; b.textContent = 'Copy';
      b.setAttribute('aria-label', 'Copy code');
      b.addEventListener('click', function () { copyText(pre.textContent, b, pre); });
      box.appendChild(b);
    });
  }
  C.decorateCode = decorateCode;
  function copyText(text, btn, sel) {
    function done(msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = 'Copy'; }, 1400); }
    function fallback() {
      try { var r = document.createRange(); r.selectNodeContents(sel); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); done('Selected: press Ctrl+C'); } catch (e) { done('Select and copy'); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done('Copied'); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  C.copyText = copyText;

  /* ---------- quizzes ----------
     <div class="quiz" data-quiz="key"></div> + C.QUIZ[key] = [{q, opts:[...], a:index, why:[...per option] or ex:"..."}] */
  function mountQuiz(el) {
    var key = el.getAttribute('data-quiz');
    var qs = (C.QUIZ || {})[key] || [];
    var answered = 0, right = 0;
    var head = document.createElement('p');
    head.className = 'note';
    head.innerHTML = 'Score: <span class="score">0 / ' + qs.length + '</span>. Pick an answer to see why it is right or wrong.';
    el.appendChild(head);
    qs.forEach(function (q, qi) {
      var box = document.createElement('div');
      box.className = 'q';
      box.innerHTML = '<div><span class="num">' + (qi + 1) + '.</span> ' + q.q + '</div><div class="opts" role="group" aria-label="Question ' + (qi + 1) + ' options"></div><div class="fb" aria-live="polite"></div>';
      var opts = box.querySelector('.opts'), fb = box.querySelector('.fb');
      q.opts.forEach(function (o, oi) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'opt'; b.innerHTML = o;
        b.addEventListener('click', function () {
          if (box.dataset.done) return;
          box.dataset.done = '1'; answered++;
          var ok = oi === q.a; if (ok) right++;
          opts.querySelectorAll('button').forEach(function (x, xi) {
            x.disabled = true;
            if (xi === q.a) x.classList.add('right');
            else if (xi === oi) x.classList.add('wrong');
          });
          var why = (q.why && q.why[oi]) || q.ex || '';
          fb.innerHTML = (ok ? '<b class="ok">Correct.</b> ' : '<b class="no">Not quite.</b> ') + why + (!ok && q.ex && q.why ? ' ' + q.ex : '');
          head.querySelector('.score').textContent = right + ' / ' + qs.length;
          if (answered === qs.length) {
            var r = document.createElement('button');
            r.type = 'button'; r.className = 'btn'; r.textContent = 'Try the quiz again';
            r.addEventListener('click', function () { el.innerHTML = ''; mountQuiz(el); });
            el.appendChild(r);
          }
        });
        opts.appendChild(b);
      });
      el.appendChild(box);
    });
  }

  /* ---------- self-check ratings and task progress ---------- */
  function mountRatings() {
    document.querySelectorAll('.rate-row[data-key]').forEach(function (row) {
      var k = 'rate:' + PAGE + ':' + row.getAttribute('data-key');
      var v = store.get(k, 0);
      row.querySelectorAll('.btns button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(+b.dataset.v === v));
        b.addEventListener('click', function () {
          v = +b.dataset.v; store.set(k, v);
          row.querySelectorAll('.btns button').forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.v === v)); });
        });
      });
    });
    document.querySelectorAll('.task[data-key]').forEach(function (t) {
      var k = 'task:' + PAGE + ':' + t.getAttribute('data-key');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'done-toggle';
      function paint() { var on = store.get(k, false); t.classList.toggle('done', on); b.textContent = on ? 'Done ✓' : 'Mark as done'; b.setAttribute('aria-pressed', String(on)); }
      b.addEventListener('click', function () { store.set(k, !store.get(k, false)); paint(); updateProgress(); });
      t.appendChild(b); paint();
    });
    updateProgress();
  }
  function updateProgress() {
    var tasks = document.querySelectorAll('.task[data-key]');
    var done = document.querySelectorAll('.task.done[data-key]').length;
    document.querySelectorAll('[data-progress]').forEach(function (p) { p.textContent = done + ' of ' + tasks.length + ' tasks marked done'; });
  }

  /* ---------- section highlight in the menu ---------- */
  function scrollSpy() {
    var links = document.querySelectorAll('.side .side-secs a');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var obs = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (a) { a.classList.remove('on'); });
          var a = map[e.target.id]; if (a) a.classList.add('on');
        }
      });
    }, { rootMargin: '0px 0px -75% 0px' });
    Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) obs.observe(el); });
  }

  /* ---------- demonstration cards ---------- */
  function mountDemoLists() {
    document.querySelectorAll('[data-demolist]').forEach(function (box) {
      var keys = box.getAttribute('data-demolist').split(/\s+/);
      var html = '';
      keys.forEach(function (k) {
        var pack = (C.DEMOS || {})[k];
        if (!pack) return;
        pack.demos.forEach(function (d) {
          var code = d.steps.some(function (s) { return s.sql; });
          html += '<article class="democard"><span class="dn">Demo ' + d.num + ' · ' + d.minutes + ' min · ' + d.steps.length + ' steps</span>' +
            '<h3>' + esc(d.title) + '</h3><p>' + esc(d.objective) + '</p>' +
            '<div class="row">' + (code ? '<span class="badge ' + (pack.badgeClass || 'b-ver') + '">' + esc(pack.badgeText || ('Verified on ' + pack.engine)) + '</span>' : '<span class="badge b-lab">Board work</span>') + '</div>' +
            '<div class="row"><a class="btn primary" href="' + ROOT + 'demo.html#' + d.id + '">Open in presenter</a></div></article>';
        });
      });
      box.innerHTML = html || '<p class="note">No demonstrations yet.</p>';
    });
  }

  /* ---------- schedule table (home page) ---------- */
  function mountSchedule() {
    document.querySelectorAll('[data-schedule]').forEach(function (box) {
      var rows = (C.WEEKS || []).map(function (w) {
        var topics = w.topics.map(function (id) {
          var t = C.TOPICS[id];
          if (!t) return '';
          return t.status === 'ready'
            ? '<a href="' + ROOT + t.page + '"><b>' + esc(t.title) + '</b></a> <span class="badge b-ver" style="margin-left:4px">Ready</span><br><small class="note">' + esc(t.sources) + '</small>'
            : '<span>' + esc(t.title) + '</span> <small class="note">· planned · ' + esc(t.sources) + '</small>';
        }).join('<br>');
        return '<tr><td class="m">' + w.week + '</td><td style="white-space:nowrap">' + esc(w.wc) + '</td><td>' + topics + '</td><td>' + (w.note ? '<b style="color:var(--chal)">' + esc(w.note) + '</b>' : '') + '</td></tr>';
      }).join('');
      box.innerHTML = '<div class="tbl"><table><thead><tr><th>Week</th><th>w/c</th><th>Topics</th><th>Assessment</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    });
  }

  function init() {
    mountSchedule();
    mountDemoLists();
    mountMenus();
    decorateCode();
    document.querySelectorAll('.quiz[data-quiz]').forEach(mountQuiz);
    mountRatings();
    scrollSpy();
    (C.onReady || []).forEach(function (f) { try { f(); } catch (e) { if (window.console) console.error(e); } });
  }
  C.ready = function (f) { (C.onReady = C.onReady || []).push(f); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})();
