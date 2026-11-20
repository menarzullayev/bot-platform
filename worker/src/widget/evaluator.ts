// Mini expression evaluator embedded into the widget as ES5 source text.
// The very same string is (a) inlined into the widget HTML, which runs inside the
// QuickJS sandbox, and (b) compiled dynamically by the TESTS only (never by production code).
//
// calc(expr, deg, ans) -> number (rounded to 12 significant digits)
// Throws one of the string codes: 's' syntax, 'z' division by zero, 'm' math/domain/overflow.
//
// Grammar:  expr = term {(+|-) term};  term = unary {(*|/|implicit) unary};
//           unary = (-|+) unary | power;  power = postfix [^ unary];
//           postfix = primary {! | % | ²};  primary = number | (expr) | const | fn primary
// Percent: `A+B%` = A+A*B/100, `A-B%` = A-A*B/100, a bare `B%` = B/100.
// Intermediate results are rounded to 15 significant digits (kills 0.1+0.2 noise,
// keeps 1/3*3 = 1), the final result to 12.
export const EVALUATOR_SRC = String.raw`function calc(s,d,a){var T=[],R=/(\d+\.?\d*|\.\d+)|([a-z]+)|(\S)/g,m,q,p=0,f=0,G=d?Math.PI/180:1,Z=function(x){return+x.toPrecision(15)},E=function(c){throw c};
s=s.toLowerCase();
for(;m=R.exec(s);)T.push(m[1]?+m[1]:(q='×÷−π√'.indexOf(m[0]))<0?m[0]:['*','/','-','pi','sqrt'][q]);
function pr(){var t=T[p++],v,r;f=0;
if(typeof t=='number')return t;
if(t=='('){v=ex();if(T[p]==')')p++;else if(p<T.length)E('s');f=0;return v}
if(t=='pi')return Math.PI;if(t=='e')return Math.E;if(t=='ans')return a||0;
if(/^(sin|cos|tan|ln|log|sqrt)$/.test(t)){v=pr();
if(t=='sqrt'){if(v<0)E('m');return Z(Math.sqrt(v))}
if(t=='ln'||t=='log'){if(v<=0)E('m');return Z(Math.log(v)/(t=='ln'?1:Math.LN10))}
r=Math[t](v*G);if(Math.abs(r)<1e-12)r=0;if(Math.abs(r)>1e15)E('m');return Z(r)}
E('s')}
function po(){var v=pr(),o,k,r;for(;(o=T[p])=='!'||o=='%'||o=='²';){p++;
if(o=='%'){v=Z(v/100);f=1}else if(o=='²'){v=Z(v*v);f=0}
else{if(v<0||v>170||v%1)E('m');for(r=1,k=2;k<=v;k++)r*=k;v=Z(r);f=0}}return v}
function pw(){var b=po(),e;if(T[p]=='^'){p++;e=un();b=Z(Math.pow(b,e));f=0}return b}
function un(){var o=T[p];if(o=='-'||o=='+'){p++;return o=='-'?-un():un()}return pw()}
function tm(){var v=un(),g=f,o,r;
for(;(o=T[p])=='*'||o=='/'||o=='('||typeof o=='number'||/^[a-z]/.test(o||'');){
if(o=='*'||o=='/')p++;r=un();
if(o=='/'){if(!r)E('z');v=Z(v/r)}else v=Z(v*r);g=0}
f=g;return v}
function ex(){var v=tm(),o,r;for(;(o=T[p])=='+'||o=='-';){p++;r=tm();r=f?v*r:r;v=Z(o=='+'?v+r:v-r)}return v}
var v=ex();if(p<T.length)E('s');if(v!==v||v==1/0||v==-1/0)E('m');return+v.toPrecision(12)}`;
