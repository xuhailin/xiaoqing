# LongMemory 桌面小人入口

Tauri 2 桌面应用：小窗显示立绘，点击用系统浏览器打开对话界面。

## 前置条件

- **Rust**：需安装 [Rust](https://www.rust-lang.org/tools/install)（`cargo` 可用）。
- **前端已启动**：点击小人会打开 `http://localhost:4200`，请先在本仓根目录执行 `npm run frontend`（或 `npm start`）启动 Angular 前端。

## 使用

```bash
# 在项目根目录
npm run desktop
# 或
npm run desktop:dev
```

首次运行会编译 Rust，耗时较长。完成后会弹出小窗，可拖动；点击小人即可在默认浏览器中打开对话页。

## 打包

```bash
npm run desktop:build
```

产物在 `desktop/src-tauri/target/release/bundle/`。若需应用图标，可执行：

```bash
cd desktop && npx tauri icon ../assets/character/character_idle.png
```

再重新 `npm run desktop:build`。
