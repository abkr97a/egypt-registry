/* Landing page behaviour: live counts, and the same sign-in dialog the workspace
   uses.

   The counts are READ from data/data.json rather than written into the HTML.
   Hard-coded figures on a landing page go stale the first time the crawl runs,
   and this project has already shipped a headline saying 93 while the page drew
   91. A number nobody maintains is a number that will eventually lie. */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- sign-in dialog ----------
   Deliberately the same markup and classes as the workspace. Two copies of a
   login form is two places for a bug to live, and the styles already exist in
   workspace.css, which this page loads. */
function authClose() { $("authbox").hidden = true; $("authscrim").classList.remove("on"); }

function authOpen(mode) {
  const box = $("authbox"), signup = mode === "signup";
  box.innerHTML = `
    <div class="authhead">
      <b>${signup ? "Create your account" : "Sign in"}</b>
      <button class="x" id="authx" aria-label="Close">×</button>
    </div>
    <p class="authnote">${signup
      ? "Sign-up is invite-only while this is new."
      : "Your tracked players and notes follow your account."}</p>
    <form id="authform">
      <label>Email<input id="authemail" type="email" autocomplete="email" required></label>
      <label>Password<input id="authpass" type="password" autocomplete="${signup ? "new-password" : "current-password"}" required minlength="6"></label>
      <div class="autherr" id="autherr" hidden></div>
      <button class="authgo" type="submit" id="authgo">${signup ? "Create account" : "Sign in"}</button>
    </form>
    <div class="authalt">${signup
      ? `Already have an account? <a href="#" id="authswap">Sign in</a>`
      : `Been invited? <a href="#" id="authswap">Create your account</a>`}</div>`;
  box.hidden = false;
  $("authscrim").classList.add("on");
  $("authemail").focus();
  $("authx").onclick = authClose;
  $("authswap").onclick = e => { e.preventDefault(); authOpen(signup ? "signin" : "signup"); };
  $("authform").onsubmit = async e => {
    e.preventDefault();
    const err = $("autherr"), go = $("authgo");
    err.hidden = true; go.disabled = true; go.textContent = "Working…";
    try {
      const email = $("authemail").value.trim(), pass = $("authpass").value;
      if (signup) {
        const r = await Auth.signUp(email, pass);
        if (!r.signedIn) {
          box.innerHTML = `<div class="authhead"><b>Check your email</b>
            <button class="x" id="authx" aria-label="Close">×</button></div>
            <p class="authnote">We sent a confirmation link to ${esc(email)}. Open it, then sign in.</p>`;
          $("authx").onclick = authClose;
          return;
        }
      } else {
        await Auth.signIn(email, pass);
      }
      authClose();
      drawAccount();
      // Signing in from the landing page means you came here to work. Go there.
      location.href = "app.html";
    } catch (ex) {
      err.textContent = ex.message || "Could not sign in.";
      err.hidden = false;
      go.disabled = false; go.textContent = signup ? "Create account" : "Sign in";
    }
  };
}

function drawAccount() {
  const b = $("account");
  if (!b) return;
  if (Auth.user) {
    b.textContent = Auth.email.split("@")[0];
    b.title = `Signed in as ${Auth.email} — click to sign out`;
    b.onclick = async () => {
      if (!confirm(`Sign out of ${Auth.email}?`)) return;
      await Auth.signOut();
      drawAccount();
    };
  } else {
    b.textContent = "Sign in";
    b.title = "Sign in to track players and keep notes";
    b.onclick = () => authOpen("signin");
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
$("authscrim").onclick = authClose;
$("herojoin").onclick = () => authOpen("signup");
if (Auth.session) Auth.refresh().then(drawAccount).catch(() => {});
counts();
