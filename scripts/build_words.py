"""Builds Wordezy Scramble's answer pools.

Usage: python3 scripts/build_words.py src/data/words.ts <download-dir>

Inputs (all from public GitHub repos, cloned into <download-dir>):
  - dl/dict/enable1.txt   ENABLE word list (public domain) — the "is this a real word" check
  - dl/dict/popular.txt   common subset of ENABLE (dolph/dictionary)
  - dl/fw/content/2018/en/en_50k.txt  OpenSubtitles frequency ranks (hermitdave/FrequencyWords)

Output: a TS module with, per length 4..8, the most common words whose
letters spell no OTHER common word (so the intended answer is the obvious
one), plus any rarer ENABLE anagrams to also accept as correct.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
DL = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "dl"
OUT = Path(sys.argv[1])

enable = {w.strip() for w in open(DL / "dict/enable1.txt") if w.strip().isalpha()}
popular = {w.strip() for w in open(DL / "dict/popular.txt") if w.strip().isalpha()}

rank = {}
for i, line in enumerate(open(DL / "fw/content/2018/en/en_50k.txt")):
    w = line.split()[0]
    if w.isalpha() and w.islower() and w not in rank:
        rank[w] = i

# Words that are real but make poor or unwelcome answers in a family-friendly
# daily puzzle: sexual, violent, drug, slur-adjacent, bodily, or grim.
BLOCK = set("""
sex sexy sexual nude naked porn rape raped rapist kill killed killer killing kills murder murdered murderer
dead death die died dies dying corpse suicide drug drugs cocaine heroin weed stoned drunk booze
gun guns shoot shooting shot bomb bombs bullet bullets knife stab stabbed blood bloody gore
nazi nazis hitler slave slaves slavery racist racism terror terrorist torture abuse abused
breast breasts boob boobs penis vagina butt butts fart pee poop urine vomit puke
damn hell bitch bastard crap pissed whore slut sucks sucker screw screwed
virgin nipple nipples orgasm condom erotic lust horny pregnant abortion
hang hanged hanging prison jail crime criminal victim victims weapon weapons war wars
kidnap kidnapped hostage cancer tumor disease diseases sick sicker sickness cripple
lesbian gay gays queer dyke fag homo jew jews islam muslim christian christ jesus god gods satan devil
bloody hooker pimp stripper strip stripped nazi
fuck fucked fucking fucker dick cock suck pussy asshole bullshit goddamn screwing prick boob jerk
moron idiot stupid dope coke vodka liquor whiskey alcohol mistress funeral coma poison poisoned
homicide executed assault violent violence bleeding trauma injured injuries infected robbery robbed
bible pope bishop reverend goddess holy pray prayer catholic religion
yeah okay whoa jeez oops ouch blah heck gimme bleep monsieur madame narrator
cunt dong shitty scum geez ahem whew deceased tortured coffin cemetery widow bleed fatal banging almighty
""".split())

# First names and place/brand names that ENABLE happens to list as lowercase
# words, but which subtitles (our frequency source) rank highly only as names.
NAMES = set("""
john jack mike tony nick jake matt carl rick josh dean joey beth jess cole maya toby jill peter henry
harry jimmy billy tommy bobby roger maria jerry kelly laura jenny louis terry jesse molly sally donna
nancy randy ralph shawn sonny riley colin benny homer martin johnny morgan parker joseph jordan
victor miller nelson gloria graham caesar bonnie charlie franklin hercules veronica benjamin marshall
victoria superman batman mickey smith jones lewis walker cooper august japan greek dutch french soviet
berlin boston hong yang ford kirk kent mick chad chang perry romeo erica harper hector murphy
""".split())

# Grammar glue words make dull answers — nobody enjoys unscrambling "THAT".
FUNCTION = set("""
that have your just here they will when were then than some very only over into also such upon whom
thou thee from with this what there their where which would should could about after again those
these other while since until under above among whose either though although whether unless toward
been them well like come want know
""".split())

BLOCK |= NAMES | FUNCTION

def plural_of_real(w: str) -> bool:
    return w.endswith("s") and (w[:-1] in enable or (w.endswith("es") and w[:-2] in enable))

def key(w: str) -> str:
    return "".join(sorted(w))

by_letters = defaultdict(set)
for w in enable:
    if 4 <= len(w) <= 8:
        by_letters[key(w)].add(w)

pools = {}
alts = {}
for n in range(4, 9):
    cands = []
    for w in popular:
        if len(w) != n or w not in rank or w in BLOCK:
            continue
        if plural_of_real(w):
            continue
        # MAMA / PAPA-style words: too few distinct letters to be a puzzle.
        if len(set(w)) < 3:
            continue
        others = by_letters[key(w)] - {w}
        # Ambiguous if the same letters also spell another *common* word —
        # the player could fairly say "that's what I typed".
        if any(o in popular and o in rank for o in others):
            continue
        cands.append(w)
    cands.sort(key=lambda w: rank[w])
    limit = {4: 400, 5: 500, 6: 500, 7: 450, 8: 400}[n]
    pools[n] = cands[:limit]
    for w in pools[n]:
        others = sorted(by_letters[key(w)] - {w})
        if others:
            alts[w] = others

for n, p in pools.items():
    print(n, len(p), p[:12], p[-6:], file=sys.stderr)
print("answers with rarer accepted alternates:", len(alts), list(alts.items())[:10], file=sys.stderr)

lines = [
    "// GENERATED by scripts/build_words.py — do not edit by hand.",
    "// Answer pools by word length. Every answer is a common English word whose",
    "// letters spell no other common word, so the intended unscramble is the",
    "// obvious one. Sources: ENABLE (public domain) filtered by everyday-usage",
    "// frequency; offensive and grim words removed.",
    "",
    "export const ANSWERS_BY_LENGTH: Record<number, string[]> = {",
]
for n, p in pools.items():
    lines.append(f"  {n}: {json.dumps(p)},")
lines.append("};")
lines.append("")
lines.append("/** Rarer real words made from the same letters as an answer — accepted as")
lines.append(" *  correct too, so a player who finds one isn't told they're wrong. */")
lines.append(f"export const ALSO_ACCEPTED: Record<string, string[]> = {json.dumps(alts)};")
lines.append("")
OUT.write_text("\n".join(lines))
print("wrote", OUT, OUT.stat().st_size, "bytes", file=sys.stderr)
