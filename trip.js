// =====================================================================
// MY EXPEDITION (the Handbook): the area for people accepted onto an expedition.
//
// People sign in with an email and password, then join with a shared trip code.
// Staff (Venture Fellows and guides) use a separate staff code for the same trip,
// which unlocks the gear check.
//
// Two data layers, same functions:
//   LiveTripData  the real thing, backed by Supabase (rules in supabase/setup.sql).
//   DemoTripData  keeps everything in this browser, with made-up people.
// The site uses Live once TRIP_CONFIG below is filled in, and the demo until then.
//
// Loaded before index.html's main script; MyTrip.init() runs from its INIT block.
// Uses index.html's helpers: esc, safeUrl, tripNeeds, meetsNeed, entryLevel,
// entrySpecs, shortfallText, shortNeed, needPhrase, gearLabel, kitState, etc.
// =====================================================================

// From Supabase > Project Settings > API. The anon key is meant to be public:
// the database's rules decide what each signed-in person can see.
const TRIP_CONFIG = {
  supabaseUrl: 'https://aqvbqmyvxdxangtguajq.supabase.co',
  supabaseAnonKey: 'sb_publishable_lwjctElIoJj0rd3wazJoIA_gusFrce6'
};

const DemoTripData = (() => {
  const KEY = 'gearwrangler_tripDemo_v1';

  // Each trip has a participant code and a staff code.
  // In the real version these live in the database, not in this file.
  const TRIPS = [
    { id:'demo-patagonia', expeditionId:'undergrad-vodudahue-cloud-forest-patagonia',
      code:'PATAGONIA', staffCode:'PATAGONIA-STAFF', starts:'2026-12-28',
      fallback:{ name:'Vodudahue Cloud Forest - Patagonia', location:'Pumalin Park, Chile', when:'Dec. 28 2026 - Jan. 5, 2027', endsBy:'2027-01-05' } },
    { id:'demo-atacama', expeditionId:'undergrad-atacama-desert',
      code:'ATACAMA', staffCode:'ATACAMA-STAFF', starts:'2027-03-06',
      fallback:{ name:'Atacama Desert', location:'San Pedro de Atacama, Chile', when:'March 6-13, 2027', endsBy:'2027-03-13' } }
  ];

  const normal = code => String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const clone = value => JSON.parse(JSON.stringify(value));
  const newId = prefix => prefix + '-' + Math.random().toString(36).slice(2, 10);

  // A fingerprint of someone's gear, so a staff check can tell when it has changed.
  function gearSig(gear){
    gear = gear || {};
    return PERSONAL_GEAR.map(cat => {
      const g = gear[cat];
      return g ? [g.id, g.level || '', g.specs ? JSON.stringify(g.specs) : ''].join(':') : '-';
    }).join('|');
  }

  // Product ids from index.html's lists, turned into saved-gear entries.
  function gearOf(ids){
    const gear = {};
    Object.keys(ids).forEach(cat => {
      const product = allProducts(CATEGORIES[cat]).find(p => p.id === ids[cat]);
      if(product) gear[cat] = kitEntryFor(cat, product);
    });
    return gear;
  }

  // ---------- Made-up people for the demo ----------
  function seed(){
    const P = 'demo-patagonia', A = 'demo-atacama';
    const fullKit = { bag:'nemo-disco-15', pad:'thermarest-neoair-xlite-nxt', pack:'osprey-atmos-ag65',
      jacket:'arcteryx-beta-sl', shoes:'salomon-quest5-gtx', headlamp:'blackdiamond-spot400r' };
    const leoBefore = gearOf(Object.assign({}, fullKit, { pack:'gregory-baltoro-75', bag:'seatosummit-spark-15' }));
    const leoNow = gearOf(Object.assign({}, fullKit, { pack:'gregory-baltoro-75', bag:'kelty-cosmic-20' }));
    const maya = gearOf(fullKit);
    const ben = gearOf({ bag:'kelty-cosmic-20', pad:'thermarest-zlite-sol', pack:'osprey-exos-58', jacket:'froggtoggs-ultralite2', shoes:'salomon-quest5-gtx', headlamp:'petzl-actik-core' });

    const staff = (id, name, role, about, joinedAt) => ({ id, name, role, about, bookingUrl:'demo', joinedAt });
    const person = (id, name, about, joinedAt, extra) => Object.assign({ id, name, role:'participant', about, joinedAt, gear:{} }, extra || {});

    const members = {};
    members[P] = [
      staff('m-sam', 'Sam Okafor', 'vf', "WG'27 · led Patagonia last year", '2026-10-20T15:00:00Z'),
      staff('m-priya', 'Priya Natarajan', 'vf', "WG'27 · former NPS ranger", '2026-10-20T16:00:00Z'),
      staff('m-jordan', 'Jordan Reyes', 'guide', 'Lead guide · 12 seasons in Patagonia', '2026-10-21T12:00:00Z'),
      person('m-maya', 'Maya R.', "C'28 · first big trek", '2026-10-22T14:00:00Z', {
        gear:maya, gearUpdatedAt:'2026-10-25T20:00:00Z',
        review:{ status:'verified', note:'Looks great. See you in Chile!', byId:'m-sam', byName:'Sam Okafor', at:'2026-10-27T15:30:00Z', gearSig:gearSig(maya) },
        oneOnOne:{ withId:'m-sam', withName:'Sam Okafor', when:'2026-11-12T16:00' } }),
      person('m-ben', 'Ben Carter', "W'27 · from Denver", '2026-10-22T18:00:00Z', {
        gear:ben, gearUpdatedAt:'2026-10-26T02:00:00Z',
        review:{ status:'changes', note:"Your bag's rated 31°F and nights can hit the 30s. Let's find something warmer, plus a thicker pad.", byId:'m-priya', byName:'Priya Natarajan', at:'2026-10-28T17:00:00Z', gearSig:gearSig(ben) } }),
      person('m-aisha', 'Aisha', 'Nursing ’27 · loves rafting', '2026-10-23T13:00:00Z', {
        gear:gearOf({ pack:'osprey-exos-58', jacket:'patagonia-torrentshell-3l', headlamp:'nitecore-nu25' }), gearUpdatedAt:'2026-11-01T19:00:00Z' }),
      person('m-leo', 'Leo T.', "E'28 · climbing club", '2026-10-23T21:00:00Z', {
        gear:leoNow, gearUpdatedAt:'2026-11-03T22:00:00Z',
        review:{ status:'verified', note:'', byId:'m-priya', byName:'Priya Natarajan', at:'2026-10-30T18:00:00Z', gearSig:gearSig(leoBefore) },
        oneOnOne:{ withId:'m-priya', withName:'Priya Natarajan', when:'2026-11-14T11:30' } }),
      person('m-hannah', 'Hannah Kim', "W'28 · Philly native", '2026-10-24T16:00:00Z', {
        gear:gearOf({ bag:'westernmountaineering-megalite', pad:'nemo-tensor-all-season', pack:'granitegear-crown3-60', jacket:'outdoorresearch-helium', shoes:'lowa-renegade-evo', headlamp:'petzl-actik-core' }),
        gearUpdatedAt:'2026-11-04T15:00:00Z',
        oneOnOne:{ withId:'m-sam', withName:'Sam Okafor', when:'2026-11-18T15:00' } }),
      person('m-diego', 'Diego M.', '', '2026-11-02T20:00:00Z')
    ];
    members[A] = [
      staff('m-tess', 'Tess Alvarez', 'vf', "C'27 · Atacama alum", '2026-10-25T15:00:00Z'),
      staff('m-omar', 'Omar Haddad', 'guide', 'Guide · desert and high altitude', '2026-10-25T16:00:00Z'),
      person('m-june', 'June P.', "C'29", '2026-10-28T14:00:00Z'),
      person('m-raf', 'Rafael', "W'28 · first trip abroad", '2026-10-29T14:00:00Z'),
      person('m-sofia', 'Sofia L.', "E'27", '2026-10-30T14:00:00Z')
    ];

    const msg = (id, at, author, text, thread) => ({ id, at, authorId:author.id, authorName:author.name, authorRole:author.role, text, thread:thread || null });
    const [sam, priya, jordan] = members[P];
    const ben2 = members[P][4], hannah = members[P][7], leo = members[P][6];
    const tess = members[A][0];
    const messages = {};
    messages[P] = [
      msg('x1', '2026-10-28T14:00:00Z', sam, 'Welcome to Patagonia, crew! Add your gear here by Nov 20 so we can check it. Pre-trip meeting details coming soon.'),
      msg('x2', '2026-10-30T16:20:00Z', jordan, 'Expect rain most days. A real rain shell matters more than anything else you pack.'),
      msg('x3', '2026-11-02T19:05:00Z', hannah, 'Anyone flying out of PHL on Dec 26? Would love a travel buddy.'),
      msg('x4', '2026-11-02T19:40:00Z', leo, 'Me! Let’s sort it out.'),
      msg('x5', '2026-10-28T17:10:00Z', ben2, 'Is my Kelty bag warm enough? It says 20 on the label.', 'm-ben'),
      msg('x6', '2026-10-28T18:00:00Z', priya, "The 20 is its lower limit. It's comfort-rated around 31°F, so it's borderline. Let's talk options at your 1-1.", 'm-ben')
    ];
    messages[A] = [
      msg('y1', '2026-10-29T15:00:00Z', tess, 'Hi all! Nights in the desert get cold. Add your gear by Feb 1 and we’ll take a look.')
    ];
    return { members, messages };
  }

  let db = null;
  function data(){
    if(db) return db;
    try{
      const raw = localStorage.getItem(KEY);
      if(raw) db = JSON.parse(raw);
    }catch(e){ db = null; }
    if(!db){ db = seed(); save(); }
    return db;
  }
  function save(){
    try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){ /* storage unavailable: keep it in memory */ }
  }
  function tripView(t, role){
    const view = { id:t.id, expeditionId:t.expeditionId, code:t.code, starts:t.starts, fallback:t.fallback };
    if(role === 'staff') view.staffCode = t.staffCode;
    return view;
  }
  function list(store, tripId){
    const d = data();
    if(!d[store][tripId]) d[store][tripId] = [];
    return d[store][tripId];
  }

  async function findCode(code){
    const c = normal(code);
    if(!c) return null;
    for(const t of TRIPS){
      if(c === t.code) return { trip:tripView(t, 'participant'), role:'participant' };
      if(c === t.staffCode) return { trip:tripView(t, 'staff'), role:'staff' };
    }
    return null;
  }
  async function saveMember(tripId, member){
    const members = list('members', tripId);
    const i = members.findIndex(m => m.id === member.id);
    if(i >= 0) members[i] = clone(member); else members.push(clone(member));
    save();
  }

  return {
    isDemo:true, needsAuth:false,
    normal, newId, gearSig, findCode, saveMember,
    // The demo remembers which made-up person you are in this browser.
    async myMembership(session){
      if(!session || !session.code) return null;
      const found = await findCode(session.code);
      if(!found || !list('members', found.trip.id).some(m => m.id === session.memberId)) return null;
      return { trip:found.trip, role:found.role, code:normal(session.code), memberId:session.memberId };
    },
    async joinTrip(code, member){
      const found = await findCode(code);
      if(!found) return null;
      const m = Object.assign({ id:newId('m') }, member);
      await saveMember(found.trip.id, m);
      return m.id;
    },
    async listMembers(tripId){ return clone(list('members', tripId)); },
    async listMessages(tripId){ return clone(list('messages', tripId)); },
    async postMessage(tripId, message){
      list('messages', tripId).push(clone(message));
      save();
    },
    reset(){
      db = null;
      try{ localStorage.removeItem(KEY); }catch(e){}
    }
  };
})();


// ---------- The real thing: Supabase ----------
const LiveTripData = (() => {
  let client = null;
  function sb(){
    if(!client){
      if(!window.supabase || !window.supabase.createClient) throw new Error('offline');
      client = window.supabase.createClient(TRIP_CONFIG.supabaseUrl, TRIP_CONFIG.supabaseAnonKey, {
        auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'implicit' }
      });
    }
    return client;
  }
  async function run(query){
    const { data, error } = await query;
    if(error) throw error;
    return data;
  }
  const siteUrl = () => location.origin + location.pathname;
  const { normal } = DemoTripData;

  // Database rows, in the shape the screens expect.
  const memberOf = r => ({ id:r.id, name:r.name, about:r.about || '', role:r.role, bookingUrl:r.booking_url || '',
    gear:r.gear || {}, gearUpdatedAt:r.gear_updated_at || null, review:r.review || null,
    oneOnOne:r.one_on_one || null, joinedAt:r.joined_at });
  const messageOf = r => ({ id:r.id, at:r.at, authorId:r.author_id, authorName:r.author_name,
    authorRole:r.author_role, text:r.text, thread:r.thread });

  return {
    isDemo:false, needsAuth:true,
    normal, newId:DemoTripData.newId, gearSig:DemoTripData.gearSig,

    // Accounts
    async user(){
      const { data } = await sb().auth.getSession();
      return data && data.session ? data.session.user : null;
    },
    async signIn(email, password){ await run(sb().auth.signInWithPassword({ email, password })); },
    async signUp(email, password){
      const d = await run(sb().auth.signUp({ email, password, options:{ emailRedirectTo:siteUrl() } }));
      return { confirm:!d.session };
    },
    async sendReset(email){ await run(sb().auth.resetPasswordForEmail(email, { redirectTo:siteUrl() })); },
    async setPassword(password){ await run(sb().auth.updateUser({ password })); },
    async signOut(){ await sb().auth.signOut(); },

    // Trips
    async findCode(code){
      const c = normal(code);
      if(!c) return null;
      const d = await run(sb().rpc('find_trip_code', { p_code:c }));
      if(d && d.error === 'too_many') throw new Error('too_many');
      return d || null;
    },
    async myMembership(){
      const d = await run(sb().rpc('my_trip'));
      return d ? { trip:d.trip, role:d.role, code:d.trip.code, memberId:d.memberId } : null;
    },
    async joinTrip(code, m){
      return run(sb().rpc('join_trip', { p_code:normal(code), p_name:m.name, p_about:m.about || '',
        p_role:m.role, p_booking_url:m.bookingUrl || null, p_gear:m.gear || {} }));
    },
    async listMembers(tripId){
      return (await run(sb().rpc('trip_members', { p_trip:tripId }))).map(memberOf);
    },
    // The database decides what actually changes (see members_guard in setup.sql).
    async saveMember(tripId, m){
      await run(sb().from('members').update({
        name:m.name, about:m.about || '', role:m.role, booking_url:m.bookingUrl || null,
        gear:m.gear || {}, gear_updated_at:m.gearUpdatedAt || null,
        one_on_one:m.oneOnOne || null, review:m.review || null
      }).eq('id', m.id));
    },
    async listMessages(tripId){
      return (await run(sb().from('messages').select('*').eq('trip_id', tripId).order('at'))).map(messageOf);
    },
    // Name, role, and time are filled in by the database.
    async postMessage(tripId, m){
      await run(sb().from('messages').insert({ trip_id:tripId, author_id:m.authorId, author_name:'', author_role:'',
        thread:m.thread || null, text:m.text }));
    },

    // Super admins (listed in the admins table in Supabase). The database refuses these for anyone else.
    async isAdmin(){
      try{ return (await run(sb().rpc('is_admin'))) === true; }
      catch(e){ console.error(e); return false; }  // e.g. setup.sql hasn't been re-run yet
    },
    async adminTrips(){ return (await run(sb().rpc('admin_trips'))) || []; },
    async adminAddTrip(t){
      return run(sb().rpc('admin_add_trip', { p_expedition_id:t.expeditionId, p_code:normal(t.code),
        p_staff_code:normal(t.staffCode), p_starts:t.starts, p_ends:t.ends || null,
        p_name:t.name || null, p_location:t.location || null, p_dates:t.when || null }));
    },
    // name, location, and when are sent only for typed-in trips; otherwise they stay as they are.
    async adminUpdateTrip(t){
      await run(sb().rpc('admin_update_trip', { p_trip:t.id, p_code:normal(t.code),
        p_staff_code:normal(t.staffCode), p_starts:t.starts, p_ends:t.ends || null,
        p_name:t.name == null ? null : t.name, p_location:t.location == null ? null : t.location,
        p_dates:t.when == null ? null : t.when }));
    },
    async adminList(){ return (await run(sb().rpc('admin_list_admins'))) || []; },
    async adminAdd(email){ return (await run(sb().rpc('admin_add_admin', { p_email:email }))) || []; },
    async adminRemove(userId){ return (await run(sb().rpc('admin_remove_admin', { p_user:userId }))) || []; },
    reset(){}
  };
})();

const TripData = TRIP_CONFIG.supabaseUrl && TRIP_CONFIG.supabaseAnonKey ? LiveTripData : DemoTripData;


const MyTrip = (() => {
  const SESSION_KEY = 'gearwrangler_tripSession';
  const ROLE_LABEL = { participant:'Participant', vf:'Venture Fellow', guide:'Guide' };
  const VIEWS = ['home', 'gear', 'crew', 'messages', 'oneonone'];

  // Destination photos, matched to a trip by a word in its id. All from Wikimedia Commons.
  const PHOTOS = [
    { match:'vodudahue', file:'photos/vodudahue.jpg', credit:'Almonroth', license:'CC BY-SA 3.0', page:'https://commons.wikimedia.org/wiki/File:Parque_Pumal%C3%ADn.jpg' },
    { match:'atacama', file:'photos/atacama.jpg', credit:'Diego Delso', license:'CC BY-SA 4.0', page:'https://commons.wikimedia.org/wiki/File:Valle_de_la_Luna,_San_Pedro_de_Atacama,_Chile,_2016-02-01,_DD_160.JPG' },
    { match:'corsica', file:'photos/corsica.jpg', credit:'Hermes from mars', license:'CC BY-SA 3.0', page:'https://commons.wikimedia.org/wiki/File:GR20_Corsica_Montains-2.jpg' },
    { match:'marvels', file:'photos/merveilles.jpg', credit:'Eebie', license:'CC BY-SA 4.0', page:'https://commons.wikimedia.org/wiki/File:Vallee_des_Merveilles-Lac_superieure.jpg' },
    { match:'andes', file:'photos/plomo.jpg', credit:'Tijs Michels', license:'CC BY-SA 3.0', page:'https://commons.wikimedia.org/wiki/File:Cerro_del_Plomo_from_the_south-west.jpeg' },
    { match:'antarctica', file:'photos/antarctica.jpg', credit:'Hannes Grobe', license:'CC BY-SA 4.0', page:'https://commons.wikimedia.org/wiki/File:King-george-island_antarktis16_hg.jpg' },
    { match:'aotearoa', file:'photos/aotearoa.jpg', credit:'Christoph Strässler', license:'CC BY-SA 2.0', page:'https://commons.wikimedia.org/wiki/File:Routeburn_Track_(16352397300).jpg' },
    { match:'avellano', file:'photos/avellano.jpg', credit:'Ahti Heinla', license:'CC BY-SA 3.0', page:'https://commons.wikimedia.org/wiki/File:Cerro_Castillo.jpg' },
    { match:'sailing', file:'photos/sailing.jpg', credit:'giggel', license:'CC BY 3.0', page:'https://commons.wikimedia.org/wiki/File:Karibik_-_Brit._Jungferninseln_-_Little_Jost_van_Dyke_%E2%80%93_Green_Cay_and_Sandy_Spit_-_panoramio.jpg' }
  ];

  // Demo only: sign in as one of the sample people, to see each side of the trip.
  const DEMO_PEOPLE = [
    { id:'m-sam', name:'Sam Okafor', role:'vf', code:'PATAGONIA-STAFF' },
    { id:'m-jordan', name:'Jordan Reyes', role:'guide', code:'PATAGONIA-STAFF' },
    { id:'m-maya', name:'Maya R.', role:'participant', code:'PATAGONIA' },
    { id:'m-ben', name:'Ben Carter', role:'participant', code:'PATAGONIA' }
  ];

  let s = freshState();
  function freshState(){
    return { step:'code', view:'home', trip:null, role:null, code:null, me:null, members:[], messages:[],
      error:'', notice:'', msgTab:'board', thread:null, open:null, editing:false, loaded:false,
      checked:false, user:null, authMode:'signin', email:'', busy:false,
      admin:false, adminTrips:[], adminEdit:null, adminDraft:null, admins:[], adminError:'' };
  }

  // ---------- Session: which trip and which person, in this browser ----------
  function readSession(){
    try{ return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }catch(e){ return null; }
  }
  function writeSession(value){
    try{
      if(value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else localStorage.removeItem(SESSION_KEY);
    }catch(e){}
  }
  function hasSession(){ return !!readSession(); }

  // Works out where this person is: signed out, signed in but not on a trip yet, or on a trip.
  // The saved session is only a hint for the nav (and who you are in the demo).
  async function resume(){
    s.checked = true;
    if(TripData.needsAuth){
      s.user = await TripData.user();
      if(!s.user){ writeSession(null); s.step = 'signin'; return false; }
      s.admin = TripData.isAdmin ? await TripData.isAdmin() : false;
    }
    const found = await TripData.myMembership(readSession());
    if(found){
      s.trip = found.trip; s.role = found.role; s.code = found.code;
      await refresh(found.memberId);
    }
    if(!found || !s.me){
      writeSession(null);
      s.trip = null; s.me = null; s.loaded = false;
      // Super admins who aren't on a trip land on Manage trips.
      if(s.step !== 'profile') s.step = 'code';
      if(s.admin && s.step === 'code') await loadAdmin();
      refreshLinks(); buildTabs();
      return false;
    }
    writeSession({ code:found.code, memberId:found.memberId });
    s.step = 'in';
    s.loaded = true;
    refreshLinks(); buildTabs();
    return true;
  }
  async function refresh(memberId){
    const id = memberId || (s.me && s.me.id);
    s.members = await TripData.listMembers(s.trip.id);
    s.messages = (await TripData.listMessages(s.trip.id)).sort((a, b) => a.at.localeCompare(b.at));
    s.me = s.members.find(m => m.id === id) || null;
  }

  // ---------- Small helpers ----------
  const isStaff = m => m && (m.role === 'vf' || m.role === 'guide');
  const participants = () => s.members.filter(m => m.role === 'participant');
  const staffMembers = () => s.members.filter(isStaff);
  function initials(name){
    return String(name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  }
  function stamp(iso){
    const d = new Date(iso);
    if(isNaN(d)) return '';
    return d.toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  }
  function daysUntil(isoDate){
    const [y, m, d] = isoDate.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((start - today) / 86400000);
  }
  function expedition(){
    if(!s.trip) return null;
    const live = (expeditionList || []).find(e => e.id === s.trip.expeditionId);
    return live || Object.assign({ id:s.trip.expeditionId }, s.trip.fallback);
  }
  function photoFor(exp){
    const id = (exp && exp.id) || '';
    return PHOTOS.find(p => id.includes(p.match)) || null;
  }
  function inviteLink(code){
    return location.origin + location.pathname + '#trip=' + encodeURIComponent(code);
  }
  function personalLink(){
    return inviteLink(s.code) + '&me=' + encodeURIComponent(s.me.id);
  }
  function snapshot(){
    const gear = {};
    PERSONAL_GEAR.forEach(cat => { if(kitState[cat]) gear[cat] = JSON.parse(JSON.stringify(kitState[cat])); });
    return gear;
  }
  function val(id){
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // ---------- Gear: the site's own check, plus the staff check ----------
  function gearCheck(member){
    const exp = expedition();
    if(!exp || !exp.gearNeeds) return null;
    const gear = member.gear || {};
    const rows = tripNeeds(exp.gearNeeds).map(n => {
      const entry = gear[n.cat] || null;
      const ok = !!entry && meetsNeed(n.cat, entryLevel(n.cat, entry), n.required);
      const problem = ok ? '' : entry ? shortfallText(n.cat, n.required, entrySpecs(n.cat, entry)) : `Needs ${needPhrase(n.cat, n.text)}.`;
      return { cat:n.cat, ok, entry, problem };
    });
    return { rows, met:rows.filter(r => r.ok).length, total:rows.length };
  }
  function reviewState(member){
    const r = member.review;
    if(!r) return { key:'wait', label:'Not checked yet' };
    if(r.gearSig !== TripData.gearSig(member.gear)) return { key:'changed', label:'Changed since checked' };
    return r.status === 'verified' ? { key:'ok', label:'Verified' } : { key:'warn', label:'Changes requested' };
  }
  function chip(state){
    const cls = state.key === 'ok' ? 'ok' : state.key === 'warn' ? 'warn' : 'wait';
    return `<span class="chip ${cls}">${esc(state.label)}</span>`;
  }
  function checkListHtml(check){
    return `<ul class="check-list">` + check.rows.map(r => `<li class="${r.ok ? 'ok' : 'warn'}">
        <span class="check-mark" aria-hidden="true">${r.ok ? '✓' : '✗'}</span>
        <div><div class="check-cat">${esc(gearLabel(r.cat))}</div>
        <div class="check-name">${r.entry ? esc(r.entry.name) : 'Nothing added'}</div>
        ${r.problem ? `<div class="check-problem">${esc(r.problem)}</div>` : ''}</div>
        <span class="sr-only">${r.ok ? 'Meets the need' : 'Does not meet the need'}</span>
      </li>`).join('') + `</ul>`;
  }
  function lastThreadMessage(memberId){
    const thread = s.messages.filter(m => m.thread === memberId);
    return thread.length ? thread[thread.length - 1] : null;
  }
  function awaitingReply(memberId){
    const last = lastThreadMessage(memberId);
    return !!last && last.authorRole === 'participant';
  }

  // ---------- Screens ----------
  async function open(view){
    if(view && VIEWS.includes(view)) s.view = view;
    s.notice = '';
    updateProgress(null);
    if(!s.checked){
      s.step = 'loading';
      render();
      showScreen('trip');
      try{ await resume(); }
      catch(e){ console.error(e); s.checked = false; s.step = 'error'; s.error = friendly(e); }
      render();
      focusHeading(document.getElementById('screen-trip'));
      return;
    }
    render();
    showScreen('trip');
  }
  function go(view){
    s.view = view;
    s.notice = '';
    s.editing = false;
    render();
    const tabs = document.querySelector('.trip-tabs');
    if(tabs && view !== 'home') tabs.scrollIntoView({ block:'start' });
    else window.scrollTo({ top:0 });
    // Pick up what others have posted or changed since.
    if(!TripData.isDemo && s.step === 'in') refresh().then(render).catch(e => console.error(e));
  }
  function render(){
    const el = document.getElementById('tripContent');
    if(!el) return;
    if(s.step === 'signin') el.innerHTML = authHtml();
    else if(s.step === 'loading' || s.step === 'error') el.innerHTML = statusHtml();
    else if(s.step === 'code') el.innerHTML = codeHtml();
    else if(s.step === 'profile') el.innerHTML = profileHtml();
    else if(s.step === 'admin') el.innerHTML = adminHtml();
    else el.innerHTML = shellHtml();
  }

  // Plain-language versions of what the server says.
  function friendly(e){
    const msg = String((e && (e.message || e.error_description)) || e || '');
    const code = (e && e.code) || '';
    if(msg === 'too_many') return 'Too many wrong codes. Wait an hour, then try again.';
    if(/invalid login credentials/i.test(msg)) return "That email and password don't match.";
    if(/already (been )?registered|already exists/i.test(msg) || code === 'user_already_exists') return 'That email already has an account. Sign in instead.';
    if(/email not confirmed/i.test(msg)) return 'Confirm your email first: check your inbox.';
    if(/rate limit|too many requests/i.test(msg) || /rate_limit/.test(code)) return 'Too many tries just now. Wait a few minutes, then try again.';
    if(/should be different|same as the old/i.test(msg)) return 'Pick a password you haven’t used here before.';
    if(/password/i.test(msg) && /(at least|short|weak)/i.test(msg)) return 'Pick a stronger password: at least 8 characters.';
    if(/email/i.test(msg) && /invalid/i.test(msg)) return 'Check the email address.';
    if(/session.*missing|jwt|not authenticated|sign in first/i.test(msg)) return 'Your sign-in expired. Sign in again.';
    if(/fetch|network|offline|load failed/i.test(msg)) return "Couldn't reach the server. Check your connection and try again.";
    if(code === 'P0001' && msg) return msg;  // a plain-language message written in setup.sql
    return 'Something went wrong. Try again.';
  }

  // Loading, or the server couldn't be reached.
  function statusHtml(){
    const failed = s.step === 'error';
    return `<div class="trip-shell"><div class="join-stage"><div class="join-card">
      <span class="back-link" onclick="goToHero()">← Handbook</span>
      ${failed ? `<h1 class="question">Couldn't open your trip.</h1>
        <p class="subtext">${esc(s.error)}</p>
        <button class="btn" onclick="MyTrip.open()">Try again</button>`
      : `<p class="subtext" role="status">Loading…</p>`}
      </div></div></div>`;
  }

  // Step 0 (real site only): sign in or create an account.
  function authHtml(){
    const mode = s.authMode;
    const title = { signin:'Log into your expedition.', signup:'Create your account.', reset:'Reset your password.', newpassword:'Pick a new password.' }[mode];
    const sub = { signin:"Accepted to an expedition? Sign in, then enter your trip code.",
      signup:'Any email works. Your trip code comes next.', reset:"We'll email you a link to pick a new one.",
      newpassword:'At least 8 characters.' }[mode];
    const button = { signin:'Sign in', signup:'Create account', reset:'Email me a link', newpassword:'Save password' }[mode];
    const askEmail = mode !== 'newpassword';
    const askPassword = mode !== 'reset';
    const links = {
      signin:`New here? <span class="text-link" onclick="MyTrip.authMode('signup')">Create an account</span> · <span class="text-link" onclick="MyTrip.authMode('reset')">Forgot password?</span>`,
      signup:`Have an account? <span class="text-link" onclick="MyTrip.authMode('signin')">Sign in</span>`,
      reset:`<span class="text-link" onclick="MyTrip.authMode('signin')">Back to sign in</span>`,
      newpassword:''
    }[mode];
    return `<div class="trip-shell"><div class="join-stage"><div class="join-card">
      <span class="back-link" onclick="goToHero()">← Handbook</span>
      <div class="eyebrow">Handbook</div>
      <h1 class="question">${title}</h1>
      <p class="subtext">${sub}</p>
      ${s.notice ? `<div class="trip-notice" role="status">${s.notice}</div>` : ''}
      <form onsubmit="event.preventDefault(); MyTrip.authSubmit();" novalidate>
        ${askEmail ? `<label class="plan-label" for="authEmail">Email</label>
        <input id="authEmail" class="search-box" type="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="${esc(s.email)}">` : ''}
        ${askPassword ? `<label class="plan-label" for="authPassword">${mode === 'signin' ? 'Password' : 'New password'}</label>
        <input id="authPassword" class="search-box" type="password" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}">` : ''}
        ${s.error ? `<p class="form-error" role="alert">${esc(s.error)}</p>` : ''}
        <button class="btn" type="submit"${s.busy ? ' disabled' : ''}>${s.busy ? 'One moment…' : button}</button>
      </form>
      ${links ? `<p class="fine-print">${links}</p>` : ''}
    </div></div></div>`;
  }

  function demoBar(){
    if(!TripData.isDemo) return '';
    return `<div class="trip-demo-bar"><span><strong>Demo.</strong> Made-up people. Nothing you type leaves this browser.</span>
      <span class="text-link" onclick="MyTrip.resetDemo()">Reset demo</span></div>`;
  }

  // Step 1: the code.
  function codeHtml(){
    return `<div class="trip-shell">${demoBar()}
      <div class="join-stage">
        <div class="join-card">
          <span class="back-link" onclick="goToHero()">← Handbook</span>
          <div class="eyebrow">Accepted to an expedition?</div>
          <h1 class="question">Enter your trip code.</h1>
          <p class="subtext">Your Venture Fellows send it after you're accepted.</p>
          <label class="plan-label" for="tripCode">Trip code</label>
          <input id="tripCode" class="search-box code-input" autocomplete="off" autocapitalize="characters" spellcheck="false"
            value="${esc(s.pendingCode || '')}" onkeydown="if(event.key==='Enter') MyTrip.join()">
          ${s.error ? `<p class="form-error" role="alert">${esc(s.error)}</p>` : ''}
          <button class="btn" onclick="MyTrip.join()">Continue</button>
          ${TripData.isDemo ? `<p class="fine-print">Try <strong>PATAGONIA</strong> to join as a participant, or <strong>PATAGONIA-STAFF</strong> as a Venture Fellow or guide.</p>
          <div class="demo-people"><div class="plan-label">Or look around as someone already on the trip</div>
            ${DEMO_PEOPLE.map(p => `<button class="option-btn small" onclick="MyTrip.demoAs('${p.id}')">${esc(p.name)}<span class="opt-sub">${esc(ROLE_LABEL[p.role])}</span></button>`).join('')}
          </div>` : ''}
          ${s.admin ? `<p class="fine-print">Super admin? <span class="text-link" onclick="MyTrip.openAdmin()">Manage trips</span></p>` : ''}
          ${s.user ? `<p class="fine-print">Signed in as ${esc(s.user.email)}. <span class="text-link" onclick="MyTrip.signOut()">Sign out</span></p>` : ''}
        </div>
      </div></div>`;
  }

  // Step 2: who you are.
  function profileHtml(){
    const exp = expedition();
    const photo = photoFor(exp);
    const staff = s.role === 'staff';
    return `<div class="trip-shell">${demoBar()}
      <div class="join-stage photo" ${photo ? `style="background-image:url('${photo.file}')"` : ''}>
        <div class="join-card">
          <span class="back-link" onclick="MyTrip.startOver()">← Different code</span>
          <div class="eyebrow">${staff ? 'Joining as staff' : "You're in"}</div>
          <h1 class="question">${esc(exp.name)}</h1>
          <p class="subtext">${esc([exp.location, exp.when].filter(Boolean).join(' · '))}</p>
          <label class="plan-label" for="tripName">Your name, as your crew will see it</label>
          <input id="tripName" class="search-box" maxlength="40" autocomplete="name" placeholder="${staff ? 'Alex Park' : 'Alex P.'}">
          <label class="plan-label" for="tripAbout">About you <span class="optional">(optional)</span></label>
          <input id="tripAbout" class="search-box" maxlength="80" placeholder="${staff ? "WG'27 · led this trip last year" : "C'28 · first big trek"}">
          ${staff ? `
          <label class="plan-label" for="tripRole">Your role</label>
          <select id="tripRole" class="owned-select full"><option value="vf">Venture Fellow</option><option value="guide">Guide</option></select>
          <label class="plan-label" for="tripBooking">1-1 booking link <span class="optional">(optional, Calendly or Google)</span></label>
          <input id="tripBooking" class="search-box" type="url" maxlength="300" placeholder="https://calendly.com/your-name">` : ''}
          ${s.error ? `<p class="form-error" role="alert">${esc(s.error)}</p>` : ''}
          <button class="btn" onclick="MyTrip.createProfile()">Join trip</button>
          ${!staff && hasMyGear() ? `<p class="fine-print">The gear in My gear comes with you, so your staff can check it.</p>` : ''}
        </div>
        ${photo ? creditHtml(photo) : ''}
      </div></div>`;
  }

  function creditHtml(photo){
    return `<a class="photo-credit" href="${esc(photo.page)}" target="_blank" rel="noopener">Photo: ${esc(photo.credit)}, ${esc(photo.license)}</a>`;
  }

  // Step 3: the trip itself.
  function shellHtml(){
    const exp = expedition();
    const photo = photoFor(exp);
    const big = s.view === 'home';
    const staff = isStaff(s.me);
    const tabs = [['home', 'Home'], ['gear', staff ? 'Gear check' : 'My gear'], ['crew', 'Crew'], ['messages', 'Messages'], ['oneonone', '1-1']];
    let countdown = '';
    if(big && s.trip.starts){
      const d = daysUntil(s.trip.starts);
      const ended = exp.endsBy && exp.endsBy < todayIso();
      countdown = d > 1 ? `<strong>${d}</strong> days to go` : d === 1 ? 'Starts tomorrow' : d === 0 ? 'Starts today' : ended ? 'Welcome back' : 'On expedition';
    }
    const needsLook = staff ? participants().filter(m => reviewState(m).key !== 'ok' && Object.keys(m.gear || {}).length).length : 0;
    const waiting = staff ? participants().filter(m => awaitingReply(m.id)).length : 0;
    const badge = { gear:needsLook, messages:waiting };
    return `<div class="trip-shell">${demoBar()}
      <header class="trip-hero${big ? ' big' : ''}" ${photo ? `style="background-image:url('${photo.file}')"` : ''}>
        <div class="trip-hero-overlay"></div>
        <nav class="trip-nav">
          <span class="trip-nav-link" onclick="goToHero()">← Handbook</span>
          <span class="trip-nav-right">
            <span class="trip-nav-who">${esc(s.me.name)}<span class="hide-sm"> · ${esc(ROLE_LABEL[s.me.role])}</span></span>
            ${s.admin ? `<button class="trip-signout" onclick="MyTrip.openAdmin()">Admin</button>` : ''}
            <button class="trip-signout" onclick="MyTrip.signOut()">Sign out</button>
          </span>
        </nav>
        <div class="trip-hero-content">
          <div class="trip-eyebrow">${staff ? "Expedition you're leading" : 'Your expedition'}</div>
          <h1>${esc(exp.name)}</h1>
          <p>${esc([exp.location, exp.when].filter(Boolean).join(' · '))}</p>
          ${countdown ? `<div class="trip-countdown">${countdown}</div>` : ''}
        </div>
        ${photo ? creditHtml(photo) : ''}
      </header>
      <nav class="trip-tabs" aria-label="Trip sections">
        ${tabs.map(([key, label]) => `<button class="trip-tab${s.view === key ? ' active' : ''}"${s.view === key ? ' aria-current="page"' : ''} onclick="MyTrip.go('${key}')">${label}${badge[key] ? ` <span class="tab-badge" aria-label="${badge[key]} need attention">${badge[key]}</span>` : ''}</button>`).join('')}
      </nav>
      <main class="trip-inner">
        ${s.notice ? `<div class="trip-notice" role="status">${s.notice}</div>` : ''}
        ${viewHtml(staff)}
      </main></div>`;
  }
  function viewHtml(staff){
    if(!expeditionList && !expeditionLoadFailed && s.view === 'gear') return `<p class="subtext">Loading…</p>`;
    switch(s.view){
      case 'gear': return staff ? staffGearHtml() : myGearHtml();
      case 'crew': return crewHtml();
      case 'messages': return messagesHtml(staff);
      case 'oneonone': return staff ? staffOneOnOneHtml() : oneOnOneHtml();
      default: return staff ? staffHomeHtml() : homeHtml();
    }
  }

  // ---------- Home ----------
  function task(done, title, sub, view){
    return `<div class="task-card" onclick="MyTrip.go('${view}')">
      <span class="task-icon${done ? ' done' : ''}" aria-hidden="true">${done ? '✓' : ''}</span>
      <div class="task-body"><div class="task-title">${title}</div><div class="task-sub">${sub}</div></div>
      <span class="task-go" aria-hidden="true">›</span></div>`;
  }
  function homeHtml(){
    const me = s.me;
    const check = gearCheck(me);
    const review = reviewState(me);
    const board = s.messages.filter(m => !m.thread);
    const latest = board[board.length - 1];
    let gearSub = 'Add what you own and we’ll check it.';
    if(check) gearSub = check.met === check.total ? 'Everything meets our estimate.' : `${check.met} of ${check.total} meet our estimate.`;
    let reviewSub = 'Your staff will look once your gear is in.';
    if(review.key === 'ok') reviewSub = `Verified by ${esc(me.review.byName)}.`;
    else if(review.key === 'warn') reviewSub = `${esc(me.review.byName)} asked for changes.`;
    else if(review.key === 'changed') reviewSub = 'You changed your gear. Staff will take another look.';
    const one = me.oneOnOne;
    const crew = s.members;
    return `<h2 class="trip-h2" tabindex="-1">Welcome, ${esc(me.name.split(' ')[0])}.</h2>
      <div class="section-label">Before you go</div>
      ${task(check && check.met === check.total, 'Get your gear ready', gearSub, 'gear')}
      ${task(review.key === 'ok', 'Gear check by staff', reviewSub, 'gear')}
      ${task(!!one, 'Book your 1-1', one ? `With ${esc(one.withName)}, ${esc(stamp(one.when))}.` : 'Pick a time with a Venture Fellow.', 'oneonone')}
      <div class="section-label">Trip board</div>
      ${latest ? `<div class="task-card" onclick="MyTrip.go('messages')"><div class="task-body">
          <div class="task-sub">${esc(latest.authorName)} · ${esc(stamp(latest.at))}</div>
          <div class="msg-preview">${esc(latest.text)}</div></div><span class="task-go" aria-hidden="true">›</span></div>`
        : `<p class="fine-print">No posts yet. <span class="text-link" onclick="MyTrip.go('messages')">Say hi</span>.</p>`}
      <div class="section-label">Your crew</div>
      <div class="avatar-row" onclick="MyTrip.go('crew')">${crew.slice(0, 10).map(m => `<span class="avatar${isStaff(m) ? ' staff' : ''}" title="${esc(m.name)}">${esc(initials(m.name))}</span>`).join('')}
        <span class="avatar-count">${participants().length} participants · ${staffMembers().length} staff</span></div>
      ${deviceHtml()}`;
  }
  function staffHomeHtml(){
    const people = participants();
    const verified = people.filter(m => reviewState(m).key === 'ok').length;
    const look = people.filter(m => reviewState(m).key !== 'ok' && Object.keys(m.gear || {}).length);
    const booked = people.filter(m => m.oneOnOne).length;
    const waiting = people.filter(m => awaitingReply(m.id));
    const noGear = people.filter(m => !Object.keys(m.gear || {}).length);
    return `<h2 class="trip-h2" tabindex="-1">Welcome, ${esc(s.me.name.split(' ')[0])}.</h2>
      <div class="stat-grid">
        <div class="stat-tile" onclick="MyTrip.go('gear')"><div class="num">${verified}<span class="of"> / ${people.length}</span></div><div class="lbl">Gear verified</div></div>
        <div class="stat-tile" onclick="MyTrip.go('oneonone')"><div class="num">${booked}<span class="of"> / ${people.length}</span></div><div class="lbl">1-1s booked</div></div>
      </div>
      ${look.length ? `<div class="section-label">Gear to check</div>` + look.map(m => personLine(m, chip(reviewState(m)), `MyTrip.openMember('${m.id}')`)).join('') : ''}
      ${waiting.length ? `<div class="section-label">Waiting for a reply</div>` + waiting.map(m => personLine(m, `<span class="chip wait">${esc(stamp(lastThreadMessage(m.id).at))}</span>`, `MyTrip.openThread('${m.id}')`)).join('') : ''}
      ${noGear.length ? `<div class="section-label">No gear added yet</div><p class="fine-print">${esc(noGear.map(m => m.name).join(', '))}</p>` : ''}
      <div class="section-label">Invite your crew</div>
      <div class="code-box">
        <div><div class="code-label">Participant code</div><div class="code-value">${esc(s.trip.code)}</div></div>
        <button class="btn secondary small" onclick="MyTrip.copy('${esc(inviteLink(s.trip.code))}', 'Invite link copied.')">Copy invite link</button>
      </div>
      <div class="code-box">
        <div><div class="code-label">Staff code · staff only</div><div class="code-value">${esc(s.trip.staffCode)}</div></div>
      </div>
      ${deviceHtml()}`;
  }
  function personLine(m, right, onclick){
    return `<div class="person clickable" onclick="${onclick}">
      <span class="avatar${isStaff(m) ? ' staff' : ''}" aria-hidden="true">${esc(initials(m.name))}</span>
      <div class="person-body"><div class="person-name">${esc(m.name)}</div></div>${right}</div>`;
  }
  function deviceHtml(){
    if(!TripData.isDemo) return s.user ? `<p class="fine-print trip-device">Signed in as ${esc(s.user.email)}. Sign in with it on any device.</p>` : '';
    return `<details class="info trip-device"><summary>Using another device?</summary>
      <p>Open your personal link there. Keep it to yourself: it opens your profile.</p>
      <p><span class="text-link" onclick="MyTrip.copy('${esc(personalLink())}', 'Personal link copied.')">Copy my personal link</span></p></details>`;
  }

  // ---------- Gear (participant) ----------
  function myGearHtml(){
    const me = s.me;
    const check = gearCheck(me);
    const review = reviewState(me);
    const exp = expedition();
    let html = `<div class="eyebrow">GearWrangler</div><h2 class="trip-h2" tabindex="-1">My gear for this trip.</h2>`;
    if(!check){
      return html + `<p class="subtext">Gear needs for this trip haven't been estimated yet.</p>`;
    }
    html += `<div class="readiness"><div class="readiness-num">${check.met} of ${check.total}</div>
      <div><strong>${check.met === check.total ? 'Ready, by our estimate' : 'meet our estimate'}</strong>
      <div class="fine-print">Estimated ${esc(conditionsText(exp.gearNeeds))}.</div></div></div>`;
    html += `<div class="review-card ${review.key}">
      <div class="review-head"><strong>Staff check</strong>${chip(review)}</div>
      ${me.review && me.review.note && review.key !== 'changed' ? `<p class="review-note">“${esc(me.review.note)}”<span class="review-by">${esc(me.review.byName)} · ${esc(stamp(me.review.at))}</span></p>` : ''}
      ${review.key === 'changed' ? `<p class="fine-print">You changed your gear after ${esc(me.review.byName)} checked it. They'll take another look.</p>` : ''}
      ${review.key === 'wait' ? `<p class="fine-print">Your Venture Fellows and guides can see this list.</p>` : ''}
    </div>`;
    html += checkListHtml(check);
    html += `<button class="btn" style="margin-top:16px;" onclick="openMyGearForTrip('${esc(exp.id)}')">Add or change gear</button>
      <p class="fine-print">Uses My gear: search, tag photo, or pick what it's good for. Changes show up here for your staff. Wharton's gear list is final.</p>`;
    return html;
  }

  // ---------- Gear check (staff) ----------
  function staffGearHtml(){
    const people = participants();
    // Needs attention first; people with nothing added yet go last.
    const order = m => !Object.keys(m.gear || {}).length ? 4 : { warn:0, changed:1, wait:2, ok:3 }[reviewState(m).key];
    const sorted = people.slice().sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    let html = `<h2 class="trip-h2" tabindex="-1">Gear check.</h2>
      <p class="subtext">The site checks each list against our estimate. You make the call.</p>`;
    if(!people.length) return html + `<p class="exp-empty">No participants yet. Share the participant code from Home.</p>`;
    html += sorted.map(m => {
      const check = gearCheck(m);
      const state = reviewState(m);
      const added = Object.keys(m.gear || {}).length;
      const isOpen = s.open === m.id;
      const summary = !added ? 'No gear added yet' : check ? `Site check: ${check.met} of ${check.total} meet the need` : `${added} items`;
      let body = '';
      if(isOpen){
        body = `<div class="member-detail">
          ${check ? checkListHtml(check) : ''}
          ${m.gearUpdatedAt ? `<p class="fine-print">Last changed ${esc(stamp(m.gearUpdatedAt))}.</p>` : ''}
          ${m.review ? `<p class="fine-print">Last check: ${esc(m.review.status === 'verified' ? 'verified' : 'changes requested')} by ${esc(m.review.byName)}, ${esc(stamp(m.review.at))}${m.review.note ? `: “${esc(m.review.note)}”` : ''}</p>` : ''}
          <label class="plan-label" for="note-${m.id}">Note to ${esc(m.name)} <span class="optional">(optional)</span></label>
          <textarea id="note-${m.id}" class="trip-textarea" maxlength="500" placeholder="Bring a warmer bag, or borrow one."></textarea>
          <div class="button-row">
            <button class="btn small" onclick="MyTrip.review('${m.id}','verified')">Mark verified</button>
            <button class="btn secondary small" onclick="MyTrip.review('${m.id}','changes')">Ask for changes</button>
          </div></div>`;
      }
      return `<div class="member-card${isOpen ? ' open' : ''}">
        <button class="member-head" aria-expanded="${isOpen}" onclick="MyTrip.toggle('${m.id}')">
          <span class="avatar" aria-hidden="true">${esc(initials(m.name))}</span>
          <span class="person-body"><span class="person-name">${esc(m.name)}</span><span class="person-sub">${esc(summary)}</span></span>
          ${chip(state)}
        </button>${body}</div>`;
    }).join('');
    return html;
  }

  // ---------- Crew ----------
  function crewHtml(){
    const me = s.me;
    const person = m => `<div class="person">
      <span class="avatar${isStaff(m) ? ' staff' : ''}" aria-hidden="true">${esc(initials(m.name))}</span>
      <div class="person-body"><div class="person-name">${esc(m.name)}${m.id === me.id ? ' <span class="you">(you)</span>' : ''}</div>
      <div class="person-sub">${esc([isStaff(m) ? ROLE_LABEL[m.role] : '', m.about].filter(Boolean).join(' · '))}</div></div></div>`;
    let html = `<h2 class="trip-h2" tabindex="-1">Your crew.</h2>`;
    if(s.editing) html += profileFormHtml();
    else html += `<p class="subtext"><span class="text-link" onclick="MyTrip.editProfile()">Edit my profile</span></p>`;
    html += `<div class="section-label">Staff</div>` + (staffMembers().map(person).join('') || `<p class="fine-print">No staff yet.</p>`);
    html += `<div class="section-label">Participants · ${participants().length}</div>` + (participants().map(person).join('') || `<p class="fine-print">No participants yet.</p>`);
    html += `<p class="fine-print" style="margin-top:18px;">Everyone with your trip's code sees this list.</p>`;
    return html;
  }
  function profileFormHtml(){
    const me = s.me;
    const staff = isStaff(me);
    return `<div class="edit-card">
      <label class="plan-label" for="editName">Name</label>
      <input id="editName" class="search-box" maxlength="40" value="${esc(me.name)}">
      <label class="plan-label" for="editAbout">About you <span class="optional">(optional)</span></label>
      <input id="editAbout" class="search-box" maxlength="80" value="${esc(me.about || '')}">
      ${staff ? `<label class="plan-label" for="editRole">Role</label>
      <select id="editRole" class="owned-select full">${['vf', 'guide'].map(r => `<option value="${r}"${me.role === r ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>` : ''}
      ${s.error ? `<p class="form-error" role="alert">${esc(s.error)}</p>` : ''}
      <div class="button-row"><button class="btn small" onclick="MyTrip.saveProfile()">Save</button>
      <button class="btn secondary small" onclick="MyTrip.cancelEdit()">Cancel</button></div></div>`;
  }

  // ---------- Messages ----------
  function messageHtml(m){
    const staff = m.authorRole && m.authorRole !== 'participant';
    return `<div class="msg">
      <span class="avatar small${staff ? ' staff' : ''}" aria-hidden="true">${esc(initials(m.authorName))}</span>
      <div class="msg-body"><div class="msg-head"><strong>${esc(m.authorName)}</strong>${staff ? ` <span class="chip wait">${esc(ROLE_LABEL[m.authorRole])}</span>` : ''} <span class="msg-time">${esc(stamp(m.at))}</span></div>
      <div class="msg-text">${esc(m.text)}</div></div></div>`;
  }
  function composerHtml(id, placeholder, action){
    return `<div class="composer">
      <label class="sr-only" for="${id}">Message</label>
      <textarea id="${id}" class="trip-textarea" maxlength="2000" placeholder="${esc(placeholder)}"></textarea>
      <button class="btn small" onclick="${action}">Send</button></div>`;
  }
  function messagesHtml(staff){
    const tabs = [['board', 'Trip board'], ['private', staff ? 'Private' : 'Ask staff']];
    let html = `<h2 class="trip-h2" tabindex="-1">Messages.</h2>
      <div class="segmented msg-tabs" role="group" aria-label="Message type">` +
      tabs.map(([key, label]) => `<button class="seg-btn${s.msgTab === key ? ' selected' : ''}" aria-pressed="${s.msgTab === key}" onclick="MyTrip.msgTab('${key}')">${label}</button>`).join('') + `</div>`;
    if(s.msgTab === 'board'){
      const board = s.messages.filter(m => !m.thread);
      html += `<p class="fine-print">Everyone on the trip sees these.</p>`;
      html += board.length ? board.map(messageHtml).join('') : `<p class="exp-empty">No posts yet.</p>`;
      return html + composerHtml('boardText', 'Write to the whole trip…', "MyTrip.post('board')");
    }
    if(!staff){
      const thread = s.messages.filter(m => m.thread === s.me.id);
      html += `<p class="fine-print">Only you and your trip's staff see these.</p>`;
      html += thread.length ? thread.map(messageHtml).join('') : `<p class="exp-empty">Questions about gear, health, or anything else? Ask here.</p>`;
      return html + composerHtml('privateText', 'Ask your Venture Fellows and guides…', "MyTrip.post('private')");
    }
    // Staff: pick a participant's thread.
    if(s.thread){
      const who = s.members.find(m => m.id === s.thread);
      const thread = s.messages.filter(m => m.thread === s.thread);
      html += `<span class="back-link" onclick="MyTrip.openThread(null)">← All private messages</span>
        <p class="fine-print">Private with ${esc(who ? who.name : 'a participant')}. All staff on this trip see it.</p>`;
      html += thread.length ? thread.map(messageHtml).join('') : `<p class="exp-empty">No messages yet.</p>`;
      return html + composerHtml('privateText', `Write to ${who ? who.name : 'them'}…`, "MyTrip.post('private')");
    }
    const people = participants().map(m => ({ m, last:lastThreadMessage(m.id) }))
      .sort((a, b) => (b.last ? b.last.at : '').localeCompare(a.last ? a.last.at : ''));
    html += `<p class="fine-print">One private conversation per participant. All staff on this trip see them.</p>`;
    html += people.map(({ m, last }) => personLine(m,
      last ? (last.authorRole === 'participant' ? `<span class="chip warn">Needs reply</span>` : `<span class="chip wait">${esc(stamp(last.at))}</span>`) : `<span class="chip wait">Start</span>`,
      `MyTrip.openThread('${m.id}')`)).join('');
    return html;
  }

  // ---------- 1-1 ----------
  function oneOnOneHtml(){
    const me = s.me;
    const staff = staffMembers().filter(m => m.role === 'vf');
    let html = `<h2 class="trip-h2" tabindex="-1">Your 1-1.</h2>
      <p class="subtext">A short call with a Venture Fellow before the trip.</p>`;
    if(me.oneOnOne){
      html += `<div class="review-card ok"><div class="review-head"><strong>Booked</strong><span class="chip ok">✓</span></div>
        <p class="review-note">With ${esc(me.oneOnOne.withName)}, ${esc(stamp(me.oneOnOne.when))}.</p>
        <span class="text-link" onclick="MyTrip.clearBooking()">Change or cancel</span></div>`;
      return html;
    }
    html += `<div class="section-label">1. Pick a time</div>`;
    html += staff.length ? staff.map(m => {
      const url = m.bookingUrl && m.bookingUrl !== 'demo' ? safeUrl(m.bookingUrl) : null;
      const button = m.bookingUrl === 'demo'
        ? `<button class="btn secondary small" onclick="MyTrip.demoBooking('${m.id}')">Book with ${esc(m.name.split(' ')[0])}</button>`
        : url ? `<a class="btn secondary small link-btn" href="${esc(url)}" target="_blank" rel="noopener">Book with ${esc(m.name.split(' ')[0])} ↗</a>`
        : `<span class="fine-print">No booking link yet. Message them.</span>`;
      return `<div class="person"><span class="avatar staff" aria-hidden="true">${esc(initials(m.name))}</span>
        <div class="person-body"><div class="person-name">${esc(m.name)}</div><div class="person-sub">${esc(m.about || 'Venture Fellow')}</div></div>${button}</div>`;
    }).join('') : `<p class="fine-print">No Venture Fellows have joined yet.</p>`;
    html += `<div class="section-label">2. Tell your staff when</div>
      <div class="edit-card">
        <label class="plan-label" for="bookWith">With</label>
        <select id="bookWith" class="owned-select full">${staff.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
        <label class="plan-label" for="bookWhen">Date and time</label>
        <input id="bookWhen" class="search-box" type="datetime-local">
        ${s.error ? `<p class="form-error" role="alert">${esc(s.error)}</p>` : ''}
        <button class="btn small" onclick="MyTrip.saveBooking()">Save</button>
      </div>`;
    return html;
  }
  function staffOneOnOneHtml(){
    const me = s.me;
    const people = participants();
    const mine = people.filter(m => m.oneOnOne && m.oneOnOne.withId === me.id).sort((a, b) => a.oneOnOne.when.localeCompare(b.oneOnOne.when));
    const others = people.filter(m => m.oneOnOne && m.oneOnOne.withId !== me.id);
    const notYet = people.filter(m => !m.oneOnOne);
    let html = `<h2 class="trip-h2" tabindex="-1">1-1s.</h2>
      <div class="edit-card">
        <label class="plan-label" for="myBooking">Your booking link</label>
        <input id="myBooking" class="search-box" type="url" maxlength="300" placeholder="https://calendly.com/your-name" value="${esc(me.bookingUrl && me.bookingUrl !== 'demo' ? me.bookingUrl : '')}">
        ${me.bookingUrl === 'demo' ? `<p class="fine-print">Demo: a sample link is set. Paste a real one to replace it.</p>` : ''}
        ${s.error ? `<p class="form-error" role="alert">${esc(s.error)}</p>` : ''}
        <button class="btn small" onclick="MyTrip.saveBookingLink()">Save link</button>
      </div>`;
    const row = m => personLine(m, `<span class="chip ok">${esc(stamp(m.oneOnOne.when))}</span>`, `MyTrip.openThread('${m.id}')`);
    html += `<div class="section-label">With you · ${mine.length}</div>` + (mine.map(row).join('') || `<p class="fine-print">None yet.</p>`);
    if(others.length) html += `<div class="section-label">With other staff · ${others.length}</div>` + others.map(m => personLine(m, `<span class="chip wait">${esc(m.oneOnOne.withName.split(' ')[0])} · ${esc(stamp(m.oneOnOne.when))}</span>`, `MyTrip.openThread('${m.id}')`)).join('');
    html += `<div class="section-label">Not booked · ${notYet.length}</div>` + (notYet.length ? notYet.map(m => personLine(m, `<span class="chip warn">Not yet</span>`, `MyTrip.openThread('${m.id}')`)).join('') : `<p class="fine-print">Everyone's booked.</p>`);
    return html;
  }

  // ---------- Manage trips (super admins) ----------
  // Admins add trips and change codes. The database checks every change (see admin_* in setup.sql).
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // no 0/O, 1/I/L
  function randomPart(){
    for(;;){
      const nums = new Uint32Array(4);
      crypto.getRandomValues(nums);
      const part = Array.from(nums, n => CODE_CHARS[n % CODE_CHARS.length]).join('');
      if(/[0-9]/.test(part)) return part;
    }
  }
  const CUSTOM = '__custom';  // "Not on the list" in the expedition picker
  const isCustom = t => String(t.expeditionId || '').startsWith('custom-');
  // A readable word for the code, e.g. 'ATACAMA' or 'PATAGONIA'. Typed-in trips use their name's first word.
  function codeWord(expeditionId, name){
    const id = String(expeditionId || '');
    const photo = PHOTOS.find(p => id.includes(p.match));
    const word = photo ? photo.match
      : id && id !== CUSTOM && !id.startsWith('custom-') ? id.split('-').filter(Boolean).pop()
      : String(name || '').split(/\s+/).find(w => /[a-z0-9]{3,}/i.test(w));
    return String(word || 'TRIP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'TRIP';
  }
  const newCode = (d, staff) => `${codeWord(d.expeditionId, d.name)}${staff ? '-STAFF' : ''}-${randomPart()}`;
  const goodCode = c => c.length >= 8 && /[0-9]/.test(c);

  function adminExpedition(t){
    const live = (expeditionList || []).find(e => e.id === t.expeditionId);
    return live || Object.assign({ id:t.expeditionId, name:t.expeditionId }, t.fallback);
  }
  function dayText(iso){
    if(!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  }
  function tripDates(t){
    return t.starts ? dayText(t.starts) + (t.ends ? ' – ' + dayText(t.ends) : '') : 'No dates yet';
  }
  async function loadAdmin(){
    [s.adminTrips, s.admins] = await Promise.all([TripData.adminTrips(), TripData.adminList()]);
    s.step = 'admin';
  }
  async function openAdmin(){
    if(!s.admin) return;
    s.error = ''; s.notice = '';
    await loadAdmin();
    render();
    window.scrollTo({ top:0 });
    focusHeading(document.getElementById('screen-trip'));
  }
  async function leaveAdmin(){
    s.adminEdit = null; s.adminDraft = null; s.error = ''; s.notice = '';
    await resume();  // picks up any change to your own trip's codes
    render();
    window.scrollTo({ top:0 });
  }
  function joinWithCode(){
    s.step = 'code'; s.error = ''; s.notice = '';
    render();
    focusHeading(document.getElementById('screen-trip'));
  }

  function adminHtml(){
    const today = todayIso();
    const ended = t => t.ends && t.ends < today;
    const current = s.adminTrips.filter(t => !ended(t));
    const past = s.adminTrips.filter(ended);
    const formOpen = !!s.adminEdit;
    return `<div class="trip-shell">
      <nav class="admin-bar">
        <span class="trip-nav-link" onclick="goToHero()">← Handbook</span>
        <span class="trip-nav-right">
          ${s.me ? `<button class="trip-signout" onclick="MyTrip.leaveAdmin()">My expedition</button>`
            : `<button class="trip-signout" onclick="MyTrip.joinWithCode()">Join a trip</button>`}
          <button class="trip-signout" onclick="MyTrip.signOut()">Sign out</button>
        </span>
      </nav>
      <main class="trip-inner">
        <div class="eyebrow">Super admin</div>
        <h1 class="trip-h2">Manage trips.</h1>
        <p class="subtext">Add trips and change their codes. You see codes and head counts, not people, gear, or messages.</p>
        ${s.notice ? `<div class="trip-notice" role="status">${s.notice}</div>` : ''}
        ${s.error && !formOpen ? `<p class="form-error" role="alert">${esc(s.error)}</p>` : ''}
        ${s.adminEdit === 'new' ? tripFormHtml(null)
          : `<button class="btn" onclick="MyTrip.adminEdit('new')"${formOpen ? ' disabled' : ''}>Add a trip</button>`}
        <div class="section-label">Trips · ${current.length}</div>
        ${current.map(adminTripHtml).join('') || `<p class="fine-print">No trips yet.</p>`}
        ${past.length ? `<div class="section-label">Ended · ${past.length}</div>` + past.map(adminTripHtml).join('') : ''}
        ${adminsHtml()}
        ${s.user ? `<p class="fine-print trip-device">Signed in as ${esc(s.user.email)}.</p>` : ''}
      </main></div>`;
  }
  // Who else is a super admin, and the box to add one.
  function adminsHtml(){
    const day = iso => new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    return `<div class="section-label" id="admins">Admins · ${s.admins.length}</div>
      ${s.admins.map(a => `<div class="person">
        <span class="avatar staff" aria-hidden="true">${esc(initials(a.email))}</span>
        <div class="person-body"><div class="person-name admin-email">${esc(a.email)}${a.you ? ' <span class="you">(you)</span>' : ''}</div>
          <div class="person-sub">${a.addedBy ? `Added by ${esc(a.addedBy)}, ` : 'Added '}${esc(day(a.addedAt))}</div></div>
        ${a.you ? '' : `<button class="btn secondary small" onclick="MyTrip.adminRemove('${esc(a.userId)}')">Remove</button>`}
      </div>`).join('')}
      <form class="edit-card admin-add" onsubmit="event.preventDefault(); MyTrip.adminAdd();" novalidate>
        <label class="plan-label" for="admEmail">Add an admin</label>
        <div class="code-field">
          <input id="admEmail" class="search-box" type="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="their account email">
          <button class="btn small" type="submit">Add</button>
        </div>
        ${s.adminError ? `<p class="form-error" role="alert">${esc(s.adminError)}</p>` : ''}
        <p class="fine-print">They need an account first: they create an account under "Log into your expedition" with this email. Admins can add trips, change codes, and add or remove admins.</p>
      </form>`;
  }
  function adminTripHtml(t){
    const exp = adminExpedition(t);
    const counts = `${t.participants} participant${t.participants === 1 ? '' : 's'} · ${t.staff} staff`;
    const head = `<div class="admin-trip-head">
        <div><div class="person-name">${esc(exp.name)}</div>
        <div class="person-sub">${esc(tripDates(t))} · ${esc(counts)}</div></div></div>`;
    if(s.adminEdit === t.id) return `<div class="edit-card admin-trip open">${head}${tripFormHtml(t)}</div>`;
    return `<div class="edit-card admin-trip">${head}
      <div class="admin-codes">
        <div><div class="code-label">Participant code</div><div class="code-value">${esc(t.code)}</div></div>
        <div><div class="code-label">Staff code</div><div class="code-value">${esc(t.staffCode)}</div></div>
      </div>
      <div class="button-row">
        <button class="btn secondary small" onclick="MyTrip.adminEdit('${esc(t.id)}')"${s.adminEdit ? ' disabled' : ''}>Change codes or dates</button>
        <button class="btn secondary small" onclick="MyTrip.copy('${esc(inviteLink(t.code))}', 'Invite link copied.')">Copy invite link</button>
      </div></div>`;
  }
  // The add form (t = null) or the edit form for trip t.
  function tripFormHtml(t){
    const d = s.adminDraft || {};
    const isNew = !t;
    const exps = (expeditionList || []).slice().sort((a, b) => (a.program || '').localeCompare(b.program || '') || a.name.localeCompare(b.name));
    const program = e => e.program === 'mba' ? 'MBA' : e.program === 'undergrad' ? 'Undergrad' : '';
    const custom = isNew ? d.expeditionId === CUSTOM : isCustom(t);
    const codeField = (id, label, value, staff) => `
      <label class="plan-label" for="${id}">${label}</label>
      <div class="code-field">
        <input id="${id}" class="search-box code-input" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(value || '')}">
        <button class="btn secondary small" type="button" onclick="MyTrip.adminNewCode(${staff})">New</button>
      </div>`;
    return `<form class="${isNew ? 'edit-card ' : ''}admin-form" onsubmit="event.preventDefault(); MyTrip.adminSave();" oninput="MyTrip.readDraft(event)" novalidate>
      ${isNew ? `<div class="person-name">New trip</div>
        <label class="plan-label" for="admExp">Expedition</label>
        <select id="admExp" class="owned-select full" onchange="MyTrip.adminPickExpedition()">
          <option value="">Pick one…</option>
          ${exps.map(e => `<option value="${esc(e.id)}"${d.expeditionId === e.id ? ' selected' : ''}>${esc(e.name)}${program(e) ? ' · ' + program(e) : ''}${e.when ? ' · ' + esc(e.when) : ''}</option>`).join('')}
          <option value="${CUSTOM}"${custom ? ' selected' : ''}>Not on the list: type it in</option>
        </select>
        ${!expeditionList ? `<p class="fine-print">${expeditionLoadFailed ? "Couldn't load the expedition list. You can still type a trip in." : 'Loading the expedition list…'}</p>` : ''}` : ''}
      ${custom ? `
        <label class="plan-label" for="admName">Trip name</label>
        <input id="admName" class="search-box" maxlength="120" placeholder="Spring Break: Grand Canyon" value="${esc(d.name || '')}" onchange="MyTrip.adminNameChanged()">
        <label class="plan-label" for="admLocation">Location <span class="optional">(optional)</span></label>
        <input id="admLocation" class="search-box" maxlength="120" placeholder="Arizona, USA" value="${esc(d.location || '')}">` : ''}
      <div class="admin-dates">
        <div><label class="plan-label" for="admStarts">First day</label>
          <input id="admStarts" class="search-box" type="date" value="${esc(d.starts || '')}"></div>
        <div><label class="plan-label" for="admEnds">Last day <span class="optional">(optional)</span></label>
          <input id="admEnds" class="search-box" type="date" value="${esc(d.ends || '')}"></div>
      </div>
      ${codeField('admCode', 'Participant code', d.code, false)}
      ${codeField('admStaffCode', 'Staff code <span class="optional">(Venture Fellows and guides)</span>', d.staffCode, true)}
      <p class="fine-print">At least 8 characters, including a number. “New” makes a hard-to-guess one.${isNew ? '' : ' People already on the trip stay on it. The old codes stop working.'}${custom && isNew ? ' Trips you type in have no gear estimate, so My gear won’t check against one.' : ''}</p>
      ${s.error ? `<p class="form-error" role="alert">${esc(s.error)}</p>` : ''}
      <div class="button-row">
        <button class="btn small" type="submit"${s.busy ? ' disabled' : ''}>${s.busy ? 'Saving…' : isNew ? 'Add trip' : 'Save'}</button>
        <button class="btn secondary small" type="button" onclick="MyTrip.adminCancel()">Cancel</button>
      </div></form>`;
  }
  // Keep what's typed in the form, so re-drawing it doesn't lose anything.
  function readDraft(ev){
    const d = s.adminDraft || (s.adminDraft = {});
    const read = (id, key) => { const el = document.getElementById(id); if(el) d[key] = el.value.trim(); };
    read('admExp', 'expeditionId'); read('admStarts', 'starts'); read('admEnds', 'ends');
    read('admCode', 'code'); read('admStaffCode', 'staffCode'); read('admName', 'name'); read('admLocation', 'location');
    // Once someone types their own code, stop replacing it automatically.
    if(ev && ev.target && (ev.target.id === 'admCode' || ev.target.id === 'admStaffCode')) d.autoCodes = false;
    return d;
  }
  function adminEdit(id){
    s.error = ''; s.notice = '';
    s.adminEdit = id;
    if(id === 'new') s.adminDraft = { expeditionId:'', starts:'', ends:'', code:'', staffCode:'', name:'', location:'' };
    else {
      const t = s.adminTrips.find(x => x.id === id);
      if(!t){ s.adminEdit = null; render(); return; }
      const fb = t.fallback || {};
      s.adminDraft = { expeditionId:t.expeditionId, starts:t.starts || '', ends:t.ends || '', code:t.code, staffCode:t.staffCode,
        name:fb.name || '', location:fb.location || '' };
    }
    render();
    const first = document.getElementById(id === 'new' ? 'admExp' : 'admCode');
    if(first) first.focus();
  }
  function adminCancel(){
    s.adminEdit = null; s.adminDraft = null; s.error = '';
    render();
  }
  function adminPickExpedition(){
    const d = readDraft();
    const exp = (expeditionList || []).find(e => e.id === d.expeditionId);
    if(exp || d.expeditionId === CUSTOM){
      d.code = newCode(d, false);
      d.staffCode = newCode(d, true);
      d.autoCodes = true;
      if(exp && exp.endsBy) d.ends = exp.endsBy;
    }
    render();
    const el = document.getElementById(d.expeditionId === CUSTOM ? 'admName' : 'admStarts');
    if(el && d.expeditionId) el.focus();
  }
  // A typed-in trip got its name: make the codes match it, unless they were typed by hand.
  function adminNameChanged(){
    const d = readDraft();
    if(s.adminEdit !== 'new' || !d.autoCodes) return;
    d.code = newCode(d, false);
    d.staffCode = newCode(d, true);
    const a = document.getElementById('admCode'), b = document.getElementById('admStaffCode');
    if(a) a.value = d.code;
    if(b) b.value = d.staffCode;
  }
  function adminNewCode(staff){
    const d = readDraft();
    if(staff) d.staffCode = newCode(d, true);
    else d.code = newCode(d, false);
    render();
  }
  async function adminAdd(){
    const email = val('admEmail');
    s.adminError = ''; s.notice = '';
    if(!/^\S+@\S+\.\S+$/.test(email)){ s.adminError = email ? 'Check the email address.' : 'Add their email.'; render(); return; }
    try{ s.admins = await TripData.adminAdd(email); }
    catch(e){ console.error(e); s.adminError = friendly(e); render(); return; }
    s.notice = `${esc(email)} is now an admin.`;
    render();
    window.scrollTo({ top:0 });
  }
  async function adminRemove(userId){
    const a = s.admins.find(x => x.userId === userId);
    if(!a || !confirm(`Remove ${a.email} as an admin? They keep their account and any trips they're on.`)) return;
    s.adminError = ''; s.notice = '';
    try{ s.admins = await TripData.adminRemove(userId); }
    catch(e){ console.error(e); s.adminError = friendly(e); render(); return; }
    s.notice = `${esc(a.email)} is no longer an admin.`;
    render();
    window.scrollTo({ top:0 });
  }
  async function adminSave(){
    if(s.busy) return;
    const d = readDraft();
    const isNew = s.adminEdit === 'new';
    const code = TripData.normal(d.code), staffCode = TripData.normal(d.staffCode);
    const exp = (expeditionList || []).find(e => e.id === d.expeditionId);
    const before = isNew ? null : s.adminTrips.find(t => t.id === s.adminEdit);
    const custom = isNew ? d.expeditionId === CUSTOM : !!before && isCustom(before);
    s.error = '';
    if(isNew && !exp && !custom) s.error = 'Pick an expedition, or choose “Not on the list”.';
    else if(custom && !d.name) s.error = 'Add the trip’s name.';
    else if(!d.starts) s.error = 'Add the first day.';
    else if(d.ends && d.ends < d.starts) s.error = 'The last day is before the first day.';
    else if(!code || !staffCode) s.error = 'Add both codes, or click New.';
    else if(!goodCode(code) || !goodCode(staffCode)) s.error = 'Codes need at least 8 characters, including a number, so they’re hard to guess.';
    else if(code === staffCode) s.error = 'The participant and staff codes must be different.';
    if(s.error){ render(); return; }
    // Typed-in trips show these on their page, with the dates written out from the two days.
    const typed = custom ? { name:d.name, location:d.location || '', when:tripDates(d) } : {};
    s.busy = true;
    render();
    try{
      if(isNew && custom){
        await TripData.adminAddTrip(Object.assign({ expeditionId:'', code, staffCode, starts:d.starts, ends:d.ends }, typed));
      } else if(isNew){
        await TripData.adminAddTrip({ expeditionId:exp.id, code, staffCode, starts:d.starts, ends:d.ends,
          name:exp.name, location:exp.location, when:exp.when });
      } else {
        await TripData.adminUpdateTrip(Object.assign({ id:s.adminEdit, code, staffCode, starts:d.starts, ends:d.ends }, typed));
      }
    } finally { s.busy = false; }
    const changed = before && (before.code !== code || before.staffCode !== staffCode);
    s.notice = isNew ? `Trip added. Send ${esc(code)} to participants and ${esc(staffCode)} to staff.`
      : changed ? 'Saved. The new codes work now, and the old ones don’t.' : 'Saved.';
    s.adminEdit = null; s.adminDraft = null;
    await loadAdmin();
    render();
    window.scrollTo({ top:0 });
  }

  // ---------- Actions ----------
  function authMode(mode){
    s.authMode = mode;
    s.error = ''; s.notice = '';
    render();
    const el = document.getElementById(mode === 'newpassword' ? 'authPassword' : 'authEmail');
    if(el) el.focus();
  }
  async function authSubmit(){
    if(s.busy) return;
    const mode = s.authMode;
    const email = val('authEmail');
    const pw = document.getElementById('authPassword');
    const password = pw ? pw.value : '';
    if(mode !== 'newpassword') s.email = email;
    s.error = ''; s.notice = '';
    if(mode !== 'newpassword' && !/^\S+@\S+\.\S+$/.test(email)) s.error = email ? 'Check the email address.' : 'Add your email.';
    else if(mode !== 'reset' && !password) s.error = 'Add your password.';
    else if((mode === 'signup' || mode === 'newpassword') && password.length < 8) s.error = 'Use at least 8 characters.';
    if(s.error){ render(); return; }
    s.busy = true;
    render();
    try{
      if(mode === 'signin') await TripData.signIn(email, password);
      else if(mode === 'signup'){
        const result = await TripData.signUp(email, password);
        if(result.confirm){
          s.busy = false; s.authMode = 'signin';
          s.notice = 'Check your email to confirm, then sign in here.';
          render();
          return;
        }
      }
      else if(mode === 'reset'){
        await TripData.sendReset(email);
        s.busy = false; s.authMode = 'signin';
        s.notice = 'If that email has an account, a link is on its way. It can take a few minutes.';
        render();
        return;
      }
      else await TripData.setPassword(password);
      s.busy = false; s.authMode = 'signin';
      if(mode === 'newpassword') s.notice = 'Password saved.';
      await resume();
      render();
      focusHeading(document.getElementById('screen-trip'));
      if(s.step === 'code' && s.pendingCode) await join();
    }catch(e){
      console.error(e);
      s.busy = false;
      s.error = friendly(e);
      render();
    }
  }
  async function join(){
    const code = val('tripCode');
    s.pendingCode = code;
    let found = null;
    try{ found = await TripData.findCode(code); }
    catch(e){ console.error(e); s.error = friendly(e); render(); return; }
    if(!found){
      s.error = code ? "That code didn't work. Check the message from your Venture Fellows." : 'Enter your trip code.';
      render();
      const input = document.getElementById('tripCode');
      if(input) input.focus();
      return;
    }
    s.error = '';
    s.trip = found.trip; s.role = found.role; s.code = TripData.normal(code);
    s.step = 'profile';
    render();
    focusHeading(document.getElementById('screen-trip'));
  }
  async function createProfile(){
    const name = val('tripName');
    if(!name){ s.error = 'Add your name.'; render(); return; }
    const staff = s.role === 'staff';
    const booking = staff ? val('tripBooking') : '';
    if(booking && !safeUrl(booking)){ s.error = 'The booking link should start with https://'; render(); return; }
    const member = { name, about:val('tripAbout'), joinedAt:new Date().toISOString(),
      role:staff ? (val('tripRole') || 'vf') : 'participant' };
    if(staff) member.bookingUrl = booking;
    else { member.gear = snapshot(); member.gearUpdatedAt = new Date().toISOString(); }
    if(s.busy) return;
    s.busy = true;
    let memberId = null;
    try{ memberId = await TripData.joinTrip(s.code, member); }
    finally{ s.busy = false; }
    if(!memberId){ s.error = "That code didn't work. Go back and check it."; render(); return; }
    writeSession({ code:s.code, memberId });
    await resume();
    s.view = 'home'; s.error = '';
    render();
    window.scrollTo({ top:0 });
    focusHeading(document.getElementById('screen-trip'));
  }
  function startOver(){
    s.step = 'code'; s.trip = null; s.role = null; s.code = null; s.error = '';
    render();
  }
  async function signOut(){
    const message = TripData.isDemo
      ? 'Sign out? You can come back as anyone in the demo.'
      : 'Sign out on this device?';
    if(!confirm(message)) return;
    if(TripData.needsAuth){ try{ await TripData.signOut(); }catch(e){ console.error(e); } }
    writeSession(null);
    s = freshState();
    if(TripData.needsAuth){ s.step = 'signin'; s.checked = true; }
    refreshLinks();
    buildTabs();
    render();
    window.scrollTo({ top:0 });
  }
  async function demoAs(memberId){
    const person = DEMO_PEOPLE.find(p => p.id === memberId);
    if(!person) return;
    writeSession({ code:person.code, memberId });
    s = freshState();
    refreshLinks();
    buildTabs();
    await open('home');
    window.scrollTo({ top:0 });
  }
  function resetDemo(){
    if(!confirm('Reset the demo? This brings back the sample people and removes anything you added.')) return;
    TripData.reset();
    writeSession(null);
    s = freshState();
    refreshLinks();
    buildTabs();
    render();
    window.scrollTo({ top:0 });
  }
  function editProfile(){ s.editing = true; s.error = ''; render(); const el = document.getElementById('editName'); if(el) el.focus(); }
  function cancelEdit(){ s.editing = false; s.error = ''; render(); }
  async function saveProfile(){
    const name = val('editName');
    if(!name){ s.error = 'Add your name.'; render(); return; }
    s.me.name = name;
    s.me.about = val('editAbout');
    if(isStaff(s.me)) s.me.role = val('editRole') || s.me.role;
    await TripData.saveMember(s.trip.id, s.me);
    await refresh();
    s.editing = false; s.error = '';
    render();
  }
  function toggle(memberId){
    s.open = s.open === memberId ? null : memberId;
    render();
  }
  function openMember(memberId){
    s.open = memberId;
    go('gear');
  }
  async function review(memberId, status){
    const member = s.members.find(m => m.id === memberId);
    if(!member) return;
    const note = val('note-' + memberId);
    if(status === 'changes' && !note){
      s.notice = 'Add a note so they know what to change.';
      render();
      const el = document.getElementById('note-' + memberId);
      if(el) el.focus();
      return;
    }
    const check = gearCheck(member);
    if(status === 'verified' && check && check.met < check.total &&
      !confirm(`The site's check found ${check.total - check.met} item${check.total - check.met === 1 ? '' : 's'} that may not meet the need. Verify anyway?`)) return;
    member.review = { status, note, byId:s.me.id, byName:s.me.name, at:new Date().toISOString(), gearSig:TripData.gearSig(member.gear) };
    await TripData.saveMember(s.trip.id, member);
    await refresh();
    s.open = null;
    s.notice = status === 'verified' ? `${esc(member.name)}'s gear is verified.` : `Changes requested from ${esc(member.name)}.`;
    render();
  }
  function msgTab(tab){
    s.msgTab = tab;
    if(tab === 'board') s.thread = null;
    render();
  }
  function openThread(memberId){
    s.msgTab = 'private';
    s.thread = memberId;
    go('messages');
  }
  async function post(kind){
    const id = kind === 'board' ? 'boardText' : 'privateText';
    const text = val(id);
    if(!text) return;
    const thread = kind === 'board' ? null : (isStaff(s.me) ? s.thread : s.me.id);
    await TripData.postMessage(s.trip.id, { id:TripData.newId('x'), at:new Date().toISOString(),
      authorId:s.me.id, authorName:s.me.name, authorRole:s.me.role, text, thread });
    await refresh();
    render();
  }
  function demoBooking(memberId){
    const who = s.members.find(m => m.id === memberId);
    const name = who ? who.name : 'their';
    s.notice = `In the real site, this opens ${esc(name)}'s Calendly or Google booking page. Then come back and add the time below.`;
    render();
    window.scrollTo({ top:0 });
  }
  async function saveBooking(){
    const withId = val('bookWith');
    const when = val('bookWhen');
    const who = s.members.find(m => m.id === withId);
    if(!who || !when){ s.error = 'Pick who and when.'; render(); return; }
    s.me.oneOnOne = { withId, withName:who.name, when };
    s.error = '';
    await TripData.saveMember(s.trip.id, s.me);
    await refresh();
    render();
  }
  async function clearBooking(){
    if(!confirm('Clear your 1-1 time? If you booked through a calendar link, cancel it there too.')) return;
    delete s.me.oneOnOne;
    await TripData.saveMember(s.trip.id, s.me);
    await refresh();
    render();
  }
  async function saveBookingLink(){
    const link = val('myBooking');
    if(link && !safeUrl(link)){ s.error = 'The link should start with https://'; render(); return; }
    s.me.bookingUrl = link;
    s.error = '';
    await TripData.saveMember(s.trip.id, s.me);
    await refresh();
    s.notice = link ? 'Booking link saved.' : 'Booking link removed.';
    render();
  }
  function copy(text, done){
    const finish = ok => { s.notice = ok ? esc(done) : `Copy this: ${esc(text)}`; render(); };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => finish(true), () => finish(false));
    else finish(false);
  }

  // ---------- Hooks from the rest of the site ----------
  // My gear changed: keep this person's trip copy in step.
  async function gearChanged(){
    if(!hasSession()) return;
    try{
      if(!s.checked) await resume();
      if(!s.me || s.me.role !== 'participant') return;
      s.me.gear = snapshot();
      s.me.gearUpdatedAt = new Date().toISOString();
      await TripData.saveMember(s.trip.id, s.me);
      await refresh();
    }catch(e){ console.error('Could not sync gear to the trip', e); }
  }
  // The expedition list finished loading.
  function dataReady(){
    if(document.getElementById('screen-trip').classList.contains('active')) render();
  }
  // Links into the trip area from the public site.
  function refreshLinks(){
    const joined = hasSession();
    const heroTab = document.getElementById('heroTripTab');
    if(heroTab) heroTab.textContent = joined ? 'My expedition' : 'Trip code';
    const back = document.getElementById('backToTrip');
    if(back) back.style.display = joined ? '' : 'none';
  }
  function tabHtml(){
    return hasSession() ? `<button class="cat-tab" data-section="trip" onclick="MyTrip.open()">My expedition</button>` : '';
  }
  // Links like …/#trip or …/#trip=PATAGONIA. The demo also has personal links: …/#trip=PATAGONIA&me=m-abc.
  async function fromLink(){
    const hash = location.hash || '';
    if(!hash.startsWith('#trip')) return false;
    const params = new URLSearchParams(hash.slice(1));
    const code = params.get('trip');
    const me = params.get('me');
    history.replaceState(null, '', location.pathname + location.search);
    if(code && me && TripData.isDemo){
      const found = await TripData.findCode(code);
      const members = found ? await TripData.listMembers(found.trip.id) : [];
      if(found && members.some(m => m.id === me)){
        writeSession({ code:TripData.normal(code), memberId:me });
        s = freshState();
      }
    } else if(code && !hasSession()){
      s.pendingCode = code;
    }
    refreshLinks();
    buildTabs();
    await open();
    if(s.step === 'code' && s.pendingCode) await join();
    return true;
  }
  // Coming back from an emailed link (password reset, or email confirmation if that's turned on).
  async function fromAuthLink(){
    const hash = location.hash || '';
    if(!TripData.needsAuth || !/(access_token|error_description)=/.test(hash)) return false;
    const params = new URLSearchParams(hash.slice(1));
    try{ await TripData.user(); }catch(e){ console.error(e); }  // lets Supabase read the link
    history.replaceState(null, '', location.pathname + location.search);
    if(params.get('error_description')){
      s.step = 'signin'; s.checked = true; s.authMode = 'reset';
      s.error = 'That link expired or was already used. Send yourself a new one.';
    } else if(params.get('type') === 'recovery'){
      s.step = 'signin'; s.checked = true; s.authMode = 'newpassword';
    }
    await open();
    return true;
  }
  async function init(){
    refreshLinks();
    if(await fromAuthLink()) return;
    fromLink();
  }

  // Anything that talks to the server shows a plain message if it fails, instead of doing nothing.
  const guard = fn => async (...args) => {
    try{ return await fn(...args); }
    catch(e){
      console.error(e);
      s.busy = false;
      if(s.step === 'in'){ s.error = ''; s.notice = esc(friendly(e)); }
      else s.error = friendly(e);
      render();
    }
  };

  return { init, open, go, authMode, authSubmit, join:guard(join), createProfile:guard(createProfile), startOver, signOut,
    demoAs:guard(demoAs), resetDemo, editProfile, cancelEdit, saveProfile:guard(saveProfile),
    toggle, openMember, review:guard(review), msgTab, openThread, post:guard(post), demoBooking,
    saveBooking:guard(saveBooking), clearBooking:guard(clearBooking), saveBookingLink:guard(saveBookingLink),
    copy, gearChanged, dataReady, refreshLinks, tabHtml, hasSession,
    openAdmin:guard(openAdmin), leaveAdmin:guard(leaveAdmin), joinWithCode, adminEdit, adminCancel,
    adminPickExpedition, adminNameChanged, adminNewCode, adminSave:guard(adminSave), readDraft,
    adminAdd, adminRemove };
})();
