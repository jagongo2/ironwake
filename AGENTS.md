# 0.11 WebGL development

The user has adopted PixiJS WebGL as the development renderer, starting from
the optimized 0.11 game. This supersedes the earlier instruction to continue
development on `work/v0.12`. Keep the same resolution, camera, artwork and physics.

- Continue all game development on `work/v0.11-webgl`. Preserve `work/v0.12`, `preview/v0.11-fps`, and
  `archive/v0.23`; do not overwrite or merge their game changes into this branch.
- Production `ironwake-ten.vercel.app` uses classic 0.11 WebGL with its FPS toggle,
  explicitly released by the user on 2026-11-05.
- The user explicitly restored automatic public releases on 2026-11-05:
  after each requested update, run appropriate checks, commit and push to
  `work/v0.11-webgl`, deploy to production, and verify `ironwake-ten.vercel.app`.
  Do not ask for release confirmation each time. This supersedes the earlier
  preview-only rule. Keep the archived branches and `main` unchanged.
- Keep the 0.11 output budget and existing effects; do not add the 0.12 visual
  upgrades as part of the renderer migration.
- Keep unrelated `.vscode/` and `assets/branding/` files out of task commits.
