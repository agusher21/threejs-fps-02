// PASAR SENJA look plan: one palette, all textures drawn in code (no image files).
// Warm lantern amber against cool dusk blue, wet cobblestones, batik awnings.
import * as THREE from 'three';

export const PALETTE = {
  canvas: '#0d1526',
  ground: '#1a1d24',
  stallWood: '#6b4a2f',
  awningRed: '#b03024',
  awningTeal: '#0e7c7b',
  awningAmber: '#e67e22',
  lantern: '#ffb347',
  neonPink: '#ff5e8a',
  neonCyan: '#35e0d4',
  ink: '#f2ead8',
  muted: '#8a93a6',
  accent: '#ffb347',
  enemy: '#ff4d4d',
  friend: '#35e0d4',
};

export function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let seed = 7;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

// Wet cobblestones: dark blue-grey stones with glossy gaps.
export function cobbleTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#12141b';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const v = 26 + rnd() * 22;
        g.fillStyle = `rgb(${v | 0},${(v + 3) | 0},${(v + 12) | 0})`;
        const w = 30 + rnd() * 4;
        const h = 28 + rnd() * 4;
        g.beginPath();
        g.roundRect(x * 32 + 2, y * 32 + 2, w, h, 7);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.beginPath();
        g.roundRect(x * 32 + 4, y * 32 + 3, w - 8, 5, 3);
        g.fill();
      }
    }
  });
}

// Batik awning: diagonal stripes with dot rosettes, in two colours.
export function batikTexture(a, b) {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = a;
    g.fillRect(0, 0, s, s);
    g.fillStyle = b;
    for (let i = -s; i < s * 2; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 16, 0);
      g.lineTo(i + 16 + s, s);
      g.lineTo(i + s, s);
      g.fill();
    }
    g.fillStyle = 'rgba(242,234,216,0.85)';
    for (let y = 16; y < s; y += 32) {
      for (let x = 16; x < s; x += 32) {
        g.beginPath();
        g.arc(x, y, 3, 0, 7);
        g.fill();
      }
    }
  });
}

// Wood planks for stall counters and carts.
export function woodTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#5d3d24';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      const v = 70 + rnd() * 30;
      g.fillStyle = `rgb(${v | 0},${(v * 0.62) | 0},${(v * 0.36) | 0})`;
      g.fillRect(0, y + 1, s, 14);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, y, s, 2);
    }
  });
}

// Glowing stall sign: bright text on a dark board.
export function signTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0a0a12';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 116);
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 26;
  g.fillStyle = color;
  g.fillText(text, 256, 66);
  g.shadowBlur = 0;
  g.fillStyle = '#f2ead8';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
