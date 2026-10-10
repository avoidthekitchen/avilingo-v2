# BeakSpeak illustrations

Generated with the built-in image generation tool. Runtime assets are transparent 384 × 384 WebP files, displayed at 144 CSS pixels. Vite imports keep their URLs correct in web and packaged native builds. Illustrations are decorative; adjacent text supplies the meaning.

These illustrations are not bird photos. Bird photos are bundled under `public/content/bird-photos/`. If one fails to load, `components/shared/BirdPhoto.tsx` swaps in `../bird-photo-fallback.svg` instead. That swap is only a safety net for a missing or corrupt packaged file: photos no longer load over the network, and the E2E suite fails if the fallback appears in normal use.

Navigation and lock artwork lives in `components/shared/AppIcon.tsx`: original SVG paths that inherit the control color and scale with accessibility text size.

## Listening bird prompt

Create one polished transparent-background illustration asset for BeakSpeak, a bird song learning app. A charming but naturalistic Pacific Northwest chickadee perched on a small sage-green leafy twig, head tilted attentively toward three small curved sound waves. Editorial field-guide illustration, clean hand-cut shapes with subtle gouache texture, restrained detail readable at 120px, sophisticated rather than childish, charcoal head and bib, warm ivory body, warm brown #8B6F47 and sage #5B8A72 accents. Centered square composition, generous clear perimeter, no text, no frame, no backdrop, no emoji styling, no 3D. This bird listening illustration will be used for quiz readiness and gentle encouragement.

## Celebrating bird prompt

One transparent-background illustration for BeakSpeak bird song learning app, achievement screen. A naturalistic Pacific Northwest black-capped chickadee with wings lifted in a joyful landing pose over a small sage leafy twig, three tiny warm ochre four-point glints around it. Editorial field-guide gouache illustration with softly textured feathers, refined and friendly for adults, charcoal head and bib, ivory cheeks, warm brown #8B6F47 and sage #5B8A72 accents. Centered square composition with generous clear perimeter, readable at 120px. No text, no frame, no backdrop, no emoji styling, no 3D. Match the visual idea of a listening chickadee on a twig, as a cohesive achievement counterpart.
