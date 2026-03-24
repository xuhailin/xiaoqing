# 记忆模块 UI 重构计划

> 状态：待实施
> 目标完成时间：分三阶段，可独立上线
> 主要改动范围：`frontend/src/app/memory/**` `frontend/src/app/layout/main-layout.component.ts`
> 后端影响：Phase 1-2 不改后端；Phase 3 新增一个只读投影接口

---

## 背景与核心问题

当前「记忆」模块存在以下问题：

1. **信息架构混乱**：内容错位，"你和我"里放了"你生活里的人"，"小晴是谁"其实是配置页
2. **视觉不一致**：侧边栏样式、卡片变体、导航风格不统一
3. **命名过度拟人化**："小晴是谁"让用户困惑，小晴只是助手名称
4. **技术术语残留**：`pattern`、`profile`、`confidence` 百分比等工程词汇

**目标**：简洁直观的三标签结构 —— 痕迹、关系、设置

---

## 最终目标：新的信息架构

```
记忆（二级导航，3项）
├── 痕迹        用户相关的所有信息
│   ├── 身份信息（你跟我说过的）
│   ├── 记忆列表（我留意到的）
│   ├── 待确认的新发现
│   ├── 生活轨迹（折叠区）
│   └── 身边的人（从关系页移入）
│
├── 关系            你与助手的关系
│   ├── 关系状态概览
│   ├── 相处方式
│   ├── 最近关系变化
│   └── 共同经历
│
└── 设置            助手配置
    ├── 人格层配置
    ├── 表达调度层
    ├── Meta 层
    └── 进化约束
```

### 导航标签变更

| 当前 | 替换为 | 说明 |
|------|--------|------|
| `我对你的了解` | `痕迹` | 用户相关的所有信息痕迹 |
| `你和我` | `关系` | 用户与助手的关系状态 |
| `小晴是谁` | `设置` | 助手配置（人格、表达、进化） |

---

## Phase 1：导航重命名 + 文案去工程化

**目标**：完成三标签重命名，移除所有技术术语
**验收标准**：页面上没有 `pattern`、`profile`、`confidence`、技术百分比

### 1.1 `main-layout.component.ts`

找到 `memorySubNavItems`，改为：

```typescript
protected readonly memorySubNavItems: readonly MemorySubNavItem[] = [
  {
    value: 'understanding',
    label: '痕迹',
    icon: 'userCircle',
    description: '你跟我说过的，和我留意到的，都放在这里。',
  },
  {
    value: 'relations',
    label: '关系',
    icon: 'heartPulse',
    description: '我们之间的相处状态和共同经历。',
  },
  {
    value: 'persona',
    label: '设置',
    icon: 'settings',
    description: '助手的人格设定与进化方向。',
  },
];
```

### 1.2 `memory-understanding-page.component.ts`

```html
<app-page-header
  title="痕迹"
  description="你跟我说过的，和我留意到的，都放在这里。"
/>

<!-- 左侧 -->
<app-section-header title="你跟我说过的" />
<p class="card-desc">你主动告诉我的身份信息，我会一直记着。</p>

<!-- 右侧 -->
<app-section-header title="我留意到的" />
<p class="card-desc">从对话里留意到的你的习惯、在意的事。</p>

<!-- 底部折叠区 -->
<span class="life-trace-toggle__title">生活轨迹</span>
<span class="life-trace-toggle__hint">从对话里提炼的事件和日常</span>
```

### 1.3 `memory-relations-page.component.ts`

```html
<app-page-header
  title="关系"
  description="我们之间的相处状态和共同经历。"
/>
```

### 1.4 `memory-list.component.ts`

替换 `typeTabs`：

```typescript
protected readonly typeTabs: AppTabItem[] = [
  { value: 'all', label: '全部' },
  { value: 'mid', label: '最近留意到的' },
  { value: 'long', label: '一直记着的' },
  { value: 'pending', label: '待确认' },
];
```

替换 `categoryTabs`：

```typescript
protected readonly categoryTabs: AppTabItem[] = [
  { value: 'all', label: '全部' },
  { value: 'judgment_pattern', label: '你的决策习惯' },
  { value: 'value_priority', label: '你重视的' },
  { value: 'rhythm_pattern', label: '我们的节奏' },
];
```

替换 `getCategoryLabel()`：

```typescript
getCategoryLabel(category?: string) {
  const MAP: Record<string, string> = {
    judgment_pattern: '决策习惯',
    value_priority: '你重视的',
    rhythm_pattern: '节奏',
    shared_fact: '共识',
    commitment: '约定',
    correction: '纠正',
    soft_preference: '小习惯',
    identity_anchor: '身份',
    general: '留意到的',
  };
  return MAP[category ?? ''] ?? '留意到的';
}
```

替换 `getGrowthTypeLabel()` 和 `getGrowthKindLabel()`：

```typescript
getGrowthTypeLabel(type: string) {
  return type === 'cognitive_profile' ? '关于你的新发现' : '关系变化';
}

getGrowthKindLabel(kind?: string) {
  const MAP: Record<string, string> = {
    decision_pattern: '决策方式',
    thinking_pattern: '思考习惯',
    support_preference: '支持偏好',
  };
  return MAP[kind ?? ''] ?? '';
}
```

### 1.5 `relation-overview.component.ts`

1. **移除所有数字分数显示**（关系温度、信任、亲近、delta）
2. **移除 `significanceLabel` 显示**
3. **英文 eyebrow 改中文**：
   - `Recent Shifts` → `最近变化`
   - `Rhythm` → `相处方式`
   - `Shared Moments` → `共同经历`
4. **STAGE_META 的 label 改为**：`刚开始` / `越来越熟` / `稳定了`

### 1.6 `memory-persona-page.component.ts`

1. **完整移除 SystemSelf card**（版本号、feature flags、capabilities）
2. **替换 page-header**：

```html
<app-page-header
  title="设置"
  description="助手的人格设定与进化方向。"
/>
```

---

## Phase 2：内容重组

**目标**：将"身边的人"从关系页移到痕迹页，统一侧边栏样式
**验收标准**：痕迹页包含所有用户相关信息，关系页只关注用户与助手的关系

### 2.1 `memory-understanding-page.component.ts` - 新增"身边的人"区块

在生活轨迹区块后，新增"身边的人"折叠区块：

```html
<!-- 身边的人折叠区块 -->
<div class="people-section">
  <button
    type="button"
    class="people-toggle"
    (click)="peopleExpanded.set(!peopleExpanded())"
  >
    <app-icon
      [name]="peopleExpanded() ? 'chevronDown' : 'chevronRight'"
      size="0.9rem"
    />
    <span class="toggle__title">身边的人</span>
    <span class="toggle__hint">你生活里反复出现的人</span>
  </button>

  @if (peopleExpanded()) {
    <div class="people-content">
      <app-relation-entity-list />
    </div>
  }
</div>
```

新增 signal：

```typescript
protected readonly peopleExpanded = signal(false);
```

新增样式（与 life-trace-section 保持一致）：

```scss
.people-section {
  margin-top: var(--space-5);
  border-top: 1px solid var(--color-border-light);
  padding-top: var(--space-5);
}

.people-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  transition: background var(--transition-base), border-color var(--transition-base);
}

.people-toggle:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border);
}

.toggle__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.toggle__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-left: auto;
}

.people-content {
  margin-top: var(--space-4);
}
```

### 2.2 `memory-relations-page.component.ts` - 移除 entity-list

从模板中移除 `app-relation-entity-list`：

```html
<!-- 删除整个 relations-page__secondary 区块 -->
<div class="relations-page__secondary">
  <app-relation-entity-list class="relations-page__people" />
</div>
```

更新 imports，移除 `RelationEntityListComponent`。

更新描述：

```html
<app-page-header
  title="关系"
  description="我们之间的相处状态和共同经历。"
/>
```

### 2.3 更新 imports

`memory-understanding-page.component.ts` 新增：

```typescript
import { RelationEntityListComponent } from './relation-entity-list.component';
```

---

## Phase 3：样式统一与交互优化

**目标**：统一侧边栏样式，优化设置页交互
**验收标准**：所有导航使用一致的设计语言

### 3.1 `persona-config.component.ts` - 统一侧边栏样式

将现有的 `.sidebar` 样式改为与主布局二级导航一致：

```scss
.config-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--space-6);
  min-height: 0;
}

.config-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: all var(--transition-base);
  border: 1px solid transparent;
  cursor: pointer;
}

.sidebar-link:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.sidebar-link.active {
  background: var(--color-surface-highlight);
  color: var(--color-text);
  border-color: var(--color-border);
  font-weight: var(--font-weight-semibold);
}

.sidebar-link__icon {
  flex-shrink: 0;
}
```

模板中链接结构：

```html
<nav class="config-sidebar">
  @for (section of sections; track section.id) {
    <button
      type="button"
      class="sidebar-link"
      [class.active]="activeSection() === section.id"
      (click)="activeSection.set(section.id)"
    >
      <app-icon [name]="section.icon" size="1.1rem" class="sidebar-link__icon" />
      <span>{{ section.label }}</span>
    </button>
  }
</nav>
```

### 3.2 设置页 sections 定义

```typescript
protected readonly sections = [
  { id: 'persona', label: '人格层', icon: 'sparkles' },
  { id: 'expression', label: '表达调度', icon: 'chatBubble' },
  { id: 'meta', label: 'Meta 层', icon: 'layers' },
  { id: 'evolution', label: '进化约束', icon: 'chartLine' },
];
```

### 3.3 表达偏好改为卡片切换（可选）

如需将表达偏好从表单改为卡片切换：

```html
<div class="preference-cards">
  @for (pref of expressionPreferences; track pref.id) {
    <button
      type="button"
      class="preference-card"
      [class.selected]="selectedPreference() === pref.id"
      (click)="selectedPreference.set(pref.id)"
    >
      <app-icon [name]="pref.icon" size="1.5rem" />
      <div class="preference-card__label">{{ pref.label }}</div>
      <div class="preference-card__desc">{{ pref.description }}</div>
    </button>
  }
</div>
```

样式：

```scss
.preference-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-3);
}

.preference-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-light);
  background: var(--color-surface);
  cursor: pointer;
  transition: all var(--transition-base);
  text-align: center;
}

.preference-card:hover {
  border-color: var(--color-border);
  background: var(--color-surface-hover);
}

.preference-card.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.preference-card__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.preference-card__desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.5;
}
```

---

## 路由变更

### `app.routes.ts`

```typescript
// 确保路由与新的导航结构匹配
{ path: 'memory', redirectTo: 'memory/understanding', pathMatch: 'full' },
{ path: 'memory/understanding', component: MemoryHubComponent },
{ path: 'memory/relations', component: MemoryHubComponent },
{ path: 'memory/persona', component: MemoryHubComponent },

// 旧路由重定向
{ path: 'memory/cognitive-trace', redirectTo: 'memory/understanding', pathMatch: 'full' },
{ path: 'memory/life-record', redirectTo: 'memory/understanding', pathMatch: 'full' },
```

---

## 文件修改清单

### Phase 1

| 文件 | 改动 |
|------|------|
| `main-layout.component.ts` | 导航标签改为 痕迹/关系/设置 |
| `memory-understanding-page.component.ts` | 页面标题和描述 |
| `memory-relations-page.component.ts` | 页面标题和描述 |
| `memory-list.component.ts` | tabs 文案、getCategoryLabel、getGrowthTypeLabel |
| `relation-overview.component.ts` | 移除数字分数、英文改中文 |
| `memory-persona-page.component.ts` | 移除 SystemSelf、标题改为设置 |

### Phase 2

| 文件 | 改动 |
|------|------|
| `memory-understanding-page.component.ts` | 新增"身边的人"折叠区、导入 RelationEntityListComponent |
| `memory-relations-page.component.ts` | 移除 entity-list |

### Phase 3

| 文件 | 改动 |
|------|------|
| `persona-config.component.ts` | 统一侧边栏样式 |
| `app.routes.ts` | 确保重定向正确 |

---

## 验收检查清单

### Phase 1

- [ ] 导航显示：痕迹 / 关系 / 设置
- [ ] 页面标题和描述已更新
- [ ] 无技术术语（pattern、profile、confidence 百分比）
- [ ] 关系页无数字分数
- [ ] 设置页无 SystemSelf 卡片

### Phase 2

- [ ] 痕迹页底部有"身边的人"折叠区
- [ ] 关系页无 entity-list
- [ ] 无 TypeScript 编译错误

### Phase 3

- [ ] 设置页侧边栏样式与主布局二级导航一致
- [ ] 所有交互流畅

---

## 技术约定

1. **不改后端 API**
2. **不改 Angular service**
3. **不新增测试文件**
4. **使用现有 CSS 变量**，不新增颜色
5. **删除组件时同步删除对应样式**
