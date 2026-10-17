const icons = {
  straight: 'M7 3v18M17 3v18M12 3v3m0 4v4m0 4v3',
  drop: 'M5 3v18M19 3v5c0 5-5 6-5 13M10 3v5m0 4v3',
  add: 'M5 3v18M14 3c0 7 5 8 5 13v5M10 12v3m0 4v2',
  merge: 'M7 3v18M12 3v18M21 19c-7-1-9-5-9-11',
  exit: 'M7 3v18M12 3v18M12 16c0-7 4-10 9-11',
  toll: 'M3 7h18v5H3zM5 12v9M19 12v9M9 12v9M15 12v9M7 4h10',
  cross: 'M8 3v5H3m18 0h-5V3M3 16h5v5m8 0v-5h5',
  tee: 'M3 6h18M3 12h5v9m8 0v-9h5',
  bend: 'M4 21V9a5 5 0 0 1 5-5h12M10 21v-9a2 2 0 0 1 2-2h9',
  terminal: 'M3 6h18M3 18h18M5 12h13m-4-4 4 4-4 4',
};
export default function RoadIcon({ type, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[type] || icons.straight}/></svg>;
}
