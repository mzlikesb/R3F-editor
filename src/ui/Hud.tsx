import { useStore } from '../store';
import type { ConnectionStatus } from '../sync';

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: '연결 중',
  open: '연결됨',
  reconnecting: '재연결 중',
};

export function Hud() {
  const repairs = useStore((s) => s.sync.base?.repairs);
  const presence = useStore((s) => s.sync.presence);
  const connection = useStore((s) => s.connection);
  return (
    <div className="hud" role="status">
      누적 수리 {repairs ?? '–'}회 · 지금 접속 {presence}명 ·{' '}
      <span className={connection === 'open' ? 'ok' : 'warn'}>{CONNECTION_LABEL[connection]}</span>
    </div>
  );
}
