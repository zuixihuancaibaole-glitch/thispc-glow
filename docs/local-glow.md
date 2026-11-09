# 局部柔光 1.5.0

## Photoshop 主编辑界面

支持两种范围来源：当前选中图层的像素蒙版，或当前活动选区。白色区域添加柔光，黑色区域保护，灰色区域按比例过渡。

1. 在 PS 中添加图层蒙版，或者用套索、选框建立选区。
2. 在插件首页“局部柔光”中选择范围来源，设置“边缘羽化”，再点击“创建局部柔光”。
3. 按原来的方式选择黑柔、白柔档位并调整参数。工作页上方可继续修改羽化，单位为原照片像素。
4. 点击插件“保存”。新光效以智能对象和独立图层蒙版保留；原图层蒙版不会被修改。
5. 后续可直接在新光效的蒙版上绘制，也可选中光效图层后点击“编辑光效”，继续调整光效和羽化。

插件中的“保存”只保存光效至 Photoshop 文档；PSD 本身仍需另行保存。

## Camera Raw 18.5

Camera Raw 占用 Photoshop 模态窗口时，Photoshop 的 UXP 光效面板无法在其中运行散射算法。本机 Camera Raw 18.5 部分采用用户确认的原生蒙版柔化预设方案，使用其纹理、清晰度、去朦胧等控制，属于视觉近似。

Adobe 从 Camera Raw 18.6 加入原生 Glow，并允许对每个蒙版分别控制 Glow 数量。本次不更新 Camera Raw，也不把 Photoshop 散射算法描述为 Camera Raw 内运行的算法。

三档预设已经安装到本机 `%APPDATA%\Adobe\CameraRaw\LocalCorrections`。其他电脑安装时，退出 PS，将安装包 `camera-raw-local-presets` 中的三个 `.xmp` 文件复制到此目录，再重新打开 PS 和 Camera Raw。

1. 打开 Camera Raw，进入“蒙版”，创建或选中一个蒙版。
2. 在画笔设置下方找到该蒙版的“预设”下拉框，选择 `ThisPC 局部柔化 - 轻柔 / 标准 / 浓柔`。面板较矮时需向下滚动。
3. 关闭红色蒙版叠加显示，再观察照片。使用画笔的“羽化”、径向渐变或线性渐变控制边缘过渡，按照片继续调节纹理、清晰度或预设数量。

这是蒙版内部的调整预设，不在右侧全局“预设”面板中。应用预设会替换该蒙版原有的调整参数，建议新建或复制蒙版后使用。预设不包含画笔位置，不更改蒙版形状；Camera Raw 蒙版不会自动转为 PS 图层蒙版。

## 范围与限制

- PS 局部柔光目前支持像素图层蒙版与活动选区，矢量蒙版请先转换为像素蒙版或选区。
- 保存后保留可编辑的外层蒙版。工作预览临时使用缩小的蒙版；最终蒙版使用原尺寸，羽化交给 Photoshop 处理。
- 已有自定义蒙版的密度和羽化在编辑时会读取并保留。新建时使用首页指定的羽化数值。
- 均匀颜色区域没有明显光源时，柔光不会凭空产生强光晕。
- 自动检查覆盖局部范围、裁切坐标、预览缩放、羽化、密度、保存时不重复遮罩、编辑与取消、写入失败时隐藏新光效，以及旧宿主全图编辑兼容。
- PS 2026 已用合成图验证选区和图层蒙版创建、黑白柔切换、保存、再次编辑，以及羽化从 12 px 改到 24 px 后正确恢复。没有改动用户照片。
- Camera Raw 18.5 已在蒙版下拉菜单识别三档预设，XML 格式和参数已检查；自动化工具在选择弹出菜单项时丢失焦点，尚未完成逐档应用的实机检查。
- 广色域、16 位大图和全部照片场景尚未完整回归。Camera Raw 的柔化不会产生与 PS 多尺度散射完全相同的光晕。

参考：[Adobe 模态执行说明](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/executeasmodal)、[Adobe Imaging API](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging)、[Camera Raw Glow 与局部蒙版](https://helpx.adobe.com/camera-raw/desktop/edit-and-enhance-images/tone-and-color/vignette-grain-effects-camera-raw.html)。
