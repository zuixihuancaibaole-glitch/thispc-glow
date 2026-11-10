# ThisPC Glow

[简体中文](README.md) | English

A locally modified Photoshop black-mist and white-mist plugin, version **1.7.0**. A minimal graphite interface uses blue accents, clearer hierarchy and larger descriptions. Source and authorship records remain in [CREDITS.md](CREDITS.md); the panel shows the version only.

## Features

- Black and white mist in **1/8, 1/4 and 1/2**, custom controls and user presets.
- Optical diffusion and classic Screen glow.
- 1200 px previews, native-resolution final rendering and editable Smart Objects retaining the full-depth source.
- Latest-request scheduling, previous settings and unsaved-parameter recovery.
- **Hold-to-compare and Photoshop local-glow controls are removed in 1.7.0.** Local softening is available through the included Camera Raw mask presets only.
- Three Camera Raw 18.5 native mask presets: light, standard and strong.

This copy has no usage expiry. “ThisPC” is a project name, not hardware locking. Panel labels are currently Chinese.

## Changes in 1.7.0

Strong optical white mist uses a broader participation weight so nonlinear highlight extraction does not create narrow reversed edges at low-contrast landscape boundaries. Preview and native-depth output use the same rule; classic rendering remains pixel-compatible.

Performance work retains preview dimensions, diffusion layers and final precision. Input events coalesce over 90 ms, controls stay usable during computation and stale requests are canceled. Larger bounded strips reduce 24 MP output writes from 125 to 32. The UI removes redundant CSS, forced layout diagnostics and ornamental rendering; descriptions use 13 px text.

See [implementation and validation notes](docs/upgrades-1.7.md) (Chinese).

## Install

Download `thispc-glow-v1.7.0.zip` from [Releases](https://github.com/zuixihuancaibaole-glitch/thispc-glow/releases).

1. Save your work and exit Photoshop.
2. Back up the older plugin with ID `com.local.thispc.glow` outside `Plug-ins`.
3. Copy the ZIP's entire `thispc-glow` folder into Photoshop's `Plug-ins` directory. `manifest.json` must be directly inside the plugin folder.
4. Restart and open **Plugins → 这台电脑的插件**. Confirm **v1.7.0**.

Test environment: Windows / Photoshop 2026 (27.9.1). Minimum declared host: Photoshop 24.1. Other versions and macOS are not individually verified. Adobe's supported UXP developer-loading workflow is an alternative if direct loading is unavailable.

## Use

Open an RGB 8-bit or 16-bit image and choose **创建光效** (Create effect). Adjust a preset and choose **保存** (Save) for an editable native-resolution Smart Object. Save the Photoshop document separately. To revise an effect, select its layer and choose **编辑光效** (Edit effect).

Start with black mist 1/4. White mist 1/2 has stronger veiling; reduce intensity or the output layer opacity if needed. The home optical option is enabled by default; uncheck it for classic Screen glow. Existing saved objects retain their renderer. Previously discarded source detail cannot be reconstructed.

Recovery restores parameters only; reopen the corresponding photo yourself. It does not replace PSD saving. Existing outer layer masks remain in saved files, but the plugin no longer provides Photoshop local-glow creation, capture or feathering controls.

## Camera Raw local softening

While Photoshop is closed, copy the three `.xmp` files in `camera-raw-local-presets` into `%APPDATA%\Adobe\CameraRaw\LocalCorrections`. Restart, create or select a Camera Raw mask and choose a `ThisPC 局部柔化` preset from that mask's adjustment-preset menu.

Applying a preset replaces the mask's adjustment values, so use a new or duplicated mask. Native brush feathering and radial/linear gradients control the transition. These presets approximate softening with native Camera Raw controls; they cannot run the Photoshop scattering algorithm. See the [preset guide](camera-raw-local-presets/README.md).

## Validation and limits

Run `node --test tests/*.test.cjs` from the repository root. No third-party test dependencies are required. Tests cover classic reference-pixel parity, smooth strong-white boundaries, preview/native-depth parity, request coalescing, cancellation, rollback, native-buffer disposal and state recovery. All 14 test files pass. Native checks on the stated Windows host cover 16-bit Smart Object saving/re-editing and 6000×4000 output.

This is an uncalibrated post-processing simulation. Strength labels do not guarantee equivalence to physical filters. Wide-gamut calibration, cross-version/macOS and long-duration stability remain unverified. Linear-light processing uses an sRGB approximation and cannot recover clipped detail. Transparent source pixels need a background. Native-size output supports up to 250 megapixels and takes more temporary disk space, time and PSD storage.

Original author: **1CHEN**, Yichen Glow 1.3.1. This is an unofficial modification. Original code and assets retain their rights; this project adds no blanket open-source license. See [CREDITS.md](CREDITS.md).
