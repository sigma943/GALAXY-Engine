export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type SceneType = 'galaxy-showcase' | 'planetary-vista' | 'nebula-landscape' | 'deep-space' | 'galaxy-planet' | 'cinematic-space';
export type MeteorIntensity = 'low' | 'normal' | 'high' | 'demo';
export type ObjectKind = 'galaxy' | 'planet' | 'nebula';
export interface Rect { x: number; y: number; width: number; height: number; weight?: number }
export interface AssetVariant { path: string; width: number; height: number; bytes: number }
export interface ImageMetrics { mean: number; contrast: number; detail: number; darkFraction: number; color: number[]; luminance: number[]; histogram: number[] }
export interface AstroAsset {
  id: string; name: string; kind: ObjectKind; subtype: string; source: string; originalUrl: string;
  credit: string; license: string; licenseUrl: string; originalSize: number[]; sha256: string;
  variants: Record<'small' | 'medium' | 'large', AssetVariant>;
  mask: { method: string; edgeAlphaMax: number; approved: boolean; notes: string };
  metrics: ImageMetrics;
}
export interface AssetManifest { version: string; assets: AstroAsset[]; reference: ImageMetrics }
export interface SceneObject {
  assetId: string; kind: ObjectKind; x: number; y: number; size: number; rotation: number;
  brightness: number; depth: number; dominant: boolean;
  blendMode?: 'normal' | 'screen';
}
export interface Star { x: number; y: number; size: number; brightness: number; color: number; phase: number; depth: number }
export const CRITERIA = ['composition','coherence','naturalness','balance','focal','readability','depth','harmony','negativeSpace'] as const;
export type Criterion = typeof CRITERIA[number];
export type Weights = Record<Criterion, number>;
export interface Score { total: number; breakdown: Weights; maximum: Weights; violations: string[]; accepted: boolean; referenceSimilarity: number; preview: { darkFraction: number; contrast: number; mean: number } }
export interface UniverseScene {
  schemaVersion: 1; generatorVersion: string; assetVersion: string; seed: string; type: SceneType;
  aspect: number; objects: SceneObject[]; stars: Star[]; palette: number[]; score: Score;
  config: GeneratorConfig; candidateIndex: number;
}
export interface GeneratorConfig {
  sceneType: SceneType | 'random'; candidates: number; minScore: number; weights: Weights;
  sceneProbabilities: Record<SceneType, number>; safeZones: Rect[]; aspect: number; memoryBudgetMB: number;
  stars: { density: number; brightness: number; glow: number; twinkle: boolean };
  galaxies: { frequency: number; scale: number; brightness: number; preferredTypes: string[] };
  planets: { enabled: boolean; frequency: number; maxSize: number; preferredTypes: string[] };
  nebulae: { enabled: boolean; frequency: number; brightness: number; intensity: number };
}
export type GeneratorPatch = Partial<Omit<GeneratorConfig,'stars'|'galaxies'|'planets'|'nebulae'>> & {
  stars?: Partial<GeneratorConfig['stars']>; galaxies?: Partial<GeneratorConfig['galaxies']>;
  planets?: Partial<GeneratorConfig['planets']>; nebulae?: Partial<GeneratorConfig['nebulae']>;
};
export interface EngineOptions {
  container: HTMLElement; assetBaseUrl?: string; manifest?: AssetManifest; quality?: Quality | 'auto';
  autoGenerate?: boolean; sceneType?: SceneType | 'random'; composition?: {minScore?: number; candidates?: number; weights?: Partial<Weights>};
  generator?: GeneratorPatch; meteors?: {enabled?: boolean; intensity?: MeteorIntensity; safeZones?: Rect[]};
  motion?: {parallax?: boolean; respectReducedMotion?: boolean}; storageKey?: string; forceFallback?: boolean;
}
export interface PerformanceStats {
  fps: number; frameMs: number; cpuSubmitMs: number; renderWidth: number; renderHeight: number;
  textures: number; estimatedTextureMB: number; drawCalls: number | null; quality: Quality;
  renderer: 'webgl2' | 'canvas2d'; gpu: string; adaptive: boolean; generationMs: number;
}
export interface SavedUniverse { id: string; scene: UniverseScene; createdAt: string; rating?: number; rejected?: boolean; thumbnail?: string }
export interface EngineEvents {
  initialized: PerformanceStats; sceneGenerating: {seed: string}; sceneReady: UniverseScene; sceneChanged: UniverseScene;
  qualityChanged: Quality; performanceWarning: string; renderError: Error; contextLost: undefined; contextRestored: undefined;
}
export interface GenerationResult { scene: UniverseScene; candidates: UniverseScene[]; rejected: number; improvements: number }
