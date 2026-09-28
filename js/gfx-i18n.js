// Rescue Pins — localized strings for the Settings screen's Graphics controls.
// The rest of the game is English-only; these follow navigator.language.

const EN = {
  settings: 'Settings', back: 'Back', graphics: 'Graphics', display: 'Display',
  quality: 'Quality', auto: 'Auto (detected: {tier})', renderScale: 'Render scale',
  fromPreset: 'From preset ({tier})', adaptive: 'Adaptive resolution', showFps: 'Show frame rate',
  postUnavailable: 'Post-processing is unavailable on this device, so the game renders without it.',
  unknownGpu: 'unknown GPU',
  preset: { low: 'Low', balanced: 'Balanced', high: 'High', ultra: 'Ultra' },
  cat: { shadows: 'Shadows', ao: 'Ambient occlusion', bloom: 'Bloom', grade: 'Color grade',
    antialias: 'Anti-aliasing', reflections: 'Reflections', detail: 'Scene detail', particles: 'Particles' },
  tier: { off: 'Off', on: 'On', low: 'Low', medium: 'Medium', high: 'High', plain: 'Plain', detailed: 'Detailed',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
  summary: { noShadows: 'no shadows', shadows: '{n}² shadows', ao: 'ambient occlusion', aoHigh: 'full ambient occlusion',
    bloom: 'bloom', reflections: 'reflections', particles: 'particles', noAA: 'no anti-aliasing' },
};

const GB = { ...EN, cat: { ...EN.cat, grade: 'Colour grade' } };

const ES = {
  settings: 'Ajustes', back: 'Volver', graphics: 'Gráficos', display: 'Pantalla',
  quality: 'Calidad', auto: 'Automática (detectada: {tier})', renderScale: 'Escala de renderizado',
  fromPreset: 'Según el ajuste ({tier})', adaptive: 'Resolución adaptativa', showFps: 'Mostrar fotogramas por segundo',
  postUnavailable: 'El posprocesado no está disponible en este dispositivo; el juego se muestra sin él.',
  unknownGpu: 'GPU desconocida',
  preset: { low: 'Baja', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra' },
  cat: { shadows: 'Sombras', ao: 'Oclusión ambiental', bloom: 'Resplandor', grade: 'Corrección de color',
    antialias: 'Suavizado de bordes', reflections: 'Reflejos', detail: 'Detalle del escenario', particles: 'Partículas' },
  tier: { off: 'No', on: 'Sí', low: 'Bajo', medium: 'Medio', high: 'Alto', plain: 'Simple', detailed: 'Detallado',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
  summary: { noShadows: 'sin sombras', shadows: 'sombras {n}²', ao: 'oclusión ambiental', aoHigh: 'oclusión ambiental completa',
    bloom: 'resplandor', reflections: 'reflejos', particles: 'partículas', noAA: 'sin suavizado' },
};

const ES_ES = { ...ES, renderScale: 'Escala de renderizado',
  cat: { ...ES.cat, antialias: 'Antialiasing' }, summary: { ...ES.summary, noAA: 'sin antialiasing' } };

const DE = {
  settings: 'Einstellungen', back: 'Zurück', graphics: 'Grafik', display: 'Anzeige',
  quality: 'Qualität', auto: 'Automatisch (erkannt: {tier})', renderScale: 'Renderskalierung',
  fromPreset: 'Laut Voreinstellung ({tier})', adaptive: 'Adaptive Auflösung', showFps: 'Bildrate anzeigen',
  postUnavailable: 'Nachbearbeitung ist auf diesem Gerät nicht verfügbar; das Spiel wird ohne sie dargestellt.',
  unknownGpu: 'unbekannte GPU',
  preset: { low: 'Niedrig', balanced: 'Ausgewogen', high: 'Hoch', ultra: 'Ultra' },
  cat: { shadows: 'Schatten', ao: 'Umgebungsverdeckung', bloom: 'Leuchteffekt', grade: 'Farbkorrektur',
    antialias: 'Kantenglättung', reflections: 'Spiegelungen', detail: 'Szenendetails', particles: 'Partikel' },
  tier: { off: 'Aus', on: 'An', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', plain: 'Schlicht', detailed: 'Detailliert',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
  summary: { noShadows: 'keine Schatten', shadows: '{n}²-Schatten', ao: 'Umgebungsverdeckung', aoHigh: 'volle Umgebungsverdeckung',
    bloom: 'Leuchteffekt', reflections: 'Spiegelungen', particles: 'Partikel', noAA: 'keine Kantenglättung' },
};

const FR = {
  settings: 'Paramètres', back: 'Retour', graphics: 'Graphismes', display: 'Affichage',
  quality: 'Qualité', auto: 'Automatique (détectée : {tier})', renderScale: 'Échelle de rendu',
  fromPreset: 'Selon le préréglage ({tier})', adaptive: 'Résolution adaptative', showFps: 'Afficher les images par seconde',
  postUnavailable: 'Le post-traitement n’est pas disponible sur cet appareil ; le jeu s’affiche sans lui.',
  unknownGpu: 'GPU inconnu',
  preset: { low: 'Basse', balanced: 'Équilibrée', high: 'Haute', ultra: 'Ultra' },
  cat: { shadows: 'Ombres', ao: 'Occlusion ambiante', bloom: 'Halo lumineux', grade: 'Étalonnage des couleurs',
    antialias: 'Anticrénelage', reflections: 'Reflets', detail: 'Détails du décor', particles: 'Particules' },
  tier: { off: 'Désactivé', on: 'Activé', low: 'Bas', medium: 'Moyen', high: 'Élevé', plain: 'Simple', detailed: 'Détaillé',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
  summary: { noShadows: 'sans ombres', shadows: 'ombres {n}²', ao: 'occlusion ambiante', aoHigh: 'occlusion ambiante complète',
    bloom: 'halo', reflections: 'reflets', particles: 'particules', noAA: 'sans anticrénelage' },
};

const FR_CA = { ...FR, cat: { ...FR.cat, bloom: 'Halo lumineux' },
  showFps: 'Afficher la fréquence d’images', tier: { ...FR.tier, off: 'Désactivé', on: 'Activé' } };

const PT = {
  settings: 'Configurações', back: 'Voltar', graphics: 'Gráficos', display: 'Tela',
  quality: 'Qualidade', auto: 'Automática (detectada: {tier})', renderScale: 'Escala de renderização',
  fromPreset: 'Conforme a predefinição ({tier})', adaptive: 'Resolução adaptativa', showFps: 'Mostrar taxa de quadros',
  postUnavailable: 'O pós-processamento não está disponível neste dispositivo; o jogo é exibido sem ele.',
  unknownGpu: 'GPU desconhecida',
  preset: { low: 'Baixa', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra' },
  cat: { shadows: 'Sombras', ao: 'Oclusão ambiente', bloom: 'Brilho', grade: 'Correção de cor',
    antialias: 'Suavização de bordas', reflections: 'Reflexos', detail: 'Detalhes do cenário', particles: 'Partículas' },
  tier: { off: 'Desligado', on: 'Ligado', low: 'Baixo', medium: 'Médio', high: 'Alto', plain: 'Simples', detailed: 'Detalhado',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
  summary: { noShadows: 'sem sombras', shadows: 'sombras {n}²', ao: 'oclusão ambiente', aoHigh: 'oclusão ambiente completa',
    bloom: 'brilho', reflections: 'reflexos', particles: 'partículas', noAA: 'sem suavização' },
};

const IT = {
  settings: 'Impostazioni', back: 'Indietro', graphics: 'Grafica', display: 'Schermo',
  quality: 'Qualità', auto: 'Automatica (rilevata: {tier})', renderScale: 'Scala di rendering',
  fromPreset: 'Dal preset ({tier})', adaptive: 'Risoluzione adattiva', showFps: 'Mostra frame al secondo',
  postUnavailable: 'La post-elaborazione non è disponibile su questo dispositivo; il gioco viene mostrato senza.',
  unknownGpu: 'GPU sconosciuta',
  preset: { low: 'Bassa', balanced: 'Bilanciata', high: 'Alta', ultra: 'Ultra' },
  cat: { shadows: 'Ombre', ao: 'Occlusione ambientale', bloom: 'Bagliore', grade: 'Correzione colore',
    antialias: 'Antialiasing', reflections: 'Riflessi', detail: 'Dettagli della scena', particles: 'Particelle' },
  tier: { off: 'No', on: 'Sì', low: 'Basso', medium: 'Medio', high: 'Alto', plain: 'Semplice', detailed: 'Dettagliato',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
  summary: { noShadows: 'senza ombre', shadows: 'ombre {n}²', ao: 'occlusione ambientale', aoHigh: 'occlusione ambientale completa',
    bloom: 'bagliore', reflections: 'riflessi', particles: 'particelle', noAA: 'senza antialiasing' },
};

export const GFX_STRINGS = {
  'en-US': EN, 'en-GB': GB, 'es-419': ES, 'es-ES': ES_ES, 'de-DE': DE,
  'fr-FR': FR, 'fr-CA': FR_CA, 'pt-BR': PT, 'it-IT': IT,
};

const FALLBACK_BY_LANG = { en: 'en-US', es: 'es-419', de: 'de-DE', fr: 'fr-FR', pt: 'pt-BR', it: 'it-IT' };

/** Pick the closest supported locale for a BCP-47 tag (defaults to en-US). */
export function pickLocale(tag) {
  const t = String(tag || '').replace('_', '-');
  const exact = Object.keys(GFX_STRINGS).find(k => k.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  const lang = t.split('-')[0].toLowerCase();
  if (lang === 'en' && /-(gb|uk|ie|au|nz)$/i.test(t)) return 'en-GB';
  if (lang === 'es' && /-es$/i.test(t)) return 'es-ES';
  if (lang === 'fr' && /-ca$/i.test(t)) return 'fr-CA';
  return FALLBACK_BY_LANG[lang] || 'en-US';
}

export function gfxStrings(tag) {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  return GFX_STRINGS[pickLocale(tag || nav)];
}
