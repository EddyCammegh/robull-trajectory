'use client';

import { useEffect, useRef } from 'react';

export function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let particles: { x: number; y: number; vx: number; vy: number }[] = [];
    // Canvas size in CSS pixels. Held in closure so draw() and resize() agree
    // even if window.innerWidth changes (e.g. mobile URL bar show/hide).
    let cssWidth = 0;
    let cssHeight = 0;
    let lastDpr = 0;

    const PARTICLE_COUNT = 80;
    const DOT_RADIUS = 2;
    const LINE_WIDTH = 1.2;
    const MAX_DIST = 200;
    const DOT_COLOR = 'rgba(245, 230, 66, 0.7)';
    const LINE_BASE_OPACITY = 0.35;

    const resize = () => {
      // Prefer visualViewport on mobile so URL-bar show/hide doesn't jitter us.
      const vv = window.visualViewport;
      const w = Math.round(vv?.width ?? window.innerWidth);
      const h = Math.round(vv?.height ?? window.innerHeight);
      const dpr = window.devicePixelRatio || 1;

      // Skip resize if nothing actually changed — prevents re-seeding particles
      // on spurious resize events (iOS safe-area toggles, pinch-zoom, etc).
      if (w === cssWidth && h === cssHeight && dpr === lastDpr) return false;

      cssWidth = w;
      cssHeight = h;
      lastDpr = dpr;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };

    const randSpeed = () => {
      const sign = Math.random() < 0.5 ? -1 : 1;
      return sign * (0.2 + Math.random() * 0.3); // 0.2 - 0.5
    };

    const seedParticles = () => {
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * cssWidth,
        y: Math.random() * cssHeight,
        vx: randSpeed(),
        vy: randSpeed(),
      }));
    };

    const onResize = () => {
      const changed = resize();
      if (!changed) return;
      // Keep existing particles but clamp to new bounds so we don't jump.
      for (const p of particles) {
        if (p.x > cssWidth) p.x = cssWidth;
        if (p.y > cssHeight) p.y = cssHeight;
      }
    };

    const draw = () => {
      const w = cssWidth;
      const h = cssHeight;
      ctx.clearRect(0, 0, w, h);

      // Update positions with wrap-around
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
      }

      // Draw connections FIRST so dots render on top
      ctx.lineWidth = LINE_WIDTH;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            // Closer = more opaque
            const alpha = (1 - dist / MAX_DIST) * LINE_BASE_OPACITY;
            ctx.strokeStyle = `rgba(245, 230, 66, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw dots ON TOP of lines
      ctx.fillStyle = DOT_COLOR;
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    resize();
    seedParticles();
    draw();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
}
