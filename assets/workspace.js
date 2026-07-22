/* Egyptians Abroad — scouting workspace.
   Table-first, filters persistent, detail in a side panel so a scout working
   through 152 players never loses their place in the list. */

let DATA=[],MSTATS={},CRESTS={},NEXTM={},NATIDS={};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const initials=n=>(n||"?").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
const num=v=>{const n=parseInt(v,10);return isNaN(n)?0:n;};

/* ---------- state ---------- */
const S={view:"roster",q:"",sort:"name",dir:1,sel:null,
         f:{track:new Set(),region:new Set(),club:new Set(),pos:new Set(),age:new Set(),form:new Set()}};
// A player between clubs is available now and needs no fee — the single most
// actionable state in the dossier, and previously only findable by searching the
// words "free agent".
const isFree=p=>/free agent|without club/i.test(p.club||"");

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
  ["apps","Apps","r"],["goals","G","r"],["mv","Value","r"],
];
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
    const sq=(m.squad||[]).slice(0,10).slice().reverse();
    const did=x=>x.s==="P"?(x.min?`${x.min}' played`:"played")
              :x.s==="B"?"unused sub":"not in squad";
    const ret=x=>[(x.g?x.g+"G":""),(x.a?x.a+"A":"")].filter(Boolean).join(" ");
    const strip=sq.length
      ? `<span class="strip">${sq.map(x=>{
          const r=ret(x);
          return `<i class="${x.s}" title="${esc(x.d||"")} ${esc(x.cn||"")}${x.opp?" vs "+esc(x.opp):""} — ${esc(did(x))}${r?" · "+esc(r):""}"></i>`;
        }).join("")}</span>`
      : `<span class="nostrip">—</span>`;
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
  const body=opts.map(([val,label])=>{
    const n=DATA.filter(p=>passes(p,group)&&({
      track:x=>x.track===val, region:x=>regionOf(x)===val,
      club:x=>(isFree(x)?"free":"signed")===val,
      pos:x=>posOf(x)===val, age:x=>ageBand(x)===val, form:x=>formBand(x)===val,
    })[group](p)).length;
    return `<label class="opt"><input type="checkbox" data-g="${group}" value="${esc(val)}"${f.has(val)?" checked":""}>
      ${esc(label)}<span class="n">${n}</span></label>`;
  }).join("");
  return `<div class="fgroup"><div class="h">${esc(title)}</div>${body}</div>`;
}
function drawFilters(){
  $("filters").innerHTML=
    facet("Track","track",[["dual","Dual nationality"],["single","Egyptian only"]])
   +facet("Region","region",[["eu","Europe"],["gulf","Gulf & Middle East"],["afr","Africa"],
                             ["amer","Americas"],["asia","Asia & Oceania"],["other","Unclassified"]])
   +facet("Club status","club",[["signed","At a club"],["free","Free agent"]])
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
      <div class="psec">Transfers</div>
      ${(p.tr||[]).slice(0,6).map(t=>`<div class="prow"><span>${esc(t.date||"")}</span><b>${esc(t.from||"")} → ${esc(t.to||"")}</b></div>`).join("")||`<div class="prow"><span>No transfer record</span><b></b></div>`}
    </div>`;
  $("panel").classList.add("open");
  $("scrim").classList.add("on");
  $("pclose").onclick=closePanel;
  drawTable();
}
function closePanel(){
  S.sel=null;
  $("panel").classList.remove("open");
  $("scrim").classList.remove("on");
  drawTable();
}

/* ---------- shell ---------- */
function drawNav(){
  const n=DATA.length, dual=DATA.filter(p=>p.track==="dual").length;
  $("nav").innerHTML=[
    ["roster","Roster",n],
    ["dual","Dual nationality",dual],
    ["single","Egyptian only",n-dual],
  ].map(([k,l,c])=>`<button data-v="${k}"${S.view===k?' class="on"':""}>${esc(l)}<span class="n">${c}</span></button>`).join("");
  $("nav").querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{
    S.view=b.dataset.v;
    // The nav is a shortcut into the same facet the sidebar exposes, so the two
    // can never show different things.
    S.f.track.clear();
    if(S.view!=="roster")S.f.track.add(S.view);
    draw();
  });
}
function draw(){ drawNav(); drawFilters(); drawTable(); }

async function boot(){
  const load=n=>fetch(`data/${n}.json`).then(r=>r.json()).catch(()=>({}));
  [DATA,MSTATS,CRESTS,NEXTM,NATIDS]=await Promise.all(
    ["data","mstats","crests","nextm","natids"].map(load));
  DATA=(DATA||[]).filter(p=>p.status!=="CAP_TIED_ELSEWHERE");
  draw();

  $("q").oninput=e=>{S.q=e.target.value;drawTable();drawFilters();};
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
