import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';
import { ChatComponent } from './chat/chat.component';
import { DevAgentComponent } from './dev-agent/dev-agent.component';
import { DevAgentOverviewComponent } from './dev-agent/dev-agent-overview.component';
import { DevAgentSessionComponent } from './dev-agent/dev-agent-session.component';
import { RegressionReportsComponent } from './regression/regression-reports.component';
import { HomeShellComponent } from './home/home-shell.component';
import { WorkspaceReminderComponent } from './workspace/workspace-reminder.component';
import { WorkspacePlanComponent } from './workspace/workspace-plan.component';
import { WorkspaceTaskRecordsComponent } from './workspace/workspace-task-records.component';
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
      { path: 'life-trace', pathMatch: 'full', redirectTo: 'memory' },
      { path: 'cognitive-trace', pathMatch: 'full', redirectTo: 'memory' },
      {
        path: 'chat',
        component: HomeShellComponent,
        children: [
          { path: '', component: ChatComponent },
          { path: ':id', component: ChatComponent },
        ],
      },
      {
        path: 'workspace',
        component: WorkspaceShellComponent,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'dev-agent' },
          {
            path: 'dev-agent',
            component: DevAgentComponent,
            children: [
              { path: 'sessions/:id', component: DevAgentSessionComponent },
              { path: '', component: DevAgentOverviewComponent },
            ],
          },
          { path: 'reminder', component: WorkspaceReminderComponent },
          { path: 'plan', component: WorkspacePlanComponent },
          { path: 'regression', component: RegressionReportsComponent },
          { path: 'task-records', component: WorkspaceTaskRecordsComponent },
        ],
      },
      { path: 'memory', component: MemoryHubComponent },
      { path: 'memory/profile', pathMatch: 'full', redirectTo: 'memory' },
      { path: 'memory/persona', pathMatch: 'full', redirectTo: 'memory' },
      { path: 'memory/memories', pathMatch: 'full', redirectTo: 'memory' },
      { path: 'memory/life-record', pathMatch: 'full', redirectTo: 'memory' },
      { path: 'memory/cognitive-trace', pathMatch: 'full', redirectTo: 'memory' },
      { path: 'settings', component: SettingsComponent },
      { path: '**', redirectTo: 'chat' },
    ],
  },
];
