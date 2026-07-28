/* Egyptians Abroad — scouting workspace.
   Table-first, filters persistent, detail in a side panel so a scout working
   through 152 players never loses their place in the list. */

let DATA=[],MSTATS={},CRESTS={},NEXTM={},NATIDS={},NATFIX={},SOFA={};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const initials=n=>(n||"?").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
const num=v=>{const n=parseInt(v,10);return isNaN(n)?0:n;};

/* ---------- state ---------- */
// fxsort is separate from sort: the roster and the fixtures list answer different
// questions, and carrying one sort across both meant opening Fixtures showed them
// alphabetically when the only useful order is who plays soonest.
const S={view:"roster",q:"",sort:"name",dir:1,fxsort:"date",fxdir:1,fxview:"list",
         // Scouting defaults to most-played first: the table exists to rank, and
         // an unsorted list makes the reader do the ranking.
         scsort:"played",scdir:-1,scflat:false,sel:null,onlySaved:false,
         f:{based:new Set(),track:new Set(),region:new Set(),club:new Set(),caps:new Set(),pos:new Set(),age:new Set(),form:new Set()}};
// A player between clubs is available now and needs no fee — the single most
// actionable state in the dossier, and previously only findable by searching the
// words "free agent".
const isFree=p=>/free agent|without club/i.test(p.club||"");
// Where he plays, home or abroad — the platform's top-level split. registry.py
// writes `based`; older builds do not carry it, so fall back to plays_in rather
// than reporting every player as abroad.
const basedOf=p=>p.based||((p.plays_in==="Egypt")?"egypt":"abroad");
const capBand=p=>{const c=caps(p);return c.senior?"senior":c.youth?"youth":"none";};

/* ---------- shortlist ----------
   Saved players, kept in localStorage. No account, no email, no password, no
   server: the same mechanism that already remembers the theme.

   The honest limit, stated rather than discovered: this is per BROWSER. A list
   made on a laptop is not the list on a phone. Sharing is by URL instead
   (?list=id,id) so "send me your shortlist" is a link, still with no account.

   Every read goes through these two functions so a corrupted or absent value
   degrades to an empty list rather than throwing on boot -- localStorage can be
   disabled entirely, and a scouting page must still render when it is. */
const LIST_KEY="reg-shortlist";
function listGet(){
  try{
    const raw=localStorage.getItem(LIST_KEY);
    return new Set(raw?JSON.parse(raw):[]);
  }catch(_){ return new Set(); }
}
function listSet(s){
  try{ localStorage.setItem(LIST_KEY,JSON.stringify([...s])); }catch(_){}
}
let SHORT=new Set();
// Ids imported from a ?list= link while signed out. Held apart from SHORT so
// that signing in can push them up as the reader's own choice, without also
// adopting whatever the previous person on this browser had starred.
let SHARED=new Set();
const isSaved=p=>SHORT.has(p.tm_id);
function toggleSave(id){
  // A shortlist needs an account, exactly as notes do. Both are the scout's own
  // judgement rather than public record, and having one gated and the other not
  // was arbitrary from the reader's side: the same star silently meant "kept
  // forever" or "kept until this browser forgets" depending on a state nothing
  // on the row showed.
  //
  // Saving is also the natural moment to ask. You have found someone worth
  // keeping, so the account is the thing that keeps him -- not a toll charged
  // before you have seen anything.
  if(typeof Auth==="undefined"||!Auth.user){
    authOpen("signin");
    return;
  }
  const adding=!SHORT.has(id);
  adding?SHORT.add(id):SHORT.delete(id);
  listSet(SHORT);
  // Mirror to the server, and do not wait for it. The star must respond
  // instantly; if the write fails the local copy is still correct and the next
  // sign-in reconciles from the server.
  (adding?Auth.track(id):Auth.untrack(id)).catch(()=>{});
  // Unsaving the LAST player must also release the saved-only filter. The toggle
  // hides itself when the list is empty, so leaving the flag set left the page
  // filtered to nothing with no visible control to undo it -- an empty screen and
  // no way back. Same for the My list view, which would sit there showing zero.
  if(!SHORT.size){
    S.onlySaved=false;
    if(S.view==="mine")S.view="roster";
  }
  // Redraw the nav too: its count is the only thing on screen that says how
  // many are saved, and a star that does not move that number reads as broken.
  draw();
}

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
  // Egypt, first and on its own. It was in no list at all: this file was written
  // when every player was abroad, so Egypt could not be an answer and 554
  // domestic players fell through to "Region not mapped" — a label that reads as
  // missing data about the one country whose data is most complete.
  //
  // Kept separate from Africa rather than folded into it. For this audience
  // "at home" and "on the continent" are different questions, and a filter that
  // answered them together would be useless for both.
  if(c==="Egypt")return "egy";
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
  // 24-26 and 27+ rather than one "24+" bucket of 62. A 24-year-old who has not
  // been capped is still a prospect; a 37-year-old is a different proposition
  // entirely, and lumping them together made the largest band the least useful
  // one. The break at 26 is also where the dossier stops, so the two sites agree
  // on what "still a prospect" means.
  if(a<=26)return "24";
  return "27";
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
  const c={
    senior:played.filter(x=>isSenior(x.team)).length,
    youth: played.filter(x=>isYouth(x.team)).length,
    // Named neither way. Shown rather than silently dropped, so a gap in the
    // club-name map reads as "unresolved" instead of quietly inflating a count.
    unknown:played.filter(x=>!(x.team||"").trim()).length,
    total: g.length,
    teams:[...new Set(g.map(x=>x.team).filter(Boolean))],
  };
  // TM states caps on the PROFILE and lists the matches separately, and for some
  // players it publishes the first without the second: Hussein Mehasseb's profile
  // says 2 caps for Egypt U20 and his match feed has no national games at all.
  // Four players are in that state. Falling through to 0/0 said "never capped"
  // about someone TM says is capped, so trust the stated figure when there are no
  // rows to count -- and file it as YOUTH only when the named side is a youth one,
  // because inventing a senior cap is the one error worth never making.
  if(!c.total&&p.national_team&&/^\d+$/.test(String(p.caps||""))&&+p.caps>0){
    const n=+p.caps;
    if(isYouth(p.national_team)){ c.youth=n; c.stated=true; }
    else { c.senior=n; c.stated=true; }
    c.total=n; c.teams=[p.national_team];
  }
  return c;
}
/* Squad status over the last ten club games.

   Judged as a SHARE of the games in the window, not on raw counts. The counts
   assumed a full ten: a player with four matches on record and two starts was
   measured against thresholds meant for ten, and came out looking marginal when
   he had started half of everything available.

   "Rotating" was also the fall-through -- anything matching no earlier rule
   landed there -- so Mohamed El Shenawy, 1 played and 7 on the bench, was called
   rotating. He is a backup goalkeeper. 30 players with six or more bench
   appearances carried the same label, which made the one word that should mean
   "in and out of the side" mean "we could not classify him".

   Benched and out-of-favour are now decided BEFORE rotating, and rotating has to
   be earned: a real share of starts, not merely the absence of another verdict. */
function signal(p){
  const s=status(p);
  if(!s||!s.n)return null;
  const n=s.n, played=s.played||0, bench=s.bench||0, out=s.out||0;
  // Never played: the distinction that matters is whether he is IN the squad and
  // unused, or not in it at all.
  if(!played)return bench>=out?["bench","benched"]:["cold","not in squad"];

  // PLAYING FIRST. What a player DID outranks what he did not: Omar Gaber
  // started five of ten and sat out five, and an out-first rule called him "out
  // of favour" -- of a man in half the side's games. Half the available matches
  // is a squad player by any reading.
  if(played>=n*0.7)return ["hot","regular"];
  if(played>=n*0.4)return ["mid","rotating"];

  // Below that, HOW he is absent decides the word. An unused substitute is in
  // the manager's plans; a player left out of the squad is not, and calling both
  // the same thing loses the distinction a scout is looking for.
  //
  // Compared against each other rather than against a threshold: Shefo, four
  // played and six benched, cleared every fixed bench cut-off and still landed
  // on "rotating" because 4 of 10 met the rotation share. He is a substitute who
  // sometimes comes on.
  if(bench>out)return ["bench","benched"];
  if(out>=n*0.5)return ["cold","out of favour"];
  return ["cold","fringe"];
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
  // WHICH club he played for. The tooltip named the opponent and never his own
  // side, so Hossam Abdelmaguid's strip read "home to Enppi SC" while his row
  // said Ludogorets Razgrad — that match was for Zamalek, before the transfer.
  //
  // 14 players' last ten span more than one club, and the reason is usually the
  // most interesting thing on the row: a reserve-team player turning out for the
  // first team is the promotion moment a scout is looking for. Shown only when
  // the side differs from his current club, so the other 149 rows stay terse.
  if(f&&f.side&&f.side!==p.club)bits.push(`for ${f.side}`);
  if(x.opp)bits.push(`${f&&f.v==="away"?"away at":f?"home to":"vs"} ${x.opp}`);
  // 19% of blocks have no matching row in form[], so the side, score and venue
  // are unavailable for them. Say so. Staying silent implies the match was for
  // his current club, which is exactly the wrong inference on the 14 players
  // whose recent games span two.
  if(!f)bits.push("club and score not on record");
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
  // Keepers only. On an outfielder's tooltip "clean sheet" reads as his own,
  // and it is his whole team's.
  // Keepers get both numbers; a defender gets only the clean sheet. "2 conceded"
  // on a full-back's tooltip reads as his responsibility, and it is his whole
  // side's -- the same reason the cards do not show him goals against.
  if(isDefensive(p)&&f&&x.s==="P"&&(x.min||0)>0){
    const c=conceded(f);
    if(c===0)bits.push("clean sheet");
    else if(c!==null&&isKeeper(p))bits.push(`${c} conceded`);
  }
  return bits.filter(Boolean).join(" · ");
}
// A goal or an assist gets a star. A green block that was a goal is not the same
// as a green block that was a quiet 90 minutes, and scanning for the difference
// is the entire reason a scout reads this strip.
/* ---------- defensive record ----------
   A goalkeeper's card led with "0 goals, 0 assists", which is true and useless.
   What a scout asks about a keeper or a defender is how many goals went in
   behind him and how often none did.

   Nothing new is scraped: every form row already carries the score and the
   result. `sc` is written OWN TEAM FIRST -- verified against the stated W/L/D on
   all 9,360 rows in the file: own-first agrees 9,360 times and disagrees zero,
   while treating it as home-away agrees only 64% of the time. Flipping by venue
   would therefore have inverted goals conceded on every away match, and the
   result would have looked entirely plausible.

   PLAYED MATCHES ONLY. The first keeper I checked showed 6, 3, 2, 1, 0 and 2
   conceded across his last six rows -- every one of them from the bench. Goals
   conceded while a player was not on the pitch are not his, and counting them
   would slander the deputy for the starter's bad afternoon. */
const DEF_POS=/goalkeeper|back|defender/i;
const isKeeper=p=>/goalkeeper/i.test(p.position||"");
const isDefensive=p=>DEF_POS.test(p.position||"");
// Goals against, from the player's own perspective.
function conceded(f){
  const sc=String(f&&f.sc||"").trim();
  if(!sc.includes("-"))return null;
  const n=parseInt(sc.split("-")[1],10);
  return isNaN(n)?null:n;
}
// `n` is the number of MATCHES the window covers, counted the way the strip
// counts them -- squad[] rows, played or not -- so the numbers describe exactly
// the run of games drawn beside them.
//
// It used to read all of form[] regardless. form[] holds 14 rows and the
// Scouting strip draws 10, so Mohamed El Shenawy's row said "1 played" from the
// last ten and "1 CS · 3 GA" from the last fourteen: three matches of a
// goalkeeper's record attributed to a window that contained one. In the last ten
// he played once and lost 1-2 -- no clean sheet, two conceded. Two windows in
// one row, and nothing on screen said which was which.
function defRecord(p,n){
  if(!isDefensive(p))return null;
  const m=MSTATS[p.tm_id]||{};
  let form=m.form||[];
  if(n){
    // squad[] and form[] are both newest-first and keyed by the same dates, so
    // the window is the first n squad dates rather than the first n form rows --
    // form[] omits nothing here, but keying on dates cannot drift if it ever
    // does.
    const win=new Set((m.squad||[]).slice(0,n).map(x=>x.d));
    form=form.filter(f=>win.has(f.fd));
  }
  const rows=form.filter(f=>f.part==="P"&&(f.min||0)>0&&conceded(f)!==null);
  if(!rows.length)return null;
  const mins=rows.reduce((s,f)=>s+(f.min||0),0);
  const ga=rows.reduce((s,f)=>s+conceded(f),0);
  return {played:rows.length, cs:rows.filter(f=>conceded(f)===0).length,
          ga, mins, per90:mins?ga*90/mins:0};
}

function stripHTML(p,n){
  const sq=((MSTATS[p.tm_id]||{}).squad||[]).slice(0,n).slice().reverse();
  // Width follows the block count, so a 6-block strip on Fixtures and a 10-block
  // strip on the roster each reserve exactly their own column. Set even when
  // there are no games: an em-dash in a collapsed cell drags the next column
  // left, which is the same misalignment as a short strip.
  const w=`style="width:${n*12+(n-1)*3}px"`;
  if(!sq.length)return `<span class="strip nostrip" ${w}>—</span>`;
  // PAD SHORT STRIPS. 59 players have fewer than ten matches on record -- most
  // of the domestic additions do -- and the strip reserves the full width but
  // only draws what exists. Packed left by inline-flex, a six-block strip left
  // its gap on the RIGHT, so the newest match sat in a different column on every
  // row and the whole block read as ragged.
  //
  // The blanks go at the START because the strip runs oldest to newest: the
  // missing games are the older ones we have no record of, and the newest match
  // must land on the same edge in every row for the column to mean anything.
  // Rendered as empty slots, not as a state -- absence of a record is not the
  // same fact as "not in the squad", which has its own grey block.
  const pad=Math.max(0,n-sq.length);
  const blanks='<i class="pad" aria-hidden="true"></i>'.repeat(pad);
  return `<span class="strip" ${w}>${blanks}${sq.map(x=>{
    const hit=(x.g||0)+(x.a||0)>0;
    // A game for a club he has since left is a different fact to a game for his
    // current one, and reading a whole strip as "his form here" when half of it
    // was somewhere else is the wrong conclusion. Marked, not hidden.
    const f=matchOf(p,x);
    const elsewhere=f&&f.side&&f.side!==p.club;
    // A clean sheet, for the players judged on them. A CHECK inside the block,
    // exactly as a goal puts a star inside it -- same 12px block, same centred
    // glyph, so the two read as one system rather than as a mark and a border.
    // A ring drawn round the edge was a second visual language for the same kind
    // of fact.
    //
    // Distinct glyph, not the same star: the star means "scored or assisted",
    // and Ahmed El Shenawy is a goalkeeper with two career assists, so one
    // symbol for both would be ambiguous on exactly the players this is for. 22
    // blocks in the data are both.
    //
    // Played matches only: a 0-0 watched from the bench is not his clean sheet.
    const cs=isDefensive(p)&&x.s==="P"&&(x.min||0)>0&&f&&conceded(f)===0;
    const mark=hit?"★":cs?"✓":"";
    return `<i class="${x.s}${hit?" hit":""}${cs?" cs":""}${elsewhere?" prev":""}" title="${esc(blockTitle(p,x))}">${mark}</i>`;
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
  if(skip!=="based"&&f.based.size&&!f.based.has(basedOf(p)))return false;
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
  // Saved-only is a FILTER, not a view. Applied here, in the one function every
  // view draws from, so starring players on the roster then switching to
  // Scouting or Fixtures shows those same players -- which is how the list gets
  // used: pick a shortlist, then ask "who is actually playing" about it.
  //
  // S.onlySaved is the toggle; the "mine" view is the same thing with a tab, kept
  // so a saved list is discoverable without knowing the toggle exists.
  const only=S.onlySaved||S.view==="mine";
  const out=DATA.filter(p=>passes(p)&&(!only||isSaved(p)));
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
  // The star leads the row: it is an action, not a fact, and a reader looking for
  // "save this one" should not have to scan across nine data columns to find it.
  ["save","","c-save"],
  ["name","Player",""],["track","Track","hide-s"],["age","Age","r"],
  ["club","Club","hide-s"],["form","Last 10","hide-s"],["sig","Signal","hide-s"],
  ["caps","Caps S/Y","r hide-s"],
  ["apps","Apps","r"],["goals","G","r"],["mv","Value","r"],
];
// One builder, so the star looks and behaves the same in every view. The label
// says what will actually happen: signed out, the star opens sign-in rather than
// saving, and a control should never promise something it does not do.
const starLabel=p=>(typeof Auth!=="undefined"&&Auth.user)
  ?(isSaved(p)?"Remove from your list":"Save to your list")
  :"Sign in to save players to your list";
const starCell=p=>`<td class="c-save"><button class="star${isSaved(p)?" on":""}" `
  +`data-save="${esc(p.tm_id)}" title="${esc(starLabel(p))}" `
  +`aria-label="${esc(starLabel(p))}">${isSaved(p)?"★":"☆"}</button></td>`;
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
// Row clicks open the panel; the star does not. Without stopPropagation a save
// also opens the detail panel, so every star press costs a dismissal.
function wireRows(){
  $("body").querySelectorAll("button[data-save]").forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    toggleSave(b.dataset.save);
  });
  $("body").querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick=()=>openPanel(tr.dataset.id));
}
function drawTable(){
  const list=rows();
  $("count").innerHTML=`${list.length}<small>${list.length===DATA.length?"players":"of "+DATA.length}</small>`;

  if(!list.length){
    // In My list an empty result usually means a facet is hiding saved players,
    // not that nothing is saved. Say which, or the reader clears a list that was
    // never empty.
    // Signed out the list is empty for a reason the reader can fix, and it is
    // not "you have saved nobody" -- saying that would invite them to look for a
    // star that will not save. Say what is actually true and offer the way in.
    const mineEmpty=(typeof Auth!=="undefined"&&!Auth.user)
      ? `<div class="empty"><b>Your list lives with your account</b>Sign in to keep a
           shortlist and private notes — they follow you to any device.
           <button class="emptygo" id="emptysignin">Sign in</button></div>`
      : `<div class="empty"><b>${SHORT.size?"No saved player matches these filters":"Nothing saved yet"}</b>${
          SHORT.size?"You have "+SHORT.size+" saved — clear a filter to see them."
                    :"Click the star beside a player to keep him here."}</div>`;
    $("body").innerHTML=S.view==="mine"
      ? mineEmpty
      : `<div class="empty"><b>Nothing matches</b>Try clearing a filter or the search box.${savedNote()}</div>`;
    const es=$("emptysignin"); if(es)es.onclick=()=>authOpen("signin");
    return;
  }
  const head=COLS.map(([k,label,cls])=>{
    // The star column sorts nothing — it is a button, and giving it a sort
    // arrow would promise an ordering that does not exist.
    if(k==="save")return `<th class="${cls}"></th>`;
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
      ${starCell(p)}
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

  // Sharing without accounts: the list travels in the URL, so "send me your
  // shortlist" is a link. Nothing is uploaded and nobody signs in.
  const share=S.view==="mine"
    ? `<div class="sharebar">
         <span>${SHORT.size} saved in this browser.</span>
         <button id="copylist">Copy share link</button>
         <button id="clearlist">Clear list</button>
       </div>` : "";
  $("body").innerHTML=share
    +`<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  if(S.view==="mine"){
    $("copylist").onclick=()=>{
      const u=location.origin+location.pathname+"?list="+[...SHORT].join(",");
      // clipboard needs a secure context and permission; fall back to showing
      // the link rather than silently doing nothing.
      (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject())
        .then(()=>{$("copylist").textContent="Copied";
                   setTimeout(()=>{$("copylist").textContent="Copy share link";},1600);})
        .catch(()=>prompt("Copy this link:",u));
    };
    $("clearlist").onclick=()=>{
      if(!confirm(`Remove all ${SHORT.size} saved players?`))return;
      SHORT=new Set(); listSet(SHORT);
      // Release the filter as well, for the same reason toggleSave does: the
      // toggle hides on an empty list, so a set flag would leave the roster
      // filtered to nothing with nothing on screen able to undo it.
      S.onlySaved=false;
      S.view="roster";
      draw();
    };
  }

  $("body").querySelectorAll("th[data-sort]").forEach(th=>th.onclick=()=>{
    const k=th.dataset.sort;
    // Text sorts A→Z first; numbers sort high→low, because "most goals" is the
    // question someone is asking when they click Goals.
    if(S.sort===k)S.dir=-S.dir; else {S.sort=k;S.dir=(k==="name"||k==="club")?1:-1;}
    drawTable();
  });
  wireRows();
}

/* ---------- render: filters ---------- */
function facet(title,group,opts){
  const f=S.f[group];
  let shown=0;
  const body=opts.map(([val,label])=>{
    const n=DATA.filter(p=>passes(p,group)&&({
      based:x=>basedOf(x)===val,
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
    // First: it is the biggest cut in the data, 199 abroad against 552 at home,
    // and the question a scout answers before any other.
    facet("Based","based",[["abroad","Abroad"],["egypt","In Egypt"]])
   +facet("Track","track",[["dual","Dual nationality"],["single","Egyptian only"]])
   // "other" stays in the list but only appears when it has members — a country
   // the crawl reaches that no region names is a bug worth seeing, not a
   // permanent empty row.
   // Egypt first: it is the largest group and the one a reader starting here
   // most often wants, and it reads oddly below the continents it belongs to.
   +facet("Region","region",[["egy","Egypt"],["eu","Europe"],["gulf","Gulf & Middle East"],
                             ["afr","Africa (rest)"],["amer","Americas"],["asia","Asia & Oceania"],
                             ["free","No club"],["other","Region not mapped"]])
   +facet("Club status","club",[["signed","At a club"],["free","Free agent"]])
   +facet("International","caps",[["senior","Senior caps"],["youth","Youth only"],["none","Never capped"]])
   +facet("Position","pos",POS)
   +facet("Age","age",[["u18","18 or under"],["u21","19–21"],["u23","22–23"],
                       ["24","24–26"],["27","27 and over"]])
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
// SofaScore match rating — the one performance number this platform's own source
// (Transfermarkt) does not carry. Shown only for the ~128 players we could match
// confidently and who have rated matches; everyone else gets nothing, because a
// blank is honest and an invented rating is not. A rating band colours it the way
// SofaScore itself does: 7.0+ good, 6.5-7 average, below muted.
function sofaBand(r){ return r>=7.5?"hi":r>=7?"good":r>=6.5?"mid":"low"; }
function sofaBlock(p){
  const s=SOFA[p.tm_id];
  if(!s||!s.n)return "";
  const last=(s.last||[]).slice(0,6).map(x=>
    `<span class="sofapill ${sofaBand(x.r)}" title="${esc((x.h||"")+" v "+(x.a||""))}">${x.r.toFixed(1)}</span>`
  ).join("");
  return `<div class="psec">Match rating <span class="sofasrc">SofaScore</span></div>
    <div class="sofawrap">
      <div class="sofaavg ${sofaBand(s.avg)}">
        <b>${s.avg.toFixed(2)}</b><span>avg · last ${s.n}</span>
      </div>
      <div class="sofalast">
        <div class="sofalabel">Recent matches</div>
        <div class="sofastrip">${last}</div>
      </div>
    </div>`;
}
// Every international appearance, grouped by the side he played for. This is the
// evidence behind the caps column: a scout who sees 0/26 needs to be able to
// check it rather than take the number on trust.
function natBlock(p){
  const g=(MSTATS[p.tm_id]||{}).natl||[];
  // Capped per his profile, but TM publishes no matches for those caps. Say that,
  // rather than showing nothing: an empty section reads as "never played for
  // anyone", which is the opposite of what his profile states.
  if(!g.length){
    const c=caps(p);
    if(!c.stated)return "";
    return `<div class="psec">National team</div>
      <div class="verdict"><b class="${isYouth(p.national_team)?"ok":"sr"}">${c.total} cap${c.total===1?"":"s"} for ${esc(p.national_team)}</b>
      — stated on his Transfermarkt profile, which publishes no match list for them.
      ${isYouth(p.national_team)?"Youth caps do not cap-tie, so he remains selectable.":""}</div>`;
  }
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
/* ---------- notes ----------
   Private to their author, enforced by the database rather than by this file: the
   RLS policy on public.note is `auth.uid() = user_id`, so a bug here cannot show
   one scout another's judgement.

   Notes are the only data in this project that cannot be re-derived from a crawl.
   Everything else can be rebuilt by running the pipeline again; a note cannot. It
   is therefore the one thing worth being careful with -- hence the confirm on
   delete, and the "saving…" state rather than an optimistic insert that might
   silently not have happened. */
const noteDate=s=>{
  const d=new Date(s);
  return isNaN(d)?"" :d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
};

async function drawNotes(id){
  const box=$("notes");
  if(!box)return;

  if(!Auth.user){
    box.innerHTML=`<div class="psec">Notes</div>
      <div class="notesignin">Sign in to keep private notes on this player.
        <button id="notesignin">Sign in</button></div>`;
    $("notesignin").onclick=()=>authOpen("signin");
    return;
  }

  box.innerHTML=`<div class="psec">Notes</div><div class="noteload">Loading…</div>`;
  let list=[];
  try{
    list=await Auth.notes(id);
  }catch(_){
    // Offline or the database is asleep. Say so rather than showing an empty
    // notes section, which reads as "you have written nothing".
    box.innerHTML=`<div class="psec">Notes</div>
      <div class="noteerr">Could not reach the server. Your notes are safe — try again in a moment.</div>`;
    return;
  }

  box.innerHTML=`<div class="psec">Notes${list.length?` <span class="n">${list.length}</span>`:""}</div>
    <form class="noteform" id="noteform">
      <textarea id="notebody" rows="2" placeholder="What did you see?" maxlength="2000"></textarea>
      <button type="submit" id="notego">Add note</button>
    </form>
    <div id="notelist">${list.map(n=>`
      <div class="note" data-note="${n.id}">
        <div class="notemeta">${esc(noteDate(n.created_at))}${
          n.updated_at&&n.updated_at!==n.created_at?" · edited":""}
          <button class="notedel" data-del="${n.id}" title="Delete this note">×</button></div>
        <div class="notebody">${esc(n.body)}</div>
      </div>`).join("")||`<div class="noteempty">No notes yet.</div>`}</div>`;

  $("noteform").onsubmit=async e=>{
    e.preventDefault();
    const ta=$("notebody"), go=$("notego");
    const body=ta.value.trim();
    if(!body)return;
    go.disabled=true; go.textContent="Saving…";
    try{
      await Auth.addNote(id,body);
      ta.value="";
      await drawNotes(id);
    }catch(ex){
      go.disabled=false; go.textContent="Add note";
      // The text stays in the box. Losing what someone just wrote because a
      // request failed is the one outcome this must never produce.
      alert("Could not save: "+(ex.message||"unknown error")+"\nYour text is still in the box.");
    }
  };
  box.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{
    if(!confirm("Delete this note?"))return;
    try{ await Auth.deleteNote(b.dataset.del); await drawNotes(id); }
    catch(ex){ alert("Could not delete: "+(ex.message||"unknown error")); }
  });
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

  // Keepers and defenders lead with what they are judged on. "0 goals, 0
  // assists" is true of almost every goalkeeper and tells a scout nothing.
  // CLEAN SHEETS ARE GONE for outfielders, deliberately. A clean sheet is the
  // whole team's: Omar Gaber's five included two ten-minute cameos entered at
  // 1-0, counted identically to a full ninety, and the two goals conceded
  // belonged to a back four, a keeper and a midfield as much as to him. A number
  // that good on a card is read as a verdict on the player no matter what the
  // caption says, so the honest fix is not to show it.
  //
  // A keeper is different -- he is on the pitch for every goal his side concedes
  // and stopping them is his job -- so he keeps the defensive line.
  //
  // Transfermarkt publishes no tackles, interceptions or duels outside the top
  // leagues (verified: a form row carries only g, a and min), so there is no
  // individual defensive metric to put here instead. Minutes and starts ARE his
  // own, and they answer the question a scout actually asks about a defender:
  // does his manager pick him.
  const dr=defRecord(p);
  let dk="", dnote="";
  if(dr&&isKeeper(p)){
    // MINUTES, not matches, decide whether a rate is meaningful. A substitute
    // who plays one minute of a 0-1 defeat is charged with a goal he was on the
    // pitch for, and dividing by 1/90th of a match yields 90.00 per 90. Naïm
    // Abou Bakr cleared a five-MATCH threshold on 17 total minutes and scored
    // 63.53 -- arithmetically correct and completely meaningless.
    //
    // 270 minutes is three full matches: enough that one cameo cannot dominate,
    // low enough that a genuine squad keeper still qualifies.
    // TWO ROWS, each labelled. One set of four numbers could only ever be the
    // career or the window, and whichever it was the other went missing -- a
    // keeper's 502 appearances say who he is, his last 14 say whether he is
    // playing now, and a scout needs both.
    //
    // Career carries no goals-against: TM publishes career clean sheets but not
    // career goals conceded, so a career GA/90 cannot be computed. Rather than
    // leave a fourth cell empty the career row shows full 90s, which is the
    // honest thing the minutes total supports.
    const c90=st.m?Math.round(st.m/90):0;
    // MINUTES, not matches, decide whether a rate is meaningful. A substitute
    // who plays one minute of a 0-1 defeat is charged with a goal he was on the
    // pitch for, and dividing by 1/90th of a match yields 90.00 per 90. Naïm
    // Abou Bakr cleared a five-MATCH threshold on 17 total minutes and scored
    // 63.53 -- arithmetically correct and completely meaningless.
    //
    // 270 minutes is three full matches: enough that one cameo cannot dominate,
    // low enough that a genuine squad keeper still qualifies.
    // CAREER ONLY. The recent window moved to the Scouting tab, where it sits in
    // its own column beside the form strip that shows the same 14 matches -- the
    // panel was stating twice over what the strip already draws, and "last 14"
    // beside a career row invited exactly the misreading it was labelled to
    // prevent.
    dk=`<div class="krow">Career</div>`
      +`<div class="kpis">${kpi(st.a||0,"apps")}${kpi(st.cs||0,"clean sheets")}`
      +`${kpi(c90,"full 90s")}${kpi(st.y||0,"yellows")}</div>`;
    dnote=`<p class="dnote">${
      `Career totals. Recent form — goals conceded and clean sheets over his last
       matches — is in the Scouting tab, beside the run of games it comes from.`}${
      // A scoring goalkeeper is rare enough to be worth a line: 13 of 58 here
      // have a goal or an assist, one of them four goals. Said in the note
      // rather than given a card, because for a keeper it is a curiosity and
      // goals against is the number he is actually judged on.
      (st.g||st.as)?` Also ${[st.g?`${st.g} goal${st.g>1?"s":""}`:"",
        st.as?`${st.as} assist${st.as>1?"s":""}`:""].filter(Boolean).join(" and ")}
        in his career.`:""}</p>`;
  }else if(dr){
    // Goals and assists STAY. Removing clean sheets was right; dropping these
    // with them was not, and it cost the card its most individual numbers.
    // 147 of 200 outfield defenders here have scored or assisted -- Omar Gaber
    // has 23 goals and 46 assists in 528 appearances, which is the single most
    // interesting fact about him and exactly what marks out an attacking
    // full-back. A goal is unambiguously the player's own; a clean sheet never
    // was.
    //
    // Recent minutes replace the fourth card rather than any of the three: it
    // answers "is he playing NOW", which career totals cannot, and it is the
    // question the defensive block was there to answer in the first place.
    //
    // floor, not round. Extra time makes a match longer than 90 minutes:
    // Mahmoud Alaa's three appearances include two 120-minute ties, so 330
    // minutes ROUNDS to "4 full 90s from 3 appearances" -- true arithmetic that
    // reads as a contradiction. Rounding down can never claim more than he
    // played.
    const starts=((MSTATS[p.tm_id]||{}).form||[])
      .filter(f=>f.part==="P"&&(f.min||0)>=60).length;
    dk=`<div class="krow">Career</div>`
      +`<div class="kpis">${kpi(st.a||0,"apps")}${kpi(st.g||0,"goals")}`
      +`${kpi(st.as||0,"assists")}${kpi(st.m?Math.round(st.m/90):0,"full 90s")}</div>`;
    dnote=`<p class="dnote">Clean sheets are not shown for outfielders — they belong to the
      whole side, and no individual defensive numbers (tackles, duels) are published outside
      the top leagues. Minutes and selection are his own, and they answer the question a
      scout asks about a defender: is his manager picking him.</p>`;
  }

  // Season trajectory. Bars, not a line: six seasons is too few for a line to
  // read as anything, and the comparison is between years, not a continuum.
  let traj="";
  if((m.traj||[]).length>1){
    const t=m.traj.slice(-6), max=Math.max(...t.map(x=>x.m||0))||1;
    traj=`<div class="psec">Season by season</div>
      <div class="spark">${t.map(x=>`<div style="height:${Math.max(4,Math.round((x.m||0)/max*100))}%" title="${esc(x.s)} — ${x.a||0} apps, ${x.m||0} mins"></div>`).join("")}</div>
      <div class="sparkx">${t.map(x=>`<span>${esc(String(x.s).slice(-2))}</span>`).join("")}</div>`;
  }

  // Keepers only, for the same reason the cards are. Only on matches he PLAYED:
  // a 0 beside a game he watched from the bench would read as his clean sheet.
  const showGA=!!dr&&isKeeper(p);
  const form=(m.form||[]).slice(0,6).map(f=>{
    const c=conceded(f), played=f.part==="P"&&(f.min||0)>0;
    const ga=!showGA?"":`<td class="r ga">${played&&c!==null
      ? (c===0?`<span class="cs" title="Clean sheet">0</span>`:c)
      : `<span class="d">—</span>`}</td>`;
    return `<tr>
      <td class="d">${esc((f.fd||"").slice(5))}</td>
      <td class="o">${esc(f.opp||f.cn||"—")}<small>${esc(f.cn||"")}</small></td>
      <td class="r"><span class="res ${esc(f.r||"D")}">${esc(f.sc||"")}</span></td>
      ${ga}
      <td class="r">${f.part==="P"?(f.min?f.min+"'":"played"):f.part==="B"?"<span class='d'>bench</span>":"<span class='d'>out</span>"}</td>
    </tr>`;
  }).join("");

  const nx=NEXTM[id];
  $("panel").innerHTML=`
    <div class="phead">${face}
      <div><h2>${esc(p.name)}</h2>
        <div class="sub">${esc(p.age||"?")} · ${esc(p.position||"")} · ${esc(p.club||"")}</div></div>
      <button class="pclose" id="pclose" aria-label="Close">×</button></div>
    <div class="pbody">
      ${dk||`<div class="kpis">${kpi(st.a||0,"apps")}${kpi(st.g||0,"goals")}${kpi(st.as||0,"assists")}${kpi(mins+"","90s")}</div>`}
      ${dnote}
      ${sofaBlock(p)}
      <!-- Notes first. They are what a returning scout opens this panel for; the
           career data is always there and never changes on a visit. -->
      <div id="notes"></div>
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
  drawNotes(id);
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
// Every view here asks a different question about the same filtered set: the
// roster lists them, Scouting shows whether they are playing, Fixtures where they
// play next, National what their caps mean. A CUT of the set is not a view — that
// is what the sidebar facets are for, which is why dual/Egypt-only stopped being
// tabs. The nav must never restate a filter, or the two can disagree.
function drawNav(){
  // With "Saved only" on, every tab counts within the shortlist -- a Fixtures
  // tab reading 34 while the view draws 3 is the same class of lie as the
  // 93/91/95 roster counts, and this one would appear the moment anyone used
  // the toggle.
  const pool=S.onlySaved?DATA.filter(isSaved):DATA;
  const n=pool.length;
  // Same rule the view applies, or the tab promises a row it will not draw --
  // including the past-kickoff filter, so a played-but-not-yet-refreshed fixture
  // is not counted here while the view correctly hides it.
  const withFix=pool.filter(p=>NEXTM[p.tm_id]&&fixtureUpcoming(NEXTM[p.tm_id])&&!isFree(p)).length;
  const withMatch=pool.filter(p=>{const s=status(p);return s&&s.n;}).length;
  // caps().total, not natl.length: four players are capped per their profile with
  // no match list published, and counting rows alone dropped them from a view
  // whose whole subject is who has played for whom.
  // Cap-tied-elsewhere players were removed from the National caps view, so the
  // tab count excludes them too — the number on the tab must equal what the view
  // draws.
  const withNat=pool.filter(p=>caps(p).total&&natBucket(p)!=="tied").length;
  // Four views, not six. Dual and Egypt-only were tabs AND a sidebar facet -- the
  // same cut of the same table, reachable two ways, each able to contradict the
  // other's state. They are a filter, so the filter keeps them; a view is a
  // different question, and "dual nationality" is not a different question.
  //
  // Shorter labels than the sidebar carried: a tab strip is read horizontally and
  // "National teams" costs more width than it earns. The title attribute keeps
  // the full wording, and says what each view is for.
  $("nav").innerHTML=[
    ["roster","Roster",n,"Every player in the registry"],
    ["scout","Scouting",withMatch,"Squad status across the last ten club matchdays"],
    ["fix","Upcoming fixtures",withFix,"Next match for each player's club"],
    // National caps — the player-level view: who has played for whom, and what it
    // means for eligibility. Renamed off "National teams" so that name can go to
    // the team-level fixtures tab, which is what most readers expect it to mean.
    ["nat","National caps",withNat,"National-team appearances and what they mean for eligibility"],
    // National teams — team-level, not player-level: Egypt's sides and their recent
    // and upcoming matches. Count is the number of teams carrying any fixture data.
    ["natfix","National teams",natTeamCount(),"Egypt's national sides — recent results and upcoming matches"],
    // The game. No count — it is not a cut of the registry, it is a blank pitch to
    // fill — so it carries a star instead, marking it as the one view that is play.
    ["build","⚽ Build XI","","Pick your dream Egypt XI from the eligible pool and share it"],
    // Last, and only once something is in it. An always-visible "My list 0" is a
    // permanent reminder of an empty box; the star teaches the feature better
    // than a tab nobody has filled.
    ...(SHORT.size?[["mine","My list",SHORT.size,
        "Players you saved — kept in this browser, no account needed"]]:[]),
  ].map(([k,l,c,t])=>`<button data-v="${k}" title="${esc(t)}"${S.view===k?' class="on"':""}>${esc(l)}${c!==""?`<span class="n">${c}</span>`:""}</button>`).join("");
  $("nav").querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{
    const from=S.view, to=b.dataset.v;
    S.view=to;
    // "My list" should FOLLOW you. It is a shortlist, and the point of a shortlist
    // is to ask other questions about it — "who is playing next", "who is cap-tied"
    // — so leaving the My-list tab for another view turns on "Saved only", carrying
    // the same players into Scouting, Fixtures and the rest. Without this the list
    // silently widened back to everyone the moment you changed tabs, which is the
    // opposite of what a saved list is for. The header's "Saved only" toggle turns
    // it back off to see everyone again.
    if(from==="mine"&&to!=="mine"&&SHORT.size)S.onlySaved=true;
    // The nav is a shortcut into the same facet the sidebar exposes, so the two
    // can never show different things.
    // Filters survive a view change. They used to be reset here, because two of
    // the tabs WERE track filters and switching away had to undo them. With those
    // gone, clearing would throw away a filter the user set deliberately —
    // narrowing to dual nationality and then opening Fixtures should show that
    // narrowed set, not all 172 again.
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
  // Sort by the real kickoff INSTANT (utc), not the scraped US-Eastern date. A
  // 2am-Cairo match is stored as the previous Eastern day, so date-only sorting put
  // it a day too early and out of step with the Cairo date now shown. utc orders it
  // correctly and to the minute. f.date is the fallback only when there is no utc.
  date:p=>{const f=NEXTM[p.tm_id]||{};
    const t=f.utc?Date.parse(f.utc):Date.parse(f.date||"");
    return isNaN(t)?8.64e15:t;},
  name:p=>(p.name||"").toLowerCase(),
  club:p=>(p.club||"").toLowerCase(),
  opp: p=>((NEXTM[p.tm_id]||{}).opp||"").toLowerCase(),
  form:p=>{const s=status(p);return s?s.played*10-s.out:-99;},
};
/* Fixtures, split by where a player is based, because the two populations pose
   different questions.

   ABROAD is per PLAYER. They are scattered across dozens of leagues, one or two
   to a club, and the question is "where is this individual playing next".

   IN EGYPT is per CLUB. 552 players sit in twenty squads, so a per-player list
   would repeat the same Zamalek fixture thirty-two times and bury everything
   else. One row per club, with the squad size beside it, answers "who plays
   this weekend" in twenty lines instead of five hundred. */
function egyptFixtures(list){
  const byClub=new Map();
  list.forEach(p=>{
    const k=p.club||"—";
    if(!byClub.has(k))byClub.set(k,{club:k,fx:NEXTM[p.tm_id],players:[],club_id:p.club_id});
    byClub.get(k).players.push(p);
  });
  const clubs=[...byClub.values()].sort((a,b)=>{
    const d=Date.parse(a.fx.date||"")-Date.parse(b.fx.date||"");
    return isNaN(d)?b.players.length-a.players.length:d;
  });
  return `<table class="grid"><thead><tr>
      <th>Club</th><th class="hide-s">Kick-off</th><th>Opponent</th>
      <th class="r">Squad</th></tr></thead><tbody>
    ${clubs.map(c=>{
      const crest=CRESTS[c.club_id]?`<img class="cc" src="${esc(CRESTS[c.club_id])}" alt="" loading="lazy">`:"";
      const ocrest=CRESTS[c.fx.oid]?`<img class="cc" src="${esc(CRESTS[c.fx.oid])}" alt="" loading="lazy">`:"";
      // Named, so a scout can see WHO without opening anything. Capped at six:
      // beyond that the row stops being scannable, which is the whole reason
      // this view groups.
      const names=c.players.slice(0,6).map(p=>esc(p.name)).join(", ")
        +(c.players.length>6?` +${c.players.length-6} more`:"");
      return `<tr>
        <td><b>${crest}${esc(c.club)}</b><small class="cn">${esc(names)}</small></td>
        <td class="hide-s"><b>${esc(c.fx.date||"—")}</b><small class="cn">${koTime(c.fx)}</small></td>
        <td>${c.fx.ha==="H"?'<span class="tag">Home</span>':'<span class="tag">Away</span>'} ${ocrest}${esc(c.fx.opp||"—")}</td>
        <td class="r num">${c.players.length}</td></tr>`;
    }).join("")}</tbody></table>`;
}

/* Agenda: the same fixtures grouped by DAY rather than listed.

   The list sorts; the agenda shows shape. 67 fixtures fall on 18 dates, and 22
   of them land on one weekend -- a fact a sorted list cannot show and a scout
   planning a trip needs first. "Which weekend, and how many can I see in one
   visit" is the question.

   An agenda rather than a month grid, deliberately. 18 dates across six weeks
   would leave a month view mostly empty cells; this stays dense when the data is
   sparse, and gets better rather than worse as more leagues publish. */
const DAY=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/* ---------- kickoff times, in Cairo ----------
   f.utc is a real instant, stamped at scrape time. f.time is the raw string we
   scraped from transfermarkt.US, which renders in US EASTERN -- six hours
   behind CET. It was being shown verbatim, so a Finnish 16:00 kickoff displayed
   as "9:00 AM": wrong, but plausible enough to survive.

   The audience is in Egypt, so Cairo is the clock that matters. Everything
   derives from f.utc; f.time is only a fallback for a fixture scraped before
   the utc field existed, and is marked in the UI when used. */
const CAIRO="Africa/Cairo";
const koTime=f=>{
  if(!f||!f.utc)return f&&f.time?esc(f.time):"";
  const d=new Date(f.utc);
  return isNaN(d)?"":d.toLocaleTimeString("en-GB",
    {timeZone:CAIRO,hour:"2-digit",minute:"2-digit",hour12:false});
};
// The kickoff DATE in Cairo, for display beside koTime. f.date is scraped from
// transfermarkt.us and is therefore the US-Eastern calendar day: a 7pm Eastern
// kickoff is already 2am the NEXT day in Cairo, so showing f.date ("Jul 25")
// beside a Cairo time ("02:00") put the fixture on the wrong day. Derive the date
// from the same utc instant the time comes from, so date and time always agree.
// f.date remains the fallback only when there is no utc (an older scrape).
const koDate=f=>{
  if(!f)return "—";
  if(f.utc){const d=new Date(f.utc);
    if(!isNaN(d))return esc(d.toLocaleDateString("en-GB",
      {timeZone:CAIRO,day:"numeric",month:"short",year:"numeric"}));}
  return esc(f.date||"—");
};
// The Cairo calendar date. A late kickoff can land on a different DAY in Cairo
// than at the venue, so grouping must use the same zone the times are shown in
// or a row appears under a heading it contradicts.
const koKey=f=>{
  if(!f)return"?";
  if(f.utc){const d=new Date(f.utc);
    if(!isNaN(d))return d.toLocaleDateString("en-CA",{timeZone:CAIRO});}
  const t=Date.parse(f.date||"");
  return isNaN(t)?"?":new Date(t).toISOString().slice(0,10);
};

function agendaHTML(list){
  const byDay=new Map();
  list.forEach(p=>{
    const f=NEXTM[p.tm_id];
    // Keyed and sorted on the Cairo date, not the scraped string. "Aug 1" sorts
    // before "Aug 11" before "Aug 2" alphabetically, which is exactly the
    // ordering the list view suffers from.
    const key=koKey(f);
    const t=key==="?"?NaN:Date.parse(key+"T00:00:00Z");
    if(!byDay.has(key))byDay.set(key,{t,label:f.date,items:[]});
    byDay.get(key).items.push({p,f});
  });
  const days=[...byDay.entries()].sort((a,b)=>(a[1].t||8.64e15)-(b[1].t||8.64e15));

  return days.map(([key,d])=>{
    const dt=isNaN(d.t)?null:new Date(d.t);
    const dow=dt?DAY[dt.getUTCDay()]:"";
    // The heading is rendered from the Cairo key, not from the scraped label --
    // otherwise a fixture regrouped into a different Cairo day would sit under a
    // heading naming the day it had at the venue.
    const label=dt?dt.toLocaleDateString("en-GB",
      {timeZone:"UTC",day:"numeric",month:"short",year:"numeric"}):(d.label||"date unknown");
    // Today and tomorrow are what a reader checks first; naming them saves
    // working it out from a date. "Today" means today IN CAIRO, so that it
    // agrees with the clock the times are shown on.
    const nowKey=new Date().toLocaleDateString("en-CA",{timeZone:CAIRO});
    const today=Date.parse(nowKey+"T00:00:00Z");
    const diff=dt?Math.round((d.t-today)/86400000):null;
    const rel=diff===0?"today":diff===1?"tomorrow":diff>1&&diff<7?`in ${diff} days`:"";
    return `<div class="agday">
      <div class="agdate">
        <b>${esc(dow)}</b><span>${esc(label)}</span>
        ${rel?`<i>${esc(rel)}</i>`:""}
        <em>${d.items.length}</em>
      </div>
      <div class="agrows">${d.items.map(({p,f})=>{
        const crest=CRESTS[f.oid]?`<img class="cc" src="${esc(CRESTS[f.oid])}" alt="" loading="lazy">`:"";
        // Same face-or-initials treatment the roster and fixture tables use. The
        // agenda is scanned, not read, and a face is recognised faster than a
        // name -- it was the one player-identifying view rendering without one.
        const face=p.photo?`<img class="face" src="${esc(p.photo)}" alt="" loading="lazy">`
          :`<span class="face ini">${esc(initials(p.name))}</span>`;
        // NOT signal(). That grades the player's last 14 matches -- "regular",
        // "out of favour" -- which is a squad-status judgement, and sitting in a
        // fixture row it reads as a claim about the match ABOUT TO BE PLAYED.
        // Home/away is a genuine property of this fixture and is what decides
        // whether you can actually go and watch it.
        const venue=f.ha==="H"?`<span class="ven h">HOME</span>`
          :f.ha==="A"?`<span class="ven a">AWAY</span>`:"";
        const t=koTime(f);
        // The player's OWN club badge, beside his club name. Both sides of the
        // fixture now carry a crest; previously only the opponent did, which
        // made the row read as being about the opponent.
        const own=CRESTS[f.sid]||CRESTS[p.club_id];
        const oc=own?`<img class="cc" src="${esc(own)}" alt="" loading="lazy">`:"";
        // Competition, then country. `comp` is the division the FIXTURE belongs
        // to, scraped from the schedule page -- not the player's `league`, which
        // says "Academy / youth" for 26 of these and nothing at all for 13.
        const where=[f.comp||"",p.plays_in||""].filter(Boolean);
        return `<div class="agrow" data-id="${esc(p.tm_id)}">
          <span class="agp">${face}<span class="agnm">${esc(p.name)}<small>${oc}${esc(p.club||"")}</small></span></span>
          <span class="agv">${f.ha==="H"?"vs":f.ha==="A"?"at":""} ${crest}${esc(f.opp||"—")}</span>
          <span class="agc">${where.length?`${esc(where[0])}${where[1]?`<small>${esc(where[1])}</small>`:""}`:""}</span>
          <span class="agt"${f.utc?"":' title="time as published, zone unconfirmed"'}>${t}${f.utc?"":"*"}</span>
          <span class="ags">${venue}</span>
        </div>`;
      }).join("")}</div>
    </div>`;
  }).join("");
}

// A fixture is only "upcoming" while its kickoff is not well in the past. The
// fixture feed is scraped point-in-time: the moment a match is played it should be
// replaced by the next one, but between refreshes a played game lingers in
// nextm.json and would otherwise show as still-to-come (Aboukoura's Jul 25 win at
// Indy Eleven kept showing as an upcoming fixture the day after he had played it).
// So drop any fixture whose kickoff is more than a few hours past — the grace
// window keeps a live or just-finished match visible rather than vanishing
// mid-game. No utc (older scrape) => keep it, since we cannot judge it.
const FIXTURE_GRACE_MS=4*60*60*1000; // 4h after kickoff it is no longer "next"
function fixtureUpcoming(f){
  if(!f)return false;
  if(!f.utc)return true;
  const t=Date.parse(f.utc);
  if(isNaN(t))return true;
  return t>=Date.now()-FIXTURE_GRACE_MS;
}
function drawFixtures(){
  // A free agent has no next match. The fixture stored against him belongs to
  // the club he LEFT -- Adam Tolba was listed as away at Holzheimer SG on 15 Aug
  // while being a free agent, which is his old side's fixture and tells a scout
  // nothing about him. isFree, not club_id 515, because the placeholder is only
  // one of the ways TM renders clublessness.
  const all=rows().filter(p=>NEXTM[p.tm_id]&&fixtureUpcoming(NEXTM[p.tm_id])&&!isFree(p));
  const egy=all.filter(p=>basedOf(p)==="egypt");
  let list=all.filter(p=>basedOf(p)==="abroad");
  const nEgyClubs=new Set(egy.map(p=>p.club)).size;
  $("count").innerHTML=`${all.length}<small>with a fixture</small>`;

  // Egyptian clubs whose players are here but whose schedule TM has not published.
  // Said explicitly: an absent section reads as "nobody plays", when the truth is
  // "the league has not released its dates".
  const egyPending=[...new Set(rows().filter(p=>basedOf(p)==="egypt"&&!isFree(p)&&!NEXTM[p.tm_id])
                                      .map(p=>p.club))].filter(Boolean);

  if(!all.length&&!egyPending.length){
    $("body").innerHTML=`<div class="empty"><b>No upcoming fixtures</b>Leagues publish 26/27 dates at different times, so this fills in through pre-season.${savedNote()}</div>`;
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
    // His own club's badge, which this view never showed — only the opponent's.
    // A fixture is two teams, and a scout reading a list of them recognises the
    // badge faster than the name. NEXTM.sid is the club the fixture belongs to,
    // which is right even when the player has just transferred.
    const own=CRESTS[f.sid]||CRESTS[p.club_id];
    const ownc=own?`<img class="cc" src="${esc(own)}" alt="" loading="lazy">`:"";
    const strip=stripHTML(p,6);
    const g=signal(p);
    return `<tr data-id="${esc(p.tm_id)}">
      ${starCell(p)}
      <td><span class="who">${p.photo?`<img class="face" src="${esc(p.photo)}" alt="" loading="lazy">`
        :`<span class="face ini">${esc(initials(p.name))}</span>`}<span class="nm"><b>${esc(p.name)}</b>
        <span>${ownc}${esc(p.club||"")}${p.plays_in?` · ${esc(p.plays_in)}`:""}</span></span></span></td>
      <td class="hide-s"><b>${koDate(f)}</b><small class="cn">${koTime(f)}</small></td>
      <td>${f.ha==="H"?'<span class="tag">Home</span>':f.ha==="A"?'<span class="tag">Away</span>':""} ${crest}${esc(f.opp||"—")}
        ${f.comp?`<small class="cn">${esc(f.comp)}</small>`:""}</td>
      <td class="hide-s">${strip}</td>
      <td class="hide-s">${g?`<span class="sig ${g[0]}">${g[1]}</span>`:`<span class="nostrip">—</span>`}</td></tr>`;
  }).join("");
  // No Club column: the player cell already carries it as a subtitle, and a
  // second copy would cost a column on a view whose job is dates.
  const FXCOLS=[["name","Player",""],["date","Kick-off (Cairo)","hide-s"],["opp","Opponent",""],
                ["form","Last 6","hide-s"]];
  const head=FXCOLS.map(([k,label,cls])=>{
    const on=S.fxsort===k;
    return `<th class="${cls}${on?" sorted":""}" data-fx="${k}">${esc(label)}<span class="ar">${on?(S.fxdir>0?"▲":"▼"):"▲"}</span></th>`;
  }).join("");
  // Two sections, each with its own heading and count, so the split is visible
  // rather than implied by a filter the reader has to notice.
  // One switch, two shapes of the same data: the list sorts, the agenda shows
  // clustering. Neither replaces the other, so it is a toggle rather than a
  // second tab.
  const modes=`<div class="fxmode">
      <button data-fxv="list"${S.fxview==="list"?' class="on"':""}>List</button>
      <button data-fxv="agenda"${S.fxview==="agenda"?' class="on"':""}>Calendar</button>
    </div>`;
  // Only in the calendar. The list has a "Kick-off" column header the note can
  // live in, so a separate banner was saying the same thing twice; the calendar
  // has no column headers at all, and an unlabelled clock is what let the
  // six-hour timezone error survive in the first place.
  const tzn=S.fxview==="agenda"?`<span class="tzn">times in Cairo</span>`:"";
  const abroadBlock=list.length
    ? `<div class="fxgrp"><div class="ntgh"><b>Abroad</b><span>${list.length} player${list.length===1?"":"s"}</span>${tzn}${modes}</div>
        ${S.fxview==="agenda"
          ? agendaHTML(list)
          : `<table class="grid"><thead><tr><th class="c-save"></th>${head}<th class="hide-s" title="How often the player has featured across his last 14 matches — squad status, not a prediction about this fixture">Squad status</th></tr></thead><tbody>${body}</tbody></table>`}</div>`
    : "";
  const egyBlock=egy.length
    ? `<div class="fxgrp"><div class="ntgh"><b class="eg">Egyptian league</b><span>${nEgyClubs} club${nEgyClubs===1?"":"s"} · ${egy.length} player${egy.length===1?"":"s"}</span></div>
        <p class="ntnote">Grouped by club: one fixture covers the whole squad, so a per-player list would repeat it.</p>
        ${egyptFixtures(egy)}</div>`
    : "";
  // Not an omission — a source gap, and it says so. TM has not published the
  // Egyptian league schedule for this season.
  const pendingBlock=egyPending.length
    ? `<div class="fxgrp"><div class="ntgh"><b>Egyptian league — no dates yet</b><span>${egyPending.length} club${egyPending.length===1?"":"s"}</span></div>
        <p class="ntnote">Transfermarkt has not published this season's Egyptian fixtures. Their players are in the database; only the schedule is missing: ${egyPending.map(esc).join(", ")}.</p></div>`
    : "";
  $("body").innerHTML=abroadBlock+egyBlock+pendingBlock;
  // querySelectorAll over whatever rendered: with no players abroad there is no
  // sortable header, and this simply wires nothing.
  $("body").querySelectorAll("[data-fxv]").forEach(b=>b.onclick=()=>{
    S.fxview=b.dataset.fxv;
    drawFixtures();
  });
  // Agenda rows open the panel like table rows do; the two layouts must behave
  // the same or switching costs the reader their muscle memory.
  $("body").querySelectorAll(".agrow[data-id]").forEach(r=>r.onclick=()=>openPanel(r.dataset.id));
  $("body").querySelectorAll("th[data-fx]").forEach(th=>th.onclick=()=>{
    const k=th.dataset.fx;
    // Dates and text both read best ascending -- soonest first, A to Z. Form is
    // the one where "best first" means descending.
    if(S.fxsort===k)S.fxdir=-S.fxdir; else {S.fxsort=k;S.fxdir=k==="form"?-1:1;}
    drawFixtures();
  });
  wireRows();
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
  // "Cap-tied elsewhere" removed at the user's request: this view now shows only
  // players who are Egypt's — senior Egypt caps, and youth-capped players still
  // available. A player with a senior cap for another country is dropped from the
  // caps breakdown (he still appears everywhere else in the registry).
  ["egypt","Senior caps for Egypt", "Already committed and playing. These are the successes, not the targets."],
  ["open", "Youth caps only — still selectable", "Youth appearances never cap-tie. Every one of these players remains available to Egypt."],
];
// One shared grid across all three bucket tables. Without it each table sizes to
// its own content, so the age sat in a different place in "Cap-tied elsewhere"
// than in "Senior caps for Egypt" and the badge rows started at three different
// x-positions — three tables reading as three unrelated lists rather than one
// page. Same reason Scouting mode carries a colgroup.
const NTCOLS=`<colgroup><col class="c-save"><col class="c-pl"><col class="c-ag"><col class="c-sd"><col class="c-cp"></colgroup>`;
// This table shipped without a thead, alone among the four views. Two columns of
// bare numbers -- an age and a senior/youth pair -- sat unlabelled, so "21" and
// "8 / 26" had to be guessed at. Not sortable, unlike the roster's: the buckets
// are the sort, and a click that reordered rows across three groups would undo
// the only structure the view has.
const NTHEAD=`<thead><tr><th class="c-save"></th><th>Player</th><th class="r hide-s">Age</th>
  <th class="hide-s">National sides · appearances</th>
  <th class="r" title="Senior caps / youth appearances">Caps S/Y</th></tr></thead>`;
function natBucket(p){
  const played=((MSTATS[p.tm_id]||{}).natl||[]).filter(x=>x.part==="P");
  const snr=[...new Set(played.filter(x=>isSenior(x.team)).map(x=>x.team))];
  if(!snr.length)return "open";
  return snr.every(t=>/^egypt/i.test(t))?"egypt":"tied";
}
/* ---------- view: national teams (team-level fixtures) ----------
   Egypt's national sides and their matches — team-level, not tied to any player.
   Its own tab, separate from "National caps" (which is the player-level view of
   who has played for whom). Per team: the last five results and the next five
   scheduled matches, when found.

   A national side plays in windows with long gaps, so a team with no upcoming
   fixture is the normal state, not an error — the recent results carry the card
   until the next window is published. */
const NAT_ORDER=["Egypt","Egypt Olympic","Egypt U23","Egypt U20","Egypt U17"];
function natTeams(){
  const teams=Object.values(NATFIX||{}).filter(t=>(t.upcoming||[]).length||(t.recent||[]).length);
  teams.sort((a,b)=>{
    const ia=NAT_ORDER.indexOf(a.name), ib=NAT_ORDER.indexOf(b.name);
    return (ia<0?99:ia)-(ib<0?99:ib);
  });
  return teams;
}
// Count for the nav tab: how many teams carry any fixture data at all.
function natTeamCount(){ return natTeams().length; }

// Egypt's goals are the FIRST number on TM's schedule (the club whose page it is
// is always listed first), so "3:2" means Egypt scored 3. That lets a past result
// be coloured win/draw/loss from Egypt's side without guessing.
function natOutcome(score){
  const m=/^(\d+):(\d+)/.exec(score||"");
  if(!m)return "";
  const us=+m[1], them=+m[2];
  return us>them?"w":us<them?"l":"d";
}
function natMatchRow(f,past){
  const crest=CRESTS[f.oid]
    ?`<img class="natfxcrest" src="${esc(CRESTS[f.oid])}" alt="" loading="lazy">`
    :`<span class="natfxcrest ini">${esc(initials(f.opp||"?"))}</span>`;
  // Date always carries the YEAR now -- a youth side's last match can be a year or
  // two back, and "Tue 7 Jul" alone hid which year. Cairo clock from the stored
  // instant; date-only fallback when there is no kickoff time.
  let day=esc(f.date||""), clock="";
  if(f.utc){
    const d=new Date(f.utc);
    if(!isNaN(d)){
      day=d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric",timeZone:"Africa/Cairo"});
      clock=d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Africa/Cairo"});
    }
  }
  const venue=f.ha==="H"?"H":f.ha==="A"?"A":"";
  const venueTitle=f.ha==="H"?"Home":f.ha==="A"?"Away":"";
  // Right side: a coloured result pill for past games, the kickoff time for
  // upcoming ones. One column, so the rows line up whichever they are.
  const right=past&&f.score
    ? `<span class="natfxscore ${natOutcome(f.score)}" title="Egypt ${esc(f.score.replace(':','–'))}">${esc(f.score)}</span>`
    : clock?`<span class="natfxtime">${esc(clock)}</span>`:"";
  return `<div class="natfxrow${past?" past":""}">
    ${venue?`<span class="natfxven ${venue==="H"?"h":"a"}" title="${venueTitle}">${venue}</span>`:`<span class="natfxven none"></span>`}
    <span class="natfxmid">
      <span class="natfxopp">${crest}<b>${esc(f.opp||"—")}</b></span>
      <span class="natfxmeta">${esc(day)}${f.comp?` · ${esc(f.comp)}`:""}</span>
    </span>
    ${right}
  </div>`;
}
function drawNatFixtures(){
  const teams=natTeams();
  $("count").innerHTML=`${teams.length}<small>team${teams.length===1?"":"s"}</small>`;
  if(!teams.length){
    $("body").innerHTML=`<div class="empty"><b>No national-team fixtures yet</b>Egypt's schedule has not been published. Check back when the next international window is announced.</div>`;
    return;
  }
  const anyUpcoming=teams.some(t=>(t.upcoming||[]).length);
  const sub=anyUpcoming
    ? "Egypt's national sides — senior and youth. Recent results and the next scheduled matches for each."
    : "No fixtures are scheduled right now — normal between international windows. Recent results are shown for each side until the next window is announced.";
  // Each team card: up to five upcoming (newest window first) then up to five
  // recent results. Upcoming are oldest-first (soonest at the top); recent are
  // newest-first. A subheading marks the two runs so a result and a fixture are
  // never mistaken for one another.
  const blocks=teams.map(t=>{
    const up=(t.upcoming||[]).slice(0,5);
    const rec=(t.recent||[]).slice(0,5);
    const crest=CRESTS[t.sid]?`<img class="cc" src="${esc(CRESTS[t.sid])}" alt="" loading="lazy">`:"";
    const upHTML=up.length
      ? `<div class="natfxsub up">Upcoming</div><div class="natfxruns">${up.map(f=>natMatchRow(f,false)).join("")}</div>`
      : `<div class="natfxsub none">No match scheduled</div>`;
    const recHTML=rec.length
      ? `<div class="natfxsub past">Recent results</div><div class="natfxruns">${rec.map(f=>natMatchRow(f,true)).join("")}</div>`
      : "";
    return `<div class="natfxteam">
      <div class="natfxth">${crest}<b>${esc(t.name)}</b></div>
      ${upHTML}${recHTML}</div>`;
  }).join("");
  $("body").innerHTML=`<section class="natfx">
    <div class="natfxhead"><b>Egypt's national teams</b><span>${esc(sub)}</span></div>
    <div class="natfxgrid">${blocks}</div>
  </section>`;
}

function drawNational(){
  // Capped players, but NOT those cap-tied to another country: that group was
  // removed from this view, so it must also leave the count and the list, or the
  // header would promise rows the page no longer draws.
  const list=rows().filter(p=>caps(p).total&&natBucket(p)!=="tied");
  $("count").innerHTML=`${list.length}<small>with caps</small>`;
  if(!list.length){
    $("body").innerHTML=`<div class="empty"><b>Nobody matches</b>No player in this filter has a national-team appearance.${savedNote()}</div>`;
    return;
  }
  // Every side he has played for, senior first, as badges. This is what the old
  // grouping conveyed; carrying it on the row costs one line and keeps the page
  // one row per player.
  const country=t=>t.replace(/\s+(U-?\d\d|Olympic Team|Olympic)$/i,"");
  const sides=p=>{
    const played=((MSTATS[p.tm_id]||{}).natl||[]).filter(x=>x.part==="P");
    const by=new Map();
    played.forEach(x=>{const t=(x.team||"").trim();if(!t)return;by.set(t,(by.get(t)||0)+1);});
    // Capped per the profile with no match list published. Without this the badge
    // cell is empty on a row that exists BECAUSE he is capped, which reads as a
    // rendering fault rather than as a gap in TM's data.
    const c=caps(p);
    if(!by.size&&c.stated)by.set(p.national_team,c.total);
    // Abbreviate only when every side is the same country. Haissem Hassan has
    // Egypt plus France U17/U18 and Moustafa Moustafa has Egypt U23 plus Germany
    // U16 -- shortening those to "U17" beside a French flag invites reading it as
    // Egypt U17, which is the exact confusion this whole view exists to prevent.
    const oneCountry=new Set([...by.keys()].map(country)).size<=1;
    return [...by.entries()]
      .sort((a,b)=>(isYouth(a[0])?1:0)-(isYouth(b[0])?1:0)||b[1]-a[1])
      .map(([t,n])=>{
        const flag=NATIDS[t]&&CRESTS[NATIDS[t]]
          ?`<img class="cc" src="${esc(CRESTS[NATIDS[t]])}" alt="" loading="lazy">`:"";
        // "Egypt Olympic Team" -> "Olympic", "Egypt U20" -> "U20". Every badge on
        // a row is nearly always the same country -- only 2 of 72 players span
        // two -- so repeating it five times spends the column on a word the flag
        // beside it already carries. The senior side keeps its full name, because
        // "Egypt" alone IS the distinction there, and the hover always shows the
        // unabbreviated side.
        const lvl=/^(.*?)\s+(U-?\d\d|Olympic Team|Olympic)$/i.exec(t);
        const label=(oneCountry&&lvl)?lvl[2].replace(/\s*Team$/i,""):t;
        // natside, not side: aside.side is the sidebar, and one class name for
        // both meant a sidebar rule could reach in and restyle these badges.
        return `<span class="natside ${isYouth(t)?"y":/^egypt/i.test(t)?"eg":"sr"}" title="${esc(t)} — ${n} appearance${n===1?"":"s"}">${flag}${esc(label)}<i>${n}</i></span>`;
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
      <table class="grid nttbl">${NTCOLS}${NTHEAD}<tbody>${g.map(p=>`<tr data-id="${esc(p.tm_id)}">
        ${starCell(p)}
        <td><span class="who">${p.photo?`<img class="face" src="${esc(p.photo)}" alt="" loading="lazy">`
          :`<span class="face ini">${esc(initials(p.name))}</span>`}<span class="nm"><b>${esc(p.name)}</b>
          <span>${esc(p.position||"")} · ${esc(p.club||"")}${p.plays_in?` · ${esc(p.plays_in)}`:""}</span></span></span></td>
        <td class="r num hide-s">${esc(p.age||"—")}</td>
        <td class="sides hide-s"><span class="sidesw">${sides(p)}</span></td>
        <td class="r caps-c">${capsCell(p)}</td></tr>`).join("")}</tbody></table></div>`;
  }).join("");
  wireRows();
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
    $("body").innerHTML=`<div class="empty"><b>Nobody matches</b>No player in this filter has recent club match data.${savedNote()}</div>`;
    return;
  }
  const row=p=>{
    const m=MSTATS[p.tm_id]||{}, s=m.status||{}, g=signal(p);
    const strip=stripHTML(p,10);
    // TWO COLUMNS, not one overloaded cell. G/A means goals and assists for
    // every player including a keeper -- 13 of 58 keepers here have one, and
    // hiding that behind a conditional made the column mean different things in
    // different rows, which is the one thing a column must never do.
    const ga=(s.g||s.a)?`${s.g?s.g+"G":""}${s.g&&s.a?" ":""}${s.a?s.a+"A":""}`:"—";
    // The defensive column: goals conceded and clean sheets over the SAME ten
    // matches the strip to its left draws, so the number and the run of games it
    // comes from are read together. Empty for anyone who is not a keeper or a
    // defender -- an outfield attacker has no goals-against to report.
    const dr2=defRecord(p,10);   // same ten matches the strip draws
    const def=!dr2?"—"
      :dr2.mins>=270
        ? `<b>${dr2.per90.toFixed(2)}</b><small class="cn">${dr2.cs} CS · ${dr2.ga} GA</small>`
        : `<span class="cn">${dr2.cs} CS · ${dr2.ga} GA</span><small class="cn">${dr2.mins}'</small>`;
    const crest=CRESTS[p.club_id]?`<img class="cc" src="${esc(CRESTS[p.club_id])}" alt="" loading="lazy">`:"";
    return `<tr data-id="${esc(p.tm_id)}">
      ${starCell(p)}
      <td><span class="who">${p.photo?`<img class="face" src="${esc(p.photo)}" alt="" loading="lazy">`
        :`<span class="face ini">${esc(initials(p.name))}</span>`}<span class="nm"><b>${esc(p.name)}</b>
        <span>${esc(p.age||"")} · ${crest}${esc(p.club||"")}${p.plays_in?` · ${esc(p.plays_in)}`:""}</span></span></span></td>
      <td>${strip}</td>
      <td class="hide-s tally"><b>${s.played||0}</b> played · ${s.bench||0} bench · ${s.out||0} out</td>
      <td class="r num hide-s">${esc(ga)}</td>
      <td class="r num hide-s">${def}</td>
      <td class="c">${g?`<span class="sig ${g[0]}">${g[1]}</span>`:`<span class="nostrip">—</span>`}</td>
      <td class="r hide-s"><small class="cn">${esc(s.latest_date||"")}</small></td></tr>`;
  };
  const cols=`<colgroup><col class="c-save"><col class="c-pl"><col class="c-st"><col class="c-ta"><col class="c-ga"><col class="c-gd"><col class="c-sg"><col class="c-dt"></colgroup>`;
  // Sortable, like the roster and Fixtures. This was the one table that was not,
  // and it is the table a scout uses to rank people -- "who is playing most",
  // "which keeper concedes least" are the questions it exists to answer, and
  // reading them off an unordered list is work the page should be doing.
  //
  // Sorting happens WITHIN each position group, not across them. Comparing a
  // keeper's minutes to a winger's is exactly what the grouping exists to
  // prevent, and a global sort would dissolve it.
  const SCCOLS=[["name","Player",""],["strip","Last 10 club games",""],
                ["played","Squad status","hide-s"],["ga","G/A","r hide-s"],
                ["def","GA / 90","r hide-s"],["sig","Signal","c"],
                ["date","Last game","r hide-s"]];
  const TITLES={ga:"Goals and assists in these matches",
    def:"Goalkeepers and defenders: goals conceded per 90, with clean sheets and goals against, over the same matches shown in the strip",
    played:"Matches started, benched and missed in this window"};
  const head=`<thead><tr><th class="c-save"></th>${SCCOLS.map(([k,label,cls])=>{
    const on=S.scsort===k;
    return `<th class="${cls}${on?" sorted":""}" data-sc="${k}"${TITLES[k]?` title="${esc(TITLES[k])}"`:""}>`
      +`${esc(label)}<span class="ar">${on?(S.scdir>0?"▲":"▼"):"▲"}</span></th>`;
  }).join("")}</tr></thead>`;

  // Ranking values. Every one is a number so the comparator stays simple, and
  // every one reads from the SAME source the cell renders from -- a sort that
  // ranks on a different figure than the column shows is the worst kind of bug
  // here, because both look right in isolation.
  const SIGRANK={regular:5,rotating:4,benched:3,fringe:2,"out of favour":1,"not in squad":0};
  const sckey=(p,k)=>{
    const st=(MSTATS[p.tm_id]||{}).status||{};
    if(k==="name")return p.name||"";
    if(k==="played"||k==="strip")return st.played||0;
    if(k==="ga")return (st.g||0)*2+(st.a||0);
    if(k==="def"){const r=defRecord(p,10);
      // No record sorts last in both directions rather than as zero: a winger
      // with no goals-against is not the best defensive record on the page.
      return r&&r.mins>=270?-r.per90:-Infinity;}
    if(k==="sig"){const g=signal(p);return g?SIGRANK[g[1]]??0:-1;}
    if(k==="date")return st.latest_date||"";
    return 0;
  };
  const scsort=arr=>arr.slice().sort((a,b)=>{
    const x=sckey(a,S.scsort), y=sckey(b,S.scsort);
    const c=typeof x==="string"?x.localeCompare(y):(x-y);
    // Name ties broken by name so the order is stable between redraws.
    return (c||String(a.name).localeCompare(String(b.name)))*S.scdir;
  });
  const legend=`<div class="sclegend">
      <span><i class="P"></i>played</span><span><i class="B"></i>benched</span>
      <span><i class="O"></i>not in squad</span>
      <span><i class="P hit">★</i>scored or assisted</span>
      <span><i class="P cs">✓</i>clean sheet (GK &amp; defenders)</span>
      <span><i class="P prev"></i>another club</span>
      <span>oldest → newest · hover a block for the match, score and minutes</span></div>`;

  // Grouped by position by default -- comparing a keeper's minutes to a winger's
  // is what the grouping exists to prevent. But sorting on a column is a request
  // to rank EVERYONE by it, which the per-group sort cannot do: "who played most
  // recently" spanned four separate tables. So a column sort flattens into one
  // table across all positions; a toggle switches back to grouped.
  const modes=`<div class="scmode">
      <button data-scg="1"${S.scflat?"":' class="on"'}>By position</button>
      <button data-scg="0"${S.scflat?' class="on"':""}>One list</button>
    </div>`;

  if(S.scflat){
    $("body").innerHTML=legend+modes
      +`<table class="grid sctbl">${cols}${head}<tbody>${scsort(list).map(row).join("")}</tbody></table>`;
  }else{
    $("body").innerHTML=legend+modes
      +SCGRP.map(([k,label])=>{
        const g=list.filter(p=>posOf(p)===k);
        if(!g.length)return "";
        return `<div class="scgrp"><div class="ntgh"><b>${esc(label)}</b><span>${g.length}</span></div>
          <table class="grid sctbl">${cols}${head}<tbody>${scsort(g).map(row).join("")}</tbody></table></div>`;
      }).join("");
  }

  // Clicking a column header sorts AND flattens -- a sort is a cross-position
  // ranking, so it drops the grouping to make one ordered list.
  $("body").querySelectorAll("th[data-sc]").forEach(th=>th.onclick=()=>{
    const k=th.dataset.sc;
    if(S.scsort===k&&S.scflat)S.scdir=-S.scdir; else {S.scsort=k;S.scdir=k==="name"?1:-1;}
    S.scflat=true;
    drawScouting();
  });
  // The By position / One list toggle.
  $("body").querySelectorAll("[data-scg]").forEach(b=>b.onclick=()=>{
    S.scflat=b.dataset.scg==="0";
    drawScouting();
  });
  wireRows();
}

/* ---------- view: build your Egypt XI ----------
   The one view that is play, not work. Pick a formation, fill eleven slots from
   the eligible pool, share the result as a link. No account, no budget: a dream
   team, not a scouting exercise. Everything it needs — photos, clubs, values,
   positions — is already in DATA, so this adds a screen, not a data source.

   The whole XI lives in the URL hash (#build?f=433&xi=id,id,...) so a shared
   link IS the team. That mirrors the shortlist's ?list= sharing: the same
   promise, that "send me yours" is a link and nothing is stored server-side. */

// Slot roles the pitch understands, coarser than TM's fifteen position strings.
// A picker keyed on the exact string would leave "Second Striker" or "Midfield"
// pickable for nothing, so every TM position maps to one PRIMARY role plus the
// roles it can reasonably cover — a Left Winger can take either wing, a Central
// Midfielder can sit as DM or push to AM. The map is generous on purpose: this
// is a game, and a slot no one can fill is a dead square on the pitch.
const ROLE_OK={
  "Goalkeeper":       ["GK"],
  "Centre-Back":      ["CB","LB","RB"],
  "Left-Back":        ["LB","CB"],
  "Right-Back":       ["RB","CB"],
  "Defender":         ["CB","LB","RB","DM"],
  "Defensive Midfield":["DM","CM","CB"],
  "Central Midfield": ["CM","DM","AM"],
  "Attacking Midfield":["AM","CM","LW","RW"],
  "Midfield":         ["CM","DM","AM"],
  "Left Midfield":    ["LW","AM","CM","LB"],
  "Left Winger":      ["LW","RW","AM","ST"],
  "Right Winger":     ["RW","LW","AM","ST"],
  "Second Striker":   ["ST","AM"],
  "Centre-Forward":   ["ST","AM"],
  "Attack":           ["ST","LW","RW","AM"],
};
// Which players may fill a given slot role. Falls back to the primary bucket so a
// player whose exact string is missing from the map is never stranded.
const PRIMARY={Goalkeeper:"GK","Centre-Back":"CB","Left-Back":"LB","Right-Back":"RB",
  "Defensive Midfield":"DM","Central Midfield":"CM","Attacking Midfield":"AM",
  "Left Winger":"LW","Right Winger":"RW","Centre-Forward":"ST"};
function roleFits(p,role){
  const ok=ROLE_OK[p.position];
  if(ok)return ok.includes(role);
  return PRIMARY[p.position]===role;
}

// Formations as slot layouts. x/y are percentages on the pitch (0,0 = top-left,
// attack at the top so the GK sits at the bottom like a real team sheet). The
// role decides who is pickable; the label is what the reader sees on an empty
// slot. Kept to the four shapes Egypt actually lines up in.
const FORMS={
  "433":{name:"4-3-3",slots:[
    {role:"GK",x:50,y:90},
    {role:"LB",x:16,y:70},{role:"CB",x:38,y:73},{role:"CB",x:62,y:73},{role:"RB",x:84,y:70},
    {role:"CM",x:30,y:48},{role:"CM",x:50,y:52},{role:"CM",x:70,y:48},
    {role:"LW",x:20,y:22},{role:"ST",x:50,y:16},{role:"RW",x:80,y:22}]},
  "4231":{name:"4-2-3-1",slots:[
    {role:"GK",x:50,y:90},
    {role:"LB",x:16,y:70},{role:"CB",x:38,y:73},{role:"CB",x:62,y:73},{role:"RB",x:84,y:70},
    {role:"DM",x:36,y:54},{role:"DM",x:64,y:54},
    {role:"LW",x:20,y:34},{role:"AM",x:50,y:38},{role:"RW",x:80,y:34},
    {role:"ST",x:50,y:14}]},
  "442":{name:"4-4-2",slots:[
    {role:"GK",x:50,y:90},
    {role:"LB",x:16,y:70},{role:"CB",x:38,y:73},{role:"CB",x:62,y:73},{role:"RB",x:84,y:70},
    {role:"LW",x:16,y:46},{role:"CM",x:38,y:49},{role:"CM",x:62,y:49},{role:"RW",x:84,y:46},
    {role:"ST",x:38,y:18},{role:"ST",x:62,y:18}]},
  "352":{name:"3-5-2",slots:[
    {role:"GK",x:50,y:90},
    {role:"CB",x:28,y:73},{role:"CB",x:50,y:75},{role:"CB",x:72,y:73},
    {role:"LB",x:12,y:50},{role:"CM",x:35,y:52},{role:"CM",x:50,y:55},{role:"CM",x:65,y:52},{role:"RB",x:88,y:50},
    {role:"ST",x:38,y:18},{role:"ST",x:62,y:18}]},
};
const ROLE_LABEL={GK:"Goalkeeper",CB:"Centre-back",LB:"Left-back",RB:"Right-back",
  DM:"Defensive mid",CM:"Central mid",AM:"Attacking mid",LW:"Left wing",RW:"Right wing",ST:"Striker"};

// The build state. xi maps slot index -> tm_id; nothing is persisted server-side,
// but the last team is remembered in this browser so a refresh does not wipe the
// pitch. The URL hash always wins over the cache when present.
const BUILD_KEY="reg-build";
const B={form:"433",xi:{},pickSlot:null,saved:null};
// The signed-in reader's kept squads, fetched from Supabase. null = not loaded
// yet (or signed out); an array once fetched. Held on B so the view can redraw
// the list without refetching on every keystroke.
async function loadSquads(){
  if(typeof Auth==="undefined"||!Auth.user){B.saved=null;return;}
  try{ B.saved=await Auth.squads(); }catch(_){ B.saved=[]; }
}
function buildLoad(){
  try{const raw=localStorage.getItem(BUILD_KEY);if(raw){const d=JSON.parse(raw);
    if(FORMS[d.form])B.form=d.form;
    if(d.xi&&typeof d.xi==="object")B.xi=d.xi;}}catch(_){}
}
function buildSave(){
  try{localStorage.setItem(BUILD_KEY,JSON.stringify({form:B.form,xi:B.xi}));}catch(_){}
}
// Encode the pitch into the hash. Slot order is the formation's own order, so the
// same team on the same formation always round-trips. Empty slots are a bare
// comma, which decode reads as "unfilled" — a link to a half-built team still works.
function buildHash(){
  const ids=FORMS[B.form].slots.map((_,i)=>B.xi[i]||"");
  return "#build?f="+B.form+"&xi="+ids.join(",");
}
function buildShareURL(){ return location.origin+location.pathname+buildHash(); }
// Read a #build hash into B. Returns true if it carried a team, so boot knows to
// open the view. Unknown ids are dropped rather than shown as blanks the reader
// cannot explain — the same rule the ?list= import uses.
function buildFromHash(){
  const h=location.hash||"";
  if(!h.startsWith("#build"))return false;
  const qs=new URLSearchParams(h.slice(h.indexOf("?")+1));
  const f=qs.get("f");
  if(FORMS[f])B.form=f;
  const known=new Set(DATA.map(p=>p.tm_id));
  const ids=(qs.get("xi")||"").split(",");
  const xi={};
  ids.forEach((id,i)=>{ if(id&&known.has(id))xi[i]=id; });
  B.xi=xi;
  return true;
}
// A team on a formation whose slots the picks no longer fit (switched 4-3-3 -> 3-5-2)
// keeps every pick that still fits its new slot's role and drops the rest, rather
// than clearing the pitch. Same player, same square where the square survives.
function reflowForm(newForm){
  const oldSlots=FORMS[B.form].slots, newSlots=FORMS[newForm].slots;
  const next={};
  const used=new Set();
  // First pass: same index, same role -> keep in place.
  newSlots.forEach((s,i)=>{
    const id=B.xi[i];
    if(id&&oldSlots[i]&&oldSlots[i].role===s.role){next[i]=id;used.add(id);}
  });
  // Second pass: rehome the rest into any free slot whose role the player fits.
  Object.entries(B.xi).forEach(([i,id])=>{
    if(used.has(id))return;
    const p=byId(id); if(!p)return;
    for(let j=0;j<newSlots.length;j++){
      if(next[j])continue;
      if(roleFits(p,newSlots[j].role)){next[j]=id;used.add(id);break;}
    }
  });
  B.form=newForm; B.xi=next; buildSave();
}
const byId=id=>DATA.find(p=>p.tm_id===id);

function drawBuild(){
  // Lazily fetch saved squads the first time a signed-in reader opens this view
  // (afterSignIn already loads them on a fresh sign-in, but a returning user with
  // a restored session reaches Build without going through it). Fire once, then
  // redraw when it lands; squadsHTML shows "Loading…" until then.
  if(typeof Auth!=="undefined"&&Auth.user&&B.saved==null){
    B._loading||(B._loading=true,loadSquads().finally(()=>{B._loading=false;
      if(S.view==="build")drawBuild();}));
  }
  const form=FORMS[B.form];
  const filled=form.slots.filter((_,i)=>B.xi[i]).length;
  const total=form.slots.length;
  const value=form.slots.reduce((s,_,i)=>{
    const p=B.xi[i]&&byId(B.xi[i]); return s+(p?num(p.market_value_eur):0);
  },0);
  // Average age over the players actually picked -- and only those with a known
  // age, so a blank age string does not drag the mean toward zero. Shown as one
  // decimal, the way a squad's average age is usually quoted.
  const ages=form.slots.map((_,i)=>B.xi[i]&&byId(B.xi[i])).filter(Boolean)
    .map(p=>num(p.age)).filter(a=>a>0);
  const avgAge=ages.length?(ages.reduce((a,b)=>a+b,0)/ages.length):0;
  $("count").innerHTML=`${filled}<small>of ${total} picked</small>`;

  const opts=Object.entries(FORMS).map(([k,f])=>
    `<option value="${k}"${B.form===k?" selected":""}>${esc(f.name)}</option>`).join("");

  // Each slot is either a filled tile (face, name, value) or an empty prompt
  // showing the role it wants. Positioned by percentage over the pitch.
  const slots=form.slots.map((s,i)=>{
    const id=B.xi[i], p=id&&byId(id);
    const sel=B.pickSlot===i?" picking":"";
    if(p){
      const face=p.photo?`<img class="bface" src="${esc(p.photo)}" alt="" loading="lazy">`
                        :`<span class="bface ini">${esc(initials(p.name))}</span>`;
      const last=p.name.split(/\s+/).slice(-1)[0];
      return `<button class="slot filled${sel}" data-slot="${i}" style="left:${s.x}%;top:${s.y}%"
          title="${esc(p.name)} — ${esc(ROLE_LABEL[s.role])}">
        ${face}
        <span class="bname">${esc(last)}</span>
        <span class="bmv">${esc(p.mv_now||"—")}</span>
        <span class="bx" data-clear="${i}" title="Remove">×</span></button>`;
    }
    return `<button class="slot empty${sel}" data-slot="${i}" style="left:${s.x}%;top:${s.y}%">
        <span class="bplus">+</span><span class="brole">${esc(ROLE_LABEL[s.role])}</span></button>`;
  }).join("");

  const valStr=value>=1e6?"€"+(value/1e6).toFixed(0)+"m":value>=1e3?"€"+Math.round(value/1e3)+"k":"€0";
  $("body").innerHTML=`
    <div class="build">
      <div class="buildbar">
        <label class="bfield">Formation
          <select id="bform">${opts}</select></label>
        <div class="bstat"><span>Squad value</span><b>${valStr}</b></div>
        <div class="bstat"><span>Avg age</span><b>${avgAge?avgAge.toFixed(1):"—"}</b></div>
        <div class="bstat"><span>Picked</span><b>${filled} / ${total}</b></div>
        <div class="bactions">
          <button class="bbtn" id="bsave"${filled?"":" disabled"}>Save squad</button>
          <button class="bbtn" id="bshare"${filled?"":" disabled"}>Share XI</button>
          <button class="bbtn ghost" id="bclear"${filled?"":" disabled"}>Clear</button>
        </div>
      </div>
      <div class="pitchwrap">
        <div class="pitch" id="pitch">
          <div class="pitch-lines" aria-hidden="true"></div>
          ${slots}
        </div>
      </div>
      <p class="buildnote">Pick anyone eligible for Egypt — dual or single nationality, at home or abroad.
        Tap a slot to choose. Your team lives in this browser and in the share link; no account needed.</p>
      ${squadsHTML()}
    </div>
    <div class="pickwrap" id="pickwrap" hidden></div>`;

  $("bform").onchange=e=>{ reflowForm(e.target.value); B.pickSlot=null; drawBuild(); };
  const sh=$("bshare"); if(sh)sh.onclick=shareBuild;
  const sv=$("bsave"); if(sv)sv.onclick=saveSquad;
  const cl=$("bclear"); if(cl)cl.onclick=()=>{
    B.xi={}; B.pickSlot=null; buildSave();
    history.replaceState(null,"",location.pathname); drawBuild();
  };
  $("pitch").querySelectorAll("[data-slot]").forEach(b=>b.onclick=e=>{
    if(e.target.dataset.clear!=null){
      delete B.xi[+e.target.dataset.clear]; buildSave(); drawBuild(); return;
    }
    B.pickSlot=+b.dataset.slot; drawBuild(); openPicker();
  });
  wireSquads();
  if(B.pickSlot!=null)openPicker();
}

// The saved-squads strip below the pitch. Three states, all honest about what an
// account buys: signed out, an invitation to sign in (the game still works, this
// only adds keeping); signed in with none, a gentle prompt; signed in with some,
// the collection — each row loads onto the pitch or deletes.
function squadsHTML(){
  if(typeof Auth==="undefined"||!Auth.user){
    return `<div class="squads">
      <div class="sqhead">Your saved squads</div>
      <p class="sqnote">Your team is kept in this browser and in the share link already.
        <button class="linklike" id="sqsignin">Sign in</button> to keep a collection of named
        squads that follows you to any device.</p></div>`;
  }
  if(B.saved==null)return `<div class="squads"><div class="sqhead">Your saved squads</div>
    <p class="sqnote">Loading…</p></div>`;
  if(!B.saved.length)return `<div class="squads"><div class="sqhead">Your saved squads</div>
    <p class="sqnote">None yet. Build an XI and press <b>Save squad</b> to keep it here.</p></div>`;
  const rows=B.saved.map(s=>{
    const f=FORMS[s.formation], nm=f?f.name:s.formation;
    const n=f?Object.keys(s.xi||{}).filter(k=>s.xi[k]).length:0;
    return `<div class="sqrow" data-load="${s.id}">
      <span class="sqname"><b>${esc(s.name)}</b><small>${esc(nm)} · ${n}/${f?f.slots.length:11}</small></span>
      <button class="sqdel" data-del="${s.id}" title="Delete">×</button></div>`;
  }).join("");
  return `<div class="squads"><div class="sqhead">Your saved squads <span class="sqn">${B.saved.length}</span></div>
    <div class="sqlist">${rows}</div></div>`;
}
function wireSquads(){
  const si=$("sqsignin"); if(si)si.onclick=()=>authOpen("signin");
  document.querySelectorAll("[data-load]").forEach(r=>r.onclick=e=>{
    if(e.target.dataset.del!=null)return; // the × handles itself
    const s=(B.saved||[]).find(x=>String(x.id)===r.dataset.load);
    if(!s)return;
    if(FORMS[s.formation])B.form=s.formation;
    // Copy the picks, keeping only ids the registry still has, so a squad saved
    // before a player left does not put a blank on the pitch.
    const known=new Set(DATA.map(p=>p.tm_id)), xi={};
    Object.entries(s.xi||{}).forEach(([k,id])=>{ if(id&&known.has(id))xi[k]=id; });
    B.xi=xi; B.pickSlot=null; buildSave();
    history.replaceState(null,"",buildHash());
    drawBuild();
  });
  document.querySelectorAll("[data-del]").forEach(b=>b.onclick=async e=>{
    e.stopPropagation();
    const id=b.dataset.del;
    b.disabled=true;
    try{ await Auth.deleteSquad(id); B.saved=(B.saved||[]).filter(x=>String(x.id)!==String(id)); }
    catch(_){ b.disabled=false; return; }
    drawBuild();
  });
}
// Save the current pitch as a named squad. Names it for the reader with a sensible
// default (the formation + a number) so saving is one click, but lets them rename.
async function saveSquad(){
  if(typeof Auth==="undefined"||!Auth.user){ authOpen("signin"); return; }
  const filled=FORMS[B.form].slots.filter((_,i)=>B.xi[i]).length;
  if(!filled)return;
  const dflt=FORMS[B.form].name+" XI"+((B.saved&&B.saved.length)?" "+(B.saved.length+1):"");
  const name=(prompt("Name this squad:",dflt)||"").trim();
  if(!name)return;
  const btn=$("bsave"); if(btn){btn.disabled=true;btn.textContent="Saving…";}
  try{
    const row=await Auth.saveSquad(name,B.form,B.xi);
    // saveSquad returns the inserted row(s); prepend so it shows at the top.
    const rec=Array.isArray(row)?row[0]:row;
    B.saved=[rec,...(B.saved||[])];
  }catch(err){
    if(btn){btn.disabled=false;btn.textContent="Save squad";}
    alert(err&&err.message?err.message:"Could not save the squad.");
    return;
  }
  drawBuild();
}

// The slot picker: every player who fits the chosen slot's role, searchable,
// value-sorted so the marquee names surface first. A player already on the pitch
// is shown as "picked" and, if chosen again, simply moves to the new slot — you
// cannot field the same man twice.
// The eligible/searched list for the current slot, sorted. Split out so the
// keystroke handler can rebuild only the LIST, never the input.
function pickList(role){
  const q=(B.pickQ||"").toLowerCase();
  // Without a search, offer the sensible pool: players who fit this slot's role.
  // The moment someone TYPES, they are naming a person, not browsing a position —
  // so search the WHOLE registry, not just the role. Filtering the search inside
  // the role filter is what made "omar" in a right-back slot return nothing: the
  // man is there, he just is not a right-back. Off-position hits still show, tagged
  // so the stretch is visible, and sorted below the ones who fit.
  let list=q
    ? DATA.filter(p=>(p.name+" "+(p.club||"")).toLowerCase().includes(q))
    : DATA.filter(p=>roleFits(p,role));
  list.sort((a,b)=>{
    if(q){
      const fa=roleFits(a,role), fb=roleFits(b,role);
      if(fa!==fb)return fa?-1:1;
    }
    return num(b.market_value_eur)-num(a.market_value_eur);
  });
  return list;
}
// Render (only) the results into the open modal. Called on every keystroke, so it
// must NOT touch the input — rebuilding the input on each key reset the caret to 0,
// and on an RTL page that made "omar" come out "ramo". Now the input is built once
// in openPicker and lives untouched; this repaints the list and the count beside it.
function renderPickList(role){
  const list=pickList(role);
  const q=(B.pickQ||"");
  const onPitch=new Set(Object.values(B.xi));
  const rows=list.slice(0,80).map(p=>{
    const here=onPitch.has(p.tm_id);
    const off=!roleFits(p,role);
    const face=p.photo?`<img class="pface" src="${esc(p.photo)}" alt="" loading="lazy">`
                      :`<span class="pface ini">${esc(initials(p.name))}</span>`;
    const crest=CRESTS[p.club_id]?`<img class="cc" src="${esc(CRESTS[p.club_id])}" alt="">`:"";
    return `<button class="pkrow${here?" here":""}" data-pid="${esc(p.tm_id)}">
      ${face}
      <span class="pinfo"><b>${esc(p.name)}</b>
        <small>${esc(p.position||"")} · ${crest}${isFree(p)?"Free agent":esc(p.club||"—")}</small></span>
      <span class="pmv">${esc(p.mv_now||"—")}</span>
      ${here?'<span class="ptag">On pitch</span>':off?'<span class="ptag off">Off position</span>':""}</button>`;
  }).join("");
  const cnt=$("pickcount");
  if(cnt)cnt.textContent=q
    ? `${list.length} match${list.length===1?"":"es"} across the registry`
    : `${list.length} eligible`;
  const box=$("picklist");
  if(box)box.innerHTML=rows||'<div class="pickempty">No player matches — try a different spelling.</div>';
  // (Re)bind the rows each render, since their markup was just replaced.
  const i=B.pickSlot;
  box&&box.querySelectorAll("[data-pid]").forEach(b=>b.onclick=()=>{
    const pid=b.dataset.pid;
    // One man, one shirt: if he is already on the pitch, vacate his old slot first.
    for(const k of Object.keys(B.xi))if(B.xi[k]===pid)delete B.xi[k];
    B.xi[i]=pid; buildSave();
    B.pickSlot=null; B.pickQ=""; $("pickwrap").hidden=true; $("pickwrap").innerHTML=""; drawBuild();
  });
}
function openPicker(){
  const i=B.pickSlot; if(i==null)return;
  const role=FORMS[B.form].slots[i].role;
  const wrap=$("pickwrap"); if(!wrap)return;
  // Build the shell ONCE. The input is created here and never rebuilt, so typing
  // never loses the caret. Only the list inside repaints as the query changes.
  wrap.hidden=false;
  wrap.innerHTML=`
    <div class="pickscrim" id="pickscrim"></div>
    <div class="pickbox" role="dialog" aria-label="Choose a player">
      <div class="pickhead">
        <div><b>Choose a ${esc(ROLE_LABEL[role].toLowerCase())}</b>
          <small id="pickcount"></small></div>
        <button class="pickx" id="pickx" aria-label="Close">×</button>
      </div>
      <input class="picksearch" id="picksearch" type="search" dir="ltr"
        placeholder="Search player or club…" value="${esc(B.pickQ||"")}">
      <div class="picklist" id="picklist"></div>
    </div>`;
  const close=()=>{ B.pickSlot=null; B.pickQ=""; wrap.hidden=true; wrap.innerHTML=""; drawBuild(); };
  $("pickscrim").onclick=close;
  $("pickx").onclick=close;
  const search=$("picksearch");
  search.oninput=e=>{ B.pickQ=e.target.value; renderPickList(role); };
  renderPickList(role);
  search.focus();
}

// Share writes the hash into the address bar and copies the full link. No modal:
// the button becomes its own confirmation, exactly like the shortlist's copy.
function shareBuild(){
  const url=buildShareURL();
  history.replaceState(null,"",buildHash());
  const btn=$("bshare"); if(!btn)return;
  const done=()=>{ btn.textContent="Link copied"; setTimeout(()=>{btn.textContent="Share XI";},1600); };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(done).catch(()=>{ prompt("Copy your XI link:",url); });
  }else{ prompt("Copy your XI link:",url); }
}

function drawBody(){
  if(S.view==="build")return drawBuild();
  if(S.view==="fix")return drawFixtures();
  if(S.view==="natfix")return drawNatFixtures();
  if(S.view==="nat")return drawNational();
  if(S.view==="scout")return drawScouting();
  drawTable();
}
// The saved-only toggle. Hidden until something is saved, because a control that
// can only ever return nothing is noise. Inside "My list" it is redundant -- that
// view is already saved-only -- so it hides there too rather than offering a
// switch that does nothing.
// Appended to an empty view when "Saved only" is on. Without it a shortlist of
// three players opening Fixtures reads "No upcoming fixtures" -- true of those
// three, and easily misread as true of the registry.
const savedNote=()=>S.onlySaved
  ? ` Showing only your ${SHORT.size} saved player${SHORT.size===1?"":"s"} — turn off “Saved only” to see everyone.`
  : "";
function drawSavedToggle(){
  // Belt and braces: the filter can never be ON with an empty list, whichever
  // route emptied it. The two callers clear it themselves, but this runs on every
  // draw, so a future path that removes a save cannot recreate the trap.
  if(!SHORT.size)S.onlySaved=false;
  const b=$("savedtgl");
  if(!b)return;
  const show=SHORT.size>0&&S.view!=="mine";
  b.hidden=!show;
  if(!show)return;
  b.className="savedtgl"+(S.onlySaved?" on":"");
  b.textContent=(S.onlySaved?"★ ":"☆ ")+"Saved only ("+SHORT.size+")";
  b.title=S.onlySaved
    ? "Showing only your saved players — click to show everyone"
    : "Show only your saved players, in this view and the others";
  b.onclick=()=>{S.onlySaved=!S.onlySaved;draw();};
}
// drawSavedToggle FIRST: it normalises S.onlySaved against an empty list, and the
// nav counts read that flag. Called after drawNav, the nav would spend one pass
// counting against a filter the toggle is about to clear.
function draw(){ drawSavedToggle(); drawNav(); drawFilters(); drawBody(); }

/* ---------- accounts ----------
   Signing in is optional and stays optional. Everything on this page works
   signed out, against localStorage, exactly as it did before accounts existed;
   an account moves the shortlist to the server so it survives a cleared browser
   and follows you to another device, and unlocks notes.

   That is why nothing here blocks: a scouting page that will not render because
   a database is slow is worse than one with no accounts at all. */
function authClose(){ AuthUI.close(); }

/* The dialog itself lives in auth.js, shared with the landing page. Two copies
   of a login form is two places for every bug. */
function authOpen(mode){
  AuthUI.open(mode, ()=>{
    if(Auth.user){
      // Signed in: pull this account's shortlist down.
      afterSignIn();
      return;
    }
    // Signed out: the shortlist belongs to the account that just left. Clearing
    // it is not data loss -- the server keeps it, and it comes back on the next
    // sign-in. Leaving it would show one person's saved players to whoever uses
    // this browser next.
    SHORT=new Set(); SHARED.clear(); listSet(SHORT);
    // The saved squads belong to the account that just left, exactly like the
    // shortlist. Drop them from memory so the next person on this browser does not
    // see them; the server keeps them for the next sign-in.
    B.saved=null;
    S.onlySaved=false;
    if(S.view==="mine")S.view="roster";
    drawAccount(); draw();
  });
}

/* The server is the shortlist. localStorage is only a cache of it, so that the
   stars are already drawn on the next visit before Supabase answers.

   This used to MERGE a signed-out list into the account, which was right while
   saving worked signed out. It no longer does, so there is no unsaved local list
   to rescue -- and merging now would be actively wrong: it would pull whatever
   the previous person on this browser had starred into the account of whoever
   signs in next.

   One exception, kept deliberately: ?list= shared links still merge, because
   those are an explicit act by the person clicking them. */
async function afterSignIn(){
  try{
    const server=await Auth.tracked();
    if(server){
      // Anything starred from a shared link before signing in is the reader's
      // own choice and gets pushed up; everything else comes down.
      for(const id of SHARED) if(!server.has(id)) { await Auth.track(id); server.add(id); }
      SHORT=new Set(server);
      listSet(SHORT);
    }
  }catch(_){ /* offline: keep the cached list and try again next sign-in */ }
  SHARED.clear();
  // Pull the reader's saved squads too, so the Build view shows their collection
  // the moment they land on it. Not awaited into the first paint elsewhere, but
  // here we are already post-sign-in, so it is cheap and makes the list appear
  // without a manual refresh.
  await loadSquads();
  drawAccount();
  draw();
}

function drawAccount(){
  const b=$("account");
  if(!b)return;
  if(Auth.user){
    // Was a straight sign-out confirm, which made the only thing you could do
    // with your account be to leave it. Now it opens the account panel, where
    // signing out is one option among changing your name and password.
    // Name wrapped so a narrow header can drop it to just the monogram, reclaiming
    // the width the tab strip and the saved/count controls need.
    b.innerHTML=`<span class="acctdot">${esc(Auth.initials)}</span><span class="acctname">${esc(Auth.displayName)}</span>`;
    b.title=`Signed in as ${Auth.email}`;
    b.onclick=()=>AuthUI.open("account",()=>{drawAccount();draw();});
  } else {
    b.textContent="Sign in";
    b.title="Sign in to keep your shortlist and notes";
    b.onclick=()=>authOpen("signin");
  }
}

async function boot(){
  const load=n=>fetch(`data/${n}.json`).then(r=>r.json()).catch(()=>({}));
  [DATA,MSTATS,CRESTS,NEXTM,NATIDS,NATFIX,SOFA]=await Promise.all(
    ["data","mstats","crests","nextm","natids","natfix","sofa"].map(load));
  // Copied from the dossier, where hiding a cap-tied player is right: that site
  // lists who Egypt can still sign. Here it is wrong. This registry answers "who
  // is out there at all", and a player cap-tied to Qatar is still an Egyptian
  // abroad — the International facet already says so, in a column built for it.
  // Left in, the filter made the file say 172 and the page say 170.
  DATA=DATA||[];

  // Only a signed-in reader has a shortlist, so only load the cache when a
  // session exists. Otherwise a sign-out would leave the previous user's stars
  // on screen for whoever opens the browser next.
  SHORT=Auth.load()?listGet():new Set();

  // Restore a session if there is one, then draw the account button. Deliberately
  // NOT awaited before the first draw below: the page must paint from the JSON it
  // already has, whether or not Supabase answers.
  drawAccount();
  $("authscrim").onclick=authClose;
  if(Auth.session){
    Auth.refresh()
      .then(s=>{ drawAccount(); return s?afterSignIn():null; })
      .catch(()=>{});
  }
  // A shared list arrives as ?list=id,id. MERGED, not replaced: opening a
  // colleague's link must not wipe your own saves, and a replace is
  // unrecoverable — there is no server copy to restore from.
  const qs=new URLSearchParams(location.search);
  // ?based=abroad|egypt — the landing page's two entry points. Applied as the
  // facet, not as a separate mode, so the sidebar shows what is filtering and
  // the reader can widen it without going back.
  const basedArg=qs.get("based");
  if(basedArg==="abroad"||basedArg==="egypt")S.f.based.add(basedArg);

  const shared=qs.get("list");
  if(shared){
    const known=new Set(DATA.map(p=>p.tm_id));
    let added=0;
    shared.split(",").map(s=>s.trim()).forEach(id=>{
      // Only ids that exist here. A stale or hand-edited link would otherwise
      // inflate the counter with players the page cannot draw.
      if(id&&known.has(id)&&!SHORT.has(id)){SHORT.add(id);SHARED.add(id);added++;}
    });
    if(added){
      // Persisted only for a signed-in reader. Signed out this stays in memory:
      // the link still works for the visit, but nothing is written to a browser
      // that has no account to attach it to.
      if(Auth.user){SHARED.forEach(id=>Auth.track(id).catch(()=>{}));listSet(SHORT);}
      S.view="mine";
    }
    // Drop the parameter so a refresh does not re-import, and so the address bar
    // reflects what is actually shown.
    history.replaceState(null,"",location.pathname);
  }

  // The squad builder. A #build link IS a team, so it wins over the browser's
  // remembered pitch; without one, restore whatever was last built here. Opening
  // a shared link drops the reader straight onto the pitch it describes.
  buildLoad();
  if(location.hash.startsWith("#build")){
    if(buildFromHash())S.view="build";
  }

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
