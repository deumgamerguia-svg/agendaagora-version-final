import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AgpayBackgroundProps = {
  accent?: string;
  light?: string;
  words?: string[];
  morphAccentTo?: string;
  morphLightTo?: string;
  morphDelayMs?: number;
  morphDurationMs?: number;
  goldEdges?: boolean;
  goldWash?: boolean;
  canvasClassName?: string;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mixRgb = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const rgbCss = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

/** Fundo animado em tela cheia (partículas em rede + palavras flutuantes). */
export function AgpayBackground({
  accent = "#4A90E2",
  light = "#8ABAF0",
  words = ["AgPay", "PIX", "PAGAMENTOS", "GATEWAY", "AgPay", "SEGURO", "AgPay"],
  morphAccentTo,
  morphLightTo,
  morphDelayMs = 500,
  morphDurationMs = 1200,
  goldEdges = false,
  goldWash = false,
  canvasClassName = "pointer-events-none absolute inset-x-0 top-0 z-0 w-full",
}: AgpayBackgroundProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    setHost(document.querySelector(".owner-panel") ?? document.body);
  }, []);

  const wordsKey = words.join("|");

  useEffect(() => {
    if (!host) return;
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    const resize = () => {
      const rect = (host as HTMLElement).getBoundingClientRect();
      W = Math.max(1, Math.floor(rect.width));
      H = Math.max(
        1,
        Math.floor(
          Math.max(rect.height, document.documentElement.scrollHeight, window.innerHeight),
        ),
      );
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.height = `${H}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    window.addEventListener("resize", resize);

    class P {
      x = 0;
      y = 0;
      vx = 0;
      vy = 0;
      r = 0;
      a = 0;
      accentDot = true;
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * W;
        this.y = Math.random() * H;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.r = Math.random() * 1.2 + 0.3;
        this.a = Math.random() * 0.5 + 0.15;
        this.accentDot = Math.random() > 0.3;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
      }
      draw(dotAccent: string, dotLight: string) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = this.accentDot ? dotAccent : dotLight;
        ctx.globalAlpha = this.a;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    const accentFrom = hexToRgb(accent);
    const lightFrom = hexToRgb(light);
    const accentTo = hexToRgb(morphAccentTo ?? accent);
    const lightTo = hexToRgb(morphLightTo ?? light);
    const morphing = Boolean(morphAccentTo ?? morphLightTo);
    const t0 = performance.now();

    const bgLines = wordsKey.split("|").map((text) => ({
      text,
      x: Math.random() * W,
      y: Math.random() * H,
      speed: Math.random() * 0.4 + 0.15,
      a: Math.random() * 0.05 + 0.02,
      size: Math.floor(Math.random() * 80 + 40),
    }));
    const particles: P[] = [];
    for (let i = 0; i < 100; i++) particles.push(new P());

    const drawConn = (lineColor: string) => {
      for (let i = 0; i < particles.length; i++) {
        const pi = particles[i]!;
        for (let j = i + 1; j < particles.length; j++) {
          const pj = particles[j]!;
          const dx = pi.x - pj.x;
          const dy = pi.y - pj.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 100) {
            ctx.beginPath();
            ctx.moveTo(pi.x, pi.y);
            ctx.lineTo(pj.x, pj.y);
            ctx.strokeStyle = lineColor;
            ctx.globalAlpha = (1 - d / 100) * 0.1;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
    };

    let raf = 0;
    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      const rawT = morphing
        ? Math.min(1, Math.max(0, (performance.now() - t0 - morphDelayMs) / morphDurationMs))
        : 1;
      const eased = rawT * rawT * (3 - 2 * rawT);
      const curAccent = rgbCss(mixRgb(accentFrom, accentTo, eased));
      const curLight = rgbCss(mixRgb(lightFrom, lightTo, eased));
      for (const l of bgLines) {
        ctx.font = `400 ${l.size}px 'Bebas Neue', sans-serif`;
        ctx.fillStyle = curAccent;
        ctx.globalAlpha = l.a;
        ctx.fillText(l.text, l.x, l.y);
        ctx.globalAlpha = 1;
        l.y -= l.speed;
        if (l.y < -l.size * 1.2) {
          l.y = H + l.size;
          l.x = Math.random() * W;
        }
      }
      drawConn(curAccent);
      for (const p of particles) {
        p.update();
        p.draw(curAccent, curLight);
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [host, accent, light, wordsKey, morphAccentTo, morphLightTo, morphDelayMs, morphDurationMs]);

  if (!host) return null;
  return createPortal(
    <>
      <canvas
        ref={ref}
        aria-hidden="true"
        className={canvasClassName}
      />
      {goldEdges && (
        <div
          aria-hidden="true"
          className="agpay-edge-gold pointer-events-none fixed inset-0 z-0"
        />
      )}
      {goldWash && (
        <div
          aria-hidden="true"
          className="agpay-gold-wash pointer-events-none fixed inset-0 z-20"
        />
      )}
    </>,
    host,
  );
}
