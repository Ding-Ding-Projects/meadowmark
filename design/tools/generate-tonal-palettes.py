#!/usr/bin/env python3
"""Meadowmark design system — tonal palette generator.

Generates M3-style tonal ramps (tone 0..100) for each key hue using HSL as
a practical, dependency-free stand-in for the HCT colour space the official
Material tooling uses. Hue and saturation are held constant per palette;
"tone" drives lightness directly, and the two extremes (0 and 100) are
clamped to pure black / pure white exactly as the real M3 tonal palettes do.

This is intentionally NOT a perceptual-uniformity claim — it is documented
here, once, so nobody mistakes the output for material-color-utilities
output. It is close enough for a hand-authored game landing site, and every
role derived from it is checked afterwards for accidental collisions.

Run: python3 generate-tonal-palettes.py
"""
import colorsys

# (name, hue-degrees, saturation 0..1)
PALETTES = {
    "primary":   (132, 0.36),   # harvest green — crops, growth
    "secondary": (42,  0.66),   # harvest gold — wheat, sunlight, barns
    "tertiary":  (203, 0.46),   # sky blue — weather, water, the mine's lanterns
    "error":     (6,   0.70),   # standard warm red
    "neutral":   (100, 0.07),   # soil-tinted warm grey-green, for surfaces
    "neutral-variant": (100, 0.13),  # same hue, more chroma, for outlines
}

# Standard M3 tone stops for a key-colour ramp.
KEY_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100]

# Extended stops needed to cover every surface-container role for the
# neutral ramp (0/4/6/10/12/17/20/22/24/30/40/50/60/70/80/87/90/92/94/95/96/98/99/100).
NEUTRAL_STOPS = sorted(set(KEY_STOPS + [4, 6, 12, 17, 22, 24, 87, 92, 94, 96, 98]))


def tone_to_hex(hue, sat, tone):
    if tone <= 0:
        return "#000000"
    if tone >= 100:
        return "#ffffff"
    lightness = tone / 100.0
    r, g, b = colorsys.hls_to_rgb(hue / 360.0, lightness, sat)
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def main():
    for name, (hue, sat) in PALETTES.items():
        stops = NEUTRAL_STOPS if name.startswith("neutral") else KEY_STOPS
        print(f"/* {name}  (hue {hue}, sat {sat}) */")
        for tone in stops:
            print(f"--mm-ref-{name}-{tone}: {tone_to_hex(hue, sat, tone)};")
        print()


if __name__ == "__main__":
    main()
