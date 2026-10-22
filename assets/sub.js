function closeNav(){var n=document.getElementById('navLinks');n.classList.remove('open');var t=document.getElementById('navToggle');if(t){t.setAttribute('aria-expanded','false');t.setAttribute('aria-label','פתיחת תפריט')}}

/* ====================================================================
   נגישות: תפריט נגישות, מקלדת, ARIA
   ==================================================================== */
function toggleNav(){
  const n=document.getElementById('navLinks'),t=document.getElementById('navToggle');
  const o=n.classList.toggle('open');
  t.setAttribute('aria-expanded',o?'true':'false');
  t.setAttribute('aria-label',o?'סגירת תפריט':'פתיחת תפריט');
}
function markExternal(){
  document.querySelectorAll('a[target="_blank"]').forEach(a=>{
    const t=a.textContent.trim();
    if(!t)return;
    a.setAttribute('aria-label',t+' (נפתח בכרטיסייה חדשה)');
  });
}
const A11Y_KEY='szold-a11y';
const A11Y={size:100,contrast:false,gray:false,links:false,font:false,cursor:false,noanim:false,heads:false,spacing:false};
const A11Y_TOGGLES=[
  ['contrast','ניגודיות גבוהה'],['gray','גווני אפור'],['links','הדגשת קישורים'],['heads','הדגשת כותרות'],
  ['font','גופן קריא'],['spacing','ריווח טקסט'],['cursor','סמן גדול'],['noanim','עצירת אנימציות']
];
function a11yApply(){
  const h=document.documentElement;
  h.style.fontSize=A11Y.size===100?'':A11Y.size+'%';
  A11Y_TOGGLES.forEach(([k])=>h.classList.toggle('a11y-'+k,!!A11Y[k]));
  document.querySelectorAll('#a11yPanel [data-a11y]').forEach(b=>b.setAttribute('aria-pressed',A11Y[b.dataset.a11y]?'true':'false'));
  const s=document.getElementById('a11ySize');if(s)s.textContent=A11Y.size+'%';
  try{localStorage.setItem(A11Y_KEY,JSON.stringify(A11Y))}catch(e){}
}
function a11ySet(k){A11Y[k]=!A11Y[k];a11yApply()}
function a11ySize(d){A11Y.size=Math.max(80,Math.min(160,A11Y.size+d));a11yApply()}
function a11yReset(){A11Y.size=100;A11Y_TOGGLES.forEach(([k])=>A11Y[k]=false);a11yApply()}
function a11yPanel(open){
  const p=document.getElementById('a11yPanel'),b=document.getElementById('a11yBtn');
  const o=open===undefined?p.hidden:open;
  p.hidden=!o;b.setAttribute('aria-expanded',o?'true':'false');
  if(o)p.querySelector('button').focus();else if(open===false)b.focus();
}
function a11yInit(){
  try{Object.assign(A11Y,JSON.parse(localStorage.getItem(A11Y_KEY)||'{}'))}catch(e){}
  const wrap=document.createElement('div');
  wrap.id='a11yRoot';
  wrap.innerHTML=
   '<button id="a11yBtn" type="button" aria-label="תפריט נגישות" aria-expanded="false" aria-controls="a11yPanel" onclick="a11yPanel()">'+
   '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><circle cx="12" cy="4.2" r="2.2" fill="currentColor"/><path d="M4 8.2l8 1.3 8-1.3M12 9.5v5.3m0 0l-3.2 6m3.2-6l3.2 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'+
   '<div id="a11yPanel" role="dialog" aria-label="תפריט נגישות" hidden>'+
   '<div class="a11y-head"><b>הגדרות נגישות</b><button type="button" class="a11y-x" aria-label="סגירת תפריט הנגישות" onclick="a11yPanel(false)"><span aria-hidden="true">✕</span></button></div>'+
   '<div class="a11y-size"><span>גודל טקסט</span><button type="button" aria-label="הקטנת טקסט" onclick="a11ySize(-10)"><span aria-hidden="true">א−</span></button><output id="a11ySize" aria-live="polite">100%</output><button type="button" aria-label="הגדלת טקסט" onclick="a11ySize(10)"><span aria-hidden="true">א+</span></button></div>'+
   '<div class="a11y-grid">'+A11Y_TOGGLES.map(([k,l])=>'<button type="button" data-a11y="'+k+'" aria-pressed="false" onclick="a11ySet(\''+k+'\')">'+l+'</button>').join('')+'</div>'+
   '<div class="a11y-foot"><button type="button" onclick="a11yReset()">איפוס הגדרות</button><a href="#accessibility" onclick="a11yPanel(false)">הצהרת נגישות</a></div></div>';
  document.body.appendChild(wrap);
  a11yApply();
  markExternal();
}
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const p=document.getElementById('a11yPanel');
  if(p&&!p.hidden){a11yPanel(false);return}
  const m=document.querySelector('.modal-bg.show');
  if(m){m.classList.remove('show');return}
  const chat=document.getElementById('chatBox');
  if(chat&&chat.classList.contains('open')){toggleChat();return}
  const nav=document.getElementById('navLinks');
  if(nav&&nav.classList.contains('open')){toggleNav();document.getElementById('navToggle').focus()}
});
/* סגירת התפריט בלחיצה מחוץ לו */
document.addEventListener('click',e=>{
  const p=document.getElementById('a11yPanel');
  if(p&&!p.hidden&&!e.target.closest('#a11yPanel,#a11yBtn'))a11yPanel(false);
});
/* מעבר ל-main בלחיצה על "דלגו לתוכן" מעביר גם את המקלדת */
document.querySelector('.skip-link').addEventListener('click',()=>{setTimeout(()=>document.getElementById('main').focus(),0)});
a11yInit();
