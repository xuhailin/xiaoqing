import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';
import { ChatComponent } from './chat/chat.component';
import { LifeTraceComponent } from './life-trace/life-trace.component';
import { CognitiveTraceComponent } from './cognitive-trace/cognitive-trace.component';
import { DevAgentComponent } from './dev-agent/dev-agent.component';
import { DevAgentOverviewComponent } from './dev-agent/dev-agent-overview.component';
import { DevAgentSessionComponent } from './dev-agent/dev-agent-session.component';
import { RegressionReportsComponent } from './regression/regression-reports.component';
import { WorkspaceReminderComponent } from './workspace/workspace-reminder.component';
import { WorkspacePlanComponent } from './workspace/workspace-plan.component';
import { WorkspaceTaskRecordsComponent } from './workspace/workspace-task-records.component';
import { MemoryProfilePageComponent } from './memory/memory-profile-page.component';
import { MemoryPersonaPageComponent } from './memory/memory-persona-page.component';
import { MemoryLongMemoryPageComponent } from './memory/memory-long-memory-page.component';
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
      { path: 'life-trace', pathMatch: 'full', redirectTo: 'memory/life-record' },
      { path: 'cognitive-trace', pathMatch: 'full', redirectTo: 'memory/cognitive-trace' },
      { path: 'chat', component: ChatComponent },
      { path: 'chat/:id', component: ChatComponent },
      { path: 'workspace', pathMatch: 'full', redirectTo: 'workspace/dev-agent' },
      {
        path: 'workspace/dev-agent',
        component: DevAgentComponent,
        children: [
          { path: 'sessions/:id', component: DevAgentSessionComponent },
          { path: '', component: DevAgentOverviewComponent },
        ],
      },
      { path: 'workspace/reminder', component: WorkspaceReminderComponent },
      { path: 'workspace/plan', component: WorkspacePlanComponent },
      { path: 'workspace/regression', component: RegressionReportsComponent },
      { path: 'workspace/task-records', component: WorkspaceTaskRecordsComponent },
      { path: 'memory', pathMatch: 'full', redirectTo: 'memory/profile' },
      { path: 'memory/profile', component: MemoryProfilePageComponent },
      { path: 'memory/persona', component: MemoryPersonaPageComponent },
      { path: 'memory/memories', component: MemoryLongMemoryPageComponent },
      { path: 'memory/life-record', component: LifeTraceComponent },
      { path: 'memory/cognitive-trace', component: CognitiveTraceComponent },
      { path: 'settings', component: SettingsComponent },
      { path: '**', redirectTo: 'chat' },
    ],
  },
];
