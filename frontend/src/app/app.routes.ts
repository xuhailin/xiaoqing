import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';
import { ChatComponent } from './chat/chat.component';
import { LifeTraceComponent } from './life-trace/life-trace.component';
import { DevAgentComponent } from './dev-agent/dev-agent.component';
import { DevAgentOverviewComponent } from './dev-agent/dev-agent-overview.component';
import { DevAgentSessionComponent } from './dev-agent/dev-agent-session.component';
import { RegressionReportsComponent } from './regression/regression-reports.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: 'chat/:id', component: ChatComponent },
      { path: 'life-trace', component: LifeTraceComponent },
      {
        path: 'dev-agent',
        component: DevAgentComponent,
        children: [
          { path: 'sessions/:id', component: DevAgentSessionComponent },
          { path: '', component: DevAgentOverviewComponent },
        ],
      },
      { path: 'regression', component: RegressionReportsComponent },
      { path: '', component: ChatComponent },
    ],
  },
];
