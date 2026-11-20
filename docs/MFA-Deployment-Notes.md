# MFA deployment prerequisites

The MFA PR requires operator review before any migration or deployment. Do not
rewrite an existing migration history. The runner recognizes only the two
checksum-pinned MFA migrations as late additions, preserves existing history
rows, and refuses automatic rollback of a history containing late migrations.
If an environment already applied a different version of an MFA migration,
stop on a history or catalog mismatch and prepare a separately reviewed forward
migration; do not edit its history or previously applied SQL.

An operator must grant the runtime role the MFA table and column permissions
shown in `backend/scripts/local/prepare.js`, including `DELETE` on
`mfa_challenges` for bounded retention and `UPDATE(last_totp_step, mfa_generation)` on
`user_mfa` for replay protection and factor replacement. The existing `auth_sessions` insert and update
grants must cover `mfa_verified` and `mfa_generation`. Review these privileges for each deployment
scope; the migrations do not grant them automatically.

Existing sessions default to unverified MFA assurance. Admins must sign in
again with their second factor before protected requests or refresh succeed.
Each accepted TOTP step is single-use across enrollment, login, recovery-code
regeneration, and disabling MFA. Users performing successive actions may need
to wait for the authenticator's next code.

Configure the dedicated MFA encryption key and administrator allowlist using
the existing deployment process. During key rotation, coordinate the current
version and current/previous keys across all application instances, run the
operator-only rotation procedure, and verify zero failures and remaining rows
before retiring the previous key. These notes do not authorize execution.
