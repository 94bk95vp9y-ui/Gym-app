// Ein Training als Bild zum Teilen: auf einer Zeichenfläche gezeichnet, dann
// über das Teilen-Menü des iPhones weitergegeben (oder heruntergeladen, wo
// das Teilen von Dateien fehlt). Nichts verlässt das Gerät, bevor der Nutzer
// im Teilen-Menü ein Ziel wählt.
const W = 1080;
const H = 1350;
const FONT = '-apple-system, "SF Pro Display", "Inter", "Segoe UI", Roboto, sans-serif';
// Titel und Zahlen in der schmalen Auszeichnungsschrift der App
const DISPLAY = '"Archivo", "Arial Narrow", -apple-system, sans-serif';
// Schmal gesetzt wird über das Stauchen der Zeichenfläche: die Laufweite
// einer variablen Schrift lässt sich auf einer Zeichenfläche nicht in jedem
// Browser wählen, das Stauchen sieht überall gleich aus.
const SQUEEZE = 0.72;
function narrowText(ctx, text, x, y, max) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(SQUEEZE, 1);
  const shown = fit(ctx, text, max / SQUEEZE);
  ctx.fillText(shown, 0, 0);
  const width = ctx.measureText(shown).width * SQUEEZE;
  ctx.restore();
  return width;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// data: { title, date, stats: [{ value, unit?, label }], rows: [{ name, detail, pr }],
//         more, colors: [from, to], footer }
export function drawShareCard(data) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const [from, to] = data.colors;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, from);
  bg.addColorStop(0.3, from);
  bg.addColorStop(1, to);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Rändelung: feines Kreuzmuster, nach rechts hin stärker
  const dark = data.ink !== '#ffffff';
  ctx.save();
  ctx.lineWidth = 2;
  for (let x = -H; x < W + H; x += 26) {
    const alpha = Math.max(0, Math.min(1, (x + H / 2) / W)) * 0.09;
    ctx.strokeStyle = dark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + H, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  ctx.restore();

  const ink = data.ink || '#ffffff';
  const soft = data.ink !== '#ffffff' ? 'rgba(0,0,0,0.62)' : 'rgba(255,255,255,0.78)';
  const panel = data.ink !== '#ffffff' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)';
  const pad = 84;
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = soft;
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText(data.date.toUpperCase(), pad, 150);
  ctx.fillStyle = ink;
  ctx.font = `900 168px ${DISPLAY}`;
  narrowText(ctx, data.title.toUpperCase(), pad, 296, W - 2 * pad);

  // Kennzahlen
  const gap = 24;
  const cw = (W - 2 * pad - gap * (data.stats.length - 1)) / data.stats.length;
  data.stats.forEach((s, i) => {
    const x = pad + i * (cw + gap);
    ctx.fillStyle = panel;
    roundRect(ctx, x, 340, cw, 190, 40);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.font = `900 100px ${DISPLAY}`;
    const vw = narrowText(ctx, s.value, x + 30, 446, cw - 60 - (s.unit ? 80 : 0));
    if (s.unit) {
      ctx.fillStyle = soft;
      ctx.font = `600 38px ${FONT}`;
      ctx.fillText(s.unit, x + 30 + vw + 10, 446);
    }
    ctx.fillStyle = soft;
    ctx.font = `500 32px ${FONT}`;
    ctx.fillText(s.label, x + 30, 492);
  });

  // Übungen
  let y = 640;
  const rowH = 92;
  const maxRows = Math.min(data.rows.length, Math.floor((H - 190 - y) / rowH) + 1);
  data.rows.slice(0, maxRows).forEach((r) => {
    ctx.font = `600 40px ${FONT}`;
    const detailW = ctx.measureText(r.detail).width;
    ctx.fillStyle = soft;
    ctx.textAlign = 'right';
    ctx.fillText(r.detail, W - pad, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = ink;
    ctx.font = `600 42px ${FONT}`;
    const nameMax = W - 2 * pad - detailW - 40 - (r.pr ? 96 : 0);
    const name = fit(ctx, r.name, nameMax);
    ctx.fillText(name, pad, y);
    if (r.pr) {
      const nx = pad + ctx.measureText(name).width + 18;
      ctx.fillStyle = '#ffcc33';
      roundRect(ctx, nx, y - 38, 76, 46, 14);
      ctx.fill();
      ctx.fillStyle = '#3a2a00';
      ctx.font = `800 28px ${FONT}`;
      ctx.fillText('PR', nx + 17, y - 5);
    }
    ctx.fillStyle = data.ink !== '#ffffff' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)';
    ctx.fillRect(pad, y + 30, W - 2 * pad, 2);
    y += rowH;
  });
  const hidden = data.rows.length - maxRows;
  if (hidden > 0) {
    ctx.fillStyle = soft;
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText(`+ ${hidden} weitere`, pad, y);
  }

  ctx.fillStyle = soft;
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText(data.footer || 'Gym', pad, H - 76);
  return canvas;
}

// Gibt 'shared', 'saved', 'cancelled' oder 'failed' zurück
export async function shareCard(data, filename = 'training.png') {
  // Die Schrift muss geladen sein, bevor die Zeichenfläche sie benutzt
  try { await document.fonts.load('900 150px "Archivo"'); } catch { /* dann eben die Systemschrift */ }
  const canvas = drawShareCard(data);
  if (!canvas) return 'failed';
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/png'); });
  if (!blob) return 'failed';
  const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      return err?.name === 'AbortError' ? 'cancelled' : 'failed';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}
