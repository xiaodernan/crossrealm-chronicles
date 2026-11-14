# Crossrealm Chronicles — Combat System Design

> English mirror of `COMBAT_DESIGN.md`. For the open-source player-facing loop (the shipped web build), this page is the reference for combat numbers and early-game pacing.

## Action set (base kit)

| Key | Action | Damage | Notes |
|-----|--------|--------|-------|
| LMB | Light combo | 12 | 0.38s; mid-range |
| RMB | Heavy attack | 28 | 0.68s; high stance damage |
| Q | Lock-on / take-back | — | 20m target range |
| Ctrl | Dodge roll | 18 | 0.45s i-frames |
| Shift | Sprint | — | Adjusts to stamina bar |

## Value ranges

- Base HP: 100
- Light stance damage: 18 / +12 on hit
- Heavy stance damage: 42 / +28 on hit
- Combo stacking: raw damage cannot exceed 2s grace

## First stretch (enemy windows)

| Zone | Enemy | HP | Notes |
|------|-------|----|-------|
| Ash Woods | Greatwood Warden | — | Teaches dodge & light attack |
| Hollow Saints | Shadow disciple ×2 | 120 | Introduces dodge + counter |
| Stone Ring | Stone-ring rival | 180 | Teaches pose (stance) reading |
| Miller wastes | Aeolus’s crew ×2 | 90 | Teaches priority & target choice |

## UE5 implementation notes

- `UCrossrealmCombatComponent` interface reserved
- Animation notifies driving hit traces
- Lock-on via `AActor*` + SpringArm slot offset
- UI bound to `CurrentHealth / CurrentStamina` via UMG ProgressBar
