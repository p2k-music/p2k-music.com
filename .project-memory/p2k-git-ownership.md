---
name: p2k-git-ownership
description: "For any of P2K's projects, configure git under P2K's identity + his own remote so he keeps exclusive ownership/credit (never Aaron)."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9c81bb46-4ae8-40a5-8d60-1691431428b0
---

Standing rule (Aaron, 2026-07-06): every project of P2K's that we help with must be set up so **P2K has exclusive ownership and credit** — Aaron only assists, his account/identity must never be the owner or author.

**Why:** the work is P2K's; Aaron is helping/refining. Commits and repo ownership showing Aaron's name/email is wrong and must be corrected.

**How to apply (do this at the start of / when committing to any P2K project):**
- Set git identity: `git config user.name "P2K"` and `git config user.email "tajallatajalla2@gmail.com"` (P2K's GitHub email — this is what links commits to his account; the display name is cosmetic).
- Confirm the remote is P2K's: `origin` should be `github.com/p2k-music/...`.
- Never author/commit/push under Aaron's `aaron.styles9393@gmail.com`. If a local `user.email` override points to Aaron, fix it (it once did — see [[p2k-site-project]]).
- If existing history was authored under Aaron's email, offer to re-author it (filter-branch) + force-push so credit goes to P2K.

Aaron = the helper (`aaron.styles9393@gmail.com`). P2K = the owner (GitHub `p2k-music` / `tajallatajalla2@gmail.com`). See [[aaron-working-style]], [[p2k-site-project]].
