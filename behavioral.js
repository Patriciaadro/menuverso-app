// Behavioral assertions: do the core admin/partner ACTIONS actually change state?
// (Crash-crawl found no throws; this checks for silent no-ops / wrong effects.)
const fs = require('fs');
const { JSDOM } = require('jsdom');
const SRC = fs.readFileSync(process.argv[2], 'utf8');
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let pass=0, fail=0; const out=[];
const ck=(n,c,d)=>{ if(c){pass++;out.push('  PASS  '+n);} else {fail++;out.push('  FAIL  '+n+(d?'  → '+d:''));} };
function boot(uid){const dom=new JSDOM(SRC,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://menuverso.com/',beforeParse(w){w.requestAnimationFrame=c=>setTimeout(c,0);w.cancelAnimationFrame=()=>{};w.scrollTo=()=>{};w.confirm=()=>true;w.alert=()=>{};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.fetch=()=>Promise.reject(new Error('netblock'));if(uid)w.localStorage.setItem('menuverso_session_v4',JSON.stringify({userId:uid,expiresAt:Date.now()+9e11}));const e=[];w.__e=e;w.addEventListener('error',ev=>{const m=(ev.error?ev.error.message:ev.message)||'';if(!/tailwind|netblock/.test(m))e.push(m);});}});return dom.window;}
const ev=(w,r,p)=>w.dispatchEvent(new w.PopStateEvent('popstate',{state:{mvRoute:r,mvParams:p||{}}}));
const V=(o)=>Object.assign({id:'pv1',ownerId:null,slug:'bar',name:'Bar',barrio:'Eixample',cuisine:'Drinks',priceTier:2,address:'C X 1',postcode:'08010',phone:'600',website:'https://x.com',instagram:'@x',description:'d',hours:'12-23',photos:[PNG],foodPhotos:[],venuePhotos:[],menuPhotos:[],dealTerms:'t',dealSlots:[{id:'s1',label:'Dinner',timeStart:'19:00',timeEnd:'23:00',active:true,days:['mon']}],deals:[{id:'d1',title:'2×1 cocktails',description:'x',active:true,savingsEur:12,cooldownDays:7}],liveDeal:{dealSlots:[{id:'s1',active:true}]},rating:4.5,reviews:1,lat:41.39,lng:2.16,status:'LIVE',submittedAt:Date.now(),approvedAt:Date.now(),offerVersion:1,createdAt:Date.now()},o);
const seed=(w,arr,extra)=>w.eval('store.partnerVenues='+JSON.stringify(arr)+';'+(extra||'')+'saveStore();');
const btnByText=(w,re)=>[...w.document.querySelectorAll('#root button')].find(b=>re.test((b.textContent||'').trim()));

console.log('\n=========== BEHAVIORAL ACTION AUDIT ===========');

// ---- ADMIN: approve a PENDING venue ----
{
  const w=boot('u_demo_admin');
  seed(w,[V({id:'pvP',slug:'pend',name:'Pend',status:'PENDING_APPROVAL',approvedAt:null})]);
  ev(w,'admin',{tab:'partners'});
  const b=btnByText(w,/^Aprobar$|^Approve$/);
  ck('ADMIN approve button present', !!b);
  if(b){ b.click(); ck('ADMIN approve → status LIVE', w.eval('store.partnerVenues[0].status')==='LIVE', w.eval('store.partnerVenues[0].status')); }
}
// ---- ADMIN: pause a LIVE venue ----
{
  const w=boot('u_demo_admin');
  seed(w,[V({id:'pvL',slug:'liv',name:'Liv',status:'LIVE'})]);
  ev(w,'admin',{tab:'partners'});
  const b=btnByText(w,/^Pausar$|^Pause$/);
  ck('ADMIN pause button present', !!b);
  if(b){ b.click(); ck('ADMIN pause → status PAUSED', w.eval('store.partnerVenues[0].status')==='PAUSED', w.eval('store.partnerVenues[0].status')); }
}
// ---- ADMIN: delete a venue ----
{
  const w=boot('u_demo_admin');
  seed(w,[V({id:'pvD',slug:'del',name:'Del',status:'LIVE'})]);
  ev(w,'admin',{tab:'partners'});
  const b=btnByText(w,/^Eliminar$|^Delete$/);
  ck('ADMIN delete button present', !!b);
  if(b){ b.click(); ck('ADMIN delete → venue removed from store', w.eval('store.partnerVenues.length')===0, 'len='+w.eval('store.partnerVenues.length')); }
}
// ---- ADMIN: hidden/removed venue gone from members after delete ----
{
  const w=boot('u_demo_admin');
  seed(w,[V({id:'pvD2',slug:'del2',name:'Del2',status:'LIVE'})]);
  ev(w,'admin',{tab:'partners'});
  const b=btnByText(w,/^Eliminar$|^Delete$/);
  if(b){ b.click(); ck('ADMIN deleted venue absent from getAllVenues', w.eval('getAllVenues().some(v=>v.slug==="del2")')===false); }
}

// ---- PARTNER: offers tab is INTENTIONALLY read-only (admin-managed, brief 19/06) ----
{
  const w=boot('u_demo_partner');
  seed(w,[V({id:'pv_cerceveria',ownerId:'u_demo_partner',slug:'mybar',name:'My Bar',status:'LIVE',deals:[{id:'d1',title:'2×1',description:'x',active:true,savingsEur:10,cooldownDays:7}]})]);
  ev(w,'partner-portal',{tab:'ofertas'});
  const t=(w.document.getElementById('root').textContent||'');
  ck('PARTNER offers tab shows the live offer', /2×1/.test(t));
  ck('PARTNER offers tab is read-only by design (no toggle checkbox)', w.document.querySelectorAll('#root input[type=checkbox]').length===0);
  ck('PARTNER offers tab exposes a "request a change" link', /Pídenos un cambio|Request a change/i.test(t), 'no request-change link');
}
// ---- PARTNER: edit profile field + save persists ----
{
  const w=boot('u_demo_partner');
  seed(w,[V({id:'pv_cerceveria',ownerId:'u_demo_partner',slug:'mybar3',name:'My Bar3',status:'LIVE'})]);
  ev(w,'partner-portal',{tab:'profile'});
  const inputs=[...w.document.querySelectorAll('#root input[type=text], #root input:not([type]), #root textarea')];
  const desc=inputs.find(i=>/descrip|sobre|about|bio/i.test((i.getAttribute('placeholder')||'')+(i.name||'')+(i.id||'')))||inputs[0];
  ck('PARTNER profile has editable fields', !!desc);
  if(desc){
    desc.value='UNIQUE_EDIT_'+Date.now(); desc.dispatchEvent(new w.Event('input',{bubbles:true}));
    const save=btnByText(w,/Guardar|Save/);
    ck('PARTNER profile save button present', !!save);
    if(save){ save.click(); const pv=w.eval('JSON.stringify(currentPartnerVenue())'); ck('PARTNER profile edit persisted to venue', /UNIQUE_EDIT_/.test(pv), 'edit not found on venue'); }
  }
}

console.log(out.join('\n'));
console.log('----------------------------------------------');
console.log('PASS: '+pass+'   FAIL: '+fail);
console.log('==============================================');
process.exit(fail?1:0);
