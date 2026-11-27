import { useEffect } from 'react';
import { loadBase } from './net/api';
import { startSocket } from './net/socket';
import { BaseCanvas } from './scene/BaseCanvas';
import { BottomStack } from './ui/BottomStack';
import { Hud } from './ui/Hud';
import { Loading } from './ui/Loading';
import { ScreenFlash } from './ui/ScreenFlash';

/**
 * Composition only (plan 005). Owned by the dev lead: each track fills its own component, none
 * edits this file. Order is paint order: canvas, then overlays on top.
 */
export function App() {
  useEffect(() => {
    void loadBase();
    return startSocket();
  }, []);

  return (
    <>
      <BaseCanvas />
      <Loading />
      <Hud />
      <BottomStack />
      <ScreenFlash />
    </>
  );
}
