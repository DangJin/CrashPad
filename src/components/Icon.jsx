const paths = {
  logo: 'M5 5h6v4H9v6h2v4H5zm14 0h-6v4h2v6h-2v4h6z',
  cursor: 'm5 3 14 10-7 1-3 7Z',
  road: 'M6 3 3 21M18 3l3 18M12 3v3m0 4v4m0 4v3',
  car: 'm5 9 2-5h10l2 5M4 9h16v9H4zm2 9v3m12-3v3M7 13h2m6 0h2',
  person: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 9v7m-6-3 6-4 6 4m-6 3-4 6m4-6 4 6',
  bicycle: 'M9 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm14 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 17l4-9 5 9H5Zm9 0 3-12h3M7 5h5m5 2 2 10',
  ebike: 'M5 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM5 19h9l4-15h3M7 14h8M8 7l-2 4h5l-1 4 5-6h-5l2-5',
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
  trash: 'M4 7h16M9 7V3h6v4M6 7l1 14h10l1-14M10 11v6m4-6v6',
  plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M6 18 18 6',
};
export default function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'logo' ? 'currentColor' : 'none'} stroke={name === 'logo' ? 'none' : 'currentColor'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.cursor} /></svg>;
}
