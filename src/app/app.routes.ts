import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'chart',
    loadComponent: () => import('./features/trading-view/trading-view.component').then(m => m.TradingViewComponent),
  },
  {
    path: 'bot',
    loadComponent: () => import('./features/bot-config/bot-config.component').then(m => m.BotConfigComponent),
  },
  {
    path: 'trades',
    loadComponent: () => import('./features/trade-history/trade-history.component').then(m => m.TradeHistoryComponent),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
  },
  { path: '**', redirectTo: '/dashboard' },
];
