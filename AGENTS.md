# 0.11 WebGL development

The user has adopted PixiJS WebGL as the development renderer, starting from
the optimized 0.11 game. This supersedes the earlier instruction to continue
development on `work/v0.12`. Keep the same resolution, camera, artwork and physics.

- The sole active development and default branch is `work/v0.11-webgl` (package
  version `0.11.1-webgl`). Check the current branch and this file before editing
  or deploying. Switch to this branch before continuing work in an old checkout.
- Versions 0.12 and 0.23, the old `main`, and the FPS preview are historical
  experiments preserved in `jagongo2/ironwake-archive`. Do not restore their
  branches here or merge their game changes into this branch unless the user
  explicitly requests it. A larger version number does not identify the active game.
- Production `ironwake-ten.vercel.app` uses classic 0.11 WebGL with its FPS toggle,
  explicitly released by the user on 2026-11-05.
- The user explicitly restored automatic public releases on 2026-11-05:
  after each requested update, run appropriate checks, commit and push to
  `work/v0.11-webgl`, deploy to production, and verify `ironwake-ten.vercel.app`.
  Do not ask for release confirmation each time. This supersedes the earlier
  preview-only rule. Verify the current branch is `work/v0.11-webgl` and the
  game is 0.11 WebGL before publishing. Do not deploy from an old `main` checkout.
- Keep the 0.11 output budget and existing effects; do not add the 0.12 visual
  upgrades as part of the renderer migration.
- Keep unrelated `.vscode/` and `assets/branding/` files out of task commits.
