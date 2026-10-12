import React from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import NotificationPrompt from '@/components/shared/NotificationPrompt';

export default function ClientLayout() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <Outlet />
      <BottomNav />
      <NotificationPrompt />
    </div>
  );
}