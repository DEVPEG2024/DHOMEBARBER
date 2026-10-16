import React from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import NotificationPrompt from '@/components/shared/NotificationPrompt';
import MotionPrompt from '@/components/shared/MotionPrompt';
import GangLevelUp from '@/components/gang/GangLevelUp';

export default function ClientLayout() {
  return (
    // overflow-x-clip : un décor qui dépasse (halos animés du fil, carrousels) ne doit jamais
    // rendre la page déplaçable de gauche à droite. « clip » et non « hidden », qui casserait
    // les éléments collants (sticky) des pages
    <div className="min-h-screen bg-background pb-24 overflow-x-clip">
      <Outlet />
      <BottomNav />
      <NotificationPrompt />
      <MotionPrompt />
      {/* Révélation plein écran quand la carte Gang du client monte de niveau */}
      <GangLevelUp />
    </div>
  );
}