import './styles.css';
import { renderTable } from './table';
import { Viewer } from './viewer';

const board = document.querySelector<HTMLOListElement>('.board');
const dialog = document.querySelector<HTMLDialogElement>('dialog.viewer');
const cover = document.querySelector<HTMLButtonElement>('.sheet--cover');

if (board && dialog && cover) {
  const sheets = [cover, ...renderTable(board)];

  const viewer = new Viewer(dialog, {
    sheetFor: (index) => sheets[index] ?? null,
    reveal: (sheet) => sheet.classList.add('is-placed', 'is-settled'),
  });

  document.addEventListener('click', (e) => {
    const trigger = (e.target as Element).closest<HTMLElement>('.sheet, [data-open]');
    if (!trigger) return;
    viewer.open(Number(trigger.dataset.index ?? trigger.dataset.open ?? 0));
  });

  document.querySelector('[data-top]')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0 });
    cover.focus({ preventScroll: true });
  });
}
