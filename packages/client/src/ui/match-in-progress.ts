import { t } from '../i18n/index.ts';

export function showMatchInProgress(): void {
  document.title = t('matchInProgress.title');
  const overlay = document.getElementById('match-in-progress');
  if (!overlay) return;
  const heading = overlay.querySelector('h1');
  const body = overlay.querySelector('h4');
  if (heading) heading.textContent = t('matchInProgress.heading');
  if (body) body.textContent = t('matchInProgress.body');
  overlay.style.display = 'block';
}
