import { LingoDotDevEngine } from 'lingo.dev/sdk';

// ---------------------------------------------------------------------------
// Lingo.dev Engine — singleton
// ---------------------------------------------------------------------------

let engine = null;

function getEngine() {
  if (!engine) {
    const apiKey = process.env.LINGO_DEV_API_KEY;
    if (!apiKey) {
      throw new Error('LINGO_DEV_API_KEY is not configured in .env');
    }
    engine = new LingoDotDevEngine({ apiKey });
  }
  return engine;
}

// ---------------------------------------------------------------------------
// Supported locales
// ---------------------------------------------------------------------------

export const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'hi'];
export const TARGET_LOCALES = SUPPORTED_LOCALES.filter((l) => l !== 'en');

export const LOCALE_LABELS = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  hi: 'हिन्दी',
};

// ---------------------------------------------------------------------------
// localizeStory — translate title + page text to target locales
// ---------------------------------------------------------------------------

/**
 * Translate the story's textual content into multiple target languages.
 *
 * @param {{ title: string, pages: Array<{ text: string }> }} storyData
 * @param {string[]} targetLocales  e.g. ['es', 'fr', 'hi']
 * @returns {Promise<Record<string, { title: string, pages: { text: string }[] }>>}
 */
export async function localizeStory(storyData, targetLocales = TARGET_LOCALES) {
  const lingo = getEngine();
  const translations = {};

  // Build a flat content object for efficient translation
  const contentToTranslate = {
    title: storyData.title,
    ...Object.fromEntries(
      storyData.pages.map((page, i) => [`page_${i}`, page.text])
    ),
  };

  // Translate into each target locale (in parallel)
  const results = await Promise.allSettled(
    targetLocales.map(async (locale) => {
      const translated = await lingo.localizeObject(contentToTranslate, {
        sourceLocale: 'en',
        targetLocale: locale,
      });

      // Reconstruct the story shape from the flat translated object
      const pages = storyData.pages.map((_, i) => ({
        text: translated[`page_${i}`] || storyData.pages[i].text,
      }));

      return { locale, data: { title: translated.title, pages } };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      translations[result.value.locale] = result.value.data;
    } else {
      console.warn(
        `[localizationService] Translation failed for locale:`,
        result.reason?.message || result.reason
      );
    }
  }

  return translations;
}

// ---------------------------------------------------------------------------
// extractLearningPhrase — pick a short, interesting phrase for language learning
// ---------------------------------------------------------------------------

/**
 * Extract a key phrase from the story for the "Word of the Story" feature.
 * Picks the most interesting short sentence from the story pages.
 *
 * @param {{ pages: Array<{ text: string }> }} storyData
 * @returns {string} A short phrase in English
 */
export function extractLearningPhrase(storyData) {
  // Collect all sentences from all pages
  const sentences = storyData.pages
    .flatMap((page) =>
      page.text
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 10 && s.length < 60)
    );

  if (sentences.length === 0) {
    return storyData.pages[0]?.text?.split('.')[0]?.trim() || 'Once upon a time';
  }

  // Pick the most interesting sentence (prefer middle of story, moderate length)
  const midIndex = Math.floor(sentences.length / 2);
  return sentences[midIndex];
}

/**
 * Translate the learning phrase into all target locales.
 *
 * @param {string} phrase  The English phrase
 * @param {string[]} targetLocales
 * @returns {Promise<Record<string, string>>}  e.g. { en: "...", es: "...", fr: "...", hi: "..." }
 */
export async function localizeLearningPhrase(phrase, targetLocales = TARGET_LOCALES) {
  const lingo = getEngine();
  const result = { en: phrase };

  const translations = await Promise.allSettled(
    targetLocales.map(async (locale) => {
      const translated = await lingo.localizeText(phrase, {
        sourceLocale: 'en',
        targetLocale: locale,
      });
      return { locale, text: translated };
    })
  );

  for (const t of translations) {
    if (t.status === 'fulfilled') {
      result[t.value.locale] = t.value.text;
    } else {
      console.warn('[localizationService] Phrase translation failed:', t.reason?.message);
    }
  }

  return result;
}
