/* Landing page behaviour: live counts, and the shared sign-in dialog.

   The counts are READ from data/data.json rather than written into the HTML.
   Hard-coded figures on a landing page go stale the first time the crawl runs,
   and this project has already shipped a headline saying 93 while the page drew
   91. A number nobody maintains is a number that will eventually lie.

   The dialog itself is AuthUI, in auth.js, shared with the workspace. This file
   used to carry its own copy; the two had already drifted. */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Signing in from the landing page means you came here to work, so go there --
// but not from the account panel, where you are only editing your details.
const authOpen = mode => AuthUI.open(mode, () => {
  drawAccount();
  if (mode !== "account") location.href = "app.html";
});

/* ---------- account state ----------
   The bug this fixes: the hero said "Create your account" to everyone, signed
   in or not, because nothing ever rewrote it. Someone already signed in was
   being invited to make a second account -- and the button did nothing useful
   if they clicked it. Every element that depends on the session is set HERE, so
   there is one place where signed-in and signed-out are decided. */
function drawAccount() {
  const b = $("account"), join = $("herojoin"), go = $("herogo"), who = $("herowho");
  const free = $("herofree");
  const inSession = !!(Auth.user);

  if (b) {
    if (inSession) {
      b.innerHTML = `<span class="acctdot">${esc(Auth.initials)}</span>${esc(Auth.displayName)}`;
      b.title = `Signed in as ${Auth.email}`;
      b.onclick = () => authOpen("account");
    } else {
      b.textContent = "Sign in";
      b.title = "Sign in to track players and keep notes";
      b.onclick = () => authOpen("signin");
    }
  }

  if (join) {
    if (inSession) {
      // Nothing left to create. The useful second action is leaving.
      join.textContent = "Sign out";
      join.onclick = async () => {
        await Auth.signOut();
        drawAccount();
      };
    } else {
      join.textContent = "Create your account";
      join.onclick = () => authOpen("signup");
    }
  }

  if (go) go.textContent = inSession ? "Open the workspace" : "Browse the workspace";
  // "No account needed" is an answer to a question you stop asking once you have
  // one, so it goes when you sign in.
  if (free) free.hidden = inSession;
  if (who) {
    who.hidden = !inSession;
    if (inSession) who.textContent = `Signed in as ${Auth.displayName} · ${Auth.email}`;
  }
}

/* ---------- counts ---------- */
async function counts() {
  let data;
  try {
    data = await (await fetch("data/data.json")).json();
  } catch (_) {
    // Leave the em-dashes. A landing page that invents numbers when its own data
    // will not load is worse than one that admits it does not know yet.
    return;
  }
  const n = data.length;
  // based is written by registry.py. Older builds do not carry it, so fall back
  // to plays_in rather than reporting every player as abroad.
  const egypt = data.filter(p => (p.based || (p.plays_in === "Egypt" ? "egypt" : "abroad")) === "egypt").length;
  const dual = data.filter(p => p.track === "dual").length;
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v.toLocaleString(); };
  set("n-total", n);
  set("n-abroad", n - egypt);
  set("n-egypt", egypt);
  set("n-dual", dual);
  set("c-abroad", n - egypt);
  set("c-egypt", egypt);
}

Auth.load();
drawAccount();
$("authscrim").onclick = () => AuthUI.close();
// A stored session can be expired; refresh decides which, then the page is
// redrawn from the answer rather than from the optimistic first guess.
if (Auth.session) Auth.refresh().then(drawAccount).catch(() => { Auth.save(null); drawAccount(); });
counts();
