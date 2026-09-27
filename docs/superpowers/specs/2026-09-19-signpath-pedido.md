# SignPath Foundation application draft (signpath.org/apply)

Draft answers in English for the application form. Verify current form fields at
https://signpath.org/apply before submitting — the site did not expose the exact form fields
to automated fetch, only the general policy (roles, privacy disclosure, build-provenance
requirement).

## Project

- **Project name**: Excalisidian
- **Project URL**: https://github.com/lucasfide/excalisidian
- **License**: MIT
- **Short description**: Local-first desktop app (Windows/macOS/Linux, Tauri v2 + React) that
  combines Markdown note-taking with an Excalidraw-based drawing canvas in the same
  file-based vault. No server, no account, no plugins. Single-maintainer open source project,
  MVP stage, already publishing tagged releases (latest: v0.5.6).

## Build process

- **CI**: GitHub Actions, workflow `.github/workflows/release.yml`, triggered on `v*` tags.
- **Build steps**: `npm ci` → `npm test` → `tauri-apps/tauri-action@v0`, which runs
  `tauri build` (NSIS bundler) on `windows-latest` (plus separate macOS/Linux jobs in the
  same workflow, not part of the Windows signing request).
- **Provenance**: builds run only from tags pushed to this repository; the workflow has no
  external triggers (no `pull_request_target`, no manual dispatch from forks). Only the
  maintainer can push tags.
- **Artifact to sign**: the Windows NSIS installer produced by `tauri build`
  (`Excalisidian_<version>_x64-setup.exe`) and the updater artifact bundled alongside it
  (`createUpdaterArtifacts: true` in `src-tauri/tauri.conf.json`). The updater package is
  already signed with a separate minisign keypair (`TAURI_SIGNING_PRIVATE_KEY` GitHub
  secret); SignPath would add the Authenticode signature on top, it does not replace the
  minisign step.

## Roles (SignPath policy requires these to be named)

- **Committers and reviewers**: lucasfide (GitHub: @lucasfide) — sole maintainer, sole
  person with write access to the repository today.
- **Approvers** (who decides a release can be signed): lucasfide (GitHub: @lucasfide) — same
  person, since there is no team yet.

## Privacy statement to reference

README now has a dedicated "Privacidade" section (in Portuguese, since the app's docs and UI
are pt-BR) stating: no telemetry/analytics; the only unconditional network call is the
updater checking a public `latest.json` on GitHub Releases; the optional AI agent is
off by default and only calls a network API after the user explicitly enables it, picks a
provider and supplies their own API key; the allowed API hosts are hardcoded in
`src-tauri/capabilities/main.json`; the API key is stored in plaintext in `settings.json`
under `%APPDATA%` via `@tauri-apps/plugin-store` (not encrypted, not sent anywhere except the
chosen provider). This satisfies SignPath's required policy statement ("this program will
not transfer any information to other networked systems unless specifically requested by the
user") because the AI agent is opt-in per call.

## Manual checklist for the maintainer before/while applying

- [ ] Enable 2FA on the GitHub account @lucasfide (SignPath requires MFA for all
      repo/SignPath-access team members — currently unverified, must confirm it is on).
- [ ] Enable 2FA/MFA on the SignPath account once created.
- [ ] Re-read https://signpath.org/apply directly in a browser and fill the actual form
      fields (this draft could not be confirmed against the live form).
- [ ] Confirm the GitHub repository is public (it is: github.com/lucasfide/excalisidian).
- [ ] Confirm LICENSE file is present and is MIT (it is, per README).
- [ ] Point SignPath reviewers to the README "Assinatura de código" and "Privacidade"
      sections as the published code signing policy page.
- [ ] Decide and document what happens if the project ever gets a second contributor with
      write access (update the Committers/Approvers roles then — not urgent now).
- [ ] After approval: wire the SignPath signing step into
      `.github/workflows/release.yml` (currently only minisign-signs the updater artifact via
      `TAURI_SIGNING_PRIVATE_KEY`; Authenticode signing via SignPath will need its own step,
      likely via SignPath's GitHub Action, and a manual "approve this release" click in the
      SignPath dashboard per SignPath's approval-gate model).
