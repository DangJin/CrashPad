import { participantType, participantColor } from './model.js';

export const participantIcon = participant => ({ car: 'car', pedestrian: 'person', ebike: 'ebike', bicycle: 'bicycle' }[participantType(participant)]);

// Shared vector symbols keep editing, the damage picker and all exports aligned.
export function participantGlyph(participant) {
  const type = participantType(participant), color = participantColor(participant);
  let body;
  if (type === 'pedestrian') {
    body = `<circle cy="-19" r="9" fill="${color}" stroke="white" stroke-width="2"/><path d="M0 -7V12M-15 3L0 -4L15 3M0 12L-10 29M0 12L10 29" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (type === 'bicycle' || type === 'ebike') {
    body = `<rect x="-4" y="-39" width="8" height="18" rx="4" fill="#25364e"/><rect x="-4" y="23" width="8" height="18" rx="4" fill="#25364e"/><path d="M0 -30V31M-17 -22H17" stroke="#25364e" stroke-width="4" stroke-linecap="round"/>`;
    body += type === 'ebike' ? `<rect x="-11" y="-19" width="22" height="46" rx="8" fill="${color}" stroke="white" stroke-width="2"/><rect x="-9" y="10" width="18" height="12" rx="4" fill="#25364e"/><path d="M3 -13L-5 0H1L-2 9L6 -4H0Z" fill="white"/>` : `<path d="M-9 -14L0 17L9 -14M-11 -14H11" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/><ellipse cy="10" rx="9" ry="5" fill="#25364e"/><circle cy="-8" r="7" fill="${color}" stroke="white" stroke-width="2"/><path d="M-5 -4L-14 -20M5 -4L14 -20" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
  } else {
    body = `<rect x="-28" y="-24" width="56" height="14" rx="4" fill="#25364e"/><rect x="-28" y="20" width="56" height="14" rx="4" fill="#25364e"/><rect x="-24" y="-45" width="48" height="90" rx="13" fill="${color}" stroke="white" stroke-width="2.5"/><path d="M-17 -25Q0 -32 17 -25L14 -10H-14Z" fill="#d9e6fc"/><rect x="-14" y="12" width="28" height="13" rx="4" fill="#d9e6fc"/><path d="M-20 -5V12M20 -5V12" stroke="white" stroke-opacity=".6" stroke-width="2"/><rect x="-18" y="-39" width="9" height="4" rx="2" fill="#fff4c3"/><rect x="9" y="-39" width="9" height="4" rx="2" fill="#fff4c3"/>`;
  }
  const front = type === 'car' ? -51 : -46;
  body += `<path d="M-5 ${front}L0 ${front - 7}L5 ${front}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
  const damage = type === 'pedestrian' ? null : (type === 'car' ? { front: 'M-21 -39H21', rear: 'M-21 39H21', left: 'M-25 -25V25', right: 'M25 -25V25' } : { front: 'M-9 -31H9', rear: 'M-9 31H9', left: 'M-12 -15V15', right: 'M12 -15V15' })[participant.damage];
  return body + (damage ? `<path d="${damage}" stroke="#e34452" stroke-width="6" stroke-linecap="round"/>` : '');
}
