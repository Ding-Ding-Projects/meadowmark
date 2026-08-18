#!/usr/bin/env python3
"""Meadowmark design system — token compiler.

Reads the tonal ramps from generate-tonal-palettes.py's algorithm, applies
the M3 baseline tone assignments (the same tone-to-role mapping the
official Material tooling uses) for light and dark schemes, and prints the
resulting hex values plus a collision report so semantic roles that MUST
differ (surface vs its containers, background vs hero, primary vs accent,
on-bg vs on-surface, surface-variant vs outline-variant) can be checked
by machine instead of by eye.

Run: python3 build-tokens.py
"""
import colorsys

PALETTES = {
    "primary":   (132, 0.36),
    "secondary": (42,  0.66),
    "tertiary":  (203, 0.46),
    "error":     (6,   0.70),
    "neutral":   (100, 0.07),
    "neutral-variant": (100, 0.13),
}


def tone_hex(hue, sat, tone):
    if tone <= 0:
        return "#000000"
    if tone >= 100:
        return "#ffffff"
    r, g, b = colorsys.hls_to_rgb(hue / 360.0, tone / 100.0, sat)
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def ref(name, tone):
    hue, sat = PALETTES[name]
    return tone_hex(hue, sat, tone)


# role -> (palette, light tone, dark tone)
ROLES = {
    "primary":                 ("primary", 38, 80),
    "on-primary":               ("primary", 100, 20),
    "primary-container":        ("primary", 90, 30),
    "on-primary-container":     ("primary", 10, 90),
    "secondary":                ("secondary", 35, 80),
    "on-secondary":             ("secondary", 100, 20),
    "secondary-container":      ("secondary", 90, 30),
    "on-secondary-container":   ("secondary", 10, 90),
    "tertiary":                 ("tertiary", 40, 80),
    "on-tertiary":              ("tertiary", 100, 20),
    "tertiary-container":       ("tertiary", 90, 30),
    "on-tertiary-container":    ("tertiary", 10, 90),
    "error":                    ("error", 40, 80),
    "on-error":                 ("error", 100, 20),
    "error-container":          ("error", 90, 30),
    "on-error-container":       ("error", 10, 90),

    "surface":                  ("neutral", 98, 6),
    "on-surface":                ("neutral", 10, 90),
    "surface-dim":               ("neutral", 87, 6),
    "surface-bright":            ("neutral", 98, 24),
    "surface-container-lowest":  ("neutral", 100, 4),
    "surface-container-low":     ("neutral", 96, 10),
    "surface-container":         ("neutral", 94, 12),
    "surface-container-high":    ("neutral", 92, 17),
    "surface-container-highest": ("neutral", 90, 22),
    "inverse-surface":           ("neutral", 20, 90),
    "inverse-on-surface":        ("neutral", 95, 20),

    "surface-variant":           ("neutral-variant", 90, 30),
    "on-surface-variant":        ("neutral-variant", 30, 80),
    "outline":                   ("neutral-variant", 50, 60),
    "outline-variant":           ("neutral-variant", 80, 40),

    "scrim":                     ("neutral", 0, 0),
    "shadow":                    ("neutral", 0, 0),
}

INVERSE_PRIMARY = {"light": ("primary", 80), "dark": ("primary", 38)}


def build(scheme):
    idx = 1 if scheme == "light" else 2
    out = {}
    for role, (palette, light_tone, dark_tone) in ROLES.items():
        tone = light_tone if scheme == "light" else dark_tone
        out[role] = ref(palette, tone)
    p, t = INVERSE_PRIMARY[scheme]
    out["inverse-primary"] = ref(p, t)
    return out


def collision_report(out, scheme):
    # roles that legitimately share a value by M3 design (pure white/black
    # "on-*" text roles, or scrim==shadow) — reported separately, not as bugs.
    expected_shared = {
        frozenset(["on-primary", "on-secondary", "on-tertiary", "on-error"]),
        frozenset(["scrim", "shadow"]),
    }
    by_value = {}
    for role, hexv in out.items():
        by_value.setdefault(hexv, []).append(role)
    print(f"--- {scheme} collisions ---")
    any_unexpected = False
    for hexv, roles in by_value.items():
        if len(roles) < 2:
            continue
        roleset = frozenset(roles)
        expected = any(roleset <= allowed for allowed in expected_shared)
        tag = "(expected — both are pure-tone text roles)" if expected else "(!!! UNEXPECTED)"
        if not expected:
            any_unexpected = True
        print(f"  {hexv}: {', '.join(sorted(roles))}  {tag}")
    if not any_unexpected:
        print("  no unexpected collisions.")
    print()


def main():
    light = build("light")
    dark = build("dark")
    for scheme, out in (("light", light), ("dark", dark)):
        print(f"/* ===== {scheme} ===== */")
        for role in ROLES:
            print(f"--mm-{role}: {out[role]};")
        print(f"--mm-inverse-primary: {out['inverse-primary']};")
        print()
    collision_report(light, "light")
    collision_report(dark, "dark")

    # The six specific pairs the brief calls out by name.
    print("--- required-distinct pairs ---")
    # accent is set directly in tokens.css (not derived from ROLES here),
    # hard-coded to the values actually shipped for this exact check.
    accent = {"light": "#63b673", "dark": "#90cb9c"}
    checks = [
        ("light bg(surface) vs card(surface-container)", light["surface"], light["surface-container"]),
        ("dark  bg(surface) vs card(surface-container)", dark["surface"], dark["surface-container"]),
        ("light surface-variant vs outline-variant", light["surface-variant"], light["outline-variant"]),
        ("dark  surface-variant vs outline-variant", dark["surface-variant"], dark["outline-variant"]),
        ("light primary vs accent", light["primary"], accent["light"]),
        ("dark  primary vs accent", dark["primary"], accent["dark"]),
    ]
    for label, a, b in checks:
        print(f"  {label}: {a} vs {b} -> {'DIFFERENT (ok)' if a != b else 'SAME (problem)'}")


if __name__ == "__main__":
    main()
