const fs=require('fs');const {JSDOM}=require('jsdom');
const S=fs.readFileSync(process.argv[2],'utf8');
function boot(){const dom=new JSDOM(S,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://menuverso.com/',beforeParse(w){w.requestAnimationFrame=c=>setTimeout(c,0);w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.fetch=()=>Promise.reject(new Error('x'));w.localStorage.setItem('menuverso_session_v4',JSON.stringify({userId:'u_demo_member',expiresAt:Date.now()+9e11}));const e=[];w.__e=e;w.addEventListener('error',ev=>{const m=(ev.error?ev.error.message:ev.message)||'';if(!/tailwind/.test(m))e.push(m);});}});return dom.window;}
const ev=(w,r,p)=>w.dispatchEvent(new w.PopStateEvent('popstate',{state:{mvRoute:r,mvParams:p||{}}}));
// Sky Lounge deal savings = €13, one redemption. Bookings total + Profile total must both = €13.
const seed=`store.partnerVenues=[{id:"pv_b",slug:"sky",name:"Sky Lounge",barrio:"Eixample",cuisine:"Drinks",priceTier:2,status:"LIVE",photos:[],foodPhotos:[],venuePhotos:[],menuPhotos:[],deals:[{id:"d1",title:"2x1",active:true,savingsEur:13,cooldownDays:7}],dealSlots:[],rating:4.5,reviews:0,lat:41.39,lng:2.16,liveDeal:{dealSlots:[]}}];
store.redemptions=[{memberId:"u_demo_member",venueSlug:"sky",dealId:"d1",redeemedAt:Date.now()-2*86400000,method:"SLIDE_CONFIRM"}];
store.bookings=[{id:"bk1",memberId:"u_demo_member",venueSlug:"sky",dealId:"d1",slot:"All day",redeemed:true,redeemedAt:Date.now()-2*86400000,createdAt:Date.now()-2*86400000,expiresAt:Date.now()-1*86400000}];
saveStore();`;
let pass=0,fail=0;const ck=(n,c,d)=>{if(c){pass++;console.log('  PASS  '+n);}else{fail++;console.log('  FAIL  '+n+(d?'  -> '+d:''));}};
const grab=(t)=>{const m=t.match(/€\s?(\d+)/g)||[];return m;};

let w=boot();w.eval(seed);ev(w,'bookings');
const bt=w.document.getElementById('root').textContent||'';
ck('Bookings lifetime total shows €13 (not €18)', /€\s?13/.test(bt) && !/€\s?18/.test(bt), 'amounts seen: '+grab(bt).join(','));
ck('Bookings memberSavingsEur() == 13', w.eval('memberSavingsEur(currentUser())')===13, 'got '+w.eval('memberSavingsEur(currentUser())'));

let w2=boot();w2.eval(seed);ev(w2,'profile');
const pt=w2.document.getElementById('root').textContent||'';
ck('Profile SAVED shows €13', /€\s?13/.test(pt), 'amounts seen: '+grab(pt).join(','));
ck('Profile shows no stray €18', !/€\s?18/.test(pt), 'found €18: '+grab(pt).join(','));

// the two screens agree
ck('Bookings total === Profile total (both per-deal)', w.eval('memberSavingsEur(currentUser())')===13);
console.log('RESULT PASS:'+pass+' FAIL:'+fail);
