/* Data lives in deploy/data/*.json and is written by src/build/render.py.
   It used to be inlined here as ~350KB of `const DATA=[...]`, which meant every
   data refresh rewrote the application code — the reason twelve injector scripts
   existed and the reason the page broke four times. */
let DATA=[],MSTATS={},CRESTS={},NEXTM={},FLAGS={},NAT3={},LGTIER={},MANIFEST=[],NATIDMAP={};

async function boot(){
  const load=n=>fetch(`data/${n}.json`).then(r=>r.json());
  [DATA,MSTATS,CRESTS,NEXTM,FLAGS,NAT3,LGTIER,MANIFEST,NATIDMAP]=await Promise.all(
    ["data","mstats","crests","nextm","flags","nat3","lgtier","manifest","natids"].map(load));
  filters();render();aChips();drawAnalytics();drawScouting();initTabs();syncCounts();
}
boot();
const SHALLOW=["Portugal","Greece","Sweden","Austria","Denmark","Netherlands"];
// Every status needs a label. The two exclusion cases were missing, so the modal
// fell back to rendering the raw enum -- CAP_TIED_ELSEWHERE in capitals.
const SEL={ELIGIBLE_UNCALLED:{t:"Uncapped",sw:"var(--up)"},ELIGIBLE_YOUTH_ELSEWHERE:{t:"Youth caps elsewhere",sw:"var(--gold)"},IN_EGYPT_PIPELINE:{t:"Egypt youth setup",sw:"var(--red)"},CAP_TIED_ELSEWHERE:{t:"Cap-tied elsewhere",sw:"var(--muted)"},NEEDS_REVIEW:{t:"Needs confirming",sw:"var(--gold)"}};
let filter="ALL";

const ICON={
  apps:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16"/></svg>',
  ball:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7l2.9 2.1-1.1 3.4h-3.6L9.1 9.1 12 7zM12 3v4M3.5 9.5l3.6 1.2M20.5 9.5l-3.6 1.2M6.5 20l2.2-3M17.5 20l-2.2-3"/></svg>',
  boot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h6l3 4h6a3 3 0 0 1 3 3v2H4a1 1 0 0 1-1-1V7z"/><path d="M6 18v2M10 18v2M14 18v2M18 18v2"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  glove:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 21V11a2 2 0 0 1 4 0V4a1.5 1.5 0 0 1 3 0v6a1.5 1.5 0 0 1 3 0v11z"/></svg>',
  card:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="6" y="3" width="12" height="18" rx="1.5"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 20V4M4 20h16M7 16l4-5 3 3 5-7"/></svg>',
  combo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5"/></svg>',
  swap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>'
};

function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function val(v){return v&&/^\d+$/.test(v)?(+v>=1e6?"€"+(+v/1e6).toFixed(1)+"m":"€"+Math.round(+v/1e3)+"k"):"—";}
function dia(p){return p.egypt_position==="secondary";}
function initials(n){return n.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();}
function passChips(cit){
  return cit.split(" / ").map(c=>{
    c=c.trim();const eg=c==="Egypt";
    const fl=FLAGS[c]?`<img class="flag" src="${FLAGS[c]}" alt="" width="18" height="12">`:"";
    const lab=NAT3[c]||c.slice(0,3).toUpperCase();
    return `<span class="pp${eg?" eg":""}" title="${esc(c)}">${fl}${lab}</span>`;
  }).join("");
}

function posMeta(pos){const p=(pos||"").toLowerCase();
  if(p.includes("keeper"))return{abbr:"GK",role:"Goalkeeper",x:50,y:90};
  if(p.includes("centre-back")||p.includes("center-back"))return{abbr:"CB",role:"Centre-Back",x:50,y:74};
  if(p.includes("left-back"))return{abbr:"LB",role:"Left-Back",x:22,y:70};
  if(p.includes("right-back"))return{abbr:"RB",role:"Right-Back",x:78,y:70};
  if(p.includes("defensive mid"))return{abbr:"DM",role:"Defensive Mid",x:50,y:58};
  if(p.includes("central mid"))return{abbr:"CM",role:"Central Mid",x:50,y:48};
  if(p.includes("attacking mid"))return{abbr:"AM",role:"Attacking Mid",x:50,y:36};
  if(p.includes("left mid")||p.includes("left wing"))return{abbr:"LW",role:"Left Wing",x:20,y:32};
  if(p.includes("right mid")||p.includes("right wing"))return{abbr:"RW",role:"Right Wing",x:80,y:32};
  if(p.includes("midfield"))return{abbr:"MF",role:"Midfielder",x:50,y:50};
  if(p.includes("forward")||p.includes("striker"))return{abbr:"CF",role:"Centre-Forward",x:50,y:20};
  if(p.includes("back")||p.includes("defender"))return{abbr:"DF",role:"Defender",x:50,y:72};
  return{abbr:"—",role:pos||"—",x:50,y:50};}

/* ---- filters ---- */
const EU=new Set(["Germany","Belgium","England","Switzerland","Spain","France","Greece","Portugal","Turkey","Italy","Netherlands","Sweden","Austria","Denmark","Norway","Finland","Scotland","Ireland","Poland","Czech Republic","Slovakia","Cyprus","Romania","Bulgaria","Albania","Hungary"])
const GULF=new Set(["Qatar","United Arab Emirates","Saudi Arabia","Kuwait","Bahrain","Oman","Jordan","Iraq"]);;
// Resolve the region from where he plays; fall back to his non-Egyptian
// passport when the country crawled is not itself a region (e.g. a
// Dutch-Egyptian playing in Romania).
function homeCountry(p){
  return EU.has(p.country_crawled)||GULF.has(p.country_crawled)||p.country_crawled==="United States"
    ?p.country_crawled
    :(p.citizenship.split("/").map(s=>s.trim()).find(c=>c!=="Egypt")||p.country_crawled);
}
// "eu" | "gulf" | "other". Shares homeCountry() with keep() deliberately: when the
// card stripe and the region chips disagree the UI is lying, and duplicated
// classification logic is how they drift apart.
function regionOf(p){
  const rc=homeCountry(p);
  if(GULF.has(rc))return "gulf";
  if(EU.has(rc)||rc==="United States")return "eu";
  return "other";
}
let plQuery="";
// One matcher for all three tabs. Name, club and country: country is included
// because "who do we have in Qatar" is a question a scout actually asks and the
// region chips cannot answer, since Gulf spans eight countries.
//
// Shared rather than duplicated -- scouting and fixtures matched only name and
// club, so the same query returned different results per tab and their
// placeholders promised a country search that only the shortlist performed.
function hits(p,q){
  q=(q||"").trim().toLowerCase();
  if(!q)return true;
  return (p.name||"").toLowerCase().includes(q)
      || (p.club||"").toLowerCase().includes(q)
      || (p.citizenship||"").toLowerCase().includes(q)
      || (p.country_crawled||"").toLowerCase().includes(q)
      || (p.league||"").toLowerCase().includes(q);
}
function matchQuery(p){ return hits(p,plQuery); }
function keep(p){
  // A senior competitive cap for another country ends eligibility outright, so
  // these players are not part of the dossier's answer to "who can Egypt get".
  // Dropped everywhere except the national teams tab, which exists precisely to
  // show who is unavailable and why.
  if(!recruitable(p))return false;
  // Search lives inside keep() deliberately: the region chips count with
  // keep(), so a query and the chip counts stay consistent. Filtering the grid
  // separately would leave "Gulf 24" beside 3 visible cards.
  if(!matchQuery(p))return false;
  if(filter==="ALL")return true;
  // track is derived from the citizenship string when the registry is built, so
  // it can never disagree with the passports shown on the card.
  if(filter==="DUAL")return p.track==="dual";
  if(filter==="SINGLE")return p.track==="single";
  // USA folds into European: two players did not warrant their own chip, and
  // MLS/USL sit closer to the European game than to the Gulf.
  if(filter==="EU")return regionOf(p)==="eu";
  if(filter==="GULF")return regionOf(p)==="gulf";
  return true;
}
function filters(){
  const n=k=>DATA.filter(p=>{const s=filter;filter=k;const r=keep(p);filter=s;return r;}).length;
  // Two regions, not four. "Raised abroad" duplicated a badge already on every
  // card, and USA was two players — a chip that filtered 71 down to 2 while
  // sitting beside one that did nothing. The US pair now count as European,
  // which is where their football sits.
  // "Europe & Americas" rather than "European": the bucket holds two US-based
  // players, and a label that excluded them would be wrong about its own count.
  // The registry's defining split, so it leads the chip row. The dossier has no
  // equivalent: every player there is dual by definition.
  const f=[["ALL","All"],["DUAL","Dual nationality"],["SINGLE","Egyptian only"],
           ["EU","Europe & Americas"],["GULF","Gulf"]];
  document.getElementById("filters").innerHTML=f.map(x=>`<button class="chip" data-f="${x[0]}" aria-pressed="${x[0]===filter}">${x[1]} <span class="cnt">${n(x[0])}</span></button>`).join("");
  document.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{filter=b.dataset.f;filters();render();});
}

/* ---- grid ---- */
function cardHTML(p){
  const pm=posMeta(p.position);
  const photo=p.photo?`<img class="pc-photo" src="${p.photo}" alt="" loading="lazy">`:`<div class="pc-photo ph">${esc(initials(p.name))}</div>`;
  const pass=passChips(p.citizenship);
  const s=p.st||{a:"—",g:"—",as:"—"};
  // Birthplace line removed from the card. It shouted -- red, bold, uppercase --
  // for a fact that is not decision-relevant at a glance, and forcing uppercase
  // mangled the place names it displayed (RÜSSELSHEIM, FRANKFURT AM MAIN). The
  // full birthplace is still on the player modal, so nothing is lost.
  return `<article class="pcard${dia(p)?" dia":""}" data-id="${esc(p.tm_id)}" role="button" tabindex="0" aria-label="Open ${esc(p.name)}">
    <div class="pc-band">
      <div class="pc-num">${pm.abbr}</div>
      <div class="pc-top">${photo}<div class="pc-idcol">
        <div class="pc-name">${esc(p.name)}</div>
        <div class="pc-pos"><span class="badge">${pm.abbr}</span>${esc(pm.role)}</div>
      </div><div class="pc-age">${esc(p.age)}<small>yrs</small></div></div>
    </div>
    <div class="pc-in">
      <div class="pc-pass">${pass}${p.source==="manual"?`<span class="manual" title="${esc(p.note||"Added by hand, not found by the crawl")}">Added manually</span>`:""}</div>
      ${p.source==="manual"&&p.note?`<div class="mnote-in">${esc(p.note)}</div>`:""}
      <div class="pc-mini">
        <div class="pmc"><b>${s.a}</b><span>Apps</span></div>
        <div class="pmc g"><b>${s.g}</b><span>Goals</span></div>
        <div class="pmc"><b>${s.as}</b><span>Assists</span></div>
      </div>
      <div class="pc-foot"><div class="clubcol"><span class="club">${CRESTS[p.club_id]?`<img class="ccrest" src="${CRESTS[p.club_id]}" alt="">`:""}${esc(p.club)}</span><span class="clubmeta">${FLAGS[p.country_crawled]?`<img class="cflag" src="${FLAGS[p.country_crawled]}" alt="">`:""}${esc(p.league||"")}${LGTIER[p.league]?` · <b>T${LGTIER[p.league]}</b>`:""}</span></div><span class="val">${val(p.market_value_eur)}</span></div>
    </div>
  </article>`;
}
const SECTIONS=[
  {key:"Goalkeepers",icon:ICON.glove,abbrs:["GK"]},
  {key:"Defenders",icon:ICON.apps,abbrs:["CB","LB","RB","DF"]},
  {key:"Midfielders",icon:ICON.combo,abbrs:["DM","CM","AM","MF"]},
  {key:"Attackers",icon:ICON.ball,abbrs:["LW","RW","CF"]}
];
// section derives from the SAME abbreviation the card badge shows, so they always agree
function secOf(pos){const ab=posMeta(pos).abbr;const s=SECTIONS.find(z=>z.abbrs.includes(ab));return s?s.key:"Midfielders";}
function render(){
  const rows=DATA.filter(keep);
  const host=document.getElementById("grid");

  // Wire once, never re-render: rebuilding the input inside render() would drop
  // focus and the caret on every keystroke.
  const box=document.getElementById("plq");
  if(box&&!box._wired){box._wired=1;box.oninput=e=>{plQuery=e.target.value;render();filters();};}

  if(!rows.length){
    host.innerHTML=`<p class="mnote">No player matches “${esc(plQuery)}”.</p>`;
    return;
  }
  host.innerHTML=SECTIONS.map(sec=>{
    const inSec=rows.filter(p=>secOf(p.position)===sec.key);
    if(!inSec.length)return "";
    return `<div class="posSection">
      <div class="posHd"><span class="pi">${sec.icon}</span>${sec.key}<span class="pn">${inSec.length}</span></div>
      <div class="posGrid">${inSec.map(cardHTML).join("")}</div>
    </div>`;
  }).join("");
  host.querySelectorAll(".pcard").forEach(c=>{
    const open=()=>openModal(c.dataset.id);
    c.onclick=open;c.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}};
  });
}



/* ---- match stats blocks ---- */
function formBlock(p){
  const m=MSTATS[p.tm_id]; if(!m||!m.form||!m.form.length)return "";
  const rows=m.form.map(f=>{
    const ga=(f.g||f.a)?`${f.g?f.g+"G":""}${f.g&&f.a?" ":""}${f.a?f.a+"A":""}`:"—";
    const comp=f.cn||f.comp||"";
    const tag=f.natl?'<span class="natl">NAT</span>':"";
    return `<tr${f.natl?' class="isnat"':""}>
      <td class="dt">${esc(f.fd?f.fd.slice(5):f.d)}</td>
      <td class="opp">${f.opp?`<span class="vs">vs</span>${esc(f.opp)}`:"—"}${tag}
        <small title="${esc(comp)}">${esc(comp)}${f.md?` · MD${esc(f.md)}`:""}</small></td>
      <td class="c ha">${f.v==="home"?"H":f.v==="away"?"A":"—"}</td>
      <td><span class="rp ${f.r}">${f.r}<span class="sc">${esc(f.sc)}</span></span></td>
      <td class="mn">${f.min}'${f.s?'<i>ST</i>':'<i>sub</i>'}</td>
      <td class="r ga${(f.g||f.a)?"":" z"}">${esc(ga)}</td></tr>`;
  }).join("");
  const nat=m.form.filter(f=>f.natl).length;
  const note=nat?`<div class="mnote"><span class="natl">NAT</span> = national-team match (not club football)${nat===m.form.length?" — every recent game was for his country":""}.</div>`:"";
  return `<div class="ct">${ICON.clock} Recent form · last ${m.form.length} games</div>
    <div class="mwrap"><table class="mtbl">
      <thead><tr><th>Date</th><th>Opponent · competition</th><th class="c">H/A</th><th>Result</th><th>Mins</th><th class="r">G/A</th></tr></thead>
      <tbody>${rows}</tbody></table></div>${note}`;
}
// Every international appearance, newest first. Club form deliberately excludes
// these so they do not read as club selections, but they are the most direct
// evidence of which federation is developing a player -- so the sheet shows them
// in full, grouped by the side he played for.
// MON already exists further down as name->index for parsing; this is the
// reverse, index->name, for display.
const MONTHS=[,"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// National sides carry a TM verein id like any club, so their badge comes from
// the same crest map. Renders nothing when absent rather than a broken image.
function natBadge(id){
  return CRESTS[id]?`<img class="natflag" src="${CRESTS[id]}" alt="" loading="lazy">`:"";
}

// team name -> verein id, built once from every national game in the dossier,
// counting opponents as well as own sides.
//
// Taking the id from the player's own appearances was not enough. Three players
// are listed as Egypt U19/U20 on their profile but have no national game in the
// feed at all, so there was no id to read; and Adam Tolba's only national games
// are for Germany U18, so a lookup on his own record could never find Egypt U20.
// Someone else in the dossier has almost always played for -- or against -- the
// side in question, so a shared map fills the gap.
let NATIDS=null;
function natIdOf(team){
  if(!team)return null;
  if(!NATIDS){
    const seen=new Map();
    // Match data first: covers every opponent any player has faced.
    Object.values(MSTATS).forEach(m=>(m.natl||[]).forEach(x=>{
      if(x.team&&x.sid&&!seen.has(x.team))seen.set(x.team,String(x.sid));
      if(x.opp&&x.oid&&!seen.has(x.opp))seen.set(x.opp,String(x.oid));
    }));
    // Then the profile-derived map, which is authoritative for the 15 sides our
    // own players are listed with -- including four nobody has played against.
    Object.entries(NATIDMAP||{}).forEach(([k,v])=>seen.set(k,String(v)));
    NATIDS=seen;
  }
  return NATIDS.get(team)||null;
}
function natlBlock(p){
  const m=MSTATS[p.tm_id]; if(!m||!m.natl||!m.natl.length)return "";
  const by=new Map();
  m.natl.forEach(x=>{ if(!by.has(x.team||"—"))by.set(x.team||"—",[]); by.get(x.team||"—").push(x); });

  // Most-capped side first, so his principal team leads.
  const teams=[...by.entries()].sort((a,b)=>b[1].length-a[1].length);
  const blocks=teams.map(([team,gs])=>{
    const played=gs.filter(x=>x.part==="P").length;
    const goals=gs.reduce((s,x)=>s+(x.g||0),0), asts=gs.reduce((s,x)=>s+(x.a||0),0);
    const senior=team&&!/U-?\d\d/.test(team);
    const rows=gs.map(x=>{
      const ga=(x.g||x.a)?`${x.g?x.g+"G":""}${x.g&&x.a?" ":""}${x.a?x.a+"A":""}`:"—";
      // Full date. These records span several years -- Aboueita has caps from
      // 2024 to 2026 -- so "02-28" alone is ambiguous in a way club form is not.
      const d=(x.d||"").split("-");
      return `<tr>
        <td class="dt">${esc(d[2]||"")} ${esc(MONTHS[+d[1]]||"")} <span class="yr">${esc(d[0]||"")}</span></td>
        <td class="opp">${x.opp?`<span class="vs">vs</span>${natBadge(x.oid||natIdOf(x.opp))}${esc(x.opp)}`:"—"}
          <small title="${esc(x.cn||"")}">${esc(x.cn||"")}</small></td>
        <td class="mn">${x.part==="P"?(x.min?`<b>${x.min}'</b>`:`<span class="pw p">minutes pending</span>`)
          :x.part==="B"?`<span class="pw b">unused sub</span>`:`<span class="pw o">not in squad</span>`}</td>
        <td class="r ga${(x.g||x.a)?"":" z"}">${esc(ga)}</td></tr>`;
    }).join("");
    return `<div class="natgrp">
      <div class="natgh">${natBadge((gs[0]&&gs[0].sid)||natIdOf(team))}<b class="${senior?"sr":""}">${esc(team)}</b>
        <span>${gs.length} call-up${gs.length===1?"":"s"} · ${played} played${goals?` · ${goals}G`:""}${asts?` · ${asts}A`:""}</span></div>
      <div class="mwrap"><table class="mtbl">
        <thead><tr><th>Date</th><th>Opponent · competition</th><th>Mins</th><th class="r">G/A</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
  }).join("");

  // A senior cap is the one thing that ends eligibility, so say so here rather
  // than leaving the reader to infer it from a team name.
  const anySenior=teams.some(([t])=>t&&!/U-?\d\d/.test(t));
  const note=anySenior
    ? `<div class="mnote">A <b>senior</b> appearance cap-ties a player permanently under FIFA Article&nbsp;9.</div>`
    : `<div class="mnote">All youth level — under FIFA Article&nbsp;9 these do <b>not</b> cap-tie. He can still choose Egypt.</div>`;
  return `<div class="ct">${ICON.star||ICON.chart} National team · ${m.natl.length} appearance${m.natl.length===1?"":"s"}</div>
    ${blocks}${note}`;
}
function trajBlock(p){
  const m=MSTATS[p.tm_id]; if(!m||!m.traj||m.traj.length<2)return "";
  const mx=Math.max(...m.traj.map(s=>s.m))||1;
  const rows=m.traj.map(s=>`<tr>
      <td class="dt">${esc(s.s)}</td>
      <td><div class="sbar"><i style="width:${Math.round(100*s.m/mx)}%"></i></div></td>
      <td class="mn">${s.m.toLocaleString()}'</td>
      <td class="c">${s.a}</td>
      <td class="r ga${(s.g||s.ast)?"":" z"}">${s.g?s.g+"G":""}${s.g&&s.ast?" ":""}${s.ast?s.ast+"A":""}${(s.g||s.ast)?"":"—"}</td></tr>`).join("");
  const r=m.role||{};
  const tc=r.min_trend==="up"?"up":r.min_trend==="down"?"dn":"fl";
  const tt=r.min_trend==="up"?"▲ minutes rising":r.min_trend==="down"?"▼ minutes falling":"▬ minutes steady";
  return `<div class="ct">${ICON.chart} Season by season</div>
    <div class="mwrap"><table class="mtbl">
      <thead><tr><th>Season</th><th>Minutes</th><th></th><th class="c">Apps</th><th class="r">G/A</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="mnote">Started <b>${r.start_pct}%</b> of his ${r.apps} games · averaging <b>${r.avg_min}'</b> ·
      <span class="trend ${tc}">${tt}</span></div>`;
}


let fxView="prev";
let fxSort="date";
let fxQuery=""; let fxPos="ALL";
const BLANK="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";



/* ---- last / next match cards ---- */
const MON={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
function fxDate(s){                       // "Aug 29, 2026" or "2026-04-17" -> epoch
  if(!s)return 0;
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(iso)return Date.UTC(+iso[1],+iso[2]-1,+iso[3]);
  const m=/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(s);
  return m?Date.UTC(+m[3],MON[m[1]],+m[2]):0;
}

function fxBlock(){
  const q=(fxQuery||"").trim().toLowerCase();
  let rows=scRows()
    .filter(x=>fxPos==="ALL"||posGroup(x.p.position)===fxPos)
    .filter(x=>hits(x.p,q));

  // Each sub-tab shows ONE match, not both. Cramming a past result and a future
  // fixture into the same card put "Lost 0-4" beside "Home Aug 1" — two
  // unrelated facts competing for the same eye.
  const upcoming = fxView==="next";
  rows = rows.filter(({p,m})=> upcoming
      ? !!NEXTM[p.tm_id]
      : !!(m.form||[])[0]);

  const key = ({p,m}) => {
    if(fxSort==="pos")  return posGroup(p.position)+"|"+p.name;
    if(fxSort==="name") return p.name;
    const d = upcoming ? fxDate((NEXTM[p.tm_id]||{}).date) : fxDate(((m.form||[])[0]||{}).fd);
    return d;                              // date
  };
  rows.sort((a,b)=>{
    const ka=key(a), kb=key(b);
    if(typeof ka==="number") return upcoming ? ka-kb : kb-ka;   // soonest first / most recent first
    return String(ka).localeCompare(String(kb));
  });

  // A missing crest used to render a 1x1 transparent GIF, leaving an invisible
  // gap where a badge belongs -- it read as a broken image rather than as a club
  // we simply have no badge for. Fall back to the club's initial so the row still
  // lines up and still identifies the team.
  const crest=(id,name)=>CRESTS[id]
    ? `<img src="${CRESTS[id]}" alt="">`
    : `<span class="crx">${esc((name||"?").replace(/^(FC|SC|SV|AC|AS|CD|CF)\s+/i,"").trim().charAt(0).toUpperCase()||"?")}</span>`;
  const side=(id,name,score,won)=>`<div class="fxteam${won?" win":""}">${crest(id,name)}
      <span>${esc(name||"—")}</span>${score!==null?`<b class="sc1">${score}</b>`:""}</div>`;

  const cards=rows.map(({p,m})=>{
    const freeAgent=/free agent|without club/i.test(p.club||"");
    const own=m.ownid;
    let body="";

    if(upcoming){
      const n=NEXTM[p.tm_id];
      const venue=n.ha==="H"?"Home":n.ha==="A"?"Away":"";
      body=`<div class="fxm">
        <div class="fxwhen">${esc(n.date)}${n.time?` · <b>${esc(n.time)}</b>`:""}${venue?` · ${venue}`:""}</div>
        <div class="fxvs">${side(n.sid||own,p.club,null,false)}${side(n.oid,n.opp,null,false)}</div></div>`;
    }else{
      const last=(m.form||[])[0];
      const [a,b]=String(last.sc||"0-0").split("-").map(x=>parseInt(x,10)||0);
      const verdict=last.r==="W"?"Won":last.r==="D"?"Drew":"Lost";
      body=`<div class="fxm">
        <div class="fxwhen"><span class="res ${last.r}">${verdict} ${esc(last.sc)}</span>
          ${esc(last.fd)} · ${last.v==="home"?"home":"away"}</div>
        <div class="fxvs">${side(last.sid||own,last.side||p.club,a,a>b)}${side(last.oid,last.opp||last.cn,b,b>a)}</div>
        <div class="fxmeta"><span>${esc(last.cn||"")}</span>${
          // His involvement, not just the club's result. A card that showed only
          // the scoreline implied he took part; for 42 of these he had not.
          //
          // "played" with no minutes is TM still filling the match in -- it
          // publishes the fixture within hours and the minutes a day or two
          // later. Rendering it as 0' read as "he was on the pitch for zero
          // minutes", which is a contradiction rather than a fact.
          last.part==="P" ? (last.min ? `<span><b>${last.min}'</b></span>`
                                      : `<span class="pw p">minutes pending</span>`)
          : last.part==="B" ? `<span class="pw b">unused sub</span>`
          : `<span class="pw o">not in squad</span>`
        }${last.part==="P"&&last.g?`<span><b>${last.g}G</b></span>`:""}${last.part==="P"&&last.a?`<span><b>${last.a}A</b></span>`:""}</div></div>`;
    }

    const clubLine=freeAgent?'<b class="fa">Free agent</b>':esc(p.club||"");
    // Portrait where we have one, initials where we don't. 8 of the newest players
    // carry no photo on TM, and an empty <img> box reads as a broken card.
    const face=p.photo
      ? `<img class="fxface" src="${p.photo}" alt="" loading="lazy">`
      : `<span class="fxface ini">${esc((p.name||"?").split(/\s+/).map(w=>w[0]).slice(0,2).join(""))}</span>`;
    // Region stripe: the dossier splits naturally into a Gulf cohort and a
    // Europe/Americas one, and they are scouted differently -- different leagues,
    // different travel, different competition for the player. Colour carries that
    // grouping without spending a column on it.
    const reg=regionOf(p);
    return `<div class="fxc r-${reg}"><div class="fxhd">${face}
        ${freeAgent?'<span class="faico">FA</span>':crest(own)}
        <div class="nm">${esc(p.name)}<small>${esc(p.age)} · ${esc(p.position||"")} · ${clubLine}</small></div></div>
      ${body}</div>`;
  }).join("");

  const nPrev=scRows().filter(x=>(x.m.form||[])[0]).length;
  const nNext=scRows().filter(x=>NEXTM[x.p.tm_id]).length;
  document.getElementById("fixtures").innerHTML=
    `<div class="fxsubs">
       <button class="sub${fxView==="prev"?" on":""}" data-fxv="prev">Previous match <b>${nPrev}</b></button>
       <button class="sub${fxView==="next"?" on":""}" data-fxv="next">Upcoming match <b>${nNext}</b></button>
       <div class="fxsort"><label>Sort
         <select id="fxsortsel">
           <option value="date"${fxSort==="date"?" selected":""}>${upcoming?"Soonest first":"Most recent first"}</option>
           <option value="pos"${fxSort==="pos"?" selected":""}>Position</option>
           <option value="name"${fxSort==="name"?" selected":""}>Name</option>
         </select></label></div>
     </div>
     <div class="fxcount">${rows.length} shown</div>
     <div class="fxwrap">${cards||`<p class="mnote">No players match these filters.</p>`}</div>`;

  document.querySelectorAll("#fixtures .sub").forEach(b=>b.onclick=()=>{fxView=b.dataset.fxv;fxBlock();});
  const sel=document.getElementById("fxsortsel");
  if(sel)sel.onchange=e=>{fxSort=e.target.value;fxBlock();};

  const rg=[["ALL","All regions"],["EU","Europe & Americas"],["GULF","Gulf"]];
  document.getElementById("fxregion").innerHTML=rg.map(([k,l])=>{
    const n2=(()=>{const o=scRegion;scRegion=k;const c=scRows().length;scRegion=o;return c;})();
    return `<button class="chip${scRegion===k?" on":""}" data-fxr="${k}">${l} <b>${n2}</b></button>`;}).join("");
  document.querySelectorAll("#fxregion .chip").forEach(b=>b.onclick=()=>{scRegion=b.dataset.fxr;drawScouting();fxBlock();});

  const pg=[["ALL","All positions"],["Goalkeeper","Goalkeepers"],["Defender","Defenders"],["Midfielder","Midfielders"],["Attacker","Attackers"]];
  document.getElementById("fxpos").innerHTML=pg.map(([k,l])=>{
    const c=scRows().filter(x=>k==="ALL"||posGroup(x.p.position)===k).length;
    return `<button class="chip${fxPos===k?" on":""}" data-fxp="${k}">${l} <b>${c}</b></button>`;}).join("");
  document.querySelectorAll("#fxpos .chip").forEach(b=>b.onclick=()=>{fxPos=b.dataset.fxp;fxBlock();});

  const box=document.getElementById("fxq");
  if(box&&!box._wired){box._wired=1;box.oninput=e=>{fxQuery=e.target.value;fxBlock();};}
}

let scRegion="ALL";
function scRegionKeep(p){
  if(scRegion==="ALL")return true;
  const saved=filter; filter=scRegion;      // reuse the shortlist's own region logic
  const r=keep(p); filter=saved; return r;
}
// Every player the Scouting tab can show, before region and search narrow it.
// The tab badge counts this, so the badge and the table are the same population by
// construction -- they previously used separate expressions and drifted apart.
// A player with a senior competitive cap for another country cannot switch, so
// tracking his club form is wasted attention -- Scouting mode and Fixtures are
// working lists, not the archive. They stay in the shortlist and on the national
// teams tab, where "who Egypt cannot get" is the point.
function recruitable(p){ return p.status!=="CAP_TIED_ELSEWHERE"; }
function scRowsAll(){
  return DATA.filter(recruitable).map(p=>({p,m:MSTATS[p.tm_id]}))
    .filter(x=>x.m&&x.m.status&&x.m.status.n);
}
let scQuery="";
// Position and form chips were removed, so their state variables went with them
// rather than staying as branches that can never fire. The table still groups by
// position, which is what the position chips were duplicating.
function scRows(){
  const q=(scQuery||"").trim().toLowerCase();
  return scRowsAll()
    .filter(x=>hits(x.p,q))
    .filter(x=>scRegionKeep(x.p))
    .sort((a,b)=>(b.m.status.played-a.m.status.played)||((b.m.status.g||0)-(a.m.status.g||0)));
}
function scSignal(s){
  // Zero appearances is its own state and has to be tested first. Without it
  // everyone fell through to "rotating": Mahmood Gamal, an unused sub ten times
  // running, read the same as a genuine squad rotator, and 21 players carried a
  // label that described the opposite of their situation.
  if(!s.played){
    // Named for what it is. A keeper travelling every week is a different
    // proposition to a player left out of the squad entirely.
    return s.bench>=5 ? '<span class="pill bench">benched all 10</span>'
                      : '<span class="pill cold">no club minutes</span>';
  }
  if(s.played>=8)return '<span class="pill hot">regular</span>';
  if(s.out>=5)return '<span class="pill cold">out of favour</span>';
  return '<span class="pill mid">rotating</span>';
}
function drawScouting(){
  const rows=scRows();
  const GRP=[["Goalkeeper","Goalkeepers"],["Defender","Defenders"],
             ["Midfielder","Midfielders"],["Attacker","Attackers"],["Other","Other"]];
  // colgroup pins one shared grid across all four position tables. Without it
  // each table sizes to its own content and the columns step out of line
  // between sections.
  const cols=`<colgroup><col class="c-player"><col class="c-strip"><col class="c-tally">`
    +`<col class="c-ga"><col class="c-signal"><col class="c-date"></colgroup>`;
  const head=`<thead><tr><th>Player</th><th>Last 10 club games</th><th>Squad status</th>`
    +`<th class="r">G/A</th><th class="c">Signal</th><th class="r">Last game</th></tr></thead>`;
  const rowHTML=({p,m})=>{
    const s=m.status;
    // Same "played but no minutes yet" case the fixture card handles: TM posts
    // the fixture before the minutes, so "0' played" would be a contradiction.
    const mins=x=>x.s==="P"?(x.min?x.min+"' played":"played \u2014 minutes not published yet")
                 :x.s==="B"?"unused sub":"not in squad";
    // Goals and assists were already carried on every entry and never shown. A
    // green block that was a goal is not the same as a green block that was a
    // quiet 90 minutes, and that is exactly what a scout is scanning for.
    const ret=x=>{
      const bits=[];
      if(x.g)bits.push(x.g+(x.g>1?" goals":" goal"));
      if(x.a)bits.push(x.a+(x.a>1?" assists":" assist"));
      return bits.length?" \u00b7 "+bits.join(", "):"";
    };
    // Oldest left, newest right: the strip is a timeline, and a timeline that
    // runs backwards makes an improving run look like a decline.
    const strip=m.squad.slice(0,10).slice().reverse()
      .map(x=>`<i class="${x.s}" title="${esc(x.d)} ${esc(x.cn||"")}${x.opp?" vs "+esc(x.opp):""} \u2014 ${mins(x)}${esc(ret(x))}"></i>`).join("");
    const ga=(s.g||s.a)?`${s.g?s.g+"G":""}${s.g&&s.a?" ":""}${s.a?s.a+"A":""}`:"\u2014";
    // Face and crest, as on every other tab. A bare name column made this read
    // as a spreadsheet next to the shortlist and fixtures, and a scout scanning
    // 73 rows recognises a badge faster than a club name.
    const face=p.photo
      ? `<img class="scface" src="${p.photo}" alt="" loading="lazy">`
      : `<span class="scface ini">${esc(initials(p.name))}</span>`;
    const crest=CRESTS[p.club_id]
      ? `<img class="sccrest" src="${CRESTS[p.club_id]}" alt="" loading="lazy">` : "";
    return `<tr>
      <td class="pl"><span class="plw">${face}<span class="plt">${esc(p.name)}
        <small>${esc(p.age)} \u00b7 ${esc(p.position||"")} \u00b7 ${crest}${esc(p.club||"")}</small></span></span></td>
      <td><span class="strip">${strip}</span></td>
      <td class="tally"><b>${s.played}</b> played \u00b7 ${s.bench} bench \u00b7 ${s.out} out</td>
      <td class="r ga2${(s.g||s.a)?"":" z"}">${esc(ga)}</td>
      <td class="c">${scSignal(s)}</td>
      <td class="dt r">${esc(s.latest_date||"")}</td></tr>`;
  };
  document.getElementById("scgroups").innerHTML=GRP.map(([key,label])=>{
    const g=rows.filter(x=>posGroup(x.p.position)===key);
    if(!g.length)return "";
    return `<div class="scgrp"><div class="ct">${label} <span class="gc">${g.length}</span></div>
      <div class="mwrap"><table class="mtbl sctbl">${cols}${head}<tbody>${g.map(rowHTML).join("")}</tbody></table></div></div>`;
  }).join("")||`<p class="mnote">No players match these filters.</p>`;

  const rg=[["ALL","All regions"],["EU","Europe & Americas"],["GULF","Gulf"]];
  document.getElementById("scregion").innerHTML=rg.map(([k,l])=>{
    const n=(()=>{const o=scRegion;scRegion=k;const c=scRows().length;scRegion=o;return c;})();
    return `<button class="chip${scRegion===k?" on":""}" data-scr="${k}">${l} <b>${n}</b></button>`;}).join("");
  document.querySelectorAll("#scregion .chip").forEach(b=>b.onclick=()=>{scRegion=b.dataset.scr;drawScouting();});
  // Position and form chips removed: the table already groups by position, so the
  // position row restated the headings, and search covers finding a player faster
  // than either chip row did. The strip legend stays -- it explains the colours,
  // which nothing else on the page does.
  const legend=document.getElementById("sclegend");
  if(legend)legend.innerHTML=`<span><i style="background:#2e9d5a"></i>played</span><span><i style="background:#d9a441"></i>benched</span><span><i class="O" style="background:var(--line)"></i>not in squad</span><span>oldest \u2192 newest \u00b7 hover a block for the match, goals and assists</span>`;

  // Wire once and never re-render the input: rebuilding it on every keystroke
  // would drop focus and the caret mid-word.
  const box=document.getElementById("scq");
  if(box&&!box._wired){box._wired=1;box.oninput=e=>{scQuery=e.target.value;drawScouting();};}
  fxBlock();
  drawNat();
}

/* ---- national teams ----------------------------------------------------- */
// The question this tab answers is not "is he capped" but "who is developing
// him". Under Article 9 a youth cap ties nobody, so a Qatar U23 player is still
// gettable -- he is simply being developed by someone else, which is a different
// kind of urgency to a player nobody has called at all.
let natFilter="ALL"; let natQuery="";
// Which rows are expanded. A Set so several can be open at once — comparing two
// players' international records side by side is the point of the tab.
const natOpen=new Set();
const NATG=[
  ["EGY", "In Egypt's setup",   "The EFA already knows them. Youth caps do not cap-tie, so these are Egypt's to keep."],
  ["OTH", "Another federation", "Being developed elsewhere. Youth caps still leave the switch open — but someone else is watching."],
  ["NONE","Never called up",    "No federation has approached them at any level. The largest group, and the least contested."],
];
function natGroup(p){
  const nt=(p.national_team||"").trim();
  if(!nt)return "NONE";
  return nt.startsWith("Egypt") ? "EGY" : "OTH";
}
// "Egypt U20" -> 20, a bare country -> 99 so senior sorts last within a group.
function natLevel(p){
  const m=/U-?(\d{2})/.exec(p.national_team||"");
  return m?+m[1]:(p.national_team?99:0);
}
// SEL covers only the three shortlist statuses, so cap-tied and needs-review had
// no label. This tab is precisely where those two matter, so it carries its own
// complete map rather than rendering a raw enum.
const NATSTATUS={
  ELIGIBLE_UNCALLED:       ["ok",  "Eligible"],
  ELIGIBLE_YOUTH_ELSEWHERE:["ok",  "Still switchable"],
  IN_EGYPT_PIPELINE:       ["egy", "Egypt youth setup"],
  CAP_TIED_ELSEWHERE:      ["no",  "Cap-tied — cannot switch"],
  NEEDS_REVIEW:            ["chk", "Needs confirming"],
};
function statusPill(p){
  const [k,label]=NATSTATUS[p.status]||["chk",p.status||"—"];
  return `<span class="npill ${k}">${esc(label)}</span>`;
}
function natRows(){
  return DATA.filter(recruitable).filter(p=>hits(p,natQuery))
    .filter(p=>natFilter==="ALL"||natGroup(p)===natFilter)
    .sort((a,b)=>natLevel(a)-natLevel(b)
      ||(a.national_team||"").localeCompare(b.national_team||"")
      ||a.name.localeCompare(b.name));
}
function drawNat(){
  const host=document.getElementById("natgroups");
  if(!host)return;
  const rows=natRows();

  const row=p=>{
    const face=p.photo?`<img class="scface" src="${p.photo}" alt="" loading="lazy">`
                      :`<span class="scface ini">${esc(initials(p.name))}</span>`;
    const crest=CRESTS[p.club_id]?`<img class="sccrest" src="${CRESTS[p.club_id]}" alt="" loading="lazy">`:"";
    const nt=p.national_team||"";
    // A bare country name means a SENIOR side, which is the one thing that does
    // cap-tie. Flagged in red so it is never confused with a youth call-up.
    const senior=nt&&!/U-?\d\d/.test(nt);
    // The store has the team's NAME but not its id, so resolve it through the
    // dossier-wide map rather than this player's own appearances.
    const tag=nt?`<span class="ntag${senior?" sr":""}">${natBadge(natIdOf(nt))}${esc(nt)}</span>`
               :`<span class="ntag none">not called up</span>`;
    const caps=(p.caps&&p.caps!=="0")?`${esc(p.caps)}`:"—";
    const m=MSTATS[p.tm_id];
    const has=!!(m&&m.natl&&m.natl.length);
    // Expands in place rather than opening the player sheet. The sheet is about
    // club form; this tab is about who is developing him, and the appearances
    // belong next to the team name they explain.
    const open=natOpen.has(p.tm_id);
    return `<tr class="${has?"natrow":""}${open?" open":""}"${has?` data-nat-id="${esc(p.tm_id)}"`:""}>
      <td class="pl"><span class="plw">${face}<span class="plt">${esc(p.name)}
        <small>${esc(p.age)} · ${esc(p.position||"")} · ${crest}${esc(p.club||"")}</small></span></span></td>
      <td>${tag}${has?`<span class="natx">${open?"▾":"▸"} ${m.natl.length}</span>`:""}</td>
      <td class="r ga2${caps==="—"?" z":""}">${caps}</td>
      <td class="c">${statusPill(p)}</td></tr>`
      +(open?`<tr class="natdet"><td colspan="4">${natlBlock(p)}</td></tr>`:"");
  };

  const cols=`<colgroup><col style="width:42%"><col style="width:22%">`
    +`<col style="width:10%"><col style="width:26%"></colgroup>`;
  const head=`<thead><tr><th>Player</th><th>National team</th>`
    +`<th class="r">Caps</th><th class="c">Eligibility</th></tr></thead>`;

  host.innerHTML=NATG.map(([key,label,blurb])=>{
    const g=rows.filter(p=>natGroup(p)===key);
    if(!g.length)return "";
    return `<div class="scgrp"><div class="ct">${label} <span class="gc">${g.length}</span></div>
      <p class="ntblurb">${blurb}</p>
      <div class="mwrap"><table class="mtbl sctbl nattbl">${cols}${head}<tbody>${g.map(row).join("")}</tbody></table></div></div>`;
  }).join("")||`<p class="mnote">No player matches “${esc(natQuery)}”.</p>`;

  const f=[["ALL","All"],...NATG.map(([k,l])=>[k,l])];
  document.getElementById("natfilters").innerHTML=f.map(([k,l])=>{
    const n=(()=>{const o=natFilter;natFilter=k;const c=natRows().length;natFilter=o;return c;})();
    return `<button class="chip${natFilter===k?" on":""}" data-nat="${k}">${l} <b>${n}</b></button>`;}).join("");
  document.querySelectorAll("#natfilters .chip").forEach(b=>b.onclick=()=>{natFilter=b.dataset.nat;drawNat();});

  host.querySelectorAll(".natrow").forEach(tr=>{
    const id=tr.dataset.natId;
    const toggle=()=>{ natOpen.has(id)?natOpen.delete(id):natOpen.add(id); drawNat(); };
    tr.onclick=toggle;
    tr.tabIndex=0;
    tr.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}};
  });

  const box=document.getElementById("natq");
  if(box&&!box._wired){box._wired=1;box.oninput=e=>{natQuery=e.target.value;drawNat();};}
}
/* ---- keep every displayed number derived from DATA ---- */
function syncCounts(){
  // Headline figures describe the recruitable pool, not the raw crawl. Counting
  // players Egypt cannot sign would overstate the dossier's own claim.
  const pool=DATA.filter(recruitable);
  const total=pool.length;
  const dia_=pool.filter(p=>p.egypt_position==="secondary").length;

  // The registry's band uses explicit ids rather than matching on label text,
  // so set them directly. Its figures describe the whole registry: unlike the
  // dossier, "how many are out there" is the entire point.
  const put=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  put("b-total",pool.length);
  put("b-dual",pool.filter(p=>p.track==="dual").length);
  put("f-count",pool.length);

  document.querySelectorAll(".bstat").forEach(el=>{
    const lab=(el.querySelector("span")||{}).textContent||"";
    const num=el.querySelector("b"); if(!num)return;
    if(/eligible/i.test(lab))num.textContent=total;
    else if(/raised abroad/i.test(lab))num.textContent=dia_;
  });

  document.querySelectorAll("h2").forEach(h=>{
    if(/who can wear the red/i.test(h.textContent))
      h.textContent=total+" who can wear the red.";
  });

  // Body copy carries the count in prose; rewrite just the number so the
  // sentence survives any later edit to its wording.
  document.querySelectorAll("p,small").forEach(el=>{
    if(/These are \d+ more/.test(el.innerHTML))
      el.innerHTML=el.innerHTML.replace(/These are \d+ more/,"These are "+total+" more");
    if(/This is \d+ caught by method/.test(el.innerHTML))
      el.innerHTML=el.innerHTML.replace(/This is \d+ caught by method/,"This is "+total+" caught by method");
  });
}

/* ---- view tabs ---- */
function setView(v){
  const map={list:"view-list",scout:"scouting",fix:"view-fix",nat:"view-nat"};
  Object.entries(map).forEach(([key,id])=>{
    const el=document.getElementById(id);
    if(el)el.classList.toggle("vhide",key!==v);
  });
  document.querySelectorAll("#vtabs .vtab").forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  const hash={list:"#shortlist",scout:"#scouting",fix:"#fixtures",nat:"#national"}[v]||"#shortlist";
  try{history.replaceState(null,"",hash);}catch(e){}
}
function initTabs(){
  // Count what each tab actually renders. This counted every player with match
  // data regardless of eligibility, so the badge included cap-tied players the
  // Scouting table drops -- it read 73 while the table listed 77. Deriving both
  // from scRows() means the badge cannot disagree with its own tab again.
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set("vc-list",DATA.filter(recruitable).length); set("vc-scout",scRowsAll().length);
  // Counts the same population the tab renders — fxBlock builds from scRows(),
  // which now drops cap-tied players.
  set("vc-fix",DATA.filter(p=>recruitable(p)&&NEXTM[p.tm_id]).length);
  // Cap-tied players are out of every view now, this one included: the dossier
  // lists who Egypt can get, and a player who legally cannot switch is not part
  // of that answer anywhere.
  set("vc-nat",DATA.filter(recruitable).length);
  document.querySelectorAll("#vtabs .vtab").forEach(b=>b.onclick=()=>setView(b.dataset.v));
  const from={"#scouting":"scout","#fixtures":"fix","#national":"nat"}[location.hash]||"list";
  setView(from);
}

/* ---- modal blocks ---- */
function pitchSvg(pos){const m=posMeta(pos);
  return `<div class="pitch"><div class="box t"></div><div class="box b"></div><div class="dot" style="left:${m.x}%;top:${m.y}%">${m.abbr}</div></div>`;}

function statCards(p){
  const s=p.st; if(!s)return "";
  const keeper=(p.position||"").toLowerCase().includes("keeper");
  const mins=s.m>=1000?(s.m/1000).toFixed(1)+"k":s.m;
  const per90=s.m>0?((s.g+s.as)/(s.m/90)).toFixed(2):"—";
  const cards=[
    [ICON.apps,s.a,"Apps",""],
    [ICON.ball,s.g,"Goals","hl"],
    [ICON.boot,s.as,"Assists",""],
    [ICON.combo,s.g+s.as,"G + A",""],
    [ICON.chart,per90,"G+A / 90",""],
    [ICON.clock,mins,"Minutes",""],
    [ICON.glove,s.cs,keeper?"Clean sh.":"Clean sh.",""],
    [ICON.card,s.y,"Yellows",""]
  ];
  return `<div class="ct">${ICON.ball} Club career · all competitions</div>
    <div class="statcards">${cards.map((c,i)=>`<div class="sc ${c[3]}" style="animation-delay:${i*40}ms">
      <div class="ic">${c[0]}</div><b>${c[1]}</b><span>${c[2]}</span></div>`).join("")}</div>`;
}

function transferBlock(p){
  const tr=p.tr; if(!tr||!tr.length)return "";
  const paid=f=>/€/.test(f||"");
  const rows=tr.map(t=>{
    const big=paid(t.fee)&&/m$/.test((t.fee||"").replace(/\s/g,""));
    return `<div class="tf${big?" big":""}"><div class="tdate">${esc(t.date||t.season||"")}</div>
      <div class="tmove">${esc(t.from)}<span class="arr">→</span><span class="to">${esc(t.to)}</span></div>
      <div class="tfee${paid(t.fee)?" paid":""}">${esc(t.fee||"—")}</div></div>`;
  }).join("");
  return `<div class="transfers"><div class="ct">${ICON.swap} Transfer history · ${tr.length} move${tr.length>1?"s":""}</div>
    <div class="tflist">${rows}</div></div>`;
}

function sparkline(p){
  const seq=p.mv_seq; const distinct=seq?new Set(seq).size:0;
  if(!seq||seq.length<3||distinct<2){
    if(!seq||!seq.length)return "";
    return `<div class="mvbox flat"><div class="mvhd"><span class="t">${ICON.chart} Market value</span><span class="rise" style="color:var(--gold)">${esc(p.mv_now||p.mv_start||val(p.market_value_eur))}</span></div>
      <div class="flatnote">Not enough valuations for a trajectory.</div></div>`;
  }
  const W=440,H=54,mx=Math.max(...seq),mn=Math.min(...seq),rng=(mx-mn)||1;
  const pts=seq.map((v,i)=>`${((i/(seq.length-1))*W).toFixed(1)},${(H-((v-mn)/rng)*H).toFixed(1)}`);
  const lastY=H-((seq[seq.length-1]-mn)/rng)*H;
  const rise=seq[seq.length-1]>=seq[0]; const col=rise?"var(--up)":"var(--red)";
  return `<div class="mvbox"><div class="mvhd"><span class="t">Market value trajectory</span>
    <span class="rise" style="color:${col}">${rise?"▲ rising":"▼ declining"} · ${seq.length} valuations</span></div>
    <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="0,${H} ${pts.join(" ")} ${W},${H}" fill="${col}" opacity="0.13"/>
      <polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round"/>
      <circle cx="${W}" cy="${lastY.toFixed(1)}" r="3.6" fill="${col}"/></svg>
    <div class="ends"><span class="s">${esc(p.mv_start)} start</span><span class="p">${esc(p.mv_peak)} peak</span><span class="n">${esc(p.mv_now)} now</span></div></div>`;
}

function openModal(id){
  const p=DATA.find(x=>x.tm_id===id); if(!p)return;
  const st=SEL[p.status]||{t:p.status};
  const pm=posMeta(p.position);
  const photo=p.photo?`<img class="sheet-photo" src="${p.photo}" alt="">`:`<div class="sheet-photo ph">${esc(initials(p.name))}</div>`;
  const pass=passChips(p.citizenship);
  const bp=p.birthplace&&p.birthplace!=="-"&&p.birthplace!==""?esc(p.birthplace):"—";
  const nt=p.national_team?esc(p.national_team):"—";
  const row=(k,v)=>`<div class="r"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  document.getElementById("modal").innerHTML=`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
      <div class="sheet-hd"><button class="mclose" aria-label="Close">&times;</button>${photo}
        <div class="who"><h3>${esc(p.name)}</h3>
          <div class="metaline"><span class="posbadge">${pm.abbr} · ${esc(pm.role)}</span>
            <span class="m">${esc(p.age)} yrs</span><span class="m">${esc(p.country_crawled)}</span></div>
          <div class="pass2">${pass}</div></div>
      </div>
      <div class="sheet-body">
        <div class="pitchwrap">${pitchSvg(p.position)}
          <div class="pitchinfo"><div class="role">${esc(pm.role)}</div><div class="rsub">${esc(p.club)}</div>
            <div class="lg">${esc(p.league)}${dia(p)?' · <span style="color:var(--gold)">◆ raised abroad</span>':''}</div></div>
        </div>
        ${statCards(p)}
        ${formBlock(p)}
        ${trajBlock(p)}
        ${transferBlock(p)}
        ${sparkline(p)}
        <div class="bio">
          ${row("Eligibility",`<b>${st.t}</b>`)}
          ${row("National team",nt+(p.caps>0?` · ${p.caps} caps`:""))}
          ${row("Born",bp)}
          ${dia(p)?row("Why he matters",`<b>Foreign-raised, Egyptian blood — the next Hassan.</b>`):""}
        </div>
      </div>
      <div class="sheet-ft"><div class="note">Career totals, all competitions. Clean sheets are a proxy. Confirm eligibility with the federation.</div>
        <a href="https://www.transfermarkt.com/x/profil/spieler/${esc(p.tm_id)}" target="_blank" rel="noopener">Transfermarkt ↗</a></div>
    </div>`;
  const m=document.getElementById("modal");m.classList.add("on");
  m.querySelector(".mclose").onclick=closeModal;
  m.onclick=e=>{if(e.target===m)closeModal();};
}
function closeModal(){document.getElementById("modal").classList.remove("on");}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});

/* ---- analytics ---- */
function posGroup(p){p=(p||"").toLowerCase();
  if(p.includes("keeper"))return"Goalkeeper";
  if(p.includes("back"))return"Defender";
  if(p.includes("midfield"))return"Midfielder";
  if(p.includes("wing")||p.includes("forward")||p.includes("striker"))return"Attacker";
  return"Other";}
function otherNat(c){return c.split(" / ").filter(x=>x!=="Egypt")[0]||"—";}
function tally(a,k){const m={};a.forEach(x=>{const v=k(x);m[v]=(m[v]||0)+1;});return Object.entries(m).sort((x,y)=>y[1]-x[1]);}
function bars(id,pairs,alt){const max=Math.max(...pairs.map(p=>p[1]),1);
  document.getElementById(id).innerHTML=pairs.map(([lb,v])=>`<div class="bar"><div class="lb">${esc(lb)}</div>
    <div class="track"><div class="fill${alt?" alt":""}" style="width:${Math.max(v/max*100,6)}%"><span class="n">${v}</span></div></div></div>`).join("");}
function ageChart(rows){const t={};rows.forEach(x=>{const a=+x.age;if(a)t[a]=(t[a]||0)+1;});
  const ages=[];for(let a=17;a<=26;a++)ages.push([a,t[a]||0]);const max=Math.max(...ages.map(a=>a[1]),1);
  const H=118; // px track height for bars
  document.getElementById("c-age").innerHTML=ages.map(([a,v])=>{
    const px=v?Math.max(Math.round(v/max*H),8):0;
    return `<div class="agecol"><div class="av">${v||""}</div>
      <div class="ab" style="height:${px}px"></div><div class="ax">${a}</div></div>`;
  }).join("");}


/* ---- analytics filters ---- */
let aFilter={country:"ALL",nat:"ALL"};
function aChips(){
  const countries=[...new Set(DATA.map(x=>x.country_crawled))].sort();
  const nats=[...new Set(DATA.flatMap(x=>x.citizenship.split(" / ").filter(c=>c!=="Egypt")))].sort();
  const el=document.getElementById("afilters");
  const opt=(list,cur)=>[["ALL","All"]].concat(list.map(c=>[c,c])).map(([k,l])=>`<option value="${esc(k)}"${cur===k?" selected":""}>${esc(l)}</option>`).join("");
  el.innerHTML=
    `<label class="ddl"><span>Country of play</span><select id="asel-country">${opt(countries,aFilter.country)}</select></label>`+
    `<label class="ddl"><span>Second nationality</span><select id="asel-nat">${opt(nats,aFilter.nat)}</select></label>`;
  document.getElementById("asel-country").onchange=e=>{aFilter.country=e.target.value;drawAnalytics();};
  document.getElementById("asel-nat").onchange=e=>{aFilter.nat=e.target.value;drawAnalytics();};
}
function aRows(){
  // Charts describe the recruitable pool for the same reason the headline
  // figures do — a cap-tied player is not part of what this dossier offers.
  return DATA.filter(recruitable).filter(x=>
    (aFilter.country==="ALL"||x.country_crawled===aFilter.country)&&
    (aFilter.nat==="ALL"||x.citizenship.split(" / ").includes(aFilter.nat)));
}
function drawAnalytics(){
  const rows=aRows();
  ageChart(rows);
  bars("c-pos",tally(rows,x=>posGroup(x.position)),true);
  bars("c-country",tally(rows,x=>x.country_crawled),false);
  bars("c-nat",tally(rows,x=>otherNat(x.citizenship)),false);
}
