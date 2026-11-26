#!/usr/bin/env python3
"""
RIFTBOUND: ECHOES OF THE FALLEN - Asset pipeline.
Inspects, validates, copies and documents all supplied itch.io assets into
public/assets/ and emits machine-readable manifests for the Phaser runtime.

Sources (uploaded archives, extracted to game-assets-raw/):
  - PVFX Foundry (CC0 1.0 for sheets+manifests)
  - BDragon 750 Effect & FX Pixel All Free
  - Epic RPG World Pack - Ancient Ruins free demo
  - Tiny RPG Character Asset Pack 01 (Soldier & Orc)
  - Tiny RPG Character Asset Pack 02 (Demon_A & Blood Monster_A)
  - Raven Fantasy Icons (free)
"""
import json
import os
import shutil
import hashlib
from PIL import Image

RAW = "/home/z/my-project/game-assets-raw"
OUT = "/home/z/my-project/public/assets"

RUINS = f"{RAW}/itch.io/extracted/ruins/EPIC RPG World Pack - [FREE Demo]Ancient Ruins - Copia"
T1 = f"{RAW}/itch.io/extracted/tiny01/Tiny RPG Character Asset Pack 01 v2.0 -Free Soldier&Orc/Characters(100x100 split)"
T2 = f"{RAW}/itch.io/extracted/tiny02/Tiny RPG Character Asset Pack 02 -Free Demon_A&Blood Monster_A/Characters(100x100 split)"
RAVEN = f"{RAW}/itch.io/extracted/raven/Free - Raven Fantasy Icons"
PVFX = f"{RAW}/itch.io/extracted/pvfx/effects"
BDRAGON = {k: os.path.join(RAW, v) for k, v in json.load(open(f"{RAW}/inspect/bdragon_files.json")).items()}

manifest = {"generatedBy": "scripts/asset-tools/build_assets.py", "assets": []}


def emit(entry):
    manifest["assets"].append(entry)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()[:16]


def copy(src, dst, **meta):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    img = Image.open(dst)
    entry = {
        "file": os.path.relpath(dst, os.path.dirname(OUT)),
        "source": os.path.relpath(src, RAW),
        "width": img.size[0],
        "height": img.size[1],
        "sha256_16": sha(dst),
    }
    entry.update(meta)
    emit(entry)
    return entry


def alpha_bbox(path):
    """Bounding box of non-transparent pixels (used to calibrate body hitboxes)."""
    img = Image.open(path).convert("RGBA")
    return img.getbbox()


# ---------------------------------------------------------------- characters
CHARACTERS = {
    "player": {
        "dir": f"{T1}/Soldier/Soldier",
        "frame": 100,
        "license": "Tiny RPG Character Asset Pack 01 v2.0 free - Zerie (zerie.itch.io), free pack, credit appreciated",
        "anims": {
            "idle": "Soldier_Idle.png", "walk": "Soldier_Walk.png",
            "atk1": "Soldier_Attack01.png", "atk2": "Soldier_Attack02.png",
            "atk3": "Soldier_Attack03.png", "hurt": "Soldier_Hurt.png",
            "death": "Soldier_Death.png",
        },
    },
    "orc": {
        "dir": f"{T1}/Orc/Orc",
        "frame": 100,
        "license": "Tiny RPG Character Asset Pack 01 v2.0 free - Zerie (zerie.itch.io), free pack, credit appreciated",
        "anims": {
            "idle": "Orc_Idle.png", "walk": "Orc_Walk.png",
            "atk1": "Orc_Attack01.png", "atk2": "Orc_Attack02.png",
            "hurt": "Orc_Hurt.png", "death": "Orc_Death.png",
        },
    },
    "demon": {
        "dir": f"{T2}/Demon_A/Demon_A",
        "frame": 100,
        "license": "Tiny RPG Character Asset Pack 02 v1.01 free - Zerie (zerie.itch.io), free pack, credit appreciated",
        "anims": {
            "idle": "Demon_A_Idle.png", "walk": "Demon_A_Walk.png",
            "atk1": "Demon_A_Attack01.png", "atk2": "Demon_A_Attack02.png",
            "hurt": "Demon_A_Hurt.png", "death": "Demon_A_Death.png",
        },
    },
    "bloodmon": {
        "dir": f"{T2}/Blood Monster_A/Blood Monster_A",
        "frame": 100,
        "license": "Tiny RPG Character Asset Pack 02 v1.01 free - Zerie (zerie.itch.io), free pack, credit appreciated",
        "anims": {
            "idle": "Blood Monster_A_Idle.png", "walk": "Blood Monster_A_Walk.png",
            "atk1": "Blood Monster_A_Attack01.png", "atk2": "Blood Monster_A_Attack02.png",
            "hurt": "Blood Monster_A_Hurt.png", "death": "Blood Monster_A_Death.png",
        },
    },
}

characters_meta = {}
for key, spec in CHARACTERS.items():
    characters_meta[key] = {"frame": spec["frame"], "license": spec["license"], "anims": {}}
    for anim, fname in spec["anims"].items():
        src = os.path.join(spec["dir"], fname)
        if not os.path.exists(src):
            print(f"  ! missing anim {key}/{anim}: {fname}")
            continue
        dst = f"{OUT}/characters/{key}/{anim}.png"
        img = Image.open(src)
        frames = img.size[0] // spec["frame"]
        copy(src, dst, kind="character-anim", character=key, anim=anim, frames=frames,
             license=spec["license"])
        characters_meta[key]["anims"][anim] = {"frames": frames, "file": f"characters/{key}/{anim}.png"}
    # body calibration from idle frame 0
    idle = os.path.join(spec["dir"], spec["anims"]["idle"])
    tmp = f"/tmp/{key}_f0.png"
    Image.open(idle).convert("RGBA").crop((0, 0, spec["frame"], spec["frame"])).save(tmp)
    bbox = alpha_bbox(tmp)
    characters_meta[key]["idleFrame0AlphaBBox"] = bbox

# merchant
mer = f"{RUINS}/Characters/NPC Merchant-idle.png"
img = Image.open(mer)
frames = img.size[0] // 110
copy(mer, f"{OUT}/characters/merchant/idle.png", kind="character-anim", character="merchant",
     anim="idle", frames=frames,
     license="Epic RPG World Pack - Ancient Ruins free demo - Rafael Matos (rafaelmatos.itch.io)")
characters_meta["merchant"] = {"frame": 110, "anims": {"idle": {"frames": frames, "file": "characters/merchant/idle.png"}}}

# ---------------------------------------------------------------- tilesets
copy(f"{RUINS}/Tilesets/Tileset-Terrain2.png", f"{OUT}/tilesets/terrain.png", kind="tileset",
     tile=32, columns=36,
     license="Epic RPG World Pack - Ancient Ruins free demo - Rafael Matos")
copy(f"{RUINS}/Tilesets/wall-8 - 2 tiles tall-transparency.png", f"{OUT}/tilesets/walls.png", kind="tileset",
     tile=32, columns=10,
     license="Epic RPG World Pack - Ancient Ruins free demo - Rafael Matos")
copy(f"{RUINS}/Tilesets/Tileset-Animated Terrains-8 frames- transparency.png",
     f"{OUT}/tilesets/animated.png", kind="tileset", tile=32, columns=29,
     license="Epic RPG World Pack - Ancient Ruins free demo - Rafael Matos")

# ---------------------------------------------------------------- props
img = Image.open(f"{RUINS}/Props/altar 224x288 - standard.png")
copy(f"{RUINS}/Props/altar 224x288 - standard.png", f"{OUT}/props/altar.png", kind="prop",
     frameW=224, frameH=288, frames=img.size[0] // 224,
     license="Epic RPG World Pack - Ancient Ruins free demo - Rafael Matos")
img = Image.open(f"{RUINS}/Props/shrine or fountain 160x128-on grass.png")
copy(f"{RUINS}/Props/shrine or fountain 160x128-on grass.png", f"{OUT}/props/shrine.png", kind="prop",
     frameW=160, frameH=128, frames=img.size[0] // 160,
     license="Epic RPG World Pack - Ancient Ruins free demo - Rafael Matos")
img = Image.open(f"{RUINS}/Props/golden chalice 64x64-spirits.png")
copy(f"{RUINS}/Props/golden chalice 64x64-spirits.png", f"{OUT}/props/chalice.png", kind="prop",
     frameW=64, frameH=64, frames=img.size[0] // 64,
     license="Epic RPG World Pack - Ancient Ruins free demo - Rafael Matos")
copy(f"{RUINS}/Props/generic_estructure1-1-on grass.png", f"{OUT}/props/ruin_arch.png", kind="prop",
     frameW=182, frameH=224, frames=1,
     license="Epic RPG World Pack - Ancient Ruins free demo - Rafael Matos")
img = Image.open(f"{RUINS}/Props/atmospheric nature particles.png")
copy(f"{RUINS}/Props/atmospheric nature particles.png", f"{OUT}/props/particles.png", kind="prop",
     frameW=64, frameH=64, frames=img.size[0] // 64,
     license="Epic RPG World Pack - Ancient Ruins free demo - Rafael Matos")

# ---------------------------------------------------------------- PVFX effects
# key -> (pvfx id, flight frames for looping projectiles or null)
PVFX_SELECTION = {
    "melee_combo": ("melee/sword-combo", None),
    "greatsword": ("melee/greatsword-sweep", None),
    "spin_slash": ("melee/spin-slash", None),
    "fireball_flight": ("projectiles/fireball-flight", None),  # native loop
    "fireball_impact": ("fire/fireball-impact", None),
    "fire_nova": ("explosions/fire-nova", None),
    "fire_cast": ("fire/fire-cast", None),
    "ice_cast": ("ice/ice-cast", None),
    "frost_nova": ("ice/frost-nova", None),
    "magic_missile": ("projectiles/magic-missile", 16),  # frames 0..15 flight, 16+ impact
    "arcane_cast": ("arcane/arcane-cast", None),
    "blink_dash": ("arcane/blink-dash", None),
    "magic_circle": ("arcane/magic-circle", None),
    "teleport_in": ("arcane/teleport-in", None),
    "arcane_burst": ("explosions/arcane-burst", None),
    "hit_spark": ("impacts/hit-spark", None),
    "crit_hit": ("impacts/crit-hit", None),
    "blood_splat": ("impacts/blood-splat", None),
    "death_poof": ("impacts/death-poof", None),
    "slime_splat": ("impacts/slime-splat", None),
    "shockwave": ("impacts/shockwave-ring", None),
    "shadow_bolt": ("shadow/shadow-bolt", 9),  # 0..8 flight
    "void_rift": ("shadow/void-rift", None),  # native loop
    "soul_drain": ("shadow/soul-drain", None),
    "dark_mist": ("shadow/dark-mist", None),  # native loop
    "curse": ("shadow/curse", None),
    "shadow_spikes": ("shadow/shadow-spikes", None),
    "holy_heal": ("holy/holy-heal", None),
    "frozen_chill": ("status/frozen-chill", None),
    "slowed": ("status/slowed", None),
    "coin_pickup": ("ui/coin-pickup", None),
    "gem_pickup": ("ui/gem-pickup", None),
    "heart_pickup": ("ui/heart-pickup", None),
    "mana_pickup": ("ui/mana-pickup", None),
    "treasure_glint": ("ui/treasure-glint", None),  # native loop
    "chest_open": ("ui/chest-open", None),
    "level_up": ("ui/level-up", None),
    "embers": ("ambient/rising-embers", None),
    "dust_motes": ("ambient/dust-motes", None),
    "fog_bank": ("ambient/fog-bank", None),
    "magic_motes": ("ambient/magic-motes", None),
    "wall_torch": ("ambient/wall-torch", None),  # native loop
    "portal_idle": ("ambient/portal-idle", None),  # native loop
    "candle_flame": ("ambient/candle-flame", None),
    "big_explosion": ("explosions/big-explosion", None),
    "implosion": ("explosions/implosion", None),
}

effects_meta = {}
for key, (pvfx_id, flight) in PVFX_SELECTION.items():
    base = f"{PVFX}/{pvfx_id}/lit/grid"
    m = json.load(open(f"{base}/manifest.json"))
    src = f"{base}/sprite-sheet.png"
    dst = f"{OUT}/effects/{key}.png"
    sw, sh = m["source_size"]
    img = Image.open(src)
    cols = img.size[0] // sw
    frames = m["frames"]
    copy(src, dst, kind="vfx", pvfxId=pvfx_id, frameW=sw, frameH=sh, columns=cols,
         frames=len(frames), loop=m["loop_mode"] == "loop",
         license="PVFX Foundry - nerijs (nerijs.itch.io), CC0 1.0 for sprite sheets + manifests")
    durations = [f["duration"]["numerator_ms"] / max(1, f["duration"]["denominator"]) for f in frames]
    effects_meta[key] = {
        "file": f"effects/{key}.png", "frameW": sw, "frameH": sh, "columns": cols,
        "frames": len(frames), "durations": durations, "pivot": m["pivot"],
        "loop": m["loop_mode"] == "loop", "flightFrames": flight,
    }

# ---------------------------------------------------------------- BDragon fx
BDRAGON_SELECTION = {
    "bd_fire_bloom": "25",     # expanding fiery burst
    "bd_flame_jets": "64",     # dual upward flame tongues
    "bd_fire_sigil": "15",     # rotating square fire sigil
    "bd_vortex": "13",         # spinning pinwheel vortex
    "bd_fire_spiral": "03",    # growing spiral disc
    "bd_flame_dash": "23",     # horizontal flame streak
}
fx_meta = {}
for key, num in BDRAGON_SELECTION.items():
    src = BDRAGON[num]
    dst = f"{OUT}/fx/{key}.png"
    img = Image.open(src)
    frames = img.size[0] // 64
    copy(src, dst, kind="vfx", frameW=64, frameH=64, columns=frames, frames=frames,
         license="750 Effect and FX Pixel All Free - BDragon1727 (bdragon1727.itch.io), free pack, credit appreciated")
    fx_meta[key] = {"file": f"fx/{key}.png", "frameW": 64, "frameH": 64, "columns": frames,
                    "frames": frames, "durations": [70] * frames, "pivot": [32, 32], "loop": False}

# ---------------------------------------------------------------- Raven icons
# icon number -> semantic name (verified against full spritesheet grid)
ICONS = {
    "melee": 729,       # crossed swords
    "fireball": 993,    # orange flame
    "frost": 783,       # blue comet
    "arcane": 842,      # purple crystal cluster
    "whirlwind": 739,   # curved sickle/claw
    "dodge": 759,       # comet with trail
    "relic_shield": 857,
    "health_potion": 122,
    "mana_potion": 123,
    "gold": 65,         # golden chalice
    "xp": 921,          # yellow starburst
    "skull": 707,
    "boss": 225,
    "chest": 6,
    "chest_alt": 312,
    "key": 179,
    "portal": 875,
    "shop": 305,
    "tome": 289,
    "gem_green": 968,
    "gem_red": 96,
    "ring": 946,
    "shards": 843,
    "chalice": 65,
    "ghost": 5,
    "demon_face": 741,
}
icons_meta = {}
for name, num in ICONS.items():
    src = f"{RAVEN}/Separated Files/32x32/fb{num}.png"
    dst = f"{OUT}/icons/{name}.png"
    copy(src, dst, kind="icon", iconNumber=num,
         license="Raven Fantasy Icons free - ClockworkRaven (clockworkraven.itch.io), free pack, credit appreciated")
    icons_meta[name] = {"file": f"icons/{name}.png", "sourceIcon": f"fb{num}.png", "size": 32}

# ---------------------------------------------------------------- manifests
os.makedirs(f"{OUT}/manifests", exist_ok=True)
effects_meta.update(fx_meta)
with open(f"{OUT}/manifests/effects.json", "w") as f:
    json.dump(effects_meta, f, indent=1)
with open(f"{OUT}/manifests/characters.json", "w") as f:
    json.dump(characters_meta, f, indent=1)
with open(f"{OUT}/manifests/icons.json", "w") as f:
    json.dump(icons_meta, f, indent=1)
with open(f"{OUT}/manifests/asset-manifest.json", "w") as f:
    json.dump(manifest, f, indent=1)

total = len(manifest["assets"])
print(f"OK: {total} assets processed into {OUT}")
print(f"  characters: {sum(1 for a in manifest['assets'] if a['kind']=='character-anim')}")
print(f"  vfx: {sum(1 for a in manifest['assets'] if a['kind']=='vfx')}")
print(f"  icons: {sum(1 for a in manifest['assets'] if a['kind']=='icon')}")
print(f"  tilesets/props: {sum(1 for a in manifest['assets'] if a['kind'] in ('tileset','prop'))}")
for key in characters_meta:
    anims = characters_meta[key]["anims"]
    print(f"  {key}: bbox={characters_meta[key].get('idleFrame0AlphaBBox')} anims={{{', '.join(f'{k}:{v['frames']}' for k,v in anims.items())}}}")
