import base from '../vite.config.js';
const API = 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com';
export default { ...base, server: { ...base.server, proxy: { '/__api': { target: API, changeOrigin: true, rewrite: (p) => p.replace(/^\/__api/, ''),
  configure: (proxy) => { proxy.on('proxyReq', (req) => { req.removeHeader('origin'); req.removeHeader('referer'); }); } } } } };
