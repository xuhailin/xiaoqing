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
import { MemoryHubComponent } from './memory/memory-hub.component';
import { SettingsComponent } from './settings/settings.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'chat' },
      { path: 'dev-agent', pathMatch: 'full', redirectTo: 'workspace/dev-agent' },
      { path: 'dev-agent/sessions/:id', pathMatch: 'full', redirectTo: 'workspace/dev-agent/sessions/:id' },
      { path: 'regression', pathMatch: 'full', redirectTo: 'workspace/regression' },
      { path: 'life-trace', pathMatch: 'full', redirectTo: 'memory/understanding' },
      { path: 'cognitive-trace', pathMatch: 'full', redirectTo: 'memory/understanding' },
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
      { path: 'memory', pathMatch: 'full', redirectTo: 'memory/understanding' },
      { path: 'memory/understanding', component: MemoryHubComponent },
      { path: 'memory/profile', pathMatch: 'full', redirectTo: 'memory/understanding' },
      { path: 'memory/memories', pathMatch: 'full', redirectTo: 'memory/understanding' },
      { path: 'memory/persona', component: MemoryHubComponent },
      { path: 'memory/life-record', pathMatch: 'full', redirectTo: 'memory/understanding' },
      { path: 'memory/cognitive-trace', pathMatch: 'full', redirectTo: 'memory/understanding' },
      { path: 'memory/relations', component: MemoryHubComponent },
      { path: 'settings', component: SettingsComponent },
      { path: '**', redirectTo: 'chat' },
    ],
  },
];
