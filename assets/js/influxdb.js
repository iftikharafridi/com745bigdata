/* COM745 InfluxDB topic: interactive explorers.
   The line-protocol explorer, the GROUP BY time() explorer and the playground
   run on the in-browser InfluxQL engine (influx-engine.js), loaded with the
   campus sensor data. The engine was checked against a real InfluxDB server;
   the timestamp converter and cardinality calculator are plain calculations. */
(function () {
  'use strict';
  var C = window.COM745, esc = C.esc;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function seg(name, options, current) {
    return '<div class="seg" role="group" aria-label="' + esc(name) + '">' + options.map(function (o) {
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
    if (window.InfluxEngine && C.CAMPUS) return true;
    $('.body', el).innerHTML = '<p class="msg err">The InfluxQL engine did not load (assets/js/influx-engine.js).</p>';
    return false;
  }
  function campusEngine() {
    var e = new window.InfluxEngine({ precision: 'rfc3339' });
    e.importText(C.CAMPUS.file, 's');
    e.cli('USE campus');
    return e;
  }
  function results(json) {
    var r = (json.results || [])[0] || {};
    return { error: r.error, series: r.series || [] };
  }

  /* ---------------------------------------------------------------- A3
     Line protocol: colour the parts of each line, then write it. */
  function splitLP(line) {
    // returns {m, tags, fields, ts} as raw strings, honouring \ escapes and "quoted" field values
    var i = 0, n = line.length, part = 0, buf = ['', '', '', ''], inQ = false, sawComma = false;
    for (; i < n; i++) {
      var ch = line[i];
      if (ch === '\\' && i + 1 < n) { buf[part] += ch + line[i + 1]; i++; continue; }
      if (part === 2 && ch === '"') { inQ = !inQ; buf[part] += ch; continue; }
      if (inQ) { buf[part] += ch; continue; }
      if (part === 0 && ch === ',' && !sawComma) { part = 1; sawComma = true; continue; }
      if (ch === ' ' && part < 3) { part = part === 0 ? 2 : part + 1; continue; }
      buf[part] += ch;
    }
    return { m: buf[0], tags: buf[1], fields: buf[2], ts: buf[3] };
  }
  function splitOn(str, sep, limit) { // split on sep, ignoring \-escaped and "quoted" characters
    var out = [''], q = false;
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch === '\\' && i + 1 < str.length) { out[out.length - 1] += ch + str[i + 1]; i++; continue; }
      if (ch === '"') q = !q;
      if (ch === sep && !q && (!limit || out.length < limit)) { out.push(''); continue; }
      out[out.length - 1] += ch;
    }
    return out;
  }
  function fieldType(v) {
    if (/^".*"$/.test(v)) return 'string';
    if (/^-?\d+i$/.test(v)) return 'integer';
    if (/^(t|T|true|True|TRUE|f|F|false|False|FALSE)$/.test(v)) return 'boolean';
    if (/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) return 'float';
    return 'not valid';
  }
  function tsText(ts) {
    if (!ts) return 'none: the server stamps it with its own clock';
    if (!/^-?\d+$/.test(ts)) return 'not a whole number';
    try {
      var ms = Number(BigInt(ts) / 1000000n);
      var d = new Date(ms);
      var digits = ts.replace('-', '').length;
      var warn = digits <= 11 ? ' (looks like seconds: read as nanoseconds it is 1970!)' : '';
      return isNaN(d) ? 'out of range' : d.toISOString().replace('.000Z', 'Z') + warn;
    } catch (e) { return 'out of range'; }
  }
  var LP_PRESETS = [
    ['Campus reading', 'room_env,room=lab_1,room_type=lab temp_c=19.6,co2_ppm=612i,occupancy=14i 1770022800000000000'],
    ['Bee census (lecture)', 'census,location=1,scientist=langstroth butterflies=12i,honeybees=23i 1439856000000000000\ncensus,location=1,scientist=perpetua butterflies=1i,honeybees=30i 1439856000000000000'],
    ['Type clash', 'room_env,room=lab_1 co2_ppm=612i 1770022800000000000\nroom_env,room=lab_1 co2_ppm=650 1770024600000000000'],
    ['Same time twice', 'room_env,room=lab_1 temp_c=19.6,co2_ppm=612i 1770022800000000000\nroom_env,room=lab_1 temp_c=21.0 1770022800000000000'],
    ['Space in a name', 'room env,room=lab_1 temp_c=20 1770022800000000000'],
    ['Escaped space, string field', 'notes,room=lab\\ 3 text="Projector replaced",ok=true 1770030000000000000'],
    ['Seconds by mistake', 'room_env,room=lab_2 temp_c=19.2 1770022800'],
    ['No timestamp', 'room_env,room=lab_2 temp_c=19.2']
  ];
  function lineProto(el) {
    if (!engineOk(el)) return;
    var text = LP_PRESETS[0][1];
    function render() {
      var lines = text.split('\n').filter(function (l) { return l.trim(); });
      var html = '<div class="presets">' + LP_PRESETS.map(function (p, i) { return '<button type="button" data-p="' + i + '">' + esc(p[0]) + '</button>'; }).join('') + '</div>' +
        '<label class="visually-hidden" for="lp-in">Line protocol points, one per line</label><textarea id="lp-in" class="sql" rows="3" spellcheck="false">' + esc(text) + '</textarea>' +
        '<div class="controls"><button type="button" class="btn primary" data-go>Write these points</button><span class="note">One point per line, as in a file for influx -import.</span></div>';
      lines.forEach(function (l, i) {
        var p = splitLP(l.trim());
        var tags = p.tags ? splitOn(p.tags, ',') : [];
        var fields = p.fields ? splitOn(p.fields, ',') : [];
        html += '<div class="card lp-card"><span class="k">Line ' + (i + 1) + '</span><div class="lp-anatomy"><code><span class="lp-m">' + esc(p.m) + '</span>' +
          (p.tags ? ',<span class="lp-t">' + esc(p.tags) + '</span>' : '') + (p.fields ? ' <span class="lp-f">' + esc(p.fields) + '</span>' : '') + (p.ts ? ' <span class="lp-ts">' + esc(p.ts) + '</span>' : '') + '</code></div>' +
          '<div class="tbl"><table><thead><tr><th>Part</th><th>Key</th><th>Value</th><th>Notes</th></tr></thead><tbody>' +
          '<tr><td><span class="lp-m">measurement</span></td><td colspan="2" class="m">' + esc(p.m) + '</td><td>' + (/^[A-Za-z_]\w*$/.test(p.m) ? 'OK' : 'Letters, digits and underscores are safest') + '</td></tr>' +
          tags.map(function (t) { var kv = splitOn(t, '=', 2); return '<tr><td><span class="lp-t">tag</span></td><td class="m">' + esc(kv[0]) + '</td><td class="m">' + esc(kv[1] || '') + '</td><td>string, indexed</td></tr>'; }).join('') +
          fields.map(function (f) { var kv = splitOn(f, '=', 2); var ty = fieldType(kv[1] || ''); return '<tr><td><span class="lp-f">field</span></td><td class="m">' + esc(kv[0]) + '</td><td class="m">' + esc(kv[1] || '') + '</td><td' + (ty === 'not valid' ? ' class="err"' : '') + '>' + ty + ', not indexed</td></tr>'; }).join('') +
          '<tr><td><span class="lp-ts">timestamp</span></td><td colspan="2" class="m">' + esc(p.ts || '—') + '</td><td>' + esc(tsText(p.ts)) + '</td></tr>' +
          '</tbody></table></div></div>';
      });
      html += '<div class="result" aria-live="polite"></div>';
      $('.body', el).innerHTML = html;
      el.querySelectorAll('[data-p]').forEach(function (b) { b.addEventListener('click', function () { text = LP_PRESETS[+b.dataset.p][1]; render(); write(); }); });
      $('#lp-in', el).addEventListener('change', function (e) { text = e.target.value; render(); write(); });
      $('[data-go]', el).addEventListener('click', function () { text = $('#lp-in', el).value; render(); write(); });
    }
    function write() {
      var e = new window.InfluxEngine({ precision: 'rfc3339' });
      var out = ['> CREATE DATABASE scratch', '> USE scratch', 'Using database scratch'];
      e.cli('CREATE DATABASE scratch'); e.cli('USE scratch');
      var meas = {};
      text.split('\n').filter(function (l) { return l.trim(); }).forEach(function (l) {
        var r = e.cli('INSERT ' + l.trim());
        out.push('> INSERT ' + l.trim()); if (r) out.push(r);
        var m = splitLP(l.trim()).m; if (m) meas[m.replace(/\\ /g, ' ')] = 1;
      });
      Object.keys(meas).forEach(function (m) {
        var q = 'SELECT * FROM "' + m.replace(/"/g, '\\"') + '"';
        var r = e.cli(q); out.push('> ' + q); out.push(r || '(nothing stored)');
      });
      var r2 = e.cli('SHOW SERIES'); out.push('> SHOW SERIES'); out.push(r2 || '(no series)');
      $('.result', el).innerHTML = '<div class="console" style="white-space:pre;overflow:auto;max-height:420px">' + esc(out.join('\n')) + '</div>';
    }
    render(); write();
  }

  /* ---------------------------------------------------------------- A4
     Timestamp converter (UTC or UK local time). */
  function londonOffsetMin(ms) {
    try {
      var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      var p = {}; f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
      var local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      return Math.round((local - Math.floor(ms / 1000) * 1000) / 60000);
    } catch (e) { // no Intl time zone data: EU rule for the UK
      var d = new Date(ms), y = d.getUTCFullYear();
      function lastSun(m) { var t = new Date(Date.UTC(y, m + 1, 0, 1)); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t.getTime(); }
      return (ms >= lastSun(2) && ms < lastSun(9)) ? 60 : 0;
    }
  }
  function timeConv(el) {
    var st = { date: '2017-10-27', time: '09:00', zone: 'utc', num: '1770022800' };
    function render() {
      var parts = st.date.split('-').map(Number), hm = st.time.split(':').map(Number), html = '';
      var ms = Date.UTC(parts[0], parts[1] - 1, parts[2], hm[0] || 0, hm[1] || 0, hm[2] || 0), off = 0;
      if (st.zone === 'uk') { off = londonOffsetMin(ms - 60 * 60000); ms -= off * 60000; off = londonOffsetMin(ms); }
      var ok = !isNaN(ms), s = Math.floor(ms / 1000);
      var ukOff = ok ? londonOffsetMin(ms) : 0;
      html += '<div class="controls">' +
        '<label class="ctl" for="tc-d">Date<input id="tc-d" type="date" value="' + esc(st.date) + '"></label>' +
        '<label class="ctl" for="tc-t">Time<input id="tc-t" type="time" step="1" value="' + esc(st.time) + '"></label>' +
        '<div class="ctl"><span>The time is in</span>' + seg('Time zone', [['utc', 'UTC'], ['uk', 'UK local time']], st.zone) + '</div></div>';
      if (ok) {
        html += '<div class="tbl"><table><tbody>' +
          '<tr><th>RFC 3339 (what the shell prints)</th><td class="m">' + new Date(ms).toISOString().replace('.000Z', 'Z') + '</td></tr>' +
          '<tr><th>Unix seconds (most converters; <code>precision s</code>)</th><td class="m">' + s + '</td></tr>' +
          '<tr><th>Milliseconds (<code>precision ms</code>)</th><td class="m">' + s + '000</td></tr>' +
          '<tr><th>Nanoseconds (InfluxDB default)</th><td class="m"><b>' + s + '000000000</b></td></tr>' +
          '<tr><th>UK local time</th><td>' + (ukOff ? 'BST (UTC+1): ' : 'GMT (= UTC): ') + new Date(ms + ukOff * 60000).toISOString().slice(0, 16).replace('T', ' ') + '</td></tr>' +
          '</tbody></table></div>';
        if (st.zone === 'uk' && ukOff) html += '<p class="note">' + esc(st.time) + ' UK time on this date is summer time, so it is one hour earlier in UTC. Write <code>tz(\'Europe/London\')</code> at the end of a query to see results in UK time.</p>';
      } else html += '<p class="msg err">Enter a valid date and time.</p>';
      var n = st.num.trim(), back = '';
      if (/^-?\d{1,19}$/.test(n)) {
        var len = n.replace('-', '').length, unit = len <= 11 ? 's' : len <= 14 ? 'ms' : len <= 17 ? 'u' : 'ns';
        var msv = unit === 's' ? +n * 1000 : unit === 'ms' ? +n : unit === 'u' ? Math.floor(+n / 1000) : Number(BigInt(n) / 1000000n);
        back = 'Looks like <b>' + ({ s: 'seconds', ms: 'milliseconds', u: 'microseconds', ns: 'nanoseconds' })[unit] + '</b>: ' + new Date(msv).toISOString().replace('.000Z', 'Z') +
          (unit !== 'ns' ? '. Inserted as it is (nanoseconds), it would land at ' + new Date(unit === 's' ? Math.floor(+n / 1e6) : Math.floor(+n / 1e6)).toISOString().replace(/\.\d+Z/, 'Z') + '.' : '.');
      } else back = 'Paste a whole number.';
      html += '<div class="controls"><label class="ctl" for="tc-n">Or paste a timestamp<input id="tc-n" type="text" inputmode="numeric" value="' + esc(st.num) + '"></label></div><p class="note" aria-live="polite">' + back + '</p>';
      $('.body', el).innerHTML = html;
      $('#tc-d', el).addEventListener('change', function (e) { st.date = e.target.value; render(); });
      $('#tc-t', el).addEventListener('change', function (e) { st.time = e.target.value; render(); });
      $('#tc-n', el).addEventListener('change', function (e) { st.num = e.target.value; render(); });
      el.querySelectorAll('.seg button').forEach(function (b) { b.addEventListener('click', function () { st.zone = b.dataset.v; render(); }); });
    }
    render();
  }

  /* ---------------------------------------------------------------- A5
     Cardinality: roles for the Practical 7 attributes. */
  var ATTRS = [
    { k: 'sensor_id', d: 'isj72ls, ka74zx …', role: 'tag', per: 'sensor' },
    { k: 'sensor_class', d: 'temperature, humidity, light, power usage', role: 'tag', per: 'class' },
    { k: 'location', d: 'kitchen, bedroom', role: 'tag', per: 'location' },
    { k: 'label', d: 'Blue sensor, Wemo - tv …', role: 'tag', per: 'sensor' },
    { k: 'unit', d: 'Celsius, %, Lumens, Watthour', role: 'tag', per: 'class' },
    { k: 'value', d: '19.2, 52, 180 …', role: 'field', per: 'reading' },
    { k: 'reading_id', d: 'a unique code per reading', role: 'field', per: 'point' }
  ];
  function fmtN(n) { return n >= 1e12 ? '> 10¹²' : Math.round(n).toLocaleString('en-GB'); }
  function cardinality(el) {
    var st = { sensors: 5, rate: 24, days: 30 };
    ATTRS.forEach(function (a) { st[a.k] = a.role; });
    function render() {
      var N = st.sensors, classes = Math.min(4, N), locs = N <= 5 ? 2 : Math.max(2, Math.round(N / 5));
      var points = N * st.rate * st.days;
      var distinct = { sensor: N, class: classes, location: locs };
      var tags = ATTRS.filter(function (a) { return st[a.k] === 'tag'; });
      var fields = ATTRS.filter(function (a) { return st[a.k] === 'field'; });
      var series, msgs = [], perSensor = tags.some(function (a) { return a.per === 'sensor'; });
      if (tags.some(function (a) { return a.per === 'point' || a.per === 'reading'; })) series = points;
      else if (perSensor) series = N;
      else if (tags.length) series = Math.min(N, tags.reduce(function (p, a) { return p * distinct[a.per]; }, 1));
      else series = 1;
      if (st.value === 'tag') msgs.push(['err', 'value as a tag: tag values are strings, so mean(), max() and spread() cannot use it, and every new reading value is a new series.']);
      if (st.value === 'none') msgs.push(['err', 'value is not stored: there is nothing to query. The measured value must be a field.']);
      if (st.reading_id === 'tag') msgs.push(['err', 'reading_id as a tag: one new series for every point (' + fmtN(points) + ' over ' + st.days + ' days, and growing every day). This is the unbounded cardinality slide 21 warns about.']);
      if (st.reading_id === 'field') msgs.push(['warn', 'reading_id as a field is safe for cardinality, but the series plus the timestamp already identify each reading: store it only if something downstream needs it.']);
      if (!perSensor && st.reading_id !== 'tag') {
        if (N > classes * locs || tags.length < 2) msgs.push(['err', 'No tag identifies the sensor. Two sensors of the same class in the same place, read at the same second, are the same point: the second write overwrites the first.']);
        else msgs.push(['warn', 'No sensor tag: with these five sensors, class + location happens to be unique, but adding a second kitchen thermometer would make their readings overwrite each other.']);
      }
      if (st.label === 'tag') msgs.push(['warn', 'label as a tag adds no series (one label per sensor) but repeats "Blue sensor" in every point, and its spaces must be escaped. It never changes per reading: keep it with the sensor\'s description in the other database (Practical 6).']);
      if (st.unit === 'tag' || st.unit === 'field') msgs.push(['warn', 'unit follows from the class and never changes: storing it in every point repeats it. Keep it in the sensor table, or name the field temp_c-style.']);
      if (st.label === 'field') msgs.push(['warn', 'label as a string field is stored with every reading: repeated text, and you cannot GROUP BY it.']);
      if (st.sensor_id === 'field') msgs.push(['warn', 'sensor_id as a field: you cannot GROUP BY it, and WHERE sensor_id = … must scan every point.']);
      if (!msgs.length) msgs.push(['ok', 'A sound design: series grow with the number of sensors, not with the number of readings.']);
      var level = series > 1e6 ? 'err' : series > 1e5 ? 'warn' : 'ok';
      var html = '<div class="cd-rows">' + ATTRS.map(function (a) {
        return '<div class="cd-row"><div class="cd-name"><span class="m">' + a.k + '</span><span class="note">' + esc(a.d) + '</span></div>' + seg(a.k, [['tag', 'Tag'], ['field', 'Field'], ['none', 'Elsewhere']], st[a.k]).replace('class="seg"', 'class="seg" data-k="' + a.k + '"') + '</div>';
      }).join('') + '</div>';
      html += '<div class="controls">' + select('cd-n', 'Sensors', [[5, '5 (Practical 7)'], [50, '50'], [500, '500'], [5000, '5,000'], [50000, '50,000']], st.sensors) +
        select('cd-r', 'Readings per sensor', [[24, 'hourly'], [1440, 'every minute'], [86400, 'every second']], st.rate) +
        select('cd-d', 'Kept for', [[30, '30 days'], [365, '1 year']], st.days) + '</div>';
      html += '<div class="grid3"><div class="card stat"><span class="k">Points stored</span><b>' + fmtN(points) + '</b></div>' +
        '<div class="card stat ' + level + '"><span class="k">Series (index entries)</span><b>' + fmtN(series) + '</b></div>' +
        '<div class="card stat small"><span class="k">Tags / fields</span><b>' + (tags.map(function (a) { return a.k; }).join(', ') || '—') + ' / ' + (fields.map(function (a) { return a.k; }).join(', ') || '—') + '</b></div></div>';
      html += '<ul class="list">' + msgs.map(function (m) { return '<li class="msg ' + (m[0] === 'err' ? 'err' : m[0] === 'ok' ? 'okm' : '') + '"' + (m[0] === 'warn' ? ' style="color:var(--chal)"' : '') + '>' + esc(m[1]) + '</li>'; }).join('') + '</ul>';
      var tl = tags.map(function (a) { return a.k + '=' + ({ sensor_id: 'isj72ls', sensor_class: 'temperature', location: 'kitchen', label: 'Blue\\ sensor', unit: 'Celsius', value: '19.2', reading_id: 'r000183' })[a.k]; });
      var fl = fields.map(function (a) { return a.k + '=' + ({ sensor_id: '"isj72ls"', sensor_class: '"temperature"', location: '"kitchen"', label: '"Blue sensor"', unit: '"Celsius"', value: '19.2', reading_id: '"r000183"' })[a.k]; });
      html += '<p class="note">One point in this design:</p><div class="code" data-lang="influxql"><pre>' + esc('sensor_reading' + (tl.length ? ',' + tl.join(',') : '') + ' ' + (fl.join(',') || '(no fields: not a valid point)') + ' 1509094800000000000') + '</pre></div>';
      $('.body', el).innerHTML = html;
      C.decorateCode(el);
      el.querySelectorAll('.seg[data-k] button').forEach(function (b) { b.addEventListener('click', function () { st[b.closest('.seg').dataset.k] = b.dataset.v; render(); }); });
      $('#cd-n', el).addEventListener('change', function (e) { st.sensors = +e.target.value; render(); });
      $('#cd-r', el).addEventListener('change', function (e) { st.rate = +e.target.value; render(); });
      $('#cd-d', el).addEventListener('change', function (e) { st.days = +e.target.value; render(); });
    }
    render();
  }

  /* ---------------------------------------------------------------- A6
     GROUP BY time() + fill(), drawn from the engine's results. */
  function windowsExplorer(el) {
    if (!engineOk(el)) return;
    var eng = campusEngine();
    var st = { room: 'lab_2', field: 'temp_c', fn: 'mean', win: '30m', fill: 'null' };
    var T0 = '2026-02-02T08:00:00Z', T1 = '2026-02-02T18:00:00Z';
    function q() {
      return 'SELECT ' + st.fn + '(' + st.field + ') FROM room_env WHERE room = \'' + st.room + '\' AND time >= \'' + T0 + '\' AND time <= \'' + T1 + '\' GROUP BY time(' + st.win + ')' + (st.fill === 'null' ? '' : ' fill(' + st.fill + ')');
    }
    function t2x(t) { return 50 + (Date.parse(t) - Date.parse(T0)) / 36e5 * 57; }
    function render() {
      var raw = results(eng.query('SELECT ' + st.field + ' FROM room_env WHERE room = \'' + st.room + '\' AND time >= \'' + T0 + '\' AND time <= \'' + T1 + '\'', 'campus')).series[0];
      var res = results(eng.query(q(), 'campus')), ser = res.series[0];
      var rv = raw ? raw.values : [], wv = ser ? ser.values : [];
      var all = rv.map(function (v) { return v[1]; }).concat(wv.map(function (v) { return v[1]; })).filter(function (v) { return v !== null; });
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
      if (st.fn === 'count') { lo = 0; hi = Math.max(hi, 2); }
      if (hi === lo) { hi += 1; lo -= 1; }
      var pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
      function y(v) { return 210 - (v - lo) / (hi - lo) * 180; }
      var wmin = { '30m': 30, '1h': 60, '2h': 120 }[st.win];
      var svg = '<svg viewBox="0 0 640 250" role="img" aria-label="Raw readings and window values" class="tschart">';
      for (var h = 8; h <= 18; h += 2) { var x = 50 + (h - 8) * 57; svg += '<line x1="' + x + '" y1="25" x2="' + x + '" y2="212" class="grid"/><text x="' + x + '" y="232" text-anchor="middle">' + (h < 10 ? '0' : '') + h + ':00</text>'; }
      [lo + pad, (lo + hi) / 2, hi - pad].forEach(function (v) { svg += '<text x="44" y="' + (y(v) + 4) + '" text-anchor="end">' + (Math.round(v * 10) / 10) + '</text>'; });
      wv.forEach(function (v) {
        var x0 = t2x(v[0]), x1 = Math.min(x0 + wmin / 60 * 57, 50 + 10 * 57 + 28);
        if (v[1] === null) svg += '<rect x="' + x0 + '" y="25" width="' + (x1 - x0) + '" height="187" class="gap"><title>' + v[0] + ': empty window</title></rect>';
        else svg += '<rect x="' + (x0 + 1) + '" y="' + y(v[1]) + '" width="' + Math.max(2, x1 - x0 - 2) + '" height="4" class="win"><title>' + v[0] + ': ' + v[1] + '</title></rect>';
      });
      if (st.fn !== 'count') rv.forEach(function (v) { svg += '<circle cx="' + t2x(v[0]) + '" cy="' + y(v[1]) + '" r="3.2" class="raw"><title>' + v[0] + ': ' + v[1] + '</title></circle>'; });
      svg += '</svg>';
      var html = '<div class="controls">' + select('ws-r', 'Room', ['lab_1', 'lab_2', 'lecture_a'], st.room) + select('ws-f', 'Field', ['temp_c', 'co2_ppm', 'occupancy', 'humidity'], st.field) +
        select('ws-fn', 'Function', [['mean', 'mean()'], ['max', 'max()'], ['min', 'min()'], ['count', 'count()']], st.fn) +
        '<div class="ctl"><span>Window</span>' + seg('Window', [['30m', '30m'], ['1h', '1h'], ['2h', '2h']], st.win).replace('class="seg"', 'class="seg" data-k="win"') + '</div>' +
        '<div class="ctl"><span>fill()</span>' + seg('fill', [['null', 'null'], ['none', 'none'], ['previous', 'previous'], ['linear', 'linear'], ['0', '0']], st.fill).replace('class="seg"', 'class="seg" data-k="fill"') + '</div></div>';
      html += '<div class="chartbox">' + svg + '<div class="legend"><span><i class="raw"></i>raw reading</span><span><i class="win"></i>one result row</span><span><i class="gap"></i>empty window (shown as no value)</span></div></div>';
      html += '<div class="code" data-lang="influxql"><pre>' + esc(q()) + '</pre></div>';
      html += res.error ? '<p class="msg err">ERR: ' + esc(res.error) + '</p>' :
        '<details><summary>Result: ' + wv.length + ' rows' + (st.fill === 'none' ? '' : ', ' + wv.filter(function (v) { return v[1] === null; }).length + ' without a value') + '</summary><div class="console" style="white-space:pre;max-height:300px;overflow:auto">' + esc(eng.formatSeries(res.series)) + '</div></details>';
      var note = st.room !== 'lab_2' ? 'Choose lab_2 to see a missing reading.' :
        st.win !== '30m' ? 'With windows longer than 30 minutes the 12:30 gap is hidden: the window still has other readings in it.' :
        ({ 'null': 'fill(null), the default: the 12:30 window is printed with no value.', none: 'fill(none): the 12:30 window is left out, so there is one row fewer.', previous: 'fill(previous): 12:30 repeats the 12:00 value.', linear: 'fill(linear): 12:30 is halfway between 12:00 and 13:00.', '0': 'fill(0): 12:30 shows 0, which for a temperature is wrong. It suits counts.' })[st.fill];
      html += '<p class="note" aria-live="polite">' + esc(note) + '</p>';
      $('.body', el).innerHTML = html;
      C.decorateCode(el);
      $('#ws-r', el).addEventListener('change', function (e) { st.room = e.target.value; render(); });
      $('#ws-f', el).addEventListener('change', function (e) { st.field = e.target.value; render(); });
      $('#ws-fn', el).addEventListener('change', function (e) { st.fn = e.target.value; render(); });
      el.querySelectorAll('.seg[data-k] button').forEach(function (b) { b.addEventListener('click', function () { st[b.closest('.seg').dataset.k] = b.dataset.v; render(); }); });
    }
    render();
  }

  /* ---------------------------------------------------------------- C1 playground */
  var PG = { el: null, e: null };
  var PRESETS = [
    ['Explore', 'SHOW MEASUREMENTS\nSHOW TAG KEYS\nSHOW FIELD KEYS'],
    ['Series', 'SHOW SERIES'],
    ['lab_1, first 4', "SELECT * FROM room_env WHERE room = 'lab_1' LIMIT 4"],
    ['Per room', 'SELECT mean(temp_c), max(co2_ppm) FROM room_env GROUP BY room'],
    ['Hourly CO2', "SELECT mean(co2_ppm) FROM room_env WHERE room = 'lab_1' AND time >= '2026-02-02T08:00:00Z' AND time < '2026-02-02T18:00:00Z' GROUP BY time(1h)"],
    ['The gap', "SELECT mean(temp_c) FROM room_env WHERE room = 'lab_2' AND time >= '2026-02-02T11:30:00Z' AND time <= '2026-02-02T13:30:00Z' GROUP BY time(30m) fill(linear)"],
    ['Moving average', "SELECT moving_average(temp_c, 3) FROM room_env WHERE room = 'lecture_a'"],
    ['Double quotes trap', 'SELECT temp_c FROM room_env WHERE room = "lab_1"'],
    ['Type clash', 'INSERT room_env,room=lab_1,room_type=lab co2_ppm=650 1770024600000000000'],
    ['Bee census', null]
  ];
  function pgRun() {
    var code = $('textarea', PG.el).value, out = $('.result', PG.el), html = '';
    C.store.set('ipg:last', code);
    var lines = code.split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) { out.innerHTML = '<p class="msg">Type a command, then press Run (or Ctrl+Enter).</p>'; return; }
    lines.forEach(function (l) {
      var r;
      try { r = PG.e.cli(l.trim()); } catch (err) { r = 'ERR: ' + err.message; }
      html += '<div class="msg">' + esc('> ' + (l.length > 110 ? l.slice(0, 108) + '…' : l)) + '</div>';
      if (r && /^ERR/.test(r)) html += '<div class="msg err">' + esc(r) + '</div>';
      else if (r) html += '<div class="console" style="white-space:pre;overflow:auto;max-height:420px">' + esc(r) + '</div>';
      else if (/^\s*select/i.test(l)) html += '<div class="msg">(no rows: check quotes, letter case and the time range)</div>';
    });
    out.innerHTML = html;
    pgSchema();
  }
  function pgSchema() {
    var box = $('.schema', PG.el), e = PG.e, db = e.current;
    var html = '<span style="font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700">' + esc(db || 'no database selected') + '</span>';
    if (db) {
      var ms = results(e.query('SHOW MEASUREMENTS', db)).series[0];
      var tk = results(e.query('SHOW TAG KEYS', db)).series, fk = results(e.query('SHOW FIELD KEYS', db)).series;
      html += ms ? ms.values.map(function (v) {
        var m = v[0], t = (tk.filter(function (s) { return s.name === m; })[0] || { values: [] }).values, f = (fk.filter(function (s) { return s.name === m; })[0] || { values: [] }).values;
        return '<details open><summary>' + esc(m) + '</summary><ul>' + t.map(function (x) { return '<li class="pk">' + esc(x[0]) + ' <i>tag</i></li>'; }).join('') +
          f.map(function (x) { return '<li>' + esc(x[0]) + ' <i>' + esc(x[1]) + '</i></li>'; }).join('') + '</ul></details>';
      }).join('') : '<p class="note">No measurements yet.</p>';
    }
    box.innerHTML = html;
  }
  function playground(el) {
    PG.el = el;
    el.querySelector('.body').innerHTML =
      '<div class="presets" aria-label="Example commands">' + PRESETS.map(function (p, i) { return '<button type="button" data-p="' + i + '">' + esc(p[0]) + '</button>'; }).join('') + '</div>' +
      '<div class="play"><div class="schema"></div><div style="display:flex;flex-direction:column;gap:10px;min-width:0">' +
      '<label class="visually-hidden" for="ipg-code">influx shell commands to run</label><textarea id="ipg-code" class="sql" spellcheck="false"></textarea>' +
      '<div class="controls"><button type="button" class="btn primary" data-run>Run (Ctrl+Enter)</button><button type="button" class="btn" data-reset>Reset data</button><span class="note">One command per line, as in the influx shell. Lines starting with -- are ignored.</span></div>' +
      '<div class="result" aria-live="polite"></div></div></div>';
    if (!engineOk(el)) return;
    PG.e = campusEngine();
    var ta = $('textarea', el);
    ta.value = C.store.get('ipg:last', PRESETS[3][1]);
    el.querySelectorAll('[data-p]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = PRESETS[+b.dataset.p];
        ta.value = p[1] === null ? 'CREATE DATABASE bees\nUSE bees\n' + C.CAMPUS.census + '\nSELECT * FROM census\nSHOW SERIES' : p[1];
        pgRun();
      });
    });
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); pgRun(); } });
    $('[data-run]', el).addEventListener('click', pgRun);
    $('[data-reset]', el).addEventListener('click', function () { PG.e = campusEngine(); pgSchema(); $('.result', el).innerHTML = '<p class="msg okm">campus reloaded from campus_sensors.txt and selected (USE campus).</p>'; });
    pgRun();
  }
  C.influxPlayground = { load: function (code) { if (!PG.el) return; if (PG.e.current !== 'campus') { if (!PG.e.dbs.campus) PG.e = campusEngine(); else PG.e.cli('USE campus'); } $('textarea', PG.el).value = code; PG.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); pgRun(); } };

  var MOUNTS = { lineproto: lineProto, timeconv: timeConv, cardinality: cardinality, windows: windowsExplorer, iplayground: playground };
  C.ready(function () {
    document.querySelectorAll('[data-explorer]').forEach(function (el) { var f = MOUNTS[el.getAttribute('data-explorer')]; if (f) f(el); });
    document.querySelectorAll('[data-try-influx]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pre = b.closest('.task, .card, details').querySelector('[data-lang=influxql] pre');
        C.influxPlayground.load(pre.textContent);
      });
    });
  });
})();
