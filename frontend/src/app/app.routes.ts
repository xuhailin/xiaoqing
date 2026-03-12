import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';
import { ChatComponent } from './chat/chat.component';
import { DevAgentComponent } from './dev-agent/dev-agent.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: 'chat/:id', component: ChatComponent },
      { path: 'dev-agent', component: DevAgentComponent },
      { path: '', component: ChatComponent },
    ],
  },
];
