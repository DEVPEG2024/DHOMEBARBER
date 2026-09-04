import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import '@/index.css';
import { ThemeProvider } from '@/lib/ThemeContext';
import { AuthProvider } from '@/lib/AuthContext';
import { queryClientInstance } from '@/lib/query-client';
import SnapLenses from '@/pages/SnapLenses';
const HEROKU = 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com';
const realFetch = window.fetch.bind(window);
window.fetch = (url, opts) => realFetch(typeof url === 'string' ? url.replace(HEROKU, '/__api') : url, opts);
ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider><AuthProvider><QueryClientProvider client={queryClientInstance}>
    <MemoryRouter initialEntries={['/snap']}><div className="min-h-screen bg-background pb-24" style={{ maxWidth: 430, margin: '0 auto' }}><Routes><Route path="/snap" element={<SnapLenses />} /></Routes></div></MemoryRouter>
  </QueryClientProvider></AuthProvider></ThemeProvider>
);
import * as CK from '@snap/camera-kit';
window.__ck = CK;
