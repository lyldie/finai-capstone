export const getGoalEmoji = (name: string): string => {
  const n = name.toLowerCase().trim();

  if (n.includes('travel') || n.includes('vacation') || n.includes('trip') || n.includes('bakasyon') || n.includes('gala')) return '✈️';
  if (n.includes('gadget') || n.includes('phone') || n.includes('laptop') || n.includes('computer') || n.includes('tech')) return '💻';
  if (n.includes('car') || n.includes('vehicle') || n.includes('auto') || n.includes('sasakyan')) return '🚗';
  if (n.includes('home') || n.includes('house') || n.includes('rent') || n.includes('bahay')) return '🏠';
  if (n.includes('emergency') || n.includes('medical') || n.includes('health')) return '🚨';
  if (n.includes('education') || n.includes('school') || n.includes('tuition') || n.includes('aral')) return '🎓';
  if (n.includes('wedding') || n.includes('marriage') || n.includes('kasal')) return '💍';
  if (n.includes('investment') || n.includes('stock') || n.includes('crypto')) return '📈';
  if (n.includes('business') || n.includes('startup') || n.includes('negosyo')) return '🏪';

  return '🎯'; // Default Trophy/Target
};