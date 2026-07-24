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

  async signUp(email, password) {
    // Invite-only for now. The check is here for a clear message; the database
    // enforces it too, because a check only in the front-end is not a check.
    const inv = await this.call(
      `/rest/v1/invite?email=eq.${encodeURIComponent(email.toLowerCase())}&select=email`,
      { auth: false }).catch(() => []);
    if (!inv || !inv.length)
      throw new Error("That email has not been invited yet.");
    const s = await this.call("/auth/v1/signup",
      { method: "POST", body: { email, password }, auth: false });
    // Supabase returns a session immediately when email confirmation is off, and
    // only a user object when it is on. Handle both rather than assuming.
    if (s.access_token) {
      this.save({ access_token: s.access_token, refresh_token: s.refresh_token, user: s.user });
      return { signedIn: true };
    }
    return { signedIn: false, confirm: true };
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
};
