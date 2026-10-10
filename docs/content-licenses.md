# Content credits and release policy

BeakSpeak's initial release is a free educational app with no purchases,
advertising, accounts, or analytics, as specified in issue #25. Audio and photos
retain their individual licenses; the application's software license does not
replace those permissions. A later commercial release needs a new rights review
before reusing the recordings licensed for noncommercial use.

The app's Credits page identifies creators, links the exact applicable licenses
and original sources, and discloses that recordings are trimmed and
volume-normalized. The generated recording files retain their source licenses,
including ShareAlike where applicable. Keep these notices with redistributed
content. Do not add restrictions or DRM to the individual content files that
would prevent uses their licenses permit. Verify distribution terms again before
App Store submission; this document is not an approval of an uninspected release
artifact or future license agreement.

## Photos

The photos are bundled with the app and the web demo. They are redistributed
copies of the 250-pixel and 960-pixel thumbnails Wikimedia Commons generates for
each file, downloaded byte for byte by `bundle_photos.py` on October 9, 2026 and
committed under `beakspeak/public/content/bird-photos/`. BeakSpeak does not crop,
recolor, re-encode, or otherwise edit them. `content/photo-metadata.lock.json`
records each copy's source thumbnail URL, pixel size, byte count, and SHA-256 hash.
`bundle_photos.py --check` verifies that every bundled file matches the lock and
comes from the Commons file named in the manifest's credits. Builds do not query
Wikimedia.

Wikimedia's imageinfo API supplied the artist metadata, license names, and file
sources on October 7, 2026. Their exact metadata is committed in manifest-base.json
and the runtime manifest.

Redistribution keeps every obligation that applies to each photo:

- The photos use four different license terms: CC BY-SA 4.0, CC BY-SA 3.0,
  CC BY 2.0, and public domain. Keep each photo's exact license and version as
  listed below. Do not generalize them to a single license.
- Producing a smaller copy at a different resolution is a technical change the
  licenses permit. Under CC BY-SA 4.0, changes of this kind alone do not create
  adapted material. This does not remove any obligation. Redistributed copies still
  need the creator credit, the license name and link, and a link to the source, and
  BY-SA copies may not carry added terms that restrict what recipients can do. The
  Credits page provides the credits and links for every photo.
- Do not edit the image content. A crop, color change, or composite would be an
  adaptation and would bring ShareAlike obligations for the edited file.
- App Store distribution wraps the whole app bundle in Apple's FairPlay DRM, and
  the BY-SA licenses forbid applying technological measures that restrict
  recipients' permitted uses. BeakSpeak does not add any restriction to the photo
  files themselves, and the same files remain freely available from Commons and
  from the web demo. This is a known consideration, not a resolved legal question.
  Review it again before any change to how the app is distributed or sold.

The shared image fallback stays as a safety net. If a bundled file is missing or
corrupt, it removes the responsive candidates and shows the bundled illustration.
Tests fail if the fallback appears during normal use.

| Bird | Creator credit | License | Source |
|---|---|---|---|
| American Robin | Rhododendrites | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [File source](https://commons.wikimedia.org/wiki/File:American_robin_(71307).jpg) |
| American Crow | Mdf | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [File source](https://commons.wikimedia.org/wiki/File:Corvus-brachyrhynchos-001.jpg) |
| Song Sparrow | Rhododendrites | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [File source](https://commons.wikimedia.org/wiki/File:Song_sparrow_in_Prospect_Park_(93031).jpg) |
| Dark-eyed Junco | Cephas | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [File source](https://commons.wikimedia.org/wiki/File:Junco_hyemalis_hyemalis_CT1_(cropped).jpg) |
| Black-capped Chickadee | Mdf (copyright attribution supplied by Wikimedia Commons) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [File source](https://commons.wikimedia.org/wiki/File:Poecile-atricapilla-001.jpg) |
| Spotted Towhee | Becky Matsubara from El Sobrante, California | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [File source](https://commons.wikimedia.org/wiki/File:Spotted_Towhee_(32684403303).jpg) |
| House Finch | Rhododendrites | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [File source](https://commons.wikimedia.org/wiki/File:House_finch_(33688)2.jpg) |
| Northern Flicker | Rhododendrites | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [File source](https://commons.wikimedia.org/wiki/File:Northern_yellow-shafted_flicker_male_(33737)_(cropped).jpg) |
| Steller's Jay | Noel Reynolds | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [File source](https://commons.wikimedia.org/wiki/File:Steller%27s_Jay_flagstaff_arizona.jpg) |
| Bewick's Wren | Minette Layne | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [File source](https://commons.wikimedia.org/wiki/File:Bewicks_Wren.jpg) |
| Anna's Hummingbird | Robert McMorran, United States Fish and Wildlife Service | [Public domain](https://commons.wikimedia.org/wiki/File:Anna%27s_hummingbird.jpg) | [File source](https://commons.wikimedia.org/wiki/File:Anna%27s_hummingbird.jpg) |
| Chestnut-backed Chickadee | VJAnderson | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [File source](https://commons.wikimedia.org/wiki/File:Chestnut-backed_Chickadee_2154ab_(cropped).jpg) |
| Bushtit | Polinova | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [File source](https://commons.wikimedia.org/wiki/File:BushtitMale.jpg) |
| Golden-crowned Sparrow | Alejandro Erickson | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [File source](https://commons.wikimedia.org/wiki/File:Zonotrichia_atricapilla_-British_Columbia,_Canada-8.jpg) |
| European Starling | PierreSelim | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [File source](https://commons.wikimedia.org/wiki/File:Toulouse_-_Sturnus_vulgaris_-_2012-02-26_-_3.jpg) |

The American Crow file has no Artist field. Its original upload by Mdf explicitly
used GFDL-self on June 26, 2007, and the current file has been relicensed under
CC BY-SA 3.0. The Black-capped Chickadee credit retains the copyright attribution
provided by Commons rather than presenting its metadata's assumed author as an
independently verified identity. Some original file sources are already cropped;
the source pages preserve those earlier changes. BeakSpeak bundles Wikimedia's
reduced-size versions of the current files.

## Audio

The expert-selected 30 recordings are unchanged. Twenty-eight use CC BY-NC-SA,
and two use CC BY-SA. Their exact license versions, recordists, recording IDs,
source links, and resolved trim windows remain in the audio metadata lock and
runtime manifest. Trimming and normalization are disclosed in the app. The
production build reused all 30 existing output files when updating photo credits.

Relevant primary sources:

- [Creative Commons attribution requirements](https://creativecommons.org/licenses/by-sa/4.0/)
- [Noncommercial and ShareAlike terms](https://creativecommons.org/licenses/by-nc-sa/4.0/)
- [Creative Commons explanation of technological restrictions](https://creativecommons.org/faq/)
- [MediaWiki imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo)
