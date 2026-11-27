/** Visual comparison switch (`?look=`): a throwaway experiment for choosing which effects to keep. */
export type Look = 'none' | 'budget' | 'max';

export function parseLook(search: string): Look {
  const v = new URLSearchParams(search).get('look');
  return v === 'budget' || v === 'max' ? v : 'none';
}
