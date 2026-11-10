# ThisPC Glow

[简体中文](README.md) | English

A local Photoshop plugin for black mist and white mist effects. Version **1.6.0** adds original-resolution editable output, optical scattering, local computation, comparison and parameter recovery. Derived from the user-supplied **Yichen Glow 1.3.1**, originally authored by **1CHEN**; see [Credits and rights](#credits-and-rights).

## Features

- Black mist and white mist presets in **1/8, 1/4 and 1/2** strengths.
- Highlight-driven, multi-scale diffusion that retains the light source's color.
- Controls for highlight range, haze density, intensity, spread, diffusion layers, hue and saturation.
- Local glow from a Photoshop pixel mask or selection, with editable edge feathering.
- Local user presets, original-resolution Smart Objects and subsequent editing. Cross-star effects have been removed.
- A minimal dark interface with muted green accents.
- Three native Camera Raw 18.5 mask-softening presets: light, standard and strong.

“ThisPC” is the project name. It does not mean hardware locking. This copy has no usage expiration date. The panel currently uses Chinese labels.

## Download and install

Download `thispc-glow-v1.6.0.zip` from [Releases](https://github.com/zuixihuancaibaole-glitch/thispc-glow/releases). The `thispc-glow` folder contains the Photoshop plugin; `camera-raw-local-presets` contains separate Camera Raw presets.

1. Save your images and exit Photoshop.
2. Extract the ZIP and copy the entire `thispc-glow` folder into Photoshop's `Plug-ins` directory. `manifest.json` must be directly inside the plugin folder.
3. Move any older copy with the same ID, `com.local.thispc.glow`, outside `Plug-ins` as a backup to avoid duplicate loading.
4. Start Photoshop and open **Plugins → 这台电脑的插件 → 这台电脑的插件**. Confirm version **1.6.0**.

This installation method has been tested on Windows with Photoshop 2026. If another environment does not recognize it, use Adobe's supported UXP developer-loading workflow with `thispc-glow/manifest.json`. The manifest declares Photoshop 24.1 or later; other versions and macOS have not been individually verified. Pixel operations require a compatible Imaging API.

Updating replaces the plugin files. Keep your own PSD files, photos and presets.

## Use

Open an RGB 8-bit or 16-bit image and choose **创建光效** (Create effect). Select a black or white mist grade, adjust the controls, then choose **保存** (Save) to insert the result as a Smart Object. Save your Photoshop document separately.

Start with **1/4 黑柔** (black mist). White mist produces stronger veiling and softer local contrast. Reduce **柔光强度** (Glow intensity) or the output layer's opacity if needed. To revise an existing effect, select its layer and choose **编辑光效** (Edit effect).

For local glow, first select a layer with an enabled pixel mask, or create a selection. Under **局部柔光** (Local glow), select the corresponding source, set feathering and choose **创建局部柔光**. The saved effect has its own editable mask; the source mask is preserved.

In Camera Raw 18.5, install the three `.xmp` files into `%APPDATA%\Adobe\CameraRaw\LocalCorrections` while Photoshop is closed. Create or select a mask, then choose a `ThisPC 局部柔化` preset from the mask's **Preset** menu. Applying one replaces that mask's adjustment settings, so use a new or duplicated mask. Adjust the brush feathering or native gradients for softer boundaries. These presets approximate softening with native controls; they cannot run the Photoshop scattering algorithm inside Camera Raw. Camera Raw masks and Photoshop layer masks remain separate.

## What changed in 1.6.0

- New effects default to optical scattering: a signed, approximately linear-light redistribution lowers source peaks and spreads light into nearby pixels. Uncheck the optical option on the home screen for classic Screen glow. Existing mist objects retain their renderer.
- Previews remain limited to a 1200 px long edge. Final saves render the retained full source at its native dimensions using bounded strips and disk caches, then embed an editable Smart Object. A 16-bit source remains 16-bit.
- The older renderer now yields cooperatively too. Pending parameters survive a restart; recovery restores settings only, so reopen the photo and reselect local masks or selections yourself.
- Local rendering includes the entire kernel support around the mask, preserving light from outside it. A very wide halo may still require the whole frame.
- Hold **按住看原图** to compare; release to restore the exact layer visibility. **恢复上一次参数** restores the previous successful settings. Save and update automatically leave comparison mode.
- Cross-star controls, presets and algorithms are removed. Existing cross-star pixels remain untouched and cannot be re-edited with this version.

Full-resolution output takes more time and temporary disk space and produces larger PSDs. Previously saved low-resolution objects cannot regain source detail that was already discarded. See [implementation and validation notes](docs/upgrades-1.6.md) (Chinese).

## Tests

No third-party test dependencies are required. Run from the repository root:

```powershell
node --test tests/*.test.cjs
```

Tests cover mist strength progression, neutral color, highlight controls, caching, saved state, local masks and feathering, original bit-depth preservation, bounded reads, native-buffer disposal, preview transactions and rollback, stale requests, UI event delivery and reference-pixel parity.

## Limits

This is a post-processing simulation, not a calibrated replacement for a physical diffusion filter. Strength labels do not guarantee equivalence to a particular brand. The new optical mode approximates energy redistribution; classic Screen mode remains additive. Neither can recover clipped detail. Linear-light processing uses an sRGB-based approximation and is not calibrated for wide-gamut profiles. Only the preview is capped at a 1200 px long edge. Native-resolution output supports up to 250 megapixels; transparent source pixels require a background first. Cooperative scheduling improves responsiveness but does not guarantee shorter standalone algorithm wall time.

Photoshop 2026 native testing with a 1600×1066 RGB 16-bit synthetic image covered original-resolution saving, PSD reopen, re-editing, consecutive preset changes, previous-parameter restoration and updating the same Smart Object. Embedded PSB headers confirm full dimensions and 16-bit data after re-editing. A 6000×4000 RGB 16-bit image also completed native-resolution saving; this black-mist 1/8 sample took about 3 minutes 20 seconds including computation, PSB saving and placement. Preview updates remain separate and much smaller. These are short synthetic tests, not a long-duration stability guarantee.

Cross-version/macOS compatibility, every wide-gamut workflow and long-duration crash stability have not been fully tested. The repository still contains upstream obfuscated scripts. See the [Chinese changelog](CHANGELOG.md) for prior releases.

## Credits and rights

Original author: **1CHEN**, Yichen Glow 1.3.1. This is an unofficial modified copy and is not endorsed by the original author. Original code and assets retain their original rights. No explicit open-source license was found in the supplied files, so this repository does not add an MIT, Apache or other license for the whole project. Public availability does not imply unrestricted redistribution or relicensing. See [CREDITS.md](CREDITS.md).
