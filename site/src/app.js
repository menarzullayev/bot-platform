// Landing behaviour: theme toggle, demo style picker and the exact-decimal demo calculator. No dependencies.
(function () {
  "use strict";
  var root = document.documentElement;
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable: still works for this visit */ } }

  // ---- theme toggle (auto -> explicit opposite of what is shown now) ----
  var themeBtn = document.getElementById("theme-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var cur = root.getAttribute("data-theme");
      var dark = cur ? cur === "dark" : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var next = dark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      save("tc-theme", next);
    });
  }

  var demo = document.getElementById("demo");
  if (!demo) return;

  // ---- style picker ----
  var styleBtns = demo.querySelectorAll("[data-style-btn]");
  function setStyle(s, persist) {
    root.setAttribute("data-style", s);
    for (var i = 0; i < styleBtns.length; i++) styleBtns[i].setAttribute("aria-pressed", styleBtns[i].getAttribute("data-style-btn") === s ? "true" : "false");
    if (persist) save("tc-style", s);
  }
  for (var i = 0; i < styleBtns.length; i++) {
    styleBtns[i].addEventListener("click", function () { setStyle(this.getAttribute("data-style-btn"), true); });
  }
  setStyle(root.getAttribute("data-style") || "tactile", false);

  // ---- exact decimal arithmetic on BigInt: value = n / 10^e ----
  var P = function (k) { return 10n ** BigInt(k); };
  function norm(x) { while (x.e > 0 && x.n % 10n === 0n) { x.n /= 10n; x.e--; } if (x.e > 300) throw "big"; return x; }
  function align(a, b) { var e = Math.max(a.e, b.e); return [a.n * P(e - a.e), b.n * P(e - b.e), e]; }
  function add(a, b) { var r = align(a, b); return norm({ n: r[0] + r[1], e: r[2] }); }
  function sub(a, b) { var r = align(a, b); return norm({ n: r[0] - r[1], e: r[2] }); }
  function mul(a, b) { return norm({ n: a.n * b.n, e: a.e + b.e }); }
  function neg(a) { return { n: -a.n, e: a.e }; }
  function pct(a) { return norm({ n: a.n, e: a.e + 2 }); }
  function div(a, b) {
    if (b.n === 0n) throw "div0";
    var n = a.n * P(b.e + 24), q = n / b.n, r = n % b.n;
    var ar = r < 0n ? -r : r, ab = b.n < 0n ? -b.n : b.n;
    if (2n * ar >= ab) q += (n < 0n) !== (b.n < 0n) ? -1n : 1n;
    return norm({ n: q, e: a.e + 24 });
  }
  function num(s) {
    var i = s.indexOf(".");
    if (i < 0) return { n: BigInt(s), e: 0 };
    var f = s.slice(i + 1);
    return norm({ n: BigInt(s.slice(0, i) + f), e: f.length });
  }
  function tokenize(s) {
    var t = [], i = 0, m;
    while (i < s.length) {
      var c = s.charAt(i);
      if ((m = /^\d+(?:\.\d*)?/.exec(s.slice(i)))) { t.push({ n: num(m[0]) }); i += m[0].length; }
      else if ("+-*/()%".indexOf(c) > -1) { t.push({ o: c }); i++; }
      else return null;
    }
    return t;
  }
  // returns {v} | {err:"div0"|"big"} | null (incomplete / invalid)
  function evaluate(s) {
    var t = tokenize(s);
    if (!t || !t.length) return null;
    var pos = 0;
    function peek() { return t[pos]; }
    function prim() {
      var k = peek();
      if (!k) throw 0;
      if (k.o === "-") { pos++; return neg(prim()); }
      if (k.o === "(") { pos++; var v = add2(); if (!peek() || peek().o !== ")") throw 0; pos++; return post(v); }
      if (k.n) { pos++; return post(k.n); }
      throw 0;
    }
    function post(v) { while (peek() && peek().o === "%") { pos++; v = pct(v); } return v; }
    function mul2() {
      var v = prim();
      while (peek() && (peek().o === "*" || peek().o === "/")) { var o = t[pos++].o, w = prim(); v = o === "*" ? mul(v, w) : div(v, w); }
      return v;
    }
    function add2() {
      var v = mul2();
      while (peek() && (peek().o === "+" || peek().o === "-")) {
        var o = t[pos++].o, start = pos, w = mul2();
        // "a + b%" means a + a*b/100 (percent of the left side), as in the bot
        if (pos === start + 2 && t[start].n && t[start + 1].o === "%") w = mul(v, w);
        v = o === "+" ? add(v, w) : sub(v, w);
      }
      return v;
    }
    try { var r = add2(); return pos < t.length ? null : { v: r }; }
    catch (e) { return e === "div0" || e === "big" ? { err: e } : null; }
  }

  // ---- formatting ----
  var dec = demo.getAttribute("data-dec") || ".";
  var grp = demo.getAttribute("data-grp") || ",";
  var errText = demo.getAttribute("data-err") || "Error";
  function parts(x) {
    // round half away from zero to 10 decimals
    var n = x.n, e = x.e, sign = n < 0n;
    if (sign) n = -n;
    if (e > 10) { n = (n + 5n * P(e - 11)) / P(e - 10); e = 10; }
    var s = n.toString();
    while (s.length <= e) s = "0" + s;
    var ip = s.slice(0, s.length - e), fp = e ? s.slice(s.length - e).replace(/0+$/, "") : "";
    return { neg: sign && (n !== 0n), i: ip, f: fp };
  }
  function plain(x) { var p = parts(x); return (p.neg ? "-" : "") + p.i + (p.f ? "." + p.f : ""); }
  function pretty(x) {
    var p = parts(x);
    return (p.neg ? "−" : "") + p.i.replace(/\B(?=(\d{3})+(?!\d))/g, grp) + (p.f ? dec + p.f : "");
  }
  function prettyExpr(s) {
    return s.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−").replace(/\./g, dec);
  }

  // ---- calculator state ----
  var exprEl = document.getElementById("d-expr"), resEl = document.getElementById("d-res");
  var buf = "0.1+0.2", fresh = false;
  function render() {
    exprEl.textContent = buf ? prettyExpr(buf) : "0";
    var r = buf ? evaluate(buf) : null;
    resEl.textContent = !buf ? "0" : r ? (r.err ? errText : pretty(r.v)) : "…";
  }
  function press(k) {
    var ops = "+-*/", last = buf.slice(-1);
    if (k === "AC") buf = "";
    else if (k === "BS") buf = buf.slice(0, -1);
    else if (k === "=") {
      var r = evaluate(buf);
      if (r && r.v) { buf = plain(r.v); fresh = true; }
    } else {
      if (fresh && /[\d.(]/.test(k)) buf = "";
      fresh = false;
      if (ops.indexOf(k) > -1) {
        if (!buf && k !== "-") return;
        if (ops.indexOf(last) > -1) buf = buf.slice(0, -1);
      }
      if (k === ".") {
        var m = /[\d.]*$/.exec(buf)[0];
        if (m.indexOf(".") > -1) return;
        if (!m) k = "0.";
      }
      if (buf.length >= 40) return;
      buf += k;
    }
    if (k !== "=") fresh = false;
    render();
  }
  var keys = demo.querySelectorAll("[data-k]");
  for (var j = 0; j < keys.length; j++) keys[j].addEventListener("click", function () { press(this.getAttribute("data-k")); });
  var chips = demo.querySelectorAll("[data-expr]");
  for (var c = 0; c < chips.length; c++) chips[c].addEventListener("click", function () { buf = this.getAttribute("data-expr"); fresh = false; render(); });
  render();
})();
