/* eslint-disable i18next/no-literal-string */
import { createCanvas, type SKRSContext2D as CanvasRenderingContext2D } from '@napi-rs/canvas';
import type { FootballMatch } from '../../db/schema/footballMatches.js';
import { logger } from '../../utils/logger.js';

export class PredictionImageService {
  private static instance: PredictionImageService;
  private cache = new Map<number, Buffer>();
  private activeGenerations = new Map<number, Promise<Buffer>>();

  private constructor() {}

  public static getInstance(): PredictionImageService {
    if (!PredictionImageService.instance) {
      PredictionImageService.instance = new PredictionImageService();
    }
    return PredictionImageService.instance;
  }

  /**
   * Clears the resolved buffer cache.
   */
  public clearCache(): void {
    this.cache.clear();
    this.activeGenerations.clear();
    logger.info('PredictionImageService', 'Buffer cache cleared.');
  }

  /**
   * Retrieves or generates a match clash card PNG buffer.
   * Utilizes Promise-Coalescing to avoid redundant canvas draw operations.
   */
  public async getClashCardBuffer(match: FootballMatch): Promise<Buffer> {
    const cached = this.cache.get(match.id);
    if (cached) {
      return cached;
    }

    const active = this.activeGenerations.get(match.id);
    if (active) {
      return active;
    }

    // Spawn a coalesced promise to run the Canvas drawing
    const renderPromise = this.drawClashCard(match)
      .then((buf) => {
        this.cache.set(match.id, buf);
        this.activeGenerations.delete(match.id);
        return buf;
      })
      .catch((err) => {
        this.activeGenerations.delete(match.id);
        logger.error('PredictionImageService', `Failed to render clash card for match ${match.id}`, err);
        throw err;
      });

    this.activeGenerations.set(match.id, renderPromise);
    return renderPromise;
  }

  /**
   * Core canvas drawing implementation
   */
  private async drawClashCard(match: FootballMatch): Promise<Buffer> {
    const width = 800;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Draw theme background
    this.drawBackground(ctx, width, height);

    // 2. Draw League Header Banner
    const leagueText = `—   ${match.leagueName.toUpperCase()}   —`;
    this.drawCenteredText(ctx, leagueText, width / 2, 45, width - 200, 20, '#F59E0B', true, 3); // Spacing simulation

    // 3. Draw Versus Element in the Center
    this.drawVS(ctx, width / 2, height / 2 - 20);

    // 4. Draw Home Team (Left Side)
    const homeX = 200;
    const teamY = 170;
    const logoRadius = 70;
    this.drawGlowingRing(ctx, homeX, teamY, logoRadius, match.homeTeamColor, '#FBBF24'); // Default gold
    await this.fetchAndDrawLogo(ctx, match.homeTeamLogo, match.homeTeamName, homeX, teamY, logoRadius, '#EAB308');

    // Dynamic Team Name text
    this.drawCenteredText(ctx, match.homeTeamName, homeX, teamY + logoRadius + 25, 260, 28, '#FFFFFF', true);

    // 5. Draw Away Team (Right Side)
    const awayX = 600;
    this.drawGlowingRing(ctx, awayX, teamY, logoRadius, match.awayTeamColor, '#06B6D4'); // Default cyan
    await this.fetchAndDrawLogo(ctx, match.awayTeamLogo, match.awayTeamName, awayX, teamY, logoRadius, '#06B6D4');

    // Dynamic Team Name text
    this.drawCenteredText(ctx, match.awayTeamName, awayX, teamY + logoRadius + 25, 260, 28, '#FFFFFF', true);

    // 6. Draw Footer Branding / Tu Tien motif
    const footerText = '—   TU TIEN ARCHIVE  •  FOOTBALL PREDICTION EVENT   —';
    this.drawCenteredText(ctx, footerText, width / 2, height - 40, width - 100, 14, '#9CA3AF', false);

    return canvas.toBuffer('image/png');
  }

  /**
   * Draws a rich deep gradient background with traditional ornaments
   */
  private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Radial gradient backing
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      50,
      width / 2,
      height / 2,
      Math.max(width, height) / 2 + 50
    );
    grad.addColorStop(0, '#1E1B4B'); // Deep Indigo
    grad.addColorStop(0.5, '#0B0F19'); // Slate 950
    grad.addColorStop(1, '#030712'); // Gray 950
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Dynamic thin diagonal overlay stripes
    ctx.save();
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.04)';
    ctx.lineWidth = 1.5;
    for (let i = -width; i < width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + height, height);
      ctx.stroke();
    }
    ctx.restore();

    // Chinese/Xianxia corner cloud frames
    this.drawCloudOrnament(ctx, 35, 35, 0);
    this.drawCloudOrnament(ctx, width - 35, 35, Math.PI / 2);
    this.drawCloudOrnament(ctx, width - 35, height - 35, Math.PI);
    this.drawCloudOrnament(ctx, 35, height - 35, (Math.PI * 3) / 2);
  }

  /**
   * Draw glowing neon rings around club logos
   */
  private drawGlowingRing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    colorHex: string | null,
    defaultColor: string
  ): void {
    const rawColor = colorHex ? colorHex.trim().replace('#', '') : '';
    const glowColor = rawColor.length === 6 || rawColor.length === 3 ? `#${rawColor}` : defaultColor;

    ctx.save();
    // Inner thick aura glow
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 25;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Asynchronously fetches a team logo, caching the buffers.
   * Renders a highly elegant vector-like placeholder if loading fails.
   */
  private async fetchAndDrawLogo(
    ctx: CanvasRenderingContext2D,
    logoUrl: string | null,
    teamName: string,
    x: number,
    y: number,
    radius: number,
    fallbackColor: string
  ): Promise<void> {
    let imgLoaded = false;
    if (logoUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout limit
        const res = await fetch(logoUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const { loadImage } = await import('@napi-rs/canvas');
          const img = await loadImage(buffer);

          ctx.save();
          // Clip to circle
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.clip();
          
          // Clear background to clean white first since many football logos have transparent backings
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();

          // Draw the loaded image
          ctx.drawImage(img, x - radius + 8, y - radius + 8, radius * 2 - 16, radius * 2 - 16);
          ctx.restore();
          imgLoaded = true;
        }
      } catch (err: unknown) {
        logger.warn('PredictionImageService', `Failed to load team logo ${logoUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!imgLoaded) {
      // Elegant vector placeholder with dynamic gradients
      ctx.save();
      const grad = ctx.createRadialGradient(x, y, 10, x, y, radius);
      grad.addColorStop(0, fallbackColor);
      grad.addColorStop(1, '#0F172A'); // Deep dark slate
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Team initial letter
      const initial = teamName.trim().charAt(0).toUpperCase();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${Math.floor(radius)}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 5;
      ctx.fillText(initial, x, y);
      ctx.restore();
    }
  }

  /**
   * Draw the visual center neon "VS" separator
   */
  private drawVS(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    ctx.save();
    // Ambient back-glow
    const radialGlow = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, 45);
    radialGlow.addColorStop(0, 'rgba(239, 68, 68, 0.25)'); // Red neon aura
    radialGlow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = radialGlow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bold text draw
    ctx.save();
    const vsGrad = ctx.createLinearGradient(centerX - 25, centerY - 25, centerX + 25, centerY + 25);
    vsGrad.addColorStop(0, '#EF4444');
    vsGrad.addColorStop(0.5, '#F97316');
    vsGrad.addColorStop(1, '#FBBF24');

    ctx.font = 'italic 900 50px "Segoe UI", "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Black stroke shadow outline
    ctx.strokeStyle = '#030712';
    ctx.lineWidth = 8;
    ctx.strokeText('VS', centerX, centerY);

    // Colored gradient fill
    ctx.fillStyle = vsGrad;
    ctx.fillText('VS', centerX, centerY);
    ctx.restore();
  }

  /**
   * Draws a traditional Vietnamese/Chinese ancient cloud scroll ornament
   */
  private drawCloudOrnament(ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Swirling vector coordinates for traditional cloud lines
    ctx.arc(0, 0, 12, Math.PI, Math.PI * 1.5);
    ctx.arc(8, -4, 8, Math.PI * 1.2, Math.PI * 1.8);
    ctx.arc(16, -4, 6, Math.PI * 1.4, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Text helper that scales down font size to prevent name text overflowing
   */
  private drawCenteredText(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    y: number,
    maxW: number,
    baseFontSize: number,
    color: string,
    bold = true,
    letterSpacing = 0
  ): void {
    ctx.save();
    let size = baseFontSize;
    
    // Simulate letter spacing if requested
    const formattedText = letterSpacing > 0 ? text.split('').join('\u200A'.repeat(letterSpacing)) : text;

    ctx.font = `${bold ? 'bold ' : ''}${size}px "Segoe UI", Arial, sans-serif`;
    while (ctx.measureText(formattedText).width > maxW && size > 11) {
      size -= 1;
      ctx.font = `${bold ? 'bold ' : ''}${size}px "Segoe UI", Arial, sans-serif`;
    }

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(formattedText, centerX, y);
    ctx.restore();
  }
}
