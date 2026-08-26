declare module "raindrop-fx" {
  export default class RaindropFX {
    options: Record<string, unknown>;
    constructor(options: {
      canvas: HTMLCanvasElement;
      background?: string | HTMLImageElement;
      [key: string]: unknown;
    });
    start(): Promise<void>;
    stop(): void;
    resize(width: number, height: number): void;
    setBackground(background: string | HTMLImageElement): Promise<void>;
  }
}
