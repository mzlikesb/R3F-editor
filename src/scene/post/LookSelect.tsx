import { Select } from '@react-three/postprocessing';
import type { ReactNode } from 'react';
import { useStore } from '../../store';
import type { BaseModuleId } from '../../modules';

/** `?look=max`: marks the module body for the composer's Outline while it is selected. */
export function PostSelect({ id, children }: { id: BaseModuleId; children: ReactNode }) {
  const selected = useStore((s) => s.selected === id);
  return <Select enabled={selected}>{children}</Select>;
}
