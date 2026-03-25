import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';
import { ChatComponent } from './chat/chat.component';
import { DevAgentComponent } from './dev-agent/dev-agent.component';
import { DevAgentOverviewComponent } from './dev-agent/dev-agent-overview.component';
import { DevAgentSessionComponent } from './dev-agent/dev-agent-session.component';
import { RegressionReportsComponent } from './regression/regression-reports.component';
import { HomeShellComponent } from './home/home-shell.component';
import { WorkbenchPageComponent } from './workspace/workbench-page.component';
import { WorkspaceIdeaComponent } from './workspace/workspace-idea.component';
import { WorkspacePlanComponent } from './workspace/workspace-plan.component';
import { WorkspaceReminderComponent } from './workspace/workspace-reminder.component';
import { WorkspaceTaskRecordsComponent } from './workspace/workspace-task-records.component';
import { WorkspaceTodoComponent } from './workspace/workspace-todo.component';
import { WorkspaceShellComponent } from './workspace/workspace-shell.component';
import { RelationOverviewComponent } from './memory/relation-overview.component';
import { SettingsComponent } from './settings/settings.component';

// Memory page components (lazy-loaded for better performance)
const memoryPageImports = () => import('./memory/pages').then((m) => m);

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'chat' },
      { path: 'dev-agent', pathMatch: 'full', redirectTo: 'workspace/dev-agent' },
      { path: 'dev-agent/sessions/:id', pathMatch: 'full', redirectTo: 'workspace/dev-agent/sessions/:id' },
      { path: 'regression', pathMatch: 'full', redirectTo: 'workspace/regression' },
      // Legacy redirects to new memory structure
      { path: 'life-trace', pathMatch: 'full', redirectTo: 'memory/trace' },
      { path: 'cognitive-trace', pathMatch: 'full', redirectTo: 'memory/settings/cognitive' },
      {
        path: 'chat',
        component: HomeShellComponent,
        children: [
          { path: '', component: ChatComponent },
          { path: ':id', component: ChatComponent },
        ],
      },
      {
        path: 'design-agent',
        loadComponent: () =>
          import('./design-agent/design-agent-page.component').then(
            (m) => m.DesignAgentPageComponent,
          ),
      },
      {
        path: 'workspace',
        component: WorkspaceShellComponent,
        children: [
          { path: '', pathMatch: 'full', component: WorkbenchPageComponent },
          {
            path: 'dev-agent',
            component: DevAgentComponent,
            children: [
              { path: 'sessions/:id', component: DevAgentSessionComponent },
              { path: '', component: DevAgentOverviewComponent },
            ],
          },
          { path: 'ideas', component: WorkspaceIdeaComponent },
          { path: 'reminder', component: WorkspaceReminderComponent },
          { path: 'plan', component: WorkspacePlanComponent },
          { path: 'todos', component: WorkspaceTodoComponent },
          { path: 'execution', component: WorkspaceTaskRecordsComponent },
          { path: 'regression', component: RegressionReportsComponent },
          { path: 'task-records', pathMatch: 'full', redirectTo: 'execution' },
        ],
      },
      // Memory routes with 3 top-level tabs: 痕迹 / 设置 / 关系
      {
        path: 'memory',
        loadComponent: () =>
          import('./memory/memory-page.component').then((m) => m.MemoryPageComponent),
        children: [
          // Default redirect to settings
          { path: '', pathMatch: 'full', redirectTo: 'settings/identity' },
          // 痕迹 - Life Trace (standalone page)
          {
            path: 'trace',
            loadComponent: () => memoryPageImports().then((m) => m.LifeTracePageComponent),
          },
          // 设置 - 9 cognitive categories with left nav
          {
            path: 'settings',
            loadComponent: () =>
              import('./memory/memory-settings-shell.component').then(
                (m) => m.MemorySettingsShellComponent,
              ),
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'identity' },
              // 1. 身份锚定
              {
                path: 'identity',
                loadComponent: () =>
                  memoryPageImports().then((m) => m.IdentityAnchorPageComponent),
              },
              // 2. 用户偏好
              {
                path: 'preference',
                loadComponent: () =>
                  memoryPageImports().then((m) => m.UserPreferencePageComponent),
              },
              // 3. 软偏好
              {
                path: 'soft-preference',
                loadComponent: () =>
                  memoryPageImports().then((m) => m.SoftPreferencePageComponent),
              },
              // 4. 长期认知
              {
                path: 'cognitive',
                loadComponent: () =>
                  memoryPageImports().then((m) => m.CognitiveProfilePageComponent),
              },
              // 5. 共识事实
              {
                path: 'shared-fact',
                loadComponent: () =>
                  memoryPageImports().then((m) => m.SharedFactPageComponent),
              },
              // 6. 承诺感知
              {
                path: 'commitment',
                loadComponent: () =>
                  memoryPageImports().then((m) => m.CommitmentPageComponent),
              },
              // 7. 世界状态
              {
                path: 'world-state',
                loadComponent: () =>
                  memoryPageImports().then((m) => m.WorldStatePageComponent),
              },
              // 8. 待确认
              {
                path: 'pending',
                loadComponent: () =>
                  memoryPageImports().then((m) => m.PendingConfirmPageComponent),
              },
              // 9. 身边的人
              {
                path: 'people',
                loadComponent: () => memoryPageImports().then((m) => m.PeoplePageComponent),
              },
          // Persona / 人格配置（挂在认知面板-设置菜单下）
          {
            path: 'persona',
            loadComponent: () =>
              import('./memory/memory-persona-page.component').then(
                (m) => m.MemoryPersonaPageComponent,
              ),
          },
            ],
          },
          // 关系 - Relationship (standalone page)
          {
            path: 'relations',
            component: RelationOverviewComponent,
          },
      // Persona / 人格设定：已挂载到 /memory/settings/persona
        ],
      },
      // Legacy redirects for backward compatibility
      { path: 'memory/understanding', pathMatch: 'full', redirectTo: 'memory/settings/identity' },
      { path: 'memory/profile', pathMatch: 'full', redirectTo: 'memory/settings/identity' },
      { path: 'memory/memories', pathMatch: 'full', redirectTo: 'memory/settings/identity' },
      // legacy: previously redirected persona; now restore to new route
      { path: 'memory/persona', pathMatch: 'full', redirectTo: 'memory/settings/persona' },
      { path: 'memory/life-record', pathMatch: 'full', redirectTo: 'memory/trace' },
      { path: 'memory/cognitive-trace', pathMatch: 'full', redirectTo: 'memory/settings/cognitive' },
      { path: 'memory/identity', pathMatch: 'full', redirectTo: 'memory/settings/identity' },
      { path: 'memory/preference', pathMatch: 'full', redirectTo: 'memory/settings/preference' },
      {
        path: 'memory/soft-preference',
        pathMatch: 'full',
        redirectTo: 'memory/settings/soft-preference',
      },
      { path: 'memory/cognitive', pathMatch: 'full', redirectTo: 'memory/settings/cognitive' },
      { path: 'memory/shared-fact', pathMatch: 'full', redirectTo: 'memory/settings/shared-fact' },
      { path: 'memory/commitment', pathMatch: 'full', redirectTo: 'memory/settings/commitment' },
      { path: 'memory/world-state', pathMatch: 'full', redirectTo: 'memory/settings/world-state' },
      { path: 'memory/pending', pathMatch: 'full', redirectTo: 'memory/settings/pending' },
      { path: 'memory/life-trace', pathMatch: 'full', redirectTo: 'memory/trace' },
      { path: 'memory/social', pathMatch: 'full', redirectTo: 'memory/settings/people' },
      { path: 'settings', component: SettingsComponent },
      { path: '**', redirectTo: 'chat' },
    ],
  },
];
