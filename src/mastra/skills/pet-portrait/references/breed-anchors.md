# Breed Anchors — what makes an owner say "that's actually him"

Checklist of visual features the prompt must read from the photo and
preserve in the illustration. Generic cartoon-animal output is the failure
mode everyone ships.

## Coat pattern and markings

These are fingerprints. Two golden retrievers are distinguished by:
- Specific patch locations (white chest blaze, dark saddle, mask vs no mask)
- Pattern type (solid, bicolour, tricolour, merle, brindle, tabby, tuxedo,
  calico, pointed, tortoiseshell)
- Individual quirks (the "odd sock" — one white paw among dark ones; a
  half-and-half face split; a distinctive spot on the nose bridge)

If the photo shows a brown tabby with a white chin and one white front paw,
the illustration must show exactly that — not "a tabby cat".

## Ear carriage

Often the single strongest silhouette cue:
- Erect / pricked (German Shepherd, Siamese)
- Floppy / pendant (Beagle, Cocker Spaniel)
- Rose / semi-erect (Greyhound, Shetland Sheepdog)
- Folded forward (Scottish Fold)
- Asymmetric (one up, one flopping — extremely common and endearing)
- Torn or notched tip (rescued ferals, older cats)

## Muzzle and nose

- **Short-muzzled (brachycephalic):** Pug, Bulldog, Persian — flat face,
  upturned nose, wider-set eyes. Keep the flat profile; do not elongate it
  into a generic snout.
- **Long-muzzled (dolichocephalic):** Borzoi, Collie, Siamese — narrow
  elegant taper. Keep the length; do not squish it round.
- **Medium:** most breeds — maintain the actual proportions from the photo.
- **Nose leather colour:** black, liver, pink, spotted — copy it.

## Eye colour and shape

- Round vs almond vs hooded
- Colour: amber, green, blue, heterochromia (one blue one gold is
  breed-typical in huskies and Turkish Van cats — preserve whichever eye
  is which colour)
- Expression: alert, sleepy, suspicious — carry the mood

## Tail

- Curled over back (Shiba, Akita, Pomeranian)
- Docked / naturally short (Corgi, Aussie)
- Long and plume (Golden, Persian)
- Whip-thin (Greyhound, Siamese)
- Bottle-brush / bushy (Maine Coon, Samoyed)

## Body proportions by group

| Group | Shape cues |
|-------|-----------|
| Cobby (Bulldog, Persian, Pug) | Wide chest, short legs, round head |
| Lithe (Siamese, Whippet, Abyssinian) | Long limbs, narrow chest, wedge head |
| Sturdy (Lab, Tabby domestic, Beagle) | Balanced proportions, medium build |
| Compact low (Corgi, Dachshund, Munchkin) | Long body, very short legs |
| Large heavy (Great Dane, Maine Coon, Newfoundland) | Massive frame, large paws |

## Failure modes to actively avoid

### 1. Generic cute-face substitution
The model defaults to a round face, huge circular eyes, tiny nose, and
stubby ears — regardless of breed. This makes every animal look like the
same Sanrio character. **If the source shows a pointy-eared greyhound with
a long narrow muzzle and tiny eyes, the illustration must too.**

### 2. Anthropomorphism
Standing upright on hind legs, wearing a hat, holding a coffee cup, having
human hands, sitting in a chair. **Never** unless the source photo literally
shows the animal in clothing.

### 3. Breed drift
A husky rendered as a generic fluffy white dog. A Maine Coon rendered as a
generic tabby with no ear tufts. The model is biased toward the most common
exemplar of "dog" or "cat" — the prompt must anchor it to the specific
breed's silhouette.

### 4. Symmetry enforcement
Real animals are often asymmetric: one ear up, a patch only on the left,
a scar, a torn ear tip. The model prefers symmetry. Asymmetric details are
what owners look for first.

### 5. Missing interaction in pet-with-owner frames
When the photo shows a real physical connection (dog being held, cat
sleeping on lap), the illustration must keep that spatial relationship — not
separate them into two floating portraits.
