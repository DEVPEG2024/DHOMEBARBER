import React from 'react';
import { SNAKE_COLORS as C, lcdBackground } from './palette';

/**
 * Écran vert du Snake (planche : cadre noir enfoncé, écran quadrillé, encre vert sombre, police
 * à pixels `font-pixel`). Le contenu est libre ; `grid` = maille du quadrillage en px.
 *
 *   <Lcd className="p-3">…</Lcd>
 *   <Lcd frame={8} radius={20} grid={14} innerClassName="…" innerStyle={{ width, height }}>…</Lcd>
 */
export default function Lcd({
  children,
  className = '',
  innerClassName = '',
  innerStyle,
  frame = 6,
  radius = 16,
  grid = 10,
  as: Inner = 'div',
  ...rest
}) {
  return (
    <div
      className={className}
      style={{ padding: frame, borderRadius: radius, background: C.cadreEcran, boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.7)' }}
    >
      <Inner
        className={`font-pixel ${innerClassName}`}
        style={{ ...lcdBackground(grid), borderRadius: 10, color: C.encre, ...innerStyle }}
        {...rest}
      >
        {children}
      </Inner>
    </div>
  );
}
