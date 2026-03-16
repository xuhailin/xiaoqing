# Frontend UI Checklist

每次改 UI 前后，至少自检一次：

- 本次是否引入了新的 spacing 档位？
- 本次是否引入了新的 radius 风格？
- 是否已有 `AppPanel / AppButton / AppBadge / AppTabs / AppState` 可复用？
- 是否在业务页面里手写了重复按钮、badge、panel 样式？
- 当前页面是否存在同类控件风格不一致？
- header / section / panel / list item 的层级是否清晰？
- 状态颜色是否仍然只使用 `success / warning / error / primary` 语义表达？
- 是否为了“好看”引入了不利于业务使用的布局或交互？
- 是否把新容器收敛到了 `ui-list-card` 或 `AppPanel`？
- 是否使用了 token，而不是魔法数字 `padding / margin / font-size / radius`？
- 页面在高信息密度下是否依然清晰可读？
- 改动后是否至少完成一次 `frontend` 构建验证？
