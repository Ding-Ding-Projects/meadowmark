import colorsys

PALETTES = {
    "primary": (132, 0.36), "secondary": (42, 0.66), "tertiary": (203, 0.46),
    "error": (6, 0.70), "neutral": (100, 0.07), "neutral-variant": (100, 0.13),
}
def tone_hex(hue, sat, tone):
    if tone <= 0: return (0,0,0)
    if tone >= 100: return (255,255,255)
    r,g,b = colorsys.hls_to_rgb(hue/360.0, tone/100.0, sat)
    return (round(r*255), round(g*255), round(b*255))
def ref(name, tone):
    hue, sat = PALETTES[name]
    return tone_hex(hue, sat, tone)
def lin(c):
    c = c/255.0
    return c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
def rel_lum(rgb):
    r,g,b = rgb
    return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)
def contrast(rgb1, rgb2):
    l1, l2 = rel_lum(rgb1), rel_lum(rgb2)
    l1, l2 = max(l1,l2), min(l1,l2)
    return (l1+0.05)/(l2+0.05)

pairs = [
    ("primary", 40, "on-primary", 100, "light"),
    ("primary", 90, "on-primary-container", 10, "light (container)"),
    ("secondary", 40, "on-secondary", 100, "light"),
    ("secondary", 90, "on-secondary-container", 10, "light (container)"),
    ("tertiary", 40, "on-tertiary", 100, "light"),
    ("tertiary", 90, "on-tertiary-container", 10, "light (container)"),
    ("error", 40, "on-error", 100, "light"),
    ("error", 90, "on-error-container", 10, "light (container)"),
    ("primary", 80, "on-primary", 20, "dark"),
    ("primary", 30, "on-primary-container", 90, "dark (container)"),
    ("secondary", 80, "on-secondary", 20, "dark"),
    ("secondary", 30, "on-secondary-container", 90, "dark (container)"),
    ("tertiary", 80, "on-tertiary", 20, "dark"),
    ("tertiary", 30, "on-tertiary-container", 90, "dark (container)"),
    ("error", 80, "on-error", 20, "dark"),
    ("error", 30, "on-error-container", 90, "dark (container)"),
]
for pal, tone, onname, ontone, label in pairs:
    bg = ref(pal, tone)
    fg = ref(pal, ontone)
    c = contrast(bg, fg)
    flag = "OK" if c >= 4.5 else ("LOW" if c >= 3.0 else "FAIL")
    print(f"{label:20s} {pal:10s} t{tone:<3d} vs {onname:22s} t{ontone:<3d}  contrast={c:5.2f}  {flag}")

print()
print("--- tuning light 'X vs white' to find tone with contrast >= 4.5 ---")
for pal in ["primary", "secondary"]:
    for tone in range(20, 45):
        bg = ref(pal, tone)
        c = contrast(bg, (255,255,255))
        if c >= 4.5:
            print(f"{pal}: first tone >=4.5 contrast vs white is tone {tone} ({bg}) contrast={c:.2f}")
            break
