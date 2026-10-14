const paths = {
  logo: 'M5 5h6v4H9v6h2v4H5zm14 0h-6v4h2v6h-2v4h6z',
  cursor: 'm5 3 14 10-7 1-3 7Z',
  road: 'M6 3 3 21M18 3l3 18M12 3v3m0 4v4m0 4v3',
  car: 'm5 9 2-5h10l2 5M4 9h16v9H4zm2 9v3m12-3v3M7 13h2m6 0h2',
  burst: 'm12 2 2 6 6-2-2 6 4 3-7 1-3 6-2-6-7-1 5-3-2-6 5 2Z',
  note: 'M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5',
  undo: 'M9 5 4 10l5 5M4 10h9a6 6 0 0 1 6 6v2',
  redo: 'm15 5 5 5-5 5m5-5h-9a6 6 0 0 0-6 6v2',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  play: 'm8 4 12 8-12 8Z', pause: 'M8 5v14M16 5v14',
  rewind: 'M5 5v14m14-14L7 12l12 7Z',
  grid: 'M3 3h18v18H3Zm6 0v18m6-18v18M3 9h18M3 15h18',
  fit: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6',
  rotate: 'M4 9a8 8 0 1 1 1 9M4 3v6h6',
  plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M6 18 18 6',
};
export default function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'logo' ? 'currentColor' : 'none'} stroke={name === 'logo' ? 'none' : 'currentColor'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.cursor} /></svg>;
}
