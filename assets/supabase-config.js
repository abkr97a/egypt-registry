/* Supabase connection for the registry.

   The publishable key is MEANT to be here. It ships to every visitor, and that is
   safe because row-level security constrains it in the database: verified by
   trying, an anonymous key can read published players and cannot write anything —
   both an INSERT into player and an INSERT into note return 42501.

   The SECRET key never appears in this repo. It lives in an environment variable
   on the machine that runs src/db/publish.py, and it bypasses RLS, which is
   exactly why it must not reach a browser. */
window.SB = {
  url: "https://xpximahfqsorcfdvgrvy.supabase.co",
  key: "sb_publishable_Pq7CbCFlFVpJpHusMhHeMw_d38cQ5Px",
};
