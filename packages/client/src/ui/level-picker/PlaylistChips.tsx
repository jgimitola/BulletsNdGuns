import { useState } from 'react';
import { t } from '../../i18n/index.ts';
import type { PlaylistItem } from './playlist.ts';

/**
 * The playlist as numbered chips: ✕ removes one, dragging reorders, and Alt+← / Alt+→ move the
 * focused chip for keyboard players.
 */
export function PlaylistChips({
  items,
  onRemove,
  onMove,
}: {
  items: readonly PlaylistItem[];
  onRemove(index: number): void;
  onMove(from: number, to: number): void;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  return (
    <div className="playlist">
      <ol className="playlist__chips" aria-label={t('createRoom.playlist')}>
        {items.map((item, index) => (
          <li
            key={item.key}
            className={`playlist__chip${dragged === index ? ' playlist__chip--dragged' : ''}`}
            draggable
            tabIndex={0}
            onDragStart={(event) => {
              setDragged(index);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged !== null) onMove(dragged, index);
              setDragged(null);
            }}
            onDragEnd={() => setDragged(null)}
            onKeyDown={(event) => {
              if (!event.altKey) return;
              if (event.key === 'ArrowLeft') onMove(index, index - 1);
              else if (event.key === 'ArrowRight') onMove(index, index + 1);
              else return;
              event.preventDefault();
            }}
          >
            <span className="playlist__number">{index + 1}</span>
            <span className="playlist__name">{item.name}</span>
            <button
              type="button"
              className="playlist__remove"
              aria-label={t('createRoom.remove', { name: item.name })}
              onClick={() => onRemove(index)}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <p className="field__hint">{t('createRoom.dragHint')}</p>
    </div>
  );
}
