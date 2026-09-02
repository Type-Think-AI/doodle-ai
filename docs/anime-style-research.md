# Anime art-style research — a craft taxonomy for prompt authors

**Lane A deliverable (wave 3).** This file describes anime *looks* as craft — linework,
colour, face/body grammar, motion grammar, shot grammar — so a skill can evoke a
recognisable style **without naming any series, studio, artist or character.** Every
craft claim below is cited to a live source.

> **Binding rule from the brief (§1).** No franchise noun in any prompt-ready string.
> The "prompt-ready cue" lines in this file are written to be safe to paste into a
> model prompt as-is. Proper nouns appear ONLY in the *Sources* section (URLs) and in
> two clearly-marked cited-quote lines, never in a cue. See the grep result at the end.

How to read the tables: each family gives you five dials. A prompt author picks a
family, lifts the **prompt-ready cue**, and tunes it. The dials are the same five the
brief asked for, applied consistently so Lane B can turn them into `styleHint` strings.

- **Linework** — stroke weight, tapering, ink texture.
- **Colour** — flat cel fills vs gradients, palette temperature, era look.
- **Face & body grammar** — eye size/placement, nose treatment, proportion ratio.
- **Motion grammar** — frame cadence, smears, impact frames, speed lines.
- **Shot grammar** — the framing beat the style is known for.

---

## Part 1 — Shared craft vocabulary (the primitives every family reuses)

These are the underlying techniques. Families are combinations of them.

### Linework
- Anime character design leans on **large, expressive eyes with detailed highlights,
  small noses and mouths, and clean, simplified linework**, with hair treated as a
  bold major design element carrying personality ([pixune, Complete Guide & Examples](https://pixune.com/blog/anime-art-styles/)).
- The strongest single linework variable is **weight and texture**: "fine crosshatching"
  at one end vs "bold sharp linework" at the other ([James Palm, Anime/Manga AI prompt guide](https://james-palm.medium.com/anime-manga-ai-image-prompts-styles-4ea83b7e5efd)).

### Colour and shading
- **Cel / toon shading**: a thin matte ink line holding every form, **two or three
  discrete shadow blocks instead of smooth gradients**, and saturated fills that stay
  readable at thumbnail size ([anifusion, cel-shading style](https://anifusion.ai/style/cel-shading-anime-style-generator)).
- **90s cel (analog) look**: hand-painted acetate cels layered over painted
  backgrounds, 12–24 painted frames per second, giving **grain, softer line edges,
  optical lens flares and colour shifts** ([animepapa, traditional→digital](https://www.animepapa.com/the-transition-of-anime-from-traditional-to-digital-a-historical-perspective/); [Quora, older vs modern anime](https://www.quora.com/Why-do-older-anime-have-such-a-distinctly-different-artstyle-than-modern-anime)).
- **Modern digital look**: compositors add a **bloom that bleeds light softly over
  outlines, diffusion filters that soften the whole image, and digital gradients in
  hair and eyes** that were too labour-intensive in paint — the "fluffy / shiny" look
  ([Quora, technology & the fluffy look](https://www.quora.com/How-has-technology-impacted-the-art-style-of-anime-over-the-years-and-does-it-contribute-to-the-fluffy-look-of-modern-characters); [Quora, why modern anime is shiny](https://www.quora.com/Why-are-modern-anime-so-shiny)).

### Proportion
- Standard anime figures run **about seven to eight heads tall**; a super-deformed
  (chibi) figure's head is **one-third to one-half the total height**, i.e. roughly
  2–3.5 heads tall ([Ultimate Pop Culture Wiki, super deformed](https://ultimatepopculture.fandom.com/wiki/Super_deformed); [Clip Studio Tips](https://tips.clip-studio.com/en-us/articles/4898)).

### Motion grammar
- **Limited animation**: only the important parts of a scene move; the rest is held or
  reused. Normal-speed motion is drawn **"on twos"** — each drawing exposed for two
  frames, so **12 distinct drawings per 24fps** — and slower motion "on threes/fours"
  ([Inbetweening, Wikipedia (snippet)](https://en.wikipedia.org/wiki/Inbetweening); [Limited animation, Wikipedia (snippet)](https://en.wikipedia.org/wiki/Limited_animation); [pixune, limited animation](https://pixune.com/blog/what-is-limited-animation/)).
- **Smear frames**: stretched, multiplied or blended shapes inserted between keyframes
  to simulate motion blur along the path of movement, sold as fast motion or a fast
  transformation ([Smear frame, Wikipedia (snippet)](https://en.wikipedia.org/wiki/Smear_frame); [Quora, smear frames](https://www.quora.com/What-are-smear-frames-in-animation-and-how-do-you-create-them)).
- **Impact frames**: a single striking, high-contrast frame held for a split second at
  a hit or a burst, with exaggerated poses and sharp contrast ([Know Your Meme, impact frames](https://knowyourmeme.com/memes/cultures/impact-frames)).
- **Sakuga**: bursts of high-drawing-count, fluid animation reserved for key moments,
  contrasted against the limited-animation baseline ([Animétudes, on animetism/sakuga](https://animetudes.com/2020/04/08/on-animetism-or-the-importance-of-sakuga-to-theory/)).
- **Speed lines** — and the key east/west distinction: the Japanese convention draws
  the streaks **on the background and leaves the moving subject in sharp focus**, the
  opposite of the western habit of streaking the character ([Tropedia, Speed Stripes](https://tropedia.fandom.com/wiki/Speed_Stripes); [Motion lines, Wikipedia (snippet)](https://en.wikipedia.org/wiki/Motion_lines)).

---

## Part 2 — Style families (the twelve the brief named)

### 1. Shonen action
- **Linework** — bold, clear, high-readability strokes tuned to survive fast action;
  stronger eyelids and heavier lines than the romance register ([sane-ism, anime eyes](https://sane-ism.com/how-to-draw-anime-eyes-15-styles-every-artist-should-know/)).
- **Colour** — saturated cel fills, high contrast, hero-clear silhouettes.
- **Face/body** — angular, determined eyes; expressive but simplified faces; athletic
  7–8-head proportion.
- **Motion** — limited-animation baseline broken by **sakuga bursts, impact frames and
  heavy speed lines**; narratives that "develop through action" ([mashazart, anatomy of a hug](https://mashazart.substack.com/p/anatomy-of-a-hug)).
- **Shot** — the power-up stance, the clash freeze-frame, the wide reaction crowd.
- **Prompt-ready cue** — *bold clean cel-shaded action illustration, heavy confident
  outlines, saturated high-contrast colour, dynamic foreshortened pose, background
  speed lines with the figure in sharp focus, single held impact frame.*

### 2. Seinen realism
- **Linework** — heavy pen line with **dense crosshatch piling up in folds, hair and
  musculature**; sometimes deliberately rough/jagged ([anifusion, seinen realistic style (snippet)](https://anifusion.ai/style/seinen-realistic-anime-style-generator/); [anifusion, gritty seinen style (snippet)](https://anifusion.ai/style/chainsaw-man-style/)).
- **Colour** — muted, desaturated, ink-wash skin tones; sombre atmosphere; screentone
  stipple for grit.
- **Face/body** — more realistic anatomy and proportion, subdued eye detail, mature
  faces ([Quora, shonen vs seinen art](https://www.quora.com/What-is-the-difference-between-shonen-and-seinen-in-terms-of-art-style-or-animation-quality-Is-it-just-for-age-groups-or-is-there-something-else-behind-them-as-well)).
- **Motion** — grounded weight, fewer smears, restraint over spectacle.
- **Shot** — the quiet menacing close-up, the anatomical action beat.
- **Prompt-ready cue** — *gritty adult manga illustration, dense crosshatched ink
  shading, anatomically grounded proportions, muted desaturated palette, screentone
  texture, sombre cinematic lighting.*

### 3. Shojo romance
- **Linework** — delicate, fine lines; ornate paneling; **detailed lashes and eye
  glints** ([Quora, five types of manga](https://www.quora.com/What-are-the-5-types-of-manga-and-how-do-they-differ-from-each-other); [toonstream, anime eyes](https://toonstream.org/anime-eyes-explained-styles-meanings-drawing/)).
- **Colour** — soft, warm, often pastel; airy backgrounds.
- **Face/body** — the **largest, sparkliest eyes** of any register; slender elongated
  proportions; faces and emotion foregrounded.
- **Motion** — floating flower petals, sparkle overlays, slow-motion emotional beats;
  narratives that "develop through emotion" ([mashazart, anatomy of a hug](https://mashazart.substack.com/p/anatomy-of-a-hug); [artmoments, shonen vs shojo](https://www.artmoments.com/articles/from-spikes-to-sparkles)).
- **Shot** — the emotional close-up, the petal-drift pause, the blushing two-shot.
- **Prompt-ready cue** — *delicate romance illustration, fine thin linework, very large
  sparkling detailed eyes, soft warm pastel palette, floating flower petals and light
  sparkle overlay, tender emotional close-up.*

### 4. Chibi (super-deformed)
- **Linework** — simple, rounded, minimal internal detail.
- **Colour** — bright, flat, cheerful fills.
- **Face/body** — **2–3.5 heads tall; head one-third to one-half of total height;
  oversized head and eyes, tiny nose, stubby near-boneless limbs, stubby fingers**
  ([Chibi (style), Wikipedia (snippet)](https://en.wikipedia.org/wiki/Chibi_(style)); [animepapa, chibi origins](https://www.animepapa.com/the-origins-of-the-chibi-art-style-in-japanese-animation/); [Clip Studio, 7:1 vs chibi ratio](https://tips.clip-studio.com/en-us/articles/10547)).
- **Motion** — bouncy, exaggerated squash; tiny fast reactions.
- **Shot** — mascot pose, sticker-sheet grid, reaction cut-in.
- **Prompt-ready cue** — *cute chibi super-deformed character, two heads tall, oversized
  head and huge eyes, tiny nose, short stubby limbs, minimal detail, bright flat colours.*

### 5. Mecha
- **Linework** — precise **panel-line detail on hard-surface machinery**, crisp
  mechanical edges, metallic rim light along joints ([anifusion, sci-fi/mecha style (snippet)](https://anifusion.ai/style/sci-fi-anime-style-generator/)).
- **Colour** — metallic greys with saturated accent plating; neon HUD overlays;
  anamorphic lens flares.
- **Face/body** — human pilots in the standard register; the machine carries the design
  weight with heavy, stable, blocky silhouettes.
- **Motion** — weighty limited motion for scale, sakuga for combat, glint/flare accents.
- **Shot** — the cockpit-glass HUD, the towering low-angle hero shot of the machine.
- **Prompt-ready cue** — *hard-surface mecha illustration, crisp panel-line mechanical
  detail, metallic plating with rim light along joints, neon HUD overlay, anamorphic
  lens flare, low-angle heroic robot silhouette.*

### 6. Magical-girl
- **Linework** — clean, rounded, shojo-adjacent fine line.
- **Colour** — **colour-coded costumes, heavy pink and pastel, glowing accents**
  ([mrpopculture, pink in 90s magical-girl](https://mrpopculture.com/pink-in-90s-anime-imports-sailor-moon-and-the-magical-girl-takeover/)).
- **Face/body** — large bright eyes, youthful slender proportions.
- **Motion** — the signature **transformation sequence**: ribbons, glowing energy,
  radiant auras, floating accessories, hearts and stars, with a colour change or
  glowing eyes marking the power-up ([Aesthetics Wiki, Magical Girl](https://aesthetics.fandom.com/wiki/Magical_Girl); [Tropedia, transformation sequence](https://tropedia.fandom.com/wiki/Transformation_Sequence)).
- **Shot** — the mid-air transformation spin, the pose-and-declare, the sparkle finish.
- **Prompt-ready cue** — *magical-girl transformation illustration, clean rounded
  linework, bright pastel and pink colour-coded costume, glowing ribbons and radiant
  aura, floating hearts and stars, sparkle overlay, mid-transformation spin pose.*

### 7. Slice-of-life
- **Linework** — clean, gentle, unfussy; emphasis shifts from the figure to the world.
- **Colour** — **soft, muted, nostalgic palette that rejects harshness** even on
  hard subjects, wrapping scenes in a gentle haze ([animepapa, palette in visual storytelling](https://www.animepapa.com/the-significance-of-color-palette-in-violet-evergardens-visual-storytelling/)).
- **Face/body** — natural, approachable proportions; understated eyes.
- **Motion** — calm, held moments; ambient movement (steam, curtains, light) over action.
- **Shot** — the **meticulously detailed background carrying the emotion** — a dusk-lit
  store, a crowded station — anchoring an emotional register ([animepapa, slice-of-life backgrounds](https://animepapa.com/article/the-top-slice-of-life-anime-with-stunning-background-art/)).
- **Prompt-ready cue** — *warm slice-of-life illustration, clean gentle linework, soft
  muted nostalgic palette, richly detailed everyday background, golden dusk lighting,
  quiet unhurried moment.*

### 8. Sports
- **Linework** — anatomy-literate, athletic; strong graphic edges for readability in motion.
- **Colour** — bright team-clear palette, high contrast at the decisive beat.
- **Face/body** — **exaggerated foreshortened limbs, athletic mechanics**; emotional
  close-ups snapped back to a roaring wide court/field ([anifusion, sports manga style (snippet)](https://anifusion.ai/style/slam-dunk-style-generator/)).
- **Motion** — **the decisive play suspended mid-air (hang time), impact radiating
  through speed lines and debris**, dramatic freeze-frames ([animepapa, All Out!! rugby animation](https://animepapa.com/article/how-all-out-brings-rugby-to-life-through-dynamic-animation/); [animepapa, baseball scenes evolution](https://animepapa.com/article/the-artistic-evolution-of-baseball-scenes-in-sports-anime-over-the-decades/)).
- **Shot** — the airborne freeze, the sweat-flecked determined close-up, the wide roar.
- **Prompt-ready cue** — *dynamic sports illustration, athletic anatomy with dramatic
  foreshortening, figure suspended mid-air at the decisive moment, background speed
  lines and debris, sweat detail, sharp focus on the athlete.*

### 9. Dark fantasy
- **Linework** — heavy black masses, **high-contrast crosshatching and screentone
  stipple**, jagged weighty pen line ([anifusion, horror style](https://anifusion.ai/style/horror-anime-style-generator); [anifusion, dark seinen style (snippet)](https://anifusion.ai/style/attack-on-titan-style/)).
- **Colour** — near-monochrome, deep blacks, restrained accent colour; large parts of
  the frame fall to near-silhouette.
- **Face/body** — grounded seinen anatomy, gaunt or intense faces.
- **Motion** — selective — a single highlight (a tooth, an eye, a wet streak) carries
  the shot while the rest stays in shadow.
- **Shot** — the shadowed near-silhouette with one carrying highlight; the ominous
  low-key portrait.
- **Prompt-ready cue** — *dark-fantasy manga illustration, heavy black ink masses,
  high-contrast crosshatching and screentone, near-monochrome palette with a single
  restrained accent, most of the frame in shadow, one carrying highlight.*

### 10. 90s cel look
- **Linework** — softer analog line edges, hand-inked feel.
- **Colour** — hand-painted cel fills, visible **film grain**, optical lens flares,
  slight colour shift; painted background plates.
- **Face/body** — period proportions; less gradient in hair/eyes than modern digital.
- **Motion** — cel-era limited animation, held cels, stock repeats.
- **Shot** — the multiplane-camera composite, the grainy dramatic key.
- **Prompt-ready cue** — *retro 90s cel-animation look, hand-painted flat cel colours,
  visible film grain, soft analog line edges, optical lens flare, painted background
  plate, slightly faded palette.*

### 11. Modern digital
- **Linework** — clean vector-smooth line, line-stabilised strokes.
- **Colour** — **bloom bleeding light over outlines, diffusion softening, layered
  digital gradients in hair and eyes, multiple highlights and soft shadows** — the
  "shiny/fluffy" surface ([Quora, technology & fluffy look](https://www.quora.com/How-has-technology-impacted-the-art-style-of-anime-over-the-years-and-does-it-contribute-to-the-fluffy-look-of-modern-characters); [Quora, why modern anime is shiny](https://www.quora.com/Why-are-modern-anime-so-shiny)).
- **Face/body** — polished, glossy eyes with rich gradients.
- **Motion** — digital compositing, additive glows, smooth digital effects layers.
- **Shot** — the glossy backlit key visual with lens bloom.
- **Prompt-ready cue** — *modern digital anime look, clean smooth linework, soft bloom
  and diffusion, layered colour gradients in hair and eyes, glossy highlights,
  backlit atmospheric compositing.*

### 12. Watercolour / ink
- **Linework** — a **soft ink line laid over washes**, gentle and broken.
- **Colour** — **wet-on-wet colour bleed, salt-grain texture, paper-tooth showthrough,
  soft edges, dreamlike atmosphere** ([anifusion, watercolour style (snippet)](https://anifusion.ai/style/watercolor-anime-style-generator/); [anifusion, watercolour style page](https://anifusion.ai/style/watercolor-anime-style-generator)).
- **Face/body** — standard register softened by the medium; edges dissolve into wash.
- **Motion** — still, contemplative; the medium implies stillness.
- **Shot** — the seasonal portrait, the atmospheric landscape still, the novel-jacket key.
- **Prompt-ready cue** — *watercolour anime illustration, wet-on-wet colour bleed, soft
  broken ink line over washes, visible paper texture and salt grain, soft dissolving
  edges, gentle seasonal palette.*

---

## Part 3 — The named-genre → craft-signature map (the deliverable other lanes depend on)

The owner named three genres by their famous shows. Here each is mapped to the **craft
signature that makes people recognise the look**, with **no series, studio, artist or
character noun** — so a skill evokes the genre through craft, not trademark. Each row
composes primitives from Parts 1–2.

### Pirate voyage
- **Family base** — shonen action + adventure.
- **Linework** — bold expressive outlines; **exaggerated, rubbery, elastic limb
  proportions**; lively crowd faces ([anifusion, pirate/adventure shonen style (snippet)](https://anifusion.ai/style/one-piece-style-generator/)).
- **Colour** — **bright tropical-island palette**, warm sea-and-sky blues and sun-warm sand.
- **Face/body** — wide range of exaggerated silhouettes and expressive comedic faces.
- **Motion** — motion-line-heavy action, elastic stretch-and-snap, big impact beats.
- **Shot** — the crew on a ship's deck under open sky; the wanted-poster / bounty key;
  the comedic brawl.
- **Prompt-ready cue** — *bold adventurous cel-shaded illustration, exaggerated rubbery
  elastic limb proportions, expressive crowd faces, bright tropical island palette with
  warm sea-and-sky blues, heavy motion lines, characters on a ship deck under open sky.*

### Ninja village
- **Family base** — shonen action + a stealth/earth-tone world.
- **Linework** — detailed, weapon-and-gear-heavy character vocabulary; **dense
  crosshatch shading**; ability effects with a rim glow ([anifusion, ninja/kishimoto style (snippet)](https://anifusion.ai/style/naruto-style-generator/)).
- **Colour** — **muted earth tones and sandy, low-saturation neutrals** for gear and
  village, with a saturated accent for the technique effect ([Naruto OC Critiques, village colour trends](https://naruto-oc-critiques.tumblr.com/post/180967363689/what-color-trends-does-each-village-have)).
- **Face/body** — athletic standard register; headband/mask gear as identity signal.
- **Motion** — **hand-seal gesture beat before a technique** (a recognisable cinematic
  shorthand for "power incoming"), speed lines on the background, smoke and rim-glow
  bursts ([Quora, ninja hand seals](https://www.quora.com/What-are-the-Naruto-hand-seals-based-on-1); [Narutopedia, hand signs](http://naruto.fandom.com/wiki/Hand_sign)).
- **Shot** — the rooftop/forest leap; the hand-seal charge-up; the technique-release key.
- **Prompt-ready cue** — *detailed shonen-action illustration, athletic figures in
  wrapped stealth gear, muted earth-tone and sandy palette with one saturated glowing
  accent, dense crosshatch shading, a hands-together focusing gesture before a glowing
  power effect, background speed lines and smoke.*

### Monster tamer
- **Family base** — bright shonen adventure + creature/mascot design language.
- **Linework** — clean, rounded, friendly outlines on the creatures; simple internal detail.
- **Colour** — **limited, high-identity palette per creature** so each reads as its own
  brand; bright and cheerful.
- **Creature grammar** — **readable silhouette at coin size, one clear anatomy signal
  per creature, rounded shape language (rounded = friendly/safe, triangular = danger)**,
  a design that stays consistent and recognisable — the discipline the whole genre is
  built on ([creativebloq, 30 years of creature design](https://www.creativebloq.com/art/digital-art/what-artists-can-learn-from-30-years-of-pokemon-character-design); [rocketbrush, shape language](https://rocketbrush.com/blog/shape-language-in-game-character-design-how-to-make-characters-readable-and-consistent); [aiartdaily, mascot readable at coin size](https://aiartdaily.substack.com/p/1075-three-tested-prompts-for-retro)).
- **Face/body** — young human tamer in the standard register alongside the creature.
- **Motion** — bouncy, expressive creature motion; a "capture / call-out" action beat.
- **Shot** — the tamer-and-creature two-shot; the creature reveal; the badge/collection grid.
- **Prompt-ready cue** — *bright cheerful creature-collector illustration, clean rounded
  friendly outlines, an original rounded creature with a strong readable silhouette and
  one clear signature feature, limited high-identity colour palette, a young trainer
  companion, flat cel shading, outdoor adventure setting.*

---

## Notes for downstream lanes

- **For Lane B (`styleHint` authoring):** the "prompt-ready cue" lines are written to be
  lifted directly into a `styleHint`. They are franchise-free and describe craft, not
  IP. The five-dial structure (linework / colour / face-body / motion / shot) maps
  cleanly onto both the image builder and the 7 video builders, since the motion and
  shot dials give video-specific vocabulary (cadence, transformation beat, freeze).
- **For Lane D (image skills):** the strongest visual-identity families for stills are
  chibi, watercolour, cel/shonen, and the three named genres — all give a distinct
  thumbnail silhouette.
- **Consumer-language reminder (Shared rules):** these cues are the *model-facing*
  strings. Any *user-facing* label built from them must use consumer words (moving
  doodle, comes to life) — not video/render/resolution.

---

## Sources

Craft claims above are cited inline. Full source list (proper nouns confined here):

- pixune — Anime Art Styles, Complete Guide: https://pixune.com/blog/anime-art-styles/
- pixune — What Is Limited Animation: https://pixune.com/blog/what-is-limited-animation/
- pixune — Shape Language: https://pixune.com/blog/shape-language-technique/
- Wikipedia — Inbetweening: https://en.wikipedia.org/wiki/Inbetweening
- Wikipedia — Limited animation: https://en.wikipedia.org/wiki/Limited_animation
- Wikipedia — Smear frame: https://en.wikipedia.org/wiki/Smear_frame
- Wikipedia — Motion lines: https://en.wikipedia.org/wiki/Motion_lines
- Wikipedia — Chibi (style): https://en.wikipedia.org/wiki/Chibi_(style)
- Know Your Meme — Impact Frames: https://knowyourmeme.com/memes/cultures/impact-frames
- Animétudes — sakuga to theory: https://animetudes.com/2020/04/08/on-animetism-or-the-importance-of-sakuga-to-theory/
- Ultimate Pop Culture Wiki — Super deformed: https://ultimatepopculture.fandom.com/wiki/Super_deformed
- Clip Studio Tips — head:body ratio: https://tips.clip-studio.com/en-us/articles/10547
- Clip Studio Tips — drawing chibi: https://tips.clip-studio.com/en-us/articles/4898
- animepapa — chibi origins: https://www.animepapa.com/the-origins-of-the-chibi-art-style-in-japanese-animation/
- artmoments — shonen vs shojo: https://www.artmoments.com/articles/from-spikes-to-sparkles
- sane-ism — anime eyes 15 styles: https://sane-ism.com/how-to-draw-anime-eyes-15-styles-every-artist-should-know/
- toonstream — anime eyes explained: https://toonstream.org/anime-eyes-explained-styles-meanings-drawing/
- mashazart — anatomy of a hug (shonen/shojo): https://mashazart.substack.com/p/anatomy-of-a-hug
- Quora — shonen vs seinen art: https://www.quora.com/What-is-the-difference-between-shonen-and-seinen-in-terms-of-art-style-or-animation-quality-Is-it-just-for-age-groups-or-is-there-something-else-behind-them-as-well
- Quora — five types of manga: https://www.quora.com/What-are-the-5-types-of-manga-and-how-do-they-differ-from-each-other
- James Palm — anime/manga AI prompt styles: https://james-palm.medium.com/anime-manga-ai-image-prompts-styles-4ea83b7e5efd
- anifusion — cel-shading: https://anifusion.ai/style/cel-shading-anime-style-generator
- anifusion — watercolour: https://anifusion.ai/style/watercolor-anime-style-generator
- anifusion — seinen realistic: https://anifusion.ai/style/seinen-realistic-anime-style-generator/
- anifusion — gritty seinen: https://anifusion.ai/style/chainsaw-man-style/
- anifusion — dark seinen: https://anifusion.ai/style/attack-on-titan-style/
- anifusion — horror: https://anifusion.ai/style/horror-anime-style-generator
- anifusion — sci-fi/mecha: https://anifusion.ai/style/sci-fi-anime-style-generator/
- anifusion — sports manga: https://anifusion.ai/style/slam-dunk-style-generator/
- anifusion — pirate/adventure shonen: https://anifusion.ai/style/one-piece-style-generator/
- anifusion — ninja manga: https://anifusion.ai/style/naruto-style-generator/
- anifusion — style index: https://anifusion.ai/style/
- mrpopculture — pink in 90s magical-girl: https://mrpopculture.com/pink-in-90s-anime-imports-sailor-moon-and-the-magical-girl-takeover/
- Aesthetics Wiki — Magical Girl: https://aesthetics.fandom.com/wiki/Magical_Girl
- Tropedia — Transformation Sequence: https://tropedia.fandom.com/wiki/Transformation_Sequence
- Tropedia — Speed Stripes: https://tropedia.fandom.com/wiki/Speed_Stripes
- animepapa — palette in visual storytelling: https://www.animepapa.com/the-significance-of-color-palette-in-violet-evergardens-visual-storytelling/
- animepapa — slice-of-life backgrounds: https://animepapa.com/article/the-top-slice-of-life-anime-with-stunning-background-art/
- animepapa — All Out!! rugby animation: https://animepapa.com/article/how-all-out-brings-rugby-to-life-through-dynamic-animation/
- animepapa — baseball scenes evolution: https://animepapa.com/article/the-artistic-evolution-of-baseball-scenes-in-sports-anime-over-the-decades/
- animepapa — traditional to digital transition: https://www.animepapa.com/the-transition-of-anime-from-traditional-to-digital-a-historical-perspective/
- Quora — technology & the fluffy look: https://www.quora.com/How-has-technology-impacted-the-art-style-of-anime-over-the-years-and-does-it-contribute-to-the-fluffy-look-of-modern-characters
- Quora — why modern anime is shiny: https://www.quora.com/Why-are-modern-anime-so-shiny
- Quora — older vs modern anime: https://www.quora.com/Why-do-older-anime-have-such-a-distinctly-different-artstyle-than-modern-anime
- creativebloq — 30 years of creature design: https://www.creativebloq.com/art/digital-art/what-artists-can-learn-from-30-years-of-pokemon-character-design
- rocketbrush — shape language: https://rocketbrush.com/blog/shape-language-in-game-character-design-how-to-make-characters-readable-and-consistent
- aiartdaily — mascot readable at coin size: https://aiartdaily.substack.com/p/1075-three-tested-prompts-for-retro
- Naruto OC Critiques — village colour trends: https://naruto-oc-critiques.tumblr.com/post/180967363689/what-color-trends-does-each-village-have
- Quora — ninja hand seals: https://www.quora.com/What-are-the-Naruto-hand-seals-based-on-1
- Narutopedia — hand signs: http://naruto.fandom.com/wiki/Hand_sign


---

## Part 4 — Three more named genres for thumbnail-wall variety (Sep 2026)

**Why these three.** The four genre families that already shipped (pirate voyage,
ninja village, monster tamer, gag comic) are all *bright* or *earth-toned* and all
*character-forward*. To add variety on the thumbnail wall the new picks each had to
own a palette and subject register that shares nothing with the existing four **or
with each other**: a metallic hard-surface machine, a dark neon city, and a
near-monochrome shadow frame. Sports and isekai were rejected because their "dynamic
pose + speed lines" grammar overlaps shonen-action and pirate voyage; school-romance
and idol were rejected because their pastel-sparkle register overlaps the existing
magical-girl (Sparkle) family. The three below read as three distinct silhouettes at
coin size.

As in Parts 1–3, every craft claim is cited and **no franchise noun appears in any
prompt-ready cue** — only in the *Sources* URLs below.
Content was rephrased for compliance with licensing restrictions.

### Mecha / giant robot → `mecha-pilot`
- **Family base** — hard-surface mecha (Part 2 §5).
- **Linework** — crisp precise **panel-line detail across hard-surface plating**,
  clean mechanical edges and visible joints ([anifusion, sci-fi/mecha style](https://anifusion.ai/style/sci-fi-anime-style-generator/)).
- **Colour** — a restrained industrial palette; hue, saturation and lighting act as
  narrative instruments that define scale and allegiance rather than decoration, with
  metallic greys and one or two saturated accent plates ([animepapa, colour & lighting in mecha](https://animepapa.com/article/analyzing-the-use-of-color-and-lighting-in-mecha-animations/)).
- **Face/body** — human pilot in the standard register; the machine carries the design
  weight in a heavy, stable, blocky silhouette.
- **Motion** — weighty deliberate motion for scale, a hard glint or flare on the
  decisive beat.
- **Shot** — the **cockpit heads-up-display read** (a glowing multi-layer overlay and
  lens flare) and the towering low-angle hero shot ([animepapa, mecha cockpit HUDs](https://www.animepapa.com/the-evolution-of-mecha-cockpit-interfaces-and-huds-in-anime/); [Wikipedia, Mecha anime and manga](https://en.wikipedia.org/wiki/Mecha_anime_and_manga)).
- **Prompt-ready cue** — *hard-surface mecha illustration, crisp panel-line mechanical
  detail, metallic grey plating with one or two saturated accent plates and rim light
  along the joints, glowing cockpit HUD overlay, anamorphic lens flare, towering
  low-angle heroic robot silhouette.*

### Cyberpunk neon city → `neon-city`
- **Family base** — the Neo-Tokyo cyberpunk look.
- **Linework** — clean confident outlines with a slight **glow bleed where neon meets
  an edge**.
- **Colour** — the defining move is **extreme contrast between an inky dark base
  (charcoal/navy) and high-saturation neon accents (cyan, magenta)**, with slick
  rain-reflection shine ([media.io, cyberpunk city palette](https://www.media.io/color-palette/cyberpunk-city-color-palette.html); [media.io, cyberpunk palette combinations](https://www.media.io/color-palette/cyberpunk-color-palette.html)).
- **Lighting/world** — a perpetual twilight lit by **holographic advertisements and
  towering megastructures over cramped street markets**, i.e. the figure is lit by the
  signage, not the sky ([animepapa, cyberpunk aesthetics in anime](https://animepapa.com/article/the-significance-of-cyberpunk-aesthetics-in-anime-like-ergo-proxy/); [Aesthetics Wiki, Neo-Tokyo](https://aesthetics.fandom.com/wiki/Neo-Tokyo)).
- **Face/body** — standard register in invented near-future streetwear with thin
  light-line accents.
- **Motion** — a slow drift of steam and flickering light; the genre's motion-line
  vocabulary for a bike/chase beat exists but is optional ([anifusion, cyberpunk anime style](https://anifusion.ai/style/cyberpunk-anime-style-generator/)).
- **Shot** — the rain-slicked street level under a wall of stacked glowing signage,
  long mirror reflections on the wet ground.
- **Prompt-ready cue** — *cyberpunk neon-city illustration, inky near-black charcoal
  and midnight-blue base cut by high-saturation cyan and magenta neon, figure lit from
  the signage from the side and below, rain-slicked street throwing long neon
  reflections, towering holographic signs, light smog haze, slight glow bleed at
  edges.*

### Horror / supernatural → `eerie-shadow`
- **Family base** — dark fantasy / horror (Part 2 §9).
- **Linework** — line favours **form over detail**; jagged and weighty where it shows
  ([Manga Wiki, manga iconography](https://manga.fandom.com/wiki/Manga_iconography)).
- **Colour/shading** — built on **selective contrast and on what stays in shadow**:
  heavy black ink masses with high-contrast crosshatching and screentone stipple, most
  of the frame in near-silhouette so a single highlight (an eye, a tooth, a wet streak)
  carries the shot ([anifusion, horror anime style](https://anifusion.ai/style/horror-anime-style-generator)).
- **Screentone** — the mid-greys come from halftone dot/line screens, denser dots for
  darker areas — the pre-digital shading craft that AI "manga style" usually misses
  ([Manga Wiki, screentone](https://manga.fandom.com/wiki/Screentone); [engineerfix, screentones for shading](https://engineerfix.com/how-manga-artists-use-screentones-for-shading/); [kalon.ai, ink screentone panel art](https://www.kalon.ai/templates/manga-ai-art-prompts)).
- **Negative space** — heavy blacks and empty white panels both build mood; white is
  used as tense silence against the dense blacks ([Quora, scary-manga tips](https://www.quora.com/Im-trying-to-learn-how-to-make-a-scary-manga-Does-anyone-have-some-tips)).
- **Face/body** — grounded register, still and tense; **eerie, never gory** by product
  choice (a consumer B2C surface).
- **Shot** — the low-key ominous close-up half-lost in shadow.
- **Prompt-ready cue** — *supernatural-horror manga illustration, heavy solid black ink
  masses, high-contrast crosshatching and screentone stipple, near-monochrome deep
  blacks against paper white with at most one restrained cold accent, most of the frame
  in near-silhouette with a single carrying highlight, tense held stillness, eerie not
  gory.*

### Sources added for Part 4

Content was rephrased for compliance with licensing restrictions; proper nouns are
confined to these URLs.

- animepapa — colour & lighting in mecha animations: https://animepapa.com/article/analyzing-the-use-of-color-and-lighting-in-mecha-animations/
- animepapa — evolution of mecha cockpit interfaces & HUDs: https://www.animepapa.com/the-evolution-of-mecha-cockpit-interfaces-and-huds-in-anime/
- Wikipedia — Mecha anime and manga: https://en.wikipedia.org/wiki/Mecha_anime_and_manga
- media.io — cyberpunk city colour palette: https://www.media.io/color-palette/cyberpunk-city-color-palette.html
- media.io — cyberpunk colour palette combinations: https://www.media.io/color-palette/cyberpunk-color-palette.html
- animepapa — cyberpunk aesthetics in anime: https://animepapa.com/article/the-significance-of-cyberpunk-aesthetics-in-anime-like-ergo-proxy/
- Aesthetics Wiki — Neo-Tokyo: https://aesthetics.fandom.com/wiki/Neo-Tokyo
- anifusion — cyberpunk anime style: https://anifusion.ai/style/cyberpunk-anime-style-generator/
- anifusion — horror anime style: https://anifusion.ai/style/horror-anime-style-generator
- Manga Wiki — manga iconography: https://manga.fandom.com/wiki/Manga_iconography
- Manga Wiki — screentone: https://manga.fandom.com/wiki/Screentone
- engineerfix — how manga artists use screentones for shading: https://engineerfix.com/how-manga-artists-use-screentones-for-shading/
- kalon.ai — manga AI art prompts (ink, screentone, panel art): https://www.kalon.ai/templates/manga-ai-art-prompts
- Quora — tips for scary manga: https://www.quora.com/Im-trying-to-learn-how-to-make-a-scary-manga-Does-anyone-have-some-tips
