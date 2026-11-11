window.TM = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var MAX_ROWS = 5000, PAGE = 25;
  var PILL = ['#0E5BDB', '#1E8E4E', '#C77700', '#C0392B', '#7B3FD1', '#0C8A8A', '#B8327A', '#5B6B8C'];
  var S = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    var s = v.replace(/[$,%\s]/g, '');
    if (/^\((.*)\)$/.test(s)) s = '-' + s.slice(1, -1);
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
  }
  function toDate(v) {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v !== 'string') return null;
    var s = v.trim();
    if (!/^(\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4}|\d{1,2} [A-Za-z]{3,9} \d{4})/.test(s)) return null;
    var iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
    var t = Date.parse(s);
    return isNaN(t) ? null : new Date(t);
  }
  function fmtNum(n, money) {
    var o = { maximumFractionDigits: Math.abs(n) >= 1000 || Number.isInteger(n) ? (money && !Number.isInteger(n) ? 2 : 0) : 2 };
    if (money) { o.style = 'currency'; o.currency = 'USD'; if (Number.isInteger(n) || Math.abs(n) >= 1000) { o.minimumFractionDigits = 0; o.maximumFractionDigits = 0; } }
    return n.toLocaleString('en-US', o);
  }
  function fmtDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function titleCase(s) {
    return s.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }) || 'Your App';
  }

  /* ---------- turn raw rows into a typed model ---------- */
  function build(name, grid, opts) {
    opts = opts || {};
    grid = grid.filter(function (r) { return r.some(function (c) { return c !== '' && c != null; }); });
    var h = 0;
    while (h < grid.length - 1 && grid[h].filter(function (c) { return c !== '' && c != null; }).length < 2) h++;
    if (grid.length - h < 2) throw new Error('That file needs a header row and at least one row of data.');
    var width = Math.max.apply(null, grid.slice(h, h + 50).map(function (r) { return r.length; }));
    var body = grid.slice(h + 1, h + 1 + MAX_ROWS);
    var cols = [], seen = {};
    for (var i = 0; i < width; i++) {
      var vals = body.map(function (r) { return r[i]; }).filter(function (v) { return v !== '' && v != null; });
      if (!vals.length) continue;
      var label = String(grid[h][i] == null || grid[h][i] === '' ? 'Column ' + (i + 1) : grid[h][i]).trim();
      if (grid[h][i] instanceof Date) label = fmtDate(grid[h][i]);
      while (seen[label]) label += ' 2';
      seen[label] = 1;
      var nums = 0, dates = 0, money = false;
      vals.forEach(function (v) {
        if (toDate(v)) dates++;
        else if (toNum(v) !== null) { nums++; if (typeof v === 'string' && v.indexOf('$') > -1) money = true; }
      });
      var type = 'text';
      if (dates / vals.length >= 0.8) type = 'date';
      else if (nums / vals.length >= 0.85) {
        type = /#|\b(id|no|num|number|zip|postal|phone|sku|year|code)\b/i.test(label) ? 'text' : 'number';
        if (/price|cost|total|amount|revenue|sales|paid|balance|fee|budget|invoice|payment|\$/i.test(label)) money = true;
      }
      var uniq = [];
      if (type === 'text') {
        var u = {};
        vals.forEach(function (v) { u[String(v).trim()] = (u[String(v).trim()] || 0) + 1; });
        uniq = Object.keys(u);
        if (uniq.length >= 2 && uniq.length <= 12 && uniq.length <= Math.max(2, vals.length * 0.6)) {
          type = 'category';
          uniq.sort(function (a, b) { return u[b] - u[a]; });
        }
      }
      cols.push({ i: i, label: label, type: type, money: money, options: type === 'category' ? uniq : [] });
    }
    if (!cols.length) throw new Error('We could not find any data in that file.');
    var rows = body.map(function (r) {
      return cols.map(function (c) {
        var v = r[c.i];
        if (v === '' || v == null) return null;
        if (c.type === 'number') return toNum(v);
        if (c.type === 'date') return toDate(v);
        return v instanceof Date ? fmtDate(v) : String(v).trim();
      });
    });
    var appType = opts.appType === 'log' ? 'log' : 'board';
    return {
      name: titleCase(name), cols: cols, rows: rows, total: grid.length - h - 1,
      appType: appType, entryTitle: opts.entryTitle || (appType === 'log' ? 'Log an entry' : 'Add new'),
      tab: appType === 'log' ? 'entry' : 'dashboard',
      q: '', filters: {}, sort: null, page: 0, toast: '', entry: {}, logged: []
    };
  }

  /* ---------- views ---------- */
  function cell(c, v) {
    if (v == null) return '<td' + (c.type === 'number' ? ' class="num"' : '') + '></td>';
    if (c.type === 'number') return '<td class="num">' + esc(fmtNum(v, c.money)) + '</td>';
    if (c.type === 'date') return '<td>' + esc(fmtDate(v)) + '</td>';
    if (c.type === 'category') {
      var k = c.options.indexOf(v);
      return '<td><span class="pill" style="--pc:' + PILL[(k < 0 ? 7 : k) % PILL.length] + '">' + esc(v) + '</span></td>';
    }
    return '<td title="' + esc(v) + '">' + esc(v) + '</td>';
  }
  function hbars(title, pairs, money) {
    var max = Math.max.apply(null, pairs.map(function (p) { return p[1]; }).concat([1]));
    return '<div class="card"><h4>' + esc(title) + '</h4>' + pairs.map(function (p) {
      return '<div class="hbar"><span class="n" title="' + esc(p[0]) + '">' + esc(p[0]) + '</span><span class="t"><i style="width:' +
        Math.max(2, p[1] / max * 100).toFixed(1) + '%"></i></span><span class="c">' + esc(fmtNum(p[1], money)) + '</span></div>';
    }).join('') + '</div>';
  }
  function dashboard() {
    var ci = function (t) { return S.cols.map(function (c, k) { return c.type === t ? k : -1; }).filter(function (k) { return k >= 0; }); };
    var nums = ci('number'), cats = ci('category'), dates = ci('date');
    var html = '<h3>Dashboard</h3><div class="kpis"><div class="kpi"><div class="l">Total records</div><div class="v">' +
      fmtNum(S.rows.length) + '</div><div class="s">' + S.cols.length + ' fields</div></div>';
    nums.slice(0, 3).forEach(function (k) {
      var c = S.cols[k], vs = S.rows.map(function (r) { return r[k]; }).filter(function (v) { return v != null; });
      var sum = vs.reduce(function (a, b) { return a + b; }, 0);
      html += '<div class="kpi"><div class="l" title="' + esc(c.label) + '">' + (/^total/i.test(c.label) ? '' : 'Total ') + esc(c.label) + '</div><div class="v">' +
        esc(fmtNum(sum, c.money)) + '</div><div class="s">Average ' + esc(fmtNum(vs.length ? sum / vs.length : 0, c.money)) + '</div></div>';
    });
    html += '</div><div class="charts">';
    var charts = 0;
    cats.slice(0, 2).forEach(function (k, n) {
      var c = S.cols[k], m = {}, nk = n === 1 || !nums.length ? -1 : nums[0];
      S.rows.forEach(function (r) { if (r[k] != null) m[r[k]] = (m[r[k]] || 0) + (nk < 0 ? 1 : (r[nk] || 0)); });
      var pairs = Object.keys(m).map(function (x) { return [x, m[x]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
      html += hbars(nk < 0 ? 'Records by ' + c.label : S.cols[nk].label + ' by ' + c.label, pairs, nk >= 0 && S.cols[nk].money);
      charts++;
    });
    if (dates.length) {
      var dk = dates[0], mm = {};
      S.rows.forEach(function (r) {
        if (!r[dk]) return;
        var key = r[dk].getFullYear() * 12 + r[dk].getMonth();
        mm[key] = (mm[key] || 0) + 1;
      });
      var keys = Object.keys(mm).map(Number).sort(function (a, b) { return a - b; }).slice(-12);
      if (keys.length > 1) {
        var mx = Math.max.apply(null, keys.map(function (x) { return mm[x]; }));
        html += '<div class="card"><h4>Records per month, by ' + esc(S.cols[dk].label) + '</h4><div class="cols">' + keys.map(function (x) {
          var d = new Date(Math.floor(x / 12), x % 12, 1);
          return '<div class="col" title="' + mm[x] + ' records"><i style="height:' + (mm[x] / mx * 100).toFixed(1) + '%"></i><span>' +
            d.toLocaleDateString('en-US', { month: 'short' }) + '</span></div>';
        }).join('') + '</div></div>';
        charts++;
      }
    }
    html += '</div>';
    if (!charts) html += '<p class="empty">Open Records to search and sort everything in this sheet.</p>';
    return html;
  }
  function visible() {
    var q = S.q.toLowerCase();
    var rows = S.rows.filter(function (r) {
      for (var k in S.filters) if (S.filters[k] && r[k] !== S.filters[k]) return false;
      if (!q) return true;
      return r.some(function (v, k) {
        if (v == null) return false;
        var s = S.cols[k].type === 'date' ? fmtDate(v) : String(v);
        return s.toLowerCase().indexOf(q) > -1;
      });
    });
    if (S.sort) {
      var k = S.sort.k, d = S.sort.d;
      rows = rows.slice().sort(function (a, b) {
        var x = a[k], y = b[k];
        if (x == null) return 1; if (y == null) return -1;
        if (x instanceof Date) { x = +x; y = +y; }
        return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * d;
      });
    }
    return rows;
  }
  function records() {
    var rows = visible(), pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (S.page >= pages) S.page = pages - 1;
    var html = '<h3>Records</h3><div class="tools"><input id="q" type="search" placeholder="Search everything" value="' + esc(S.q) + '">';
    S.cols.forEach(function (c, k) {
      if (c.type !== 'category') return;
      if (Object.keys(S.filters).length >= 3 && !(k in S.filters)) return;
      if (!(k in S.filters)) S.filters[k] = '';
      html += '<select data-f="' + k + '" aria-label="Filter by ' + esc(c.label) + '"><option value="">All ' + esc(c.label) + '</option>' +
        c.options.map(function (o) { return '<option' + (S.filters[k] === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    });
    html += '<span class="count">' + fmtNum(rows.length) + ' of ' + fmtNum(S.rows.length) + '</span></div><div class="tablewrap"><table><thead><tr>';
    S.cols.forEach(function (c, k) {
      var arrow = S.sort && S.sort.k === k ? (S.sort.d > 0 ? ' ↑' : ' ↓') : '';
      html += '<th data-s="' + k + '"' + (c.type === 'number' ? ' class="num"' : '') + '>' + esc(c.label) + arrow + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.slice(S.page * PAGE, S.page * PAGE + PAGE).forEach(function (r) {
      html += '<tr>' + S.cols.map(function (c, k) { return cell(c, r[k]); }).join('') + '</tr>';
    });
    html += '</tbody></table></div>';
    if (!rows.length) html += '<p class="empty">Nothing matches that search.</p>';
    html += '<div class="pager"><span>Page ' + (S.page + 1) + ' of ' + pages + '</span><button type="button" data-p="-1"' + (S.page ? '' : ' disabled') +
      '>Previous</button><button type="button" data-p="1"' + (S.page < pages - 1 ? '' : ' disabled') + '>Next</button></div>';
    return html;
  }
  function addForm() {
    var html = '<h3>Add new</h3><form class="form" id="form">';
    S.cols.forEach(function (c, k) {
      html += '<label>' + esc(c.label);
      if (c.type === 'category') html += '<select name="f' + k + '">' + c.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
      else html += '<input name="f' + k + '" type="' + (c.type === 'number' ? 'number" step="any' : c.type === 'date' ? 'date' : 'text') + '">';
      html += '</label>';
    });
    html += '<div class="actions"><button class="btn btn-primary" type="submit">Save record</button><span class="toast">' + esc(S.toast) + '</span></div></form>';
    return html;
  }
  /* ---- log apps: fast entry screen ---- */
  function isIdCol(c) { return c.type === 'text' && /(^|\b)(id|no|number)(\b|$)|#/i.test(c.label); }
  function entryCols() { return S.cols.map(function (c, k) { return k; }).filter(function (k) { return !isIdCol(S.cols[k]); }); }
  function mainNumK() { for (var k = 0; k < S.cols.length; k++) if (S.cols[k].type === 'number') return k; return -1; }
  function distinctVals(k) {
    var u = {}, order = [];
    S.rows.forEach(function (r) { var v = r[k]; if (v == null || v === '') return; var s = S.cols[k].type === 'number' ? v : String(v); if (!(s in u)) { u[s] = 0; order.push(s); } u[s]++; });
    return order.sort(function (a, b) { return u[b] - u[a]; });
  }
  function numPresets(k) {
    var vs = distinctVals(k).map(Number).filter(function (n) { return isFinite(n); });
    if (vs.length > 6) vs = vs.slice(0, 6);
    return vs.sort(function (a, b) { return a - b; });
  }
  function today0() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function quickEntry() {
    var ek = mainNumK();
    if (S.entry.__init !== true) {
      S.entry = { __init: true };
      S.cols.forEach(function (c, k) { if (c.type === 'date') S.entry[k] = today0(); });
    }
    var html = '<div class="entryhead"><h3>' + esc(S.entryTitle) + '</h3><span class="entrysub">A few taps between sessions. No forms, no spreadsheet.</span></div>';
    html += '<form class="entry" id="entry"><div class="fields">';
    entryCols().forEach(function (k) {
      var c = S.cols[k], cur = S.entry[k];
      html += '<div class="field"><div class="flabel">' + esc(c.label) + '</div>';
      if (c.type === 'category' || (c.type === 'text' && distinctVals(k).length <= 10 && distinctVals(k).length >= 2)) {
        var opts = c.type === 'category' ? c.options : distinctVals(k);
        html += '<div class="chipset">' + opts.map(function (o) {
          return '<button type="button" class="chip' + (cur === o ? ' on' : '') + '" data-ek="' + k + '" data-ev="' + esc(o) + '">' + esc(o) + '</button>';
        }).join('') + '</div>';
      } else if (c.type === 'number') {
        var pre = numPresets(k);
        html += '<div class="chipset">' + pre.map(function (n) {
          return '<button type="button" class="chip' + (Number(cur) === n ? ' on' : '') + '" data-ek="' + k + '" data-ev="' + n + '" data-num="1">' + esc(fmtNum(n, c.money)) + '</button>';
        }).join('') + '<input class="einput enum" data-ei="' + k + '" data-supp="1" type="number" step="any" inputmode="decimal" placeholder="Other" value="' + (cur != null && pre.indexOf(Number(cur)) < 0 ? esc(cur) : '') + '"></div>';
      } else if (c.type === 'date') {
        var t = today0(), y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1), cd = cur instanceof Date ? cur : t;
        var iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        html += '<div class="chipset"><button type="button" class="chip' + (+cd === +t ? ' on' : '') + '" data-ek="' + k + '" data-ev="' + iso(t) + '" data-date="1">Today</button>' +
          '<button type="button" class="chip' + (+cd === +y ? ' on' : '') + '" data-ek="' + k + '" data-ev="' + iso(y) + '" data-date="1">Yesterday</button>' +
          '<input class="einput" data-ei="' + k + '" data-date="1" type="date" value="' + iso(cd) + '"></div>';
      } else {
        var dl = distinctVals(k).slice(0, 12);
        html += '<input class="einput wide" data-ei="' + k + '" type="text" placeholder="Type here" value="' + (cur != null ? esc(cur) : '') + '"' + (dl.length ? ' list="dl' + k + '"' : '') + '>' +
          (dl.length ? '<datalist id="dl' + k + '">' + dl.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>' : '');
      }
      html += '</div>';
    });
    html += '</div><div class="entryactions"><button class="btn btn-primary big" type="submit">' + esc(S.entryTitle) +
      '</button><span class="toast">' + esc(S.toast) + '</span></div></form>';

    html += '<div class="today"><div class="today-head">';
    if (ek >= 0) {
      var tot = S.logged.reduce(function (a, r) { return a + (typeof r[ek] === 'number' ? r[ek] : 0); }, 0);
      html += '<span class="today-tot">' + esc(fmtNum(tot, S.cols[ek].money)) + '</span> ' + esc(S.cols[ek].label).toLowerCase() + ' logged today';
    } else html += '<span class="today-tot">' + S.logged.length + '</span> logged today';
    html += S.logged.length ? ' · ' + S.logged.length + (S.logged.length === 1 ? ' entry' : ' entries') : '';
    html += '</div>';
    if (!S.logged.length) html += '<p class="today-empty">Nothing logged yet. Make an entry above and it shows up here.</p>';
    else html += '<ul class="today-list">' + S.logged.map(function (r) {
      var parts = entryCols().filter(function (k) { return S.cols[k].type !== 'date' && r[k] != null && r[k] !== ''; })
        .map(function (k) { var c = S.cols[k]; return '<span>' + esc(c.type === 'number' ? fmtNum(r[k], c.money) : r[k]) + '</span>'; });
      return '<li>' + parts.join('<i>·</i>') + '</li>';
    }).join('') + '</ul>';
    html += '</div>';
    return html;
  }

  function render(keepFocus) {
    document.querySelectorAll('.side button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === S.tab); });
    $('main').innerHTML = S.tab === 'dashboard' ? dashboard() : S.tab === 'records' ? records() : S.tab === 'entry' ? quickEntry() : addForm();
    if (keepFocus) { var q = $('q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  }
  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
  function ico(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }

  var IC = {
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    rows: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'
  };
  function btn(tab, label, path) { return '<button type="button" data-tab="' + tab + '">' + ico(path) + label + '</button>'; }
  function sidebar() {
    if (S.appType === 'log') return btn('entry', esc(S.entryTitle), IC.bolt) + btn('dashboard', 'Dashboard', IC.dash) + btn('records', 'Records', IC.rows);
    return btn('dashboard', 'Dashboard', IC.dash) + btn('records', 'Records', IC.rows) + btn('add', 'Add new', IC.plus);
  }

  function readInputs() {
    document.querySelectorAll('#main .einput').forEach(function (el) {
      var k = +el.dataset.ei, v = el.value.trim();
      if (!v) { if (!el.dataset.supp) delete S.entry[k]; return; }
      if (el.dataset.date) { var p = v.split('-'); S.entry[k] = new Date(+p[0], +p[1] - 1, +p[2]); }
      else if (S.cols[k].type === 'number') S.entry[k] = toNum(v);
      else S.entry[k] = v;
    });
  }
  function saveEntry() {
    readInputs();
    var filled = S.cols.map(function (c, k) { return k; }).filter(function (k) { return S.entry[k] != null && S.entry[k] !== '' && S.cols[k].type !== 'date'; });
    var ek = mainNumK();
    if (!filled.length || (ek >= 0 && (S.entry[ek] == null || S.entry[ek] === ''))) { S.toast = ek >= 0 ? 'Add ' + S.cols[ek].label.toLowerCase() + ' and at least one detail.' : 'Fill in at least one field.'; return render(); }
    var row = S.cols.map(function (c, k) {
      if (S.entry[k] != null && S.entry[k] !== '') return c.type === 'number' ? toNum(S.entry[k]) : S.entry[k];
      if (isIdCol(c)) { var last = S.rows.length ? String(S.rows[0][k] || '') : '', m = last.match(/^(\D*)(\d+)$/); if (m) return m[1] + (String(+m[2] + 1)); }
      if (c.type === 'date') return today0();
      return null;
    });
    S.rows.unshift(row); S.logged.unshift(row);
    var keepDate = {}; S.cols.forEach(function (c, k) { if (c.type === 'date') keepDate[k] = today0(); });
    S.entry = keepDate; S.entry.__init = true; S.toast = '';
    render();
  }

  /* Builds the app frame inside #result and wires it up. Text in opts is trusted page copy. */
  function mount(opts) {
    $('result').innerHTML =
      '<div class="result-bar"><div class="note" id="note"></div><button class="linkbtn" id="again" type="button">' + opts.again + '</button></div>' +
      '<div class="frame"><div class="chrome"><div class="dots"><i></i><i></i><i></i></div><div class="url" id="url"></div></div>' +
      '<div class="app"><aside class="side" id="side"><div class="appname" id="appname"></div></aside><div class="main" id="main"></div></div></div><div id="extra"></div>' +
      '<div class="pitch"><div><h2>' + opts.pitchTitle + '</h2><p>' + opts.pitchText + '</p></div>' +
      '<a class="btn" id="pitchlink" href="' + opts.mailto + '">Build the real thing' + ARROW + '</a></div>';

    $('again').onclick = function () { $('result').hidden = true; window.scrollTo({ top: 0, behavior: 'smooth' }); if (opts.onAgain) opts.onAgain(); };
    $('side').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]'); if (!b) return;
      if (S.tab === 'entry' && b.dataset.tab !== 'entry') readInputs();
      S.tab = b.dataset.tab; S.toast = ''; render();
    });
    $('main').addEventListener('input', function (e) {
      if (e.target.id === 'q') { S.q = e.target.value; S.page = 0; render(true); }
    });
    $('main').addEventListener('change', function (e) {
      if (e.target.dataset.f != null) { S.filters[e.target.dataset.f] = e.target.value; S.page = 0; render(); }
    });
    $('main').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip'), th = e.target.closest('th'), p = e.target.closest('[data-p]');
      if (chip) {
        readInputs();
        var k = +chip.dataset.ek, v = chip.dataset.date ? (function () { var d = chip.dataset.ev.split('-'); return new Date(+d[0], +d[1] - 1, +d[2]); })() : chip.dataset.num ? toNum(chip.dataset.ev) : chip.dataset.ev;
        S.entry[k] = (!chip.dataset.date && String(S.entry[k]) === String(v)) ? undefined : v;
        if (S.entry[k] === undefined) delete S.entry[k];
        S.toast = ''; render();
      }
      if (th) { var sk = +th.dataset.s; S.sort = S.sort && S.sort.k === sk ? (S.sort.d > 0 ? { k: sk, d: -1 } : null) : { k: sk, d: 1 }; render(); }
      if (p) { S.page += +p.dataset.p; render(); }
    });
    $('main').addEventListener('submit', function (e) {
      e.preventDefault();
      if (e.target.id === 'entry') return saveEntry();
      var f = new FormData(e.target), any = false;
      var row = S.cols.map(function (c, k) {
        var v = (f.get('f' + k) || '').trim();
        if (!v) return null;
        if (c.type !== 'category') any = true;
        if (c.type === 'number') return toNum(v);
        if (c.type === 'date') { var p = v.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
        return v;
      });
      if (!any) { S.toast = 'Fill in at least one field.'; return render(); }
      S.rows.unshift(row);
      S.tab = 'records'; S.q = ''; S.sort = null; S.page = 0;
      Object.keys(S.filters).forEach(function (k) { S.filters[k] = ''; });
      render();
    });
  }

  /* noteHtml and extraHtml must already be escaped by the caller. */
  function show(model, noteHtml, extraHtml) {
    S = model;
    $('side').innerHTML = '<div class="appname" id="appname"></div>' + sidebar();
    $('appname').textContent = S.name;
    $('url').textContent = 'app.yourbusiness.com/' + S.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    $('note').innerHTML = noteHtml;
    $('extra').innerHTML = extraHtml || '';
    $('result').hidden = false;
    render();
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { build: build, show: show, mount: mount, esc: esc, fmtNum: fmtNum, MAX_ROWS: MAX_ROWS };
})();
