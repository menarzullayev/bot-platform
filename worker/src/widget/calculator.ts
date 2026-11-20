import type { Lang } from "../env";
import { EVALUATOR_SRC } from "./evaluator";
import { INNER_KEYS, WIDGET_LABELS } from "./labels";

// Widget CSS: only features inside Telegram's widget profile 1 (flex, grid, var(), min/max,
// :active, filter:brightness, text-overflow:ellipsis, env()). No vh, no :focus, no text-shadow,
// no named fonts. Colours come only from --tg-theme-* so light/dark/outgoing bubbles just work.
const CSS =
  "body{margin:0;padding:8px 8px max(8px,env(safe-area-inset-bottom))}" +
  "button{border:1px solid var(--tg-theme-section-separator-color);border-radius:12px;background:var(--tg-theme-secondary-bg-color);color:var(--tg-theme-text-color);font:inherit;font-size:1.1em;min-height:46px;padding:0}" +
  "button:active{filter:brightness(.85)}" +
  ".t{display:flex;gap:4px;margin-bottom:4px}" +
  ".k{min-width:60px;min-height:44px;padding:0 6px;font-size:.75em}" +
  ".v{flex:1;min-width:0}" +
  ".i{height:22px;line-height:22px;font-size:.8em;color:var(--tg-theme-hint-color);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
  "#e{min-height:28px;font-size:1.2em;text-align:right;word-break:break-all}" +
  "#r{height:40px;line-height:40px;font-size:1.9em;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--tg-theme-hint-color)}" +
  "#r.d{color:var(--tg-theme-text-color);font-weight:600}" +
  "#r.x{color:var(--tg-theme-destructive-text-color);font-size:1.1em}" +
  ".g{display:grid;gap:4px;margin-top:6px}" +
  "#a{grid-template-columns:repeat(5,minmax(0,1fr))}" +
  "#b{grid-template-columns:repeat(4,minmax(0,1fr))}" +
  ".f,.c{color:var(--tg-theme-accent-text-color)}" +
  ".f{min-height:44px;font-size:.95em}" +
  ".o{color:var(--tg-theme-link-color);font-size:1.4em}" +
  ".q{background:var(--tg-theme-button-color);color:var(--tg-theme-button-text-color);border-color:transparent}";

// Widget UI script (placed after the evaluator, so `calc` is in scope). `L` = labels JSON.
// State: S = {h: history (<=5 strings "expr=result"), d: 1 = DEG (default) / 0 = RAD, x: expression}.
// The widget cannot write chat_data (only the bot can), so history/mode/expression live in
// localStorage (per message, per device, 4 KB limit; we keep well under 1 KB).
const UI = String.raw`var W=window.TelegramWidget,D=document,$=function(i){return D.getElementById(i)},S={h:[],d:1,x:''},dn=0,an=0,er='',rs='',lv='',DB,j,N=L.a.split('|'),Z6=['⌫','AC','=','±','x²','√'],
H=[$('h0'),$('h1')],E=$('e'),R=$('r'),CB=$('cb'),SB=$('sb'),
sv=function(){try{localStorage.setItem('c',JSON.stringify(S))}catch(e){}},
F=function(v){return(''+v).replace(/e\+?(-?\d+)/,'×10^$1')},
cv=function(){return lv.replace('×10^','e')},
fl=function(b,t,l){b.textContent=t;setTimeout(function(){b.textContent=l},1500)};
try{var o=JSON.parse(localStorage.getItem('c'));if(o&&o.h instanceof Array){S.h=o.h.filter(function(e){return typeof e=='string'&&e.indexOf('=')>0}).slice(-5);S.d=o.d?1:0;S.x=typeof o.x=='string'?o.x.slice(0,44):'';
if(S.h.length)an=calc(S.h[S.h.length-1].split('=').pop(),0,0)}}catch(e){}
function u(){var t='',c='',q=S.h.slice(-2);
if(er){t=er;c='x'}else if(dn){t=rs;c='d'}else if(S.x)try{t=F(calc(S.x,S.d,an))}catch(e){}
R.textContent=t;R.className=c;R.dir=er?'auto':'ltr';lv=er?'':t;
E.textContent=S.x||'0';
H[0].textContent=q.length>1?q[0]:'';H[1].textContent=q.length?q[q.length-1]:L.t;
DB.textContent=S.d?L.dg:L.rd}
function ev(){var v;if(!S.x||dn)return;
try{v=calc(S.x,S.d,an);an=v;rs=F(v);dn=1;S.h.push(S.x+'='+rs);S.h=S.h.slice(-5)}catch(c){er=L[c]||L.m}}
function ng(){var m=/^(.*?)(−?)(\d*\.?\d*)$/.exec(S.x),p=m[1];
S.x=m[2]&&(!p||/[(+−×÷^]$/.test(p))?p+m[3]:p+m[2]+'−'+m[3]}
function k(v){var o;er='';
try{W.HapticFeedback.selectionChanged()}catch(e){}
if(v=='AC'){S.x='';dn=0}
else if(v=='=')ev();
else if(v=='DG')S.d=1-S.d;
else{
if(dn){if(v!='⌫')S.x=/^[+×÷−^!%x±]/.test(v)?rs:'';dn=0}
if(v=='⌫')S.x=S.x.replace(/(sin\(|cos\(|tan\(|ln\(|log\(|√\(|ans|.)$/,'');
else if(v=='±')ng();
else if(v!='.'||!/\.\d*$/.test(S.x)){o=v=='x²'?'²':/^(sin|cos|tan|ln|log|√)$/.test(v)?v+'(':v;if(S.x.length+o.length<45)S.x+=o}}
u();sv()}
'sin cos tan ln log √ x² ^ ! π ( ) e ans DG AC ⌫ % ÷ 7 8 9 × 4 5 6 − 1 2 3 + ± 0 . ='.split(' ').forEach(function(v,i){var b=D.createElement('button');b.textContent=v;
b.className=i<15?'f':'÷×−+'.indexOf(v)>=0?'o':v=='='?'q':'AC⌫±%'.indexOf(v)>=0?'c':'';
b.onclick=function(){k(v)};if(v=='DG')DB=b;if((j=Z6.indexOf(v))>=0)b.setAttribute('aria-label',N[j]);$(i<15?'a':'b').appendChild(b)});
H.forEach(function(h,i){h.onclick=function(){var q=S.h.slice(-2),e=q[i-2+q.length];if(e){S.x=e.split('=').pop();dn=0;er='';u();sv()}}});
CB.onclick=function(){var c=cv();if(c&&W)try{W.copyText(c);fl(CB,L.cd,L.c)}catch(e){}};
SB.onclick=function(){var c=cv();if(c&&W)try{SB.textContent='…';W.request('s:'+c).then(function(){fl(SB,L.bd,L.b)},function(){fl(SB,L.bf,L.b)})}catch(e){fl(SB,L.bf,L.b)}};
u();if(W&&W.ready)W.ready()`;

/**
 * Build the calculator widget: ONE self-contained HTML fragment (style + markup + script),
 * no network, no external resources. Math runs in the embedded mini evaluator.
 */
export function buildCalculatorWidget(lang: Lang): string {
  const lb = WIDGET_LABELS[lang];
  const inner: Record<string, string> = {};
  for (const key of INNER_KEYS) inner[key] = lb[key];
  const rtl = lang === "ar";
  const langAttr = lang === "uz-latn" ? "uz" : lang === "uz-cyrl" ? "uz-Cyrl" : lang;
  return (
    `<style>${CSS}</style>` +
    `<div lang=${langAttr} dir=${rtl ? "rtl" : "ltr"}>` +
    `<div class=t dir=ltr><button class=k id=cb>${lb.c}</button><button class=k id=sb>${lb.b}</button>` +
    `<div class=v dir=ltr><div class=i id=h0 dir=ltr></div><div class=i id=h1 dir=ltr></div></div></div>` +
    `<div id=e dir=ltr></div><div id=r dir=ltr></div>` +
    `<div class=g id=a dir=ltr></div><div class=g id=b dir=ltr></div></div>` +
    `<script>var L=${JSON.stringify(inner)};${EVALUATOR_SRC}\n${UI}</script>`
  );
}
