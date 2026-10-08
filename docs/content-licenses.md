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

The existing photos remain remote. Wikimedia's imageinfo API supplied the
thumbnail URLs, artist metadata, license names, and file sources on
October 7, 2026. Their exact metadata is committed in manifest-base.json and the
runtime manifest. JPEG headers were inspected for all 30 small/large resources:
small candidates are 250 pixels wide and large candidates are 960 pixels wide.
The API rounds requested sizes to these supported buckets, so srcset uses the
verified intrinsic widths without duplicate resources. Builds do not query Wikimedia. The shared image fallback
removes responsive candidates after an error so a failed host cannot prevent
using the bundled placeholder.

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
the source pages preserve those earlier changes. BeakSpeak displays reduced-size
versions.

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
