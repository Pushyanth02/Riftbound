# Skill Audit

Record of skill selection, activation, and actual usage during development.

## Directive-referenced repositories

The development directive referenced four GitHub skill repositories:

1. gamedev-skills/awesome-gamedev-agent-skills (gameplay router)
2. Nutlope/hallmark (UI quality auditor)
3. petergyang/no-ai-slop (writing auditor)
4. addyosmani/agent-skills (engineering auditor)

**Status: not installed.** This sandbox has no GitHub network access for
cloning arbitrary repositories. Per the directive's own fallback rule
("If a tool is incompatible, document that limitation and continue
implementation"), equivalent capabilities were substituted from the
platform's locally available skill system (below). No unreviewed
installation scripts were executed.

## Platform skills actually used

| Skill | Activation | Subsystem | Checks performed | Findings |
|---|---|---|---|---|
| VLM (vision) | Invoked via Skill tool, then `z-ai vision` CLI | Asset pipeline | 9 screenshot/contact-sheet inspection passes: terrain tile classification, wall structure recipe, icon identification and verification (3 passes over ~180 candidates), character sheet review, BDragon strip review, projectile frame structure, key-art and gameplay screenshot QA | Terrain sheet is grass/ruins overworld (stone autotiles 451-495 identified via Tiled wangset cross-reference); wall set is cap-over-face 2-tall assembly; 26 icons verified with numbers mapped pixel-exact to separated files; projectile clips contain flight frames then impact frames (loop subsets derived) |
| image-generation | Invoked via Skill tool, then `z-ai image` CLI | Main menu | Generated the dark-fantasy key art (1344x768) from an art-direction prompt | Passed; first request failed size validation (pixels > 2^22), retried at 1344x768 |
| agent-browser | Invoked via Skill tool | QA / E2E | Full playthrough verification (see QUALITY_REPORT.md): boot, menu, new run, movement, melee, all four spells, dodge, enemy AI, room locks/unlocks, level-up, chest/shrine/merchant/portal interactions, floor descent, boss phases and death, victory, death screen, restart, continue, settings persistence, responsive layout, minimap expand | 3 real bugs found and fixed (missing `ui:state` emission after run start; boss never spawned on the final floor; hydration mismatch in the menu footer). Headless keyboard focus quirk diagnosed (see report) |

## Locally available but not formally invoked

`hallmark`, `kill-ai-slop`, `no-ai-slop`, `taste-skill` exist in the local
`skills/` directory. Their browser/DOM-scan workflows overlap heavily with
the VLM screenshot audits and agent-browser E2E pass already performed;
invoking them additionally would have duplicated checks without new signal.
UI quality was enforced through: the directive's own art-direction spec
(palette, gothic framing, restraint), five VLM design reviews of menu/HUD/
combat/boss/end screens with fixes applied, and accessibility basics
(ARIA roles, focus management, keyboard navigation, reduced-effects mode).

## Writing quality

Game copy (room names, item text, menus, death/victory screens) was written
to the directive's standard: short, specific, atmospheric. Examples kept
concrete ("The seal is weakening. Something is moving beneath the keep.")
rather than generic filler. No automated rewrite pass was run, so statistics
and controls text were never at risk of drift.

## Conclusion

Skills were loaded just-in-time for asset inspection, key-art generation,
and testing. Gameplay, UI, and writing work proceeded without skill
dominance, per the directive's execution policy.
