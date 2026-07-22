/* Egyptians Abroad — scouting workspace.
   Table-first, filters persistent, detail in a side panel so a scout working
   through 152 players never loses their place in the list. */

let DATA=[],MSTATS={},CRESTS={},NEXTM={},NATIDS={};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const initials=n=>(n||"?").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
const num=v=>{const n=parseInt(v,10);return isNaN(n)?0:n;};

/* ---------- state ---------- */
// fxsort is separate from sort: the roster and the fixtures list answer different
// questions, and carrying one sort across both meant opening Fixtures showed them
// alphabetically when the only useful order is who plays soonest.
const S={view:"roster",q:"",sort:"name",dir:1,fxsort:"date",fxdir:1,sel:null,
         f:{track:new Set(),region:new Set(),club:new Set(),caps:new Set(),pos:new Set(),age:new Set(),form:new Set()}};
// A player between clubs is available now and needs no fee — the single most
// actionable state in the dossier, and previously only findable by searching the
// words "free agent".
const isFree=p=>/free agent|without club/i.test(p.club||"");
const capBand=p=>{const c=caps(p);return c.senior?"senior":c.youth?"youth":"none";};

/* ---------- derived ---------- */
const GULF=new Set(["Qatar","United Arab Emirates","Saudi Arabia","Kuwait","Bahrain","Oman","Jordan","Iraq",
  "Syria","Lebanon","Yemen"]);
// Every European country the crawl reaches. Serbia and the rest of the ex-Yugoslav
// bloc were added to the crawler today but not here, so nine Serbia-based players
// fell into "Elsewhere" — a bucket that told a scout nothing.
const EU=new Set(["Germany","Belgium","England","Switzerland","Spain","France","Greece","Portugal","Turkey",
  "Türkiye","Italy","Netherlands","Sweden","Austria","Denmark","Norway","Finland","Scotland","Ireland",
  "Poland","Czech Republic","Slovakia","Cyprus","Romania","Bulgaria","Albania","Hungary","Wales",
  "Serbia","Croatia","Slovenia","Bosnia-Herzegovina","North Macedonia","Montenegro","Kosovo",
  "Russia","Ukraine","Israel","Iceland","Luxembourg","Malta","Lithuania","Latvia","Estonia"]);
// The Americas are their own thing, not "European" — that was a two-player
// convenience in the dossier and it does not survive 151 players.
const AMER=new Set(["United States","Canada","Mexico","Brazil","Argentina","Uruguay","Chile","Colombia"]);
// Africa is where Egypt's own continent sits, and Libya and Algeria were landing
// in "Elsewhere" — the one region a scout for an African federation most needs.
const AFR=new Set(["Libya","Algeria","Morocco","Tunisia","Sudan","Nigeria","Ghana","South Africa",
  "Kenya","Senegal","Ivory Coast","Cameroon","Angola","Zambia","Tanzania","Ethiopia","Uganda"]);
const ASIA=new Set(["Malaysia","Indonesia","Thailand","Japan","South Korea","China","India","Vietnam",
  "Singapore","Australia","Uzbekistan","Iran","Azerbaijan","Kazakhstan"]);
// Where he PLAYS, from his club's country. country_crawled records where the
// crawl found him — empty for 70 of 151 and stale after any transfer — which is
// why the region filter used to return nothing sensible for Egypt-only players.
function homeCountry(p){
  return p.plays_in || p.country_crawled
    || (p.citizenship||"").split("/").map(s=>s.trim()).find(c=>c&&c!=="Egypt") || "";
}
function regionOf(p){
  // A free agent has no club and therefore no country, so he belongs to no
  // region. "Unclassified" was the honest label for the data and a useless one
  // for a reader — it described three players with no club, not three countries
  // nobody had mapped. They are filed under Club status instead, where the fact
  // that matters about them already lives.
  if(isFree(p))return "free";
  const c=homeCountry(p);
  if(GULF.has(c))return "gulf";
  if(EU.has(c))return "eu";
  if(AFR.has(c))return "afr";
  if(AMER.has(c))return "amer";
  if(ASIA.has(c))return "asia";
  return "other";
}
const POS=[["GK","Goalkeeper"],["DF","Defender"],["MF","Midfield"],["FW","Forward"]];
function posOf(p){
  const s=(p.position||"").toLowerCase();
  if(s.includes("keeper"))return "GK";
  if(s.includes("back")||s.includes("defen"))return "DF";
  if(s.includes("midfield"))return "MF";
  if(s.includes("wing")||s.includes("forward")||s.includes("striker")||s.includes("attack"))return "FW";
  return "MF";
}
function ageBand(p){
  const a=num(p.age);
  if(!a)return "";
  if(a<=18)return "u18";
  if(a<=21)return "u21";
  if(a<=23)return "u23";
  return "24";
}
function status(p){ return (MSTATS[p.tm_id]||{}).status||null; }

// Senior versus youth is the distinction that decides eligibility, so the two
// are counted separately rather than shown as one "caps" number. A bare country
// name means a senior side; anything with U-nn or Olympic is youth.
const isYouth=team=>/U-?\d\d|Olympic/i.test(team||"");
// A side we could not name is NOT evidence of a senior cap. isYouth() tests the
// name, so a blank one failed the youth test and was counted as senior: Haissem
// Hassan read 22/0 because 16 France U17/U18 appearances had no name in the club
// map, and 6 real Egypt caps plus 16 unnamed youth games rendered as 22 senior.
// That is the worst direction for this number to be wrong in — it says a
// selectable player is cap-tied.
const isSenior=team=>!!(team||"").trim()&&!isYouth(team);
function caps(p){
  const g=(MSTATS[p.tm_id]||{}).natl||[];
  // Appearances, not call-ups: sitting on the bench for a senior side does not
  // cap-tie anyone, and counting it would overstate the one number that matters.
  const played=g.filter(x=>x.part==="P");
  return {
    senior:played.filter(x=>isSenior(x.team)).length,
    youth: played.filter(x=>isYouth(x.team)).length,
    // Named neither way. Shown rather than silently dropped, so a gap in the
    // club-name map reads as "unresolved" instead of quietly inflating a count.
    unknown:played.filter(x=>!(x.team||"").trim()).length,
    total: g.length,
    teams:[...new Set(g.map(x=>x.team).filter(Boolean))],
  };
}
function signal(p){
  const s=status(p);
  if(!s||!s.n)return null;
  if(!s.played)return s.bench>=5?["bench","benched"]:["cold","no minutes"];
  if(s.played>=8)return ["hot","regular"];
  if(s.out>=5)return ["cold","out of favour"];
  return ["mid","rotating"];
}
function formBand(p){
  const g=signal(p);
  return g?g[0]:"";
}

/* ---------- the squad strip ---------- */
// One builder, used by the roster, Scouting mode and Fixtures. The three had
// three different tooltips saying three different amounts about the same match.
//
// squad[] carries date, competition, opponent, minutes, goals and assists.
// form[] carries the SCORE, the result and the venue for the same fixture and
// nothing was reading it — 80% of blocks match on date, so the hover can say
// "won 2-1 away" instead of leaving the reader to guess how the game went.
function matchOf(p,x){
  const f=(MSTATS[p.tm_id]||{}).form||[];
  return f.find(z=>z.fd===x.d)||null;
}
function blockTitle(p,x){
  const f=matchOf(p,x);
  const bits=[];
  bits.push(x.d||"");
  if(x.opp)bits.push(`${f&&f.v==="away"?"away at":f?"home to":"vs"} ${x.opp}`);
  if(f&&f.sc){
    const word=f.r==="W"?"won":f.r==="L"?"lost":f.r==="D"?"drew":"";
    bits.push(`${word} ${f.sc}`.trim());
  }
  if(x.cn)bits.push(x.cn);
  // Minutes: TM publishes the fixture before the minutes, so "0'" would be a
  // contradiction rather than a fact.
  bits.push(x.s==="P"?(x.min?`${x.min}' played`:"played — minutes not published yet")
           :x.s==="B"?"unused sub":"not in squad");
  const ret=[];
  if(x.g)ret.push(`${x.g} goal${x.g>1?"s":""}`);
  if(x.a)ret.push(`${x.a} assist${x.a>1?"s":""}`);
  if(ret.length)bits.push(ret.join(", "));
  return bits.filter(Boolean).join(" · ");
}
// A goal or an assist gets a star. A green block that was a goal is not the same
// as a green block that was a quiet 90 minutes, and scanning for the difference
// is the entire reason a scout reads this strip.
function stripHTML(p,n){
  const sq=((MSTATS[p.tm_id]||{}).squad||[]).slice(0,n).slice().reverse();
  if(!sq.length)return `<span class="nostrip">—</span>`;
  return `<span class="strip">${sq.map(x=>{
    const hit=(x.g||0)+(x.a||0)>0;
    return `<i class="${x.s}${hit?" hit":""}" title="${esc(blockTitle(p,x))}">${hit?"★":""}</i>`;
  }).join("")}</span>`;
}

/* ---------- filtering ---------- */
function hits(p){
  const q=S.q.trim().toLowerCase();
  if(!q)return true;
  return [p.name,p.club,p.citizenship,p.country_crawled,p.league,p.position]
    .some(v=>(v||"").toLowerCase().includes(q));
}
// A facet with nothing ticked means "no opinion", not "exclude everything" —
// otherwise the first click on any group would empty the table.
function passes(p,skip){
  if(!hits(p))return false;
  const f=S.f;
  if(skip!=="track"&&f.track.size&&!f.track.has(p.track))return false;
  if(skip!=="region"&&f.region.size&&!f.region.has(regionOf(p)))return false;
  if(skip!=="club"&&f.club.size&&!f.club.has(isFree(p)?"free":"signed"))return false;
  if(skip!=="caps"&&f.caps.size&&!f.caps.has(capBand(p)))return false;
  if(skip!=="pos"&&f.pos.size&&!f.pos.has(posOf(p)))return false;
  if(skip!=="age"&&f.age.size&&!f.age.has(ageBand(p)))return false;
  if(skip!=="form"&&f.form.size&&!f.form.has(formBand(p)))return false;
  return true;
}
function rows(){
  const out=DATA.filter(p=>passes(p));
  const dir=S.dir;
  const key={
    name:p=>(p.name||"").toLowerCase(),
    age:p=>num(p.age),
    club:p=>(p.club||"").toLowerCase(),
    apps:p=>(p.st||{}).a||0,
    goals:p=>(p.st||{}).g||0,
    mv:p=>num(p.market_value_eur),
    // Senior first, youth as the tiebreak: sorting by "caps" means "who is the
    // most experienced international", and one senior appearance outranks any
    // number of youth ones.
    caps:p=>{const c=caps(p);return c.senior*1000+c.youth;},
    form:p=>{const s=status(p);return s?s.played*10-s.out:-99;},
  }[S.sort]||(p=>p.name);
  return out.sort((a,b)=>{
    const ka=key(a),kb=key(b);
    if(ka<kb)return -dir; if(ka>kb)return dir;
    return (a.name||"").localeCompare(b.name||"");
  });
}

/* ---------- render: table ---------- */
const COLS=[
  ["name","Player",""],["track","Track","hide-s"],["age","Age","r"],
  ["club","Club","hide-s"],["form","Last 10","hide-s"],["sig","Signal","hide-s"],
  ["caps","Caps S/Y","r hide-s"],
  ["apps","Apps","r"],["goals","G","r"],["mv","Value","r"],
];
// Senior in red because it is the number that ends eligibility; youth in muted
// grey because under Article 9 it changes nothing. A player with 0/26 is fully
// available and a player with 7/26 is not, and that has to read at a glance.
function capsCell(p){
  const c=caps(p);
  if(!c.total)return `<span class="nostrip">—</span>`;
  // Green for Egypt, red for another country. Colouring every senior cap red
  // would flag a capped Egypt international as a problem, when he is the
  // opposite — the one player already committed.
  const g=(MSTATS[p.tm_id]||{}).natl||[];
  const seniorTeams=[...new Set(g.filter(x=>x.part==="P"&&isSenior(x.team)).map(x=>x.team))];
  const forEgypt=seniorTeams.length&&seniorTeams.every(t=>/^egypt/i.test(t||""));
  const cls=!c.senior?"z":forEgypt?"eg":"sr";
  const tip=c.teams.join(", ")
    +(c.senior?forEgypt?" — senior caps for Egypt":" — cap-tied elsewhere":" — youth only, still selectable")
    +" · click for every appearance";
  return `<span class="caps" title="${esc(tip)}">`
    +`<b class="${cls}">${c.senior}</b><i>/</i><span class="y">${c.youth}</span></span>`;
}
function drawTable(){
  const list=rows();
  $("count").innerHTML=`${list.length}<small>${list.length===DATA.length?"players":"of "+DATA.length}</small>`;

  if(!list.length){
    $("body").innerHTML=`<div class="empty"><b>Nothing matches</b>Try clearing a filter or the search box.</div>`;
    return;
  }
  const head=COLS.map(([k,label,cls])=>{
    const on=S.sort===k;
    return `<th class="${cls}${on?" sorted":""}" data-sort="${k}">${esc(label)}<span class="ar">${on?(S.dir>0?"▲":"▼"):"▲"}</span></th>`;
  }).join("");

  const body=list.map(p=>{
    const m=MSTATS[p.tm_id]||{};
    const face=p.photo?`<img class="face" src="${esc(p.photo)}" alt="" loading="lazy">`
                      :`<span class="face ini">${esc(initials(p.name))}</span>`;
    const crest=CRESTS[p.club_id]?`<img class="cc" src="${esc(CRESTS[p.club_id])}" alt="" loading="lazy">`:"";
    // Oldest left, newest right. Each block names the match, the competition and
    // what he did — the strip is unreadable without it, since a green block that
    // was a goal looks identical to a quiet 90 minutes.
    const strip=stripHTML(p,10);
    const g=signal(p);
    const st=p.st||{};
    return `<tr data-id="${esc(p.tm_id)}"${S.sel===p.tm_id?' class="sel"':""}>
      <td><span class="who">${face}<span class="nm"><b>${esc(p.name)}</b>
        <span>${esc(p.position||"")}${p.national_team?" · "+esc(p.national_team):""}</span></span></span></td>
      <td class="hide-s"><span class="tag ${p.track}">${p.track==="dual"?"Dual":"Egypt only"}</span></td>
      <td class="r num">${esc(p.age||"—")}</td>
      <td class="hide-s">${isFree(p)?`<b class="fa">Free agent</b>`:`${crest}${esc(p.club||"—")}`}
        ${p.plays_in&&!isFree(p)?`<small class="cn">${esc(p.plays_in)}</small>`:""}</td>
      <td class="hide-s">${strip}</td>
      <td class="hide-s">${g?`<span class="sig ${g[0]}">${g[1]}</span>`:`<span class="nostrip">—</span>`}</td>
      <td class="r hide-s">${capsCell(p)}</td>
      <td class="r num">${st.a||0}</td>
      <td class="r num">${st.g||0}</td>
      <td class="r num">${esc(p.mv_now||"—")}</td></tr>`;
  }).join("");

  $("body").innerHTML=`<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;

  $("body").querySelectorAll("th[data-sort]").forEach(th=>th.onclick=()=>{
    const k=th.dataset.sort;
    // Text sorts A→Z first; numbers sort high→low, because "most goals" is the
    // question someone is asking when they click Goals.
    if(S.sort===k)S.dir=-S.dir; else {S.sort=k;S.dir=(k==="name"||k==="club")?1:-1;}
    drawTable();
  });
  $("body").querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick=()=>openPanel(tr.dataset.id));
}

/* ---------- render: filters ---------- */
function facet(title,group,opts){
  const f=S.f[group];
  let shown=0;
  const body=opts.map(([val,label])=>{
    const n=DATA.filter(p=>passes(p,group)&&({
      track:x=>x.track===val, region:x=>regionOf(x)===val,
      club:x=>(isFree(x)?"free":"signed")===val, caps:x=>capBand(x)===val,
      pos:x=>posOf(x)===val, age:x=>ageBand(x)===val, form:x=>formBand(x)===val,
    })[group](p)).length;
    // Hide an option nobody matches, unless it is ticked — a checked box that
    // vanished would look like the filter had broken. An empty row is a dead
    // control that costs a reader a moment every time they scan the sidebar.
    if(!n&&!f.has(val))return "";
    shown++;
    return `<label class="opt"><input type="checkbox" data-g="${group}" value="${esc(val)}"${f.has(val)?" checked":""}>
      ${esc(label)}<span class="n">${n}</span></label>`;
  }).join("");
  if(!shown)return "";
  return `<div class="fgroup"><div class="h">${esc(title)}</div>${body}</div>`;
}
function drawFilters(){
  $("filters").innerHTML=
    facet("Track","track",[["dual","Dual nationality"],["single","Egyptian only"]])
   // "other" stays in the list but only appears when it has members — a country
   // the crawl reaches that no region names is a bug worth seeing, not a
   // permanent empty row.
   +facet("Region","region",[["eu","Europe"],["gulf","Gulf & Middle East"],["afr","Africa"],
                             ["amer","Americas"],["asia","Asia & Oceania"],["free","No club"],
                             ["other","Region not mapped"]])
   +facet("Club status","club",[["signed","At a club"],["free","Free agent"]])
   +facet("International","caps",[["senior","Senior caps"],["youth","Youth only"],["none","Never capped"]])
   +facet("Position","pos",POS)
   +facet("Age","age",[["u18","18 or under"],["u21","19–21"],["u23","22–23"],["24","24+"]])
   +facet("Club form","form",[["hot","Regular"],["mid","Rotating"],["bench","Benched"],["cold","Out of favour"]])
   +`<button class="clearf" id="clearf">Clear all filters</button>`;

  $("filters").querySelectorAll("input[data-g]").forEach(cb=>cb.onchange=()=>{
    const set=S.f[cb.dataset.g];
    cb.checked?set.add(cb.value):set.delete(cb.value);
    draw();
  });
  $("clearf").onclick=()=>{Object.values(S.f).forEach(s=>s.clear());draw();};
}

/* ---------- render: detail panel ---------- */
// Newest first, matching Transfermarkt and every other list on this page. The
// store keeps them oldest-first, so the panel opened on a move from 2016 while
// the row above it showed the player's situation today.
//
// The fee is the useful column and was not shown at all: "Free Transfer" and
// "loan transfer" are the difference between a signing and a temporary move, and
// a scout reads the list to find exactly that.
function trBlock(p){
  const tr=(p.tr||[]).slice().reverse();
  if(!tr.length)return `<div class="prow"><span>No transfer record</span><b></b></div>`;
  return `<table class="mtable">${tr.slice(0,8).map(t=>{
    const fee=(t.fee||"").trim();
    const free=/free|loan|end of/i.test(fee);
    return `<tr>
      <td class="d">${esc(t.date||"")}</td>
      <td class="o">${esc(t.from||"?")} <span class="arr">→</span> <b>${esc(t.to||"?")}</b></td>
      <td class="r">${fee&&fee!=="-"&&fee!=="?"?`<span class="fee${free?" f":""}">${esc(fee)}</span>`:""}</td>
    </tr>`;}).join("")}</table>`;
}
// Every international appearance, grouped by the side he played for. This is the
// evidence behind the caps column: a scout who sees 0/26 needs to be able to
// check it rather than take the number on trust.
function natBlock(p){
  const g=(MSTATS[p.tm_id]||{}).natl||[];
  if(!g.length)return "";
  const by=new Map();
  g.forEach(x=>{const k=x.team||"—";if(!by.has(k))by.set(k,[]);by.get(k).push(x);});
  const teams=[...by.entries()].sort((a,b)=>b[1].length-a[1].length);

  const blocks=teams.map(([team,gs])=>{
    const played=gs.filter(x=>x.part==="P").length;
    const youth=isYouth(team);
    const rows=gs.slice(0,8).map(x=>{
      const ret=[(x.g?x.g+"G":""),(x.a?x.a+"A":"")].filter(Boolean).join(" ");
      return `<tr>
        <td class="d">${esc((x.d||"").slice(2))}</td>
        <td class="o">${esc(x.opp||"—")}<small>${esc(x.cn||"")}</small></td>
        <td class="r">${x.part==="P"?(x.min?`${x.min}'`:"played")
          :x.part==="B"?`<span class="d">bench</span>`:`<span class="d">out</span>`}${ret?` <b>${esc(ret)}</b>`:""}</td>
      </tr>`;}).join("");
    return `<div class="ntgrp">
      <div class="ntgh"><b class="${youth?"y":"sr"}">${esc(team)}</b>
        <span>${played} played of ${gs.length}${youth?"":" · senior"}</span></div>
      <table class="mtable">${rows}</table>
      ${gs.length>8?`<div class="more">+${gs.length-8} more</div>`:""}</div>`;
  }).join("");

  // Senior caps FOR EGYPT are not a problem — they mean he already plays for
  // Egypt. Reading "cap-tied" on a senior Egypt international inverts the whole
  // point: Hamza Abdelkarim has 6 caps for Egypt and the panel called him
  // unavailable.
  const c=caps(p);
  const seniorTeams=(MSTATS[p.tm_id]||{}).natl
    ?[...new Set(((MSTATS[p.tm_id]||{}).natl||[])
       .filter(x=>x.part==="P"&&isSenior(x.team)).map(x=>x.team))]:[];
  const forEgypt=seniorTeams.length&&seniorTeams.every(t=>/^egypt/i.test(t||""));
  // "No senior appearances" is a clearance, so it must not be issued over data we
  // could not read. If some sides are unnamed, say so instead of implying a check
  // that did not happen.
  const verdict=!c.senior&&c.unknown
    ? `<b>${c.unknown} appearance${c.unknown===1?"":"s"} for an unnamed side</b> — not yet resolved to a senior or youth team, so eligibility is unconfirmed.`
    :!c.senior
    ? `<b class="ok">No senior appearances</b> — youth caps do not cap-tie, so he can still be selected.`
    : forEgypt
      ? `<b class="ok">${c.senior} senior cap${c.senior===1?"":"s"} for Egypt</b> — already committed, and playing.`
      : `<b class="sr">${c.senior} senior appearance${c.senior===1?"":"s"} for ${esc(seniorTeams.join(", "))}</b> — cap-tied under FIFA Article 9.`;
  return `<div class="psec">National team · ${g.length} call-ups</div>
    <div class="verdict">${verdict}</div>${blocks}`;
}
function openPanel(id){
  const p=DATA.find(x=>x.tm_id===id); if(!p)return;
  S.sel=id;
  const m=MSTATS[id]||{};
  const st=p.st||{};
  const face=p.photo?`<img class="face" src="${esc(p.photo)}" alt="">`
                    :`<span class="face ini">${esc(initials(p.name))}</span>`;

  const kpi=(v,l)=>`<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
  const mins=st.m?Math.round(st.m/90):0;

  // Season trajectory. Bars, not a line: six seasons is too few for a line to
  // read as anything, and the comparison is between years, not a continuum.
  let traj="";
  if((m.traj||[]).length>1){
    const t=m.traj.slice(-6), max=Math.max(...t.map(x=>x.m||0))||1;
    traj=`<div class="psec">Season by season</div>
      <div class="spark">${t.map(x=>`<div style="height:${Math.max(4,Math.round((x.m||0)/max*100))}%" title="${esc(x.s)} — ${x.a||0} apps, ${x.m||0} mins"></div>`).join("")}</div>
      <div class="sparkx">${t.map(x=>`<span>${esc(String(x.s).slice(-2))}</span>`).join("")}</div>`;
  }

  const form=(m.form||[]).slice(0,6).map(f=>`<tr>
      <td class="d">${esc((f.fd||"").slice(5))}</td>
      <td class="o">${esc(f.opp||f.cn||"—")}<small>${esc(f.cn||"")}</small></td>
      <td class="r"><span class="res ${esc(f.r||"D")}">${esc(f.sc||"")}</span></td>
      <td class="r">${f.part==="P"?(f.min?f.min+"'":"played"):f.part==="B"?"<span class='d'>bench</span>":"<span class='d'>out</span>"}</td>
    </tr>`).join("");

  const nx=NEXTM[id];
  $("panel").innerHTML=`
    <div class="phead">${face}
      <div><h2>${esc(p.name)}</h2>
        <div class="sub">${esc(p.age||"?")} · ${esc(p.position||"")} · ${esc(p.club||"")}</div></div>
      <button class="pclose" id="pclose" aria-label="Close">×</button></div>
    <div class="pbody">
      <div class="kpis">${kpi(st.a||0,"apps")}${kpi(st.g||0,"goals")}${kpi(st.as||0,"assists")}${kpi(mins+"","90s")}</div>
      <div class="psec">Profile</div>
      <div class="prow"><span>Citizenship</span><b>${esc(p.citizenship||"—")}</b></div>
      <div class="prow"><span>Born</span><b>${esc(p.birthplace||"—")}</b></div>
      <div class="prow"><span>Market value</span><b>${esc(p.mv_now||"—")}</b></div>
      <div class="prow"><span>National team</span><b>${esc(p.national_team||"not called up")}${p.caps&&p.caps!=="0"?" · "+esc(p.caps)+" caps":""}</b></div>
      ${nx?`<div class="psec">Next match</div>
        <div class="prow"><span>${esc(nx.date||"")}${nx.time?" "+esc(nx.time):""}</span><b>${esc(nx.opp||"")}</b></div>`:""}
      ${form?`<div class="psec">Recent club matches</div><table class="mtable">${form}</table>`:""}
      ${traj}
      ${natBlock(p)}
      <div class="psec">Transfer history</div>
      ${trBlock(p)}
    </div>`;
  $("panel").classList.add("open");
  $("scrim").classList.add("on");
  $("pclose").onclick=closePanel;
  // drawBody, not drawTable: opening a player from the Fixtures or National view
  // must redraw the view you are in, not silently swap it for the roster.
  drawBody();
}
function closePanel(){
  S.sel=null;
  $("panel").classList.remove("open");
  $("scrim").classList.remove("on");
  drawBody();
}

/* ---------- shell ---------- */
// Roster/dual/single are three cuts of ONE table, driven by the track facet.
// Fixtures and National teams are different questions about the same players and
// draw their own body. Keeping the distinction explicit stops the nav from
// pretending a view is a filter or the reverse.
const TRACKVIEWS=new Set(["roster","dual","single"]);
function drawNav(){
  const n=DATA.length, dual=DATA.filter(p=>p.track==="dual").length;
  const withFix=DATA.filter(p=>NEXTM[p.tm_id]).length;
  const withMatch=DATA.filter(p=>{const s=status(p);return s&&s.n;}).length;
  const withNat=DATA.filter(p=>((MSTATS[p.tm_id]||{}).natl||[]).length).length;
  $("nav").innerHTML=[
    ["roster","Roster",n],
    ["dual","Dual nationality",dual],
    ["single","Egyptian only",n-dual],
    ["scout","Scouting mode",withMatch],
    ["fix","Fixtures",withFix],
    ["nat","National teams",withNat],
  ].map(([k,l,c])=>`<button data-v="${k}"${S.view===k?' class="on"':""}>${esc(l)}<span class="n">${c}</span></button>`).join("");
  $("nav").querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{
    S.view=b.dataset.v;
    // The nav is a shortcut into the same facet the sidebar exposes, so the two
    // can never show different things.
    if(TRACKVIEWS.has(S.view)){
      S.f.track.clear();
      if(S.view!=="roster")S.f.track.add(S.view);
    }
    draw();
  });
}

/* ---------- view: fixtures ---------- */
// Where each player's club goes next. The fixture is the CLUB's game — it says
// they play on Saturday, not that he is picked — so the squad strip sits beside
// it. That pairing is the whole point: a next fixture without recent squad status
// tells a scout nothing about whether to watch it.
// "Aug 15, 2026" sorts as text into April-first nonsense, so parse it. Date is
// the only sort this view is really for: a scout plans a week, and the question
// is "who plays next", not "who is called A".
const FXKEY={
  date:p=>{const d=Date.parse((NEXTM[p.tm_id]||{}).date||"");return isNaN(d)?8.64e15:d;},
  name:p=>(p.name||"").toLowerCase(),
  club:p=>(p.club||"").toLowerCase(),
  opp: p=>((NEXTM[p.tm_id]||{}).opp||"").toLowerCase(),
  form:p=>{const s=status(p);return s?s.played*10-s.out:-99;},
};
function drawFixtures(){
  let list=rows().filter(p=>NEXTM[p.tm_id]);
  $("count").innerHTML=`${list.length}<small>with a fixture</small>`;
  if(!list.length){
    $("body").innerHTML=`<div class="empty"><b>No upcoming fixtures</b>Leagues publish 26/27 dates at different times, so this fills in through pre-season.</div>`;
    return;
  }
  // Default to soonest first. rows() has already sorted by the roster's key,
  // which is meaningless here.
  const fk=FXKEY[S.fxsort]||FXKEY.date;
  list=list.slice().sort((a,b)=>{
    const ka=fk(a),kb=fk(b);
    if(ka<kb)return -S.fxdir; if(ka>kb)return S.fxdir;
    return (a.name||"").localeCompare(b.name||"");
  });
  const body=list.map(p=>{
    const f=NEXTM[p.tm_id], m=MSTATS[p.tm_id]||{};
    const crest=CRESTS[f.oid]?`<img class="cc" src="${esc(CRESTS[f.oid])}" alt="" loading="lazy">`:"";
    const strip=stripHTML(p,6);
    const g=signal(p);
    return `<tr data-id="${esc(p.tm_id)}">
      <td><span class="who">${p.photo?`<img class="face" src="${esc(p.photo)}" alt="" loading="lazy">`
        :`<span class="face ini">${esc(initials(p.name))}</span>`}<span class="nm"><b>${esc(p.name)}</b>
        <span>${esc(p.club||"")}</span></span></span></td>
      <td class="hide-s"><b>${esc(f.date||"—")}</b><small class="cn">${esc(f.time||"")}</small></td>
      <td>${f.ha==="H"?'<span class="tag">Home</span>':'<span class="tag">Away</span>'} ${crest}${esc(f.opp||"—")}</td>
      <td class="hide-s">${strip}</td>
      <td class="hide-s">${g?`<span class="sig ${g[0]}">${g[1]}</span>`:`<span class="nostrip">—</span>`}</td></tr>`;
  }).join("");
  // No Club column: the player cell already carries it as a subtitle, and a
  // second copy would cost a column on a view whose job is dates.
  const FXCOLS=[["name","Player",""],["date","Kick-off","hide-s"],["opp","Opponent",""],
                ["form","Last 6","hide-s"]];
  const head=FXCOLS.map(([k,label,cls])=>{
    const on=S.fxsort===k;
    return `<th class="${cls}${on?" sorted":""}" data-fx="${k}">${esc(label)}<span class="ar">${on?(S.fxdir>0?"▲":"▼"):"▲"}</span></th>`;
  }).join("");
  $("body").innerHTML=`<table class="grid"><thead><tr>${head}<th class="hide-s">Signal</th></tr></thead><tbody>${body}</tbody></table>`;
  $("body").querySelectorAll("th[data-fx]").forEach(th=>th.onclick=()=>{
    const k=th.dataset.fx;
    // Dates and text both read best ascending -- soonest first, A to Z. Form is
    // the one where "best first" means descending.
    if(S.fxsort===k)S.fxdir=-S.fxdir; else {S.fxsort=k;S.fxdir=k==="form"?-1:1;}
    drawFixtures();
  });
  $("body").querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick=()=>openPanel(tr.dataset.id));
}

/* ---------- view: national teams ---------- */
// ONE ROW PER PLAYER, grouped by what his caps mean for eligibility.
//
// This was grouped by side, and it did not survive real data. A player appears
// for every team he has ever played for -- Salah has five, Ahmed Hegazy five --
// so 71 capped players rendered as 142 rows across 30 groups, the same face over
// and over. Reading it, you could not answer the only question the tab exists
// for: can Egypt still call him?
//
// Under Article 9 that question has exactly three answers, and they are about the
// player, not the side. Every team he has played for is still shown, as badges on
// his row, so nothing is lost -- it is just no longer the organising principle.
const NATBUCKETS=[
  ["tied", "Cap-tied elsewhere", "A senior appearance for another country. Under FIFA Article 9 he can no longer switch."],
  ["egypt","Senior caps for Egypt", "Already committed and playing. These are the successes, not the targets."],
  ["open", "Youth caps only — still selectable", "Youth appearances never cap-tie. Every one of these players remains available to Egypt."],
];
function natBucket(p){
  const played=((MSTATS[p.tm_id]||{}).natl||[]).filter(x=>x.part==="P");
  const snr=[...new Set(played.filter(x=>isSenior(x.team)).map(x=>x.team))];
  if(!snr.length)return "open";
  return snr.every(t=>/^egypt/i.test(t))?"egypt":"tied";
}
function drawNational(){
  const list=rows().filter(p=>((MSTATS[p.tm_id]||{}).natl||[]).length);
  $("count").innerHTML=`${list.length}<small>with caps</small>`;
  if(!list.length){
    $("body").innerHTML=`<div class="empty"><b>Nobody matches</b>No player in this filter has a national-team appearance.</div>`;
    return;
  }
  // Every side he has played for, senior first, as badges. This is what the old
  // grouping conveyed; carrying it on the row costs one line and keeps the page
  // one row per player.
  const sides=p=>{
    const played=((MSTATS[p.tm_id]||{}).natl||[]).filter(x=>x.part==="P");
    const by=new Map();
    played.forEach(x=>{const t=(x.team||"").trim();if(!t)return;by.set(t,(by.get(t)||0)+1);});
    return [...by.entries()]
      .sort((a,b)=>(isYouth(a[0])?1:0)-(isYouth(b[0])?1:0)||b[1]-a[1])
      .map(([t,n])=>{
        const flag=NATIDS[t]&&CRESTS[NATIDS[t]]
          ?`<img class="cc" src="${esc(CRESTS[NATIDS[t]])}" alt="" loading="lazy">`:"";
        return `<span class="side ${isYouth(t)?"y":/^egypt/i.test(t)?"eg":"sr"}" title="${esc(t)} — ${n} appearance${n===1?"":"s"}">${flag}${esc(t)}<i>${n}</i></span>`;
      }).join("");
  };
  $("body").innerHTML=NATBUCKETS.map(([key,label,note])=>{
    const g=list.filter(p=>natBucket(p)===key);
    if(!g.length)return "";
    g.sort((a,b)=>caps(b).senior-caps(a).senior||(a.name||"").localeCompare(b.name||""));
    return `<div class="ntgrp">
      <div class="ntgh"><b class="${key==="tied"?"sr":key==="egypt"?"eg":"y"}">${esc(label)}</b>
        <span>${g.length} player${g.length===1?"":"s"}</span></div>
      <p class="ntnote">${esc(note)}</p>
      <table class="grid"><tbody>${g.map(p=>`<tr data-id="${esc(p.tm_id)}">
        <td><span class="who">${p.photo?`<img class="face" src="${esc(p.photo)}" alt="" loading="lazy">`
          :`<span class="face ini">${esc(initials(p.name))}</span>`}<span class="nm"><b>${esc(p.name)}</b>
          <span>${esc(p.position||"")} · ${esc(p.club||"")}</span></span></span></td>
        <td class="r num hide-s">${esc(p.age||"—")}</td>
        <td class="sides hide-s">${sides(p)}</td>
        <td class="r">${capsCell(p)}</td></tr>`).join("")}</tbody></table></div>`;
  }).join("");
  $("body").querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick=()=>openPanel(tr.dataset.id));
}

/* ---------- view: scouting ---------- */
// Squad status across each player's last ten CLUB matchdays — started, benched,
// or left out entirely. A run of grey says more about a prospect's standing than
// any career total, which is why this is a view of its own rather than a column.
//
// Grouped by position because that is how a scout reads a list: nobody compares
// a keeper's minutes to a winger's. One shared colgroup keeps the columns aligned
// across all four tables — sized per-table they step out of line between groups.
const SCGRP=[["GK","Goalkeepers"],["DF","Defenders"],["MF","Midfield"],["FW","Forwards"]];
function drawScouting(){
  const list=rows().filter(p=>{const s=status(p);return s&&s.n;});
  $("count").innerHTML=`${list.length}<small>with match data</small>`;
  if(!list.length){
    $("body").innerHTML=`<div class="empty"><b>Nobody matches</b>No player in this filter has recent club match data.</div>`;
    return;
  }
  const row=p=>{
    const m=MSTATS[p.tm_id]||{}, s=m.status||{}, g=signal(p);
    const strip=stripHTML(p,10);
    const ga=(s.g||s.a)?`${s.g?s.g+"G":""}${s.g&&s.a?" ":""}${s.a?s.a+"A":""}`:"—";
    const crest=CRESTS[p.club_id]?`<img class="cc" src="${esc(CRESTS[p.club_id])}" alt="" loading="lazy">`:"";
    return `<tr data-id="${esc(p.tm_id)}">
      <td><span class="who">${p.photo?`<img class="face" src="${esc(p.photo)}" alt="" loading="lazy">`
        :`<span class="face ini">${esc(initials(p.name))}</span>`}<span class="nm"><b>${esc(p.name)}</b>
        <span>${esc(p.age||"")} · ${crest}${esc(p.club||"")}</span></span></span></td>
      <td>${strip}</td>
      <td class="hide-s tally"><b>${s.played||0}</b> played · ${s.bench||0} bench · ${s.out||0} out</td>
      <td class="r num hide-s">${esc(ga)}</td>
      <td class="c">${g?`<span class="sig ${g[0]}">${g[1]}</span>`:`<span class="nostrip">—</span>`}</td>
      <td class="r hide-s"><small class="cn">${esc(s.latest_date||"")}</small></td></tr>`;
  };
  const cols=`<colgroup><col class="c-pl"><col class="c-st"><col class="c-ta"><col class="c-ga"><col class="c-sg"><col class="c-dt"></colgroup>`;
  const head=`<thead><tr><th>Player</th><th>Last 10 club games</th>
    <th class="hide-s">Squad status</th><th class="r hide-s">G/A</th>
    <th class="c">Signal</th><th class="r hide-s">Last game</th></tr></thead>`;
  $("body").innerHTML=`<div class="sclegend">
      <span><i class="P"></i>played</span><span><i class="B"></i>benched</span>
      <span><i class="O"></i>not in squad</span>
      <span>oldest → newest · hover a block for the match, goals and assists</span></div>`
    +SCGRP.map(([k,label])=>{
      const g=list.filter(p=>posOf(p)===k);
      if(!g.length)return "";
      return `<div class="scgrp"><div class="ntgh"><b>${esc(label)}</b><span>${g.length}</span></div>
        <table class="grid sctbl">${cols}${head}<tbody>${g.map(row).join("")}</tbody></table></div>`;
    }).join("");
  $("body").querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick=()=>openPanel(tr.dataset.id));
}

function drawBody(){
  if(S.view==="fix")return drawFixtures();
  if(S.view==="nat")return drawNational();
  if(S.view==="scout")return drawScouting();
  drawTable();
}
function draw(){ drawNav(); drawFilters(); drawBody(); }

async function boot(){
  const load=n=>fetch(`data/${n}.json`).then(r=>r.json()).catch(()=>({}));
  [DATA,MSTATS,CRESTS,NEXTM,NATIDS]=await Promise.all(
    ["data","mstats","crests","nextm","natids"].map(load));
  // Copied from the dossier, where hiding a cap-tied player is right: that site
  // lists who Egypt can still sign. Here it is wrong. This registry answers "who
  // is out there at all", and a player cap-tied to Qatar is still an Egyptian
  // abroad — the International facet already says so, in a column built for it.
  // Left in, the filter made the file say 172 and the page say 170.
  DATA=DATA||[];
  draw();

  $("q").oninput=e=>{S.q=e.target.value;drawBody();drawFilters();};
  $("scrim").onclick=closePanel;
  $("menu").onclick=()=>$("side").classList.toggle("open");
  document.addEventListener("keydown",e=>{ if(e.key==="Escape")closePanel(); });

  const t=$("theme");
  t.onclick=()=>{
    const cur=document.documentElement.getAttribute("data-theme");
    const next=cur==="light"?"dark":"light";
    document.documentElement.setAttribute("data-theme",next);
    try{localStorage.setItem("reg-theme",next);}catch(_){}
  };
  try{const saved=localStorage.getItem("reg-theme");
      if(saved)document.documentElement.setAttribute("data-theme",saved);}catch(_){}
}
boot();
