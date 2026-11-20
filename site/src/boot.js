// Runs before first paint: restores the saved theme and demo style (classic script, CSP-safe).
try {
  var r = document.documentElement;
  var t = localStorage.getItem("tc-theme");
  var s = localStorage.getItem("tc-style");
  if (t === "light" || t === "dark") r.setAttribute("data-theme", t);
  if (/^(tactile|glass|fintech|techno)$/.test(s)) r.setAttribute("data-style", s);
} catch (e) {}
