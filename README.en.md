# ThisPC Glow

[简体中文](README.md) | English

A locally modified Photoshop black-mist and white-mist plugin, version **1.8.1**. A minimal graphite interface uses blue accents, clearer hierarchy and larger descriptions. Source and authorship records remain in [CREDITS.md](CREDITS.md); the panel shows the version only.

## Features

- Black and white mist in **1/8, 1/4 and 1/2**, custom controls and user presets.
- Optical diffusion and classic Screen glow.
- **Quick mode is enabled by default**: save the completed preview (up to 1200 px, 8-bit), fit it to the original canvas and skip native-size re-rendering. Smart Objects remain editable, with reduced detail.
- Disable Quick mode for native-resolution rendering and full-depth source retention. The original photo layer keeps its resolution in either mode.
- Latest-request scheduling, previous settings and unsaved-parameter recovery.
- **Hold-to-compare and Photoshop local-glow controls are removed in 1.8.1.** Local softening is available through the included Camera Raw mask presets only.
- Three Camera Raw 18.5 native mask presets: light, standard and strong.

This copy has no usage expiry. “ThisPC” is a project name, not hardware locking. Panel labels are currently Chinese.

## Changes in 1.8.1

Quick mode reuses the completed preview instead of recalculating a large image at save time. Quick objects retain only the preview-size source; create a new effect from the original photo with Quick mode disabled when full detail is needed. Editing an existing full-source object defaults to native-size mode to preserve its detail.

Black presets now have stronger diffusion without extra layers. Black and white presets default to 65 / 80 / 100 intensity. Bounded-slope black highlight extraction prevents reversed contours even at intensity 100, with matching preview and native-depth rendering. White-mist presets and the 1.7.0 strong-white edge correction are unchanged. Existing objects keep their stored parameters until a new preset is explicitly selected.

See [implementation and validation notes](docs/upgrades-1.8.md) (Chinese).

## Install

Download `thispc-glow-v1.8.1.zip` from [Releases](https://github.com/zuixihuancaibaole-glitch/thispc-glow/releases).

1. Save your work and exit Photoshop.
2. Back up the older plugin with ID `com.local.thispc.glow` outside `Plug-ins`.
3. Copy the ZIP's entire `thispc-glow` folder into Photoshop's `Plug-ins` directory. `manifest.json` must be directly inside the plugin folder.
4. Restart and open **Plugins → 这台电脑的插件**. Confirm **v1.8.1**.

Test environment: Windows / Photoshop 2026 (27.9.1). Minimum declared host: Photoshop 24.1. Other versions and macOS are not individually verified. Adobe's supported UXP developer-loading workflow is an alternative if direct loading is unavailable.

## Use

Open an RGB 8-bit or 16-bit image and choose **创建光效** (Create effect). Adjust a preset and choose **保存** (Save) for an editable Smart Object. Quick mode uses the preview size; disabling it renders at native resolution. Save the Photoshop document separately. To revise an effect, select its layer and choose **编辑光效** (Edit effect).

Start with black mist 1/4. White mist 1/2 has stronger veiling; reduce intensity or the output layer opacity if needed. The home optical option is enabled by default; uncheck it for classic Screen glow. Saved layers keep their pixels until edited; re-rendering black mist uses the corrected edge curve and may change its appearance. Previously discarded source detail cannot be reconstructed.

Recovery restores parameters only; reopen the corresponding photo yourself. It does not replace PSD saving. Existing outer layer masks remain in saved files, but the plugin no longer provides Photoshop local-glow creation, capture or feathering controls.

## Camera Raw local softening

While Photoshop is closed, copy the three `.xmp` files in `camera-raw-local-presets` into `%APPDATA%\Adobe\CameraRaw\LocalCorrections`. Restart, create or select a Camera Raw mask and choose a `ThisPC 局部柔化` preset from that mask's adjustment-preset menu.

Applying a preset replaces the mask's adjustment values, so use a new or duplicated mask. Native brush feathering and radial/linear gradients control the transition. These presets approximate softening with native Camera Raw controls; they cannot run the Photoshop scattering algorithm. See the [preset guide](camera-raw-local-presets/README.md).

## Validation and limits

Run `node --test tests/*.test.cjs` from the repository root. No third-party test dependencies are required. Tests cover historical white-parameter pixel parity, all black grades at intensity 100, smooth strong-white boundaries, preview/native-depth parity, request coalescing, cancellation, rollback, native-buffer disposal and state recovery. All 17 test files pass, including quick-output bypass, temporary-save failure protection and stronger black presets.

This is an uncalibrated post-processing simulation. Strength labels do not guarantee equivalence to physical filters. Wide-gamut calibration, cross-version/macOS and long-duration stability remain unverified. Linear-light processing uses an sRGB approximation and cannot recover clipped detail. Transparent source pixels need a background. With Quick mode disabled, native-size output supports up to 250 megapixels and takes more temporary disk space, time and PSD storage.

Original author: **1CHEN**, Yichen Glow 1.3.1. This is an unofficial modification. Original code and assets retain their rights; this project adds no blanket open-source license. See [CREDITS.md](CREDITS.md).
