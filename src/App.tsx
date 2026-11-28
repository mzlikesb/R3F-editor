import { useEffect } from 'react';
import { loadBase } from './net/api';
import { startSocket } from './net/socket';
import { BaseCanvas } from './scene/BaseCanvas';
import { BottomStack } from './ui/BottomStack';
import { Hud } from './ui/Hud';
import { PartsFlight } from './ui/PartsFlight';
import { Loading } from './ui/Loading';
import { ScreenFlash } from './ui/ScreenFlash';

/**
 * Composition only. Order is paint order: canvas, then overlays on top.
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
      <PartsFlight />
      <BottomStack />
      <ScreenFlash />
    </>
  );
}
