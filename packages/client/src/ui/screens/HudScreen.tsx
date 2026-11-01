import { t } from '../../i18n/index.ts';
import { formatHudCount } from '../hud-format.ts';
import { useUi } from '../UiStoreContext.tsx';

/** Ammo and coin counters over the level. Not interactive, so every key and click reaches the game. */
export function HudScreen() {
  const ammo = useUi((s) => s.hud.ammo);
  const coins = useUi((s) => s.hud.coins);
  return (
    <div className="hud">
      <HudCounter
        icon="assets/textures/ammo-pickup.png"
        count={ammo}
        label={t('hud.ammo', { count: ammo })}
      />
      <HudCounter
        icon="assets/textures/coin.png"
        count={coins}
        label={t('hud.coins', { count: coins })}
      />
    </div>
  );
}

function HudCounter({ icon, count, label }: { icon: string; count: number; label: string }) {
  return (
    <div className="hud__counter" role="status" aria-label={label}>
      <img className="hud__icon" src={icon} alt="" />
      <span aria-hidden="true">{formatHudCount(count)}</span>
    </div>
  );
}
