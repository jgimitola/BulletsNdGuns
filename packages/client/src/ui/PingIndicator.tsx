import { t } from '../i18n/index.ts';
import { latencyQuality } from '../net/latency.ts';
import { useUi } from './UiStoreContext.tsx';

/** Round trip to the server, coloured by how it will feel in play. Not interactive. */
export function PingIndicator() {
  const ping = useUi((s) => s.ping);
  const quality = ping === null ? 'lost' : latencyQuality(ping);
  return (
    <div
      className={`ping ping--${quality}`}
      role="status"
      aria-label={ping === null ? t('ping.lost') : t('ping.label', { ms: ping })}
    >
      <span className="ping__bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span aria-hidden="true">{ping === null ? '---' : t('ping.value', { ms: ping })}</span>
    </div>
  );
}
