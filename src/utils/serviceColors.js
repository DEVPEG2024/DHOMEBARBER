// 10 distinct colors for services (used across the agenda)
export const SERVICE_COLORS = [
  '#3fcf8e', // green (primary)
  '#60a5fa', // blue
  '#f59e0b', // amber
  '#a78bfa', // violet
  '#f472b6', // pink
  '#34d399', // emerald
  '#fb923c', // orange
  '#38bdf8', // sky
  '#e879f9', // fuchsia
  '#4ade80', // lime green
];

// Assign a stable color to a service by its index or id
export function getServiceColor(serviceIdOrIndex) {
  if (typeof serviceIdOrIndex === 'number') {
    return SERVICE_COLORS[serviceIdOrIndex % SERVICE_COLORS.length];
  }
  // Hash string id to color index
  let hash = 0;
  for (let i = 0; i < serviceIdOrIndex.length; i++) {
    hash = serviceIdOrIndex.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SERVICE_COLORS[Math.abs(hash) % SERVICE_COLORS.length];
}