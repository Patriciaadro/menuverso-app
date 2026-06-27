// i18n leakage scan: render every portal screen in EN and in ES, flag UI text
// left in the WRONG language. (Admin-entered data like cuisine/venue names are
// excluded — only translatable UI chrome is checked.)
const fs = require('fs');
const { JSDOM } = require('jsdom');
const SRC = fs.readFileSync(process.argv[2], 'utf8');
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let issues = 0; const out = [];
function boot(uid, lang) {
  const dom = new JSDOM(SRC, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://menuverso.com/',
    beforeParse(w) { w.requestAnimationFrame=c=>setTimeout(c,0); w.cancelAnimationFrame=()=>{}; w.scrollTo=()=>{}; w.confirm=()=>true; w.alert=()=>{};
      w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}); w.fetch=()=>Promise.reject(new Error('netblock'));
      if(uid)w.localStorage.setItem('menuverso_session_v4',JSON.stringify({userId:uid,expiresAt:Date.now()+9e11}));
      if(lang)w.localStorage.setItem('mv_lang_v2',lang); }});
  return dom.window;
}
const ev=(w,r,p)=>w.dispatchEvent(new w.PopStateEvent('popstate',{state:{mvRoute:r,mvParams:p||{}}}));
const V=(o)=>Object.assign({id:'pv1',ownerId:o.ownerId||null,slug:'bar',name:'Bar',barrio:'Eixample',cuisine:'Drinks',priceTier:2,address:'C X 1',postcode:'08010',phone:'600',website:'https://x.com',instagram:'@x',description:'d',hours:'12-23',photos:[PNG],foodPhotos:[],venuePhotos:[],menuPhotos:[],dealTerms:'t',dealSlots:[{id:'s1',label:'Dinner',timeStart:'19:00',timeEnd:'23:00',active:true,days:['mon']}],deals:[{id:'d1',title:'2x1 cocktails',description:'x',active:true,savingsEur:12,cooldownDays:7}],liveDeal:{dealSlots:[{id:'s1',active:true}]},rating:4.5,reviews:1,lat:41.39,lng:2.16,status:'LIVE',submittedAt:Date.now(),approvedAt:Date.now(),offerVersion:1,createdAt:Date.now()},o);
function seed(w){
  w.eval('store.partnerVenues='+JSON.stringify([
    V({id:'pv_live',slug:'live-bar',name:'Live Bar'}),
    V({id:'pv_cerceveria',ownerId:'u_demo_partner',slug:'demo-bar',name:'Demo Bar'})
  ])+';store.redemptions=[{memberId:"u_demo_member",venueSlug:"live-bar",dealId:"d1",redeemedAt:Date.now()-3*86400000,method:"SLIDE_CONFIRM"}];saveStore();');
}
// UI tokens that should appear ONLY in the named language. Word-ish boundaries.
const SPANISH = ['Cómo llegar','Llamar','Compartir','Ofertas activas','Canjeable','Disponible en','reseñas','Guardados','Cerrar sesión','Aprobar','Pausar','Eliminar','Rechazar','Ahorras','ahorras','Guardar cambios','Mis ofertas','Tus ofertas','Volver','Abierto','Cerrado','Descubre','Reservas','Aprobaciones'];
const ENGLISH = ['How to get','Active offers','Redeemable','Available in','Log out','Save changes','My offers','Your offers','Approve','Pause','Delete','Reject','Discover','Bookings','Pending approvals','save ~','How it works'];
function scan(label, uid, route, params) {
  // EN: should contain NO Spanish UI tokens
  { const w=boot(uid,'en'); seed(w); try{ev(w,route,params);}catch(e){}
    const t=(w.document.getElementById('root').textContent||'');
    const leaked=SPANISH.filter(tok=>t.includes(tok));
    if(leaked.length){issues+=leaked.length; out.push('  ✗ '+label+'  [EN shows Spanish]: '+leaked.join(', '));}
    else out.push('  ✓ '+label+'  EN clean'); }
  // ES: should contain NO English UI tokens
  { const w=boot(uid,'es'); seed(w); try{ev(w,route,params);}catch(e){}
    const t=(w.document.getElementById('root').textContent||'');
    const leaked=ENGLISH.filter(tok=>t.includes(tok));
    if(leaked.length){issues+=leaked.length; out.push('  ✗ '+label+'  [ES shows English]: '+leaked.join(', '));}
    else out.push('  ✓ '+label+'  ES clean'); }
}

console.log('\n=========== i18n LEAK SCAN (EN ⇄ ES) ===========');
scan('MEMBER discover','u_demo_member','app',{});
scan('MEMBER venue','u_demo_member','venue',{slug:'live-bar'});
scan('MEMBER profile','u_demo_member','profile',{});
scan('MEMBER bookings','u_demo_member','bookings',{});
scan('ADMIN overview','u_demo_admin','admin',{tab:'overview'});
scan('ADMIN partners','u_demo_admin','admin',{tab:'partners'});
scan('ADMIN reviews','u_demo_admin','admin',{tab:'reviews'});
scan('PARTNER overview','u_demo_partner','partner-portal',{tab:'overview'});
scan('PARTNER ofertas','u_demo_partner','partner-portal',{tab:'ofertas'});
scan('PARTNER profile','u_demo_partner','partner-portal',{tab:'profile'});
scan('PARTNER clientes','u_demo_partner','partner-portal',{tab:'clientes'});
scan('PARTNER redeem','u_demo_partner','partner-portal',{tab:'redeem'});
console.log(out.join('\n'));
console.log('-----------------------------------------------');
console.log('LEAK TOKENS FOUND: '+issues);
console.log('===============================================');
