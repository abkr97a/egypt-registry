/* Accounts, tracked players and notes — Supabase REST, no client library.

   WHY NO SDK. The registry has never loaded a third-party script, and Supabase's
   auth and data endpoints are plain REST. Pulling a CDN bundle for what is six
   fetch calls would add a dependency that can change under us, a second thing to
   keep current, and a network fetch before the page can boot. The whole file is
   below and does not move unless we move it.

   WHAT IS SAFE HERE. The publishable key ships to every visitor by design;
   row-level security constrains it in the database, verified by trying — an
   anonymous key can read published players and cannot write anything.

   OFFLINE BEHAVIOUR IS DELIBERATE. Every call is best-effort. Signed out, or with
   Supabase asleep, the site works exactly as it did before accounts existed: the
   shortlist falls back to localStorage and nothing blocks on the network. A
   scouting page that will not render because a database is slow is worse than one
   with no accounts. */

const AUTH_KEY = "reg-session";

const Auth = {
  session: null,          // { access_token, refresh_token, user:{id,email} }

  /* ---------- storage ---------- */
  load() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      this.session = raw ? JSON.parse(raw) : null;
    } catch (_) { this.session = null; }
    return this.session;
  },
  save(s) {
    this.session = s;
    try {
      s ? localStorage.setItem(AUTH_KEY, JSON.stringify(s))
        : localStorage.removeItem(AUTH_KEY);
    } catch (_) {}
  },
  get user() { return this.session && this.session.user; },
  get email() { return this.user && this.user.email; },

  // Supabase keeps arbitrary sign-up fields on the user as user_metadata, so a
  // display name costs no table, no migration and no extra request. It is the
  // whole reason this stays simple.
  get meta() { return (this.user && this.user.user_metadata) || {}; },
  get name() { return (this.meta.name || "").trim(); },
  // What to call someone, in the order of how personal it is. Falls back to the
  // local part of the address so this never renders blank.
  get displayName() {
    return this.name || (this.email ? this.email.split("@")[0] : "");
  },
  // Two initials for the avatar. Same rule as the player initials in the
  // workspace, so the two look like they belong to one product.
  get initials() {
    const s = this.displayName;
    const parts = s.split(/[\s._-]+/).filter(Boolean);
    return ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  },

  /* ---------- REST ---------- */
  async call(path, { method = "GET", body, auth = true, prefer } = {}) {
    const h = {
      apikey: SB.key,
      // The user's token when signed in, the publishable key otherwise. RLS reads
      // auth.uid() from this token, so it is what makes "only your own rows" true.
      Authorization: `Bearer ${(auth && this.session && this.session.access_token) || SB.key}`,
    };
    if (body) h["Content-Type"] = "application/json";
    if (prefer) h.Prefer = prefer;
    const r = await fetch(`${SB.url}${path}`, {
      method, headers: h, body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) {
      const msg = (data && (data.msg || data.message || data.error_description)) || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return data;
  },

  /* ---------- auth ---------- */
  async signIn(email, password) {
    const s = await this.call("/auth/v1/token?grant_type=password",
      { method: "POST", body: { email, password }, auth: false });
    this.save({ access_token: s.access_token, refresh_token: s.refresh_token, user: s.user });
    return this.session;
  },

  async signUp(email, password, name) {
    // Sign-up is open: anyone can create an account. It began invite-only while
    // the platform was private, but the site is a showcase now — friends, scouts
    // and pundits need to self-serve, and a login wall on registration was the
    // wrong first impression. Browsing was always open; an account only adds a
    // private shortlist and notes, so opening registration widens nothing that
    // was ever gated. (The invite table and is_invited() function still exist in
    // the schema, unused, if it ever needs turning back on.)
    // `data` becomes user_metadata. No profile table, no second write that can
    // half-succeed and leave an account with no name attached.
    const s = await this.call("/auth/v1/signup",
      { method: "POST", body: { email, password, data: { name: (name || "").trim() } },
        auth: false });
    // Supabase returns a session immediately when email confirmation is off, and
    // only a user object when it is on. Handle both rather than assuming.
    if (s.access_token) {
      this.save({ access_token: s.access_token, refresh_token: s.refresh_token, user: s.user });
      return { signedIn: true };
    }
    return { signedIn: false, confirm: true };
  },

  // A login form with no way back in strands anyone who forgets their password,
  // and the only recovery would be me editing the database by hand.
  //
  // Deliberately resolves the same way whether or not the address has an
  // account: telling a stranger "no such user" turns this endpoint into a way to
  // test whether a given person is a member.
  async resetPassword(email) {
    await this.call("/auth/v1/recover",
      { method: "POST", body: { email }, auth: false }).catch(() => {});
    return true;
  },

  // Used by the account panel to change the display name or the password. PUT
  // /user takes either, so one call covers both.
  async updateUser(patch) {
    const u = await this.call("/auth/v1/user", { method: "PUT", body: patch });
    if (this.session) this.save({ ...this.session, user: u });
    return u;
  },

  async signOut() {
    try {
      await this.call("/auth/v1/logout", { method: "POST", body: {} });
    } catch (_) { /* the local session goes regardless */ }
    this.save(null);
  },

  /* A stored token expires. Refresh once on boot so a returning user is not
     silently signed out mid-session, and treat failure as "signed out" rather
     than as an error to show — an expired token is normal, not a fault. */
  async refresh() {
    if (!this.session || !this.session.refresh_token) return null;
    try {
      const s = await this.call("/auth/v1/token?grant_type=refresh_token", {
        method: "POST", body: { refresh_token: this.session.refresh_token }, auth: false,
      });
      this.save({ access_token: s.access_token, refresh_token: s.refresh_token, user: s.user });
      return this.session;
    } catch (_) { this.save(null); return null; }
  },

  /* ---------- tracked players ---------- */
  async tracked() {
    if (!this.user) return null;
    const rows = await this.call("/rest/v1/tracked?select=tm_id");
    return new Set(rows.map(r => r.tm_id));
  },
  async track(tm_id) {
    if (!this.user) return;
    await this.call("/rest/v1/tracked", {
      method: "POST", body: { user_id: this.user.id, tm_id },
      // A double-click must not be an error: the row is already there, which is
      // the state the user asked for.
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  },
  async untrack(tm_id) {
    if (!this.user) return;
    await this.call(`/rest/v1/tracked?tm_id=eq.${encodeURIComponent(tm_id)}`,
      { method: "DELETE", prefer: "return=minimal" });
  },

  /* ---------- notes ---------- */
  async notes(tm_id) {
    if (!this.user) return [];
    return await this.call(
      `/rest/v1/note?tm_id=eq.${encodeURIComponent(tm_id)}&select=id,body,created_at,updated_at&order=created_at.desc`);
  },
  async addNote(tm_id, body) {
    if (!this.user) throw new Error("Sign in to write notes.");
    return await this.call("/rest/v1/note", {
      method: "POST", body: { user_id: this.user.id, tm_id, body },
      prefer: "return=representation",
    });
  },
  async deleteNote(id) {
    if (!this.user) return;
    await this.call(`/rest/v1/note?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
  },

  /* ---------- saved squads (Build XI) ----------
     A saved squad is one row: a name, a formation and the eleven picks as jsonb.
     The game works without any of this; these only add a kept collection for a
     signed-in reader, exactly as notes do. */
  async squads() {
    if (!this.user) return [];
    return await this.call(
      "/rest/v1/squad?select=id,name,formation,xi,updated_at&order=updated_at.desc");
  },
  async saveSquad(name, formation, xi) {
    if (!this.user) throw new Error("Sign in to save a squad.");
    return await this.call("/rest/v1/squad", {
      method: "POST", body: { user_id: this.user.id, name, formation, xi },
      prefer: "return=representation",
    });
  },
  async deleteSquad(id) {
    if (!this.user) return;
    await this.call(`/rest/v1/squad?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
  },
};

/* ---------------------------------------------------------------------------
   The sign-in dialog, ONCE.

   The landing page and the workspace each had their own copy of this markup and
   its submit handler. Two copies of a login form is two places to fix every bug
   and two chances for them to disagree -- and they already had: only one of them
   knew about the name field the moment it was added. This is the shared one.

   Modes: signin | signup | reset | account
--------------------------------------------------------------------------- */
const AuthUI = {
  esc: s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),

  close() {
    const b = document.getElementById("authbox"), s = document.getElementById("authscrim");
    if (b) b.hidden = true;
    if (s) s.classList.remove("on");
  },

  // onDone runs after a successful sign-in/sign-up so each page can react its
  // own way -- the workspace redraws, the landing page navigates.
  open(mode, onDone) {
    const box = document.getElementById("authbox");
    if (!box) return;
    const E = this.esc;
    const title = { signin: "Sign in", signup: "Create your account",
                    reset: "Reset your password", account: "Your account" }[mode] || "Sign in";
    const note = {
      signin: "Your shortlist and notes follow your account.",
      signup: "Free to join — keep a shortlist and private notes across devices.",
      reset: "We'll email you a link to set a new password.",
      account: "",
    }[mode];

    const field = (id, label, type, extra = "") =>
      `<label>${E(label)}<input id="${id}" type="${type}" ${extra}></label>`;

    let body;
    if (mode === "account") {
      body = `
        <div class="acctwho">
          <span class="acctav">${E(Auth.initials)}</span>
          <div><b>${E(Auth.displayName)}</b><small>${E(Auth.email)}</small></div>
        </div>
        <form id="authform">
          ${field("authname", "Display name", "text", `value="${E(Auth.name)}" autocomplete="name" maxlength="60"`)}
          ${field("authpass", "New password (leave blank to keep)", "password", 'autocomplete="new-password" minlength="6"')}
          <div class="autherr" id="autherr" hidden></div>
          <button class="authgo" type="submit" id="authgo">Save changes</button>
        </form>
        <div class="authalt"><a href="#" id="authout">Sign out</a></div>`;
    } else if (mode === "reset") {
      body = `
        <form id="authform">
          ${field("authemail", "Email", "email", 'autocomplete="email" required')}
          <div class="autherr" id="autherr" hidden></div>
          <button class="authgo" type="submit" id="authgo">Send reset link</button>
        </form>
        <div class="authalt">Remembered it? <a href="#" id="authswap">Sign in</a></div>`;
    } else {
      const signup = mode === "signup";
      body = `
        <form id="authform">
          ${signup ? field("authname", "Your name", "text",
              'autocomplete="name" required maxlength="60" placeholder="Amr Hassan"') : ""}
          ${field("authemail", "Email", "email", 'autocomplete="email" required')}
          ${field("authpass", "Password", "password",
              `autocomplete="${signup ? "new-password" : "current-password"}" required minlength="6"`)}
          ${signup ? `<p class="authhint">At least 6 characters.</p>` : ""}
          <div class="autherr" id="autherr" hidden></div>
          <button class="authgo" type="submit" id="authgo">${signup ? "Create account" : "Sign in"}</button>
        </form>
        <div class="authalt">${signup
          ? `Already have an account? <a href="#" id="authswap">Sign in</a>`
          : `New here? <a href="#" id="authswap">Create your account</a>
             <span class="authsep">·</span><a href="#" id="authforgot">Forgot password?</a>`}</div>`;
    }

    box.innerHTML = `<div class="authhead"><b>${E(title)}</b>
        <button class="x" id="authx" aria-label="Close">&times;</button></div>
      ${note ? `<p class="authnote">${E(note)}</p>` : ""}${body}`;
    box.hidden = false;
    const scrim = document.getElementById("authscrim");
    if (scrim) scrim.classList.add("on");

    const $ = id => document.getElementById(id);
    $("authx").onclick = () => this.close();
    const first = $("authname") || $("authemail") || $("authpass");
    if (first) first.focus();

    const swap = $("authswap");
    if (swap) swap.onclick = e => {
      e.preventDefault();
      this.open(mode === "signup" ? "signin" : "signup", onDone);
    };
    const forgot = $("authforgot");
    if (forgot) forgot.onclick = e => { e.preventDefault(); this.open("reset", onDone); };
    const out = $("authout");
    if (out) out.onclick = async e => {
      e.preventDefault();
      await Auth.signOut();
      this.close();
      if (onDone) onDone();
    };

    $("authform").onsubmit = async e => {
      e.preventDefault();
      const err = $("autherr"), go = $("authgo");
      err.hidden = true; go.disabled = true;
      const label = go.textContent; go.textContent = "Working…";
      try {
        if (mode === "account") {
          const patch = {};
          const nm = ($("authname").value || "").trim();
          const pw = $("authpass").value;
          if (nm !== Auth.name) patch.data = { name: nm };
          if (pw) {
            if (pw.length < 6) throw new Error("Password must be at least 6 characters.");
            patch.password = pw;
          }
          if (!Object.keys(patch).length) { this.close(); return; }
          await Auth.updateUser(patch);
        } else if (mode === "reset") {
          await Auth.resetPassword($("authemail").value.trim());
          box.innerHTML = `<div class="authhead"><b>Check your email</b>
            <button class="x" id="authx2" aria-label="Close">&times;</button></div>
            <p class="authnote">If that address has an account, a reset link is on its way.</p>`;
          $("authx2").onclick = () => this.close();
          return;
        } else if (mode === "signup") {
          const r = await Auth.signUp($("authemail").value.trim(), $("authpass").value,
                                      $("authname").value);
          if (!r.signedIn) {
            box.innerHTML = `<div class="authhead"><b>Check your email</b>
              <button class="x" id="authx2" aria-label="Close">&times;</button></div>
              <p class="authnote">We sent a confirmation link to
                ${E($("authemail") ? $("authemail").value : "")}. Open it, then sign in.</p>`;
            $("authx2").onclick = () => this.close();
            return;
          }
        } else {
          await Auth.signIn($("authemail").value.trim(), $("authpass").value);
        }
        this.close();
        if (onDone) onDone();
      } catch (ex) {
        // Supabase's raw messages are for developers. Translate the ones a
        // person can actually act on and pass the rest through.
        const raw = (ex && ex.message) || "";
        err.textContent = /invalid login/i.test(raw)
          ? "That email and password do not match."
          : /already registered|already been/i.test(raw)
          ? "That email already has an account — sign in instead."
          : /weak|password/i.test(raw) && /6|short/i.test(raw)
          ? "Password must be at least 6 characters."
          : raw || "Something went wrong. Try again.";
        err.hidden = false;
        go.disabled = false; go.textContent = label;
      }
    };
  },
};
