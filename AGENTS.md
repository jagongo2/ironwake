# 0.11 WebGL development

The user has adopted PixiJS WebGL as the development renderer, starting from
the optimized 0.11 game. This supersedes the earlier instruction to continue
development on `work/v0.12`. Keep the same resolution, camera, artwork and physics.

- Continue all game development on `work/v0.11-webgl`. Preserve `work/v0.12`, `preview/v0.11-fps`, and
  `archive/v0.23`; do not overwrite or merge their game changes into this branch.
- Production `ironwake-ten.vercel.app` remains on 0.11 Canvas with its FPS toggle.
- Publish WebGL work only as a separate preview until the user requests release.
- Keep the 0.11 output budget and existing effects; do not add the 0.12 visual
  upgrades as part of the renderer migration.
- Keep unrelated `.vscode/` and `assets/branding/` files out of task commits.
