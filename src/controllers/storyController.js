import { analyzeAndGenerateStory } from '../services/geminiService.js';
import { saveStory } from '../services/dbService.js';
import {
  localizeStory,
  extractLearningPhrase,
  localizeLearningPhrase,
} from '../services/localizationService.js';

/**
 * Controller: Generate a children's story from a canvas drawing.
 *
 * Expects JSON body:
 *   - image (string, required): base64 data-URL from canvas.toDataURL()
 *   - description (string, optional): text describing the character
 *
 * Returns:
 *   { title, pages, characters, objects, storyId, translations, learningPhrase }
 */
export async function generateStory(req, res) {
  try {
    const { image, description } = req.body;

    // ---- Validation --------------------------------------------------------
    if (!image) {
      return res.status(400).json({
        error: 'Image is required. Send a base64 data-URL from canvas.toDataURL().',
      });
    }

    // ---- Generate the story ------------------------------------------------
    const result = await analyzeAndGenerateStory(image, description);

    // ---- Localize into multiple languages -----------------------------------
    let translations = {};
    let learningPhrase = {};

    try {
      const phrase = extractLearningPhrase(result);
      console.log(`[storyController] Learning phrase: "${phrase}"`);

      // Run story localization and phrase localization in parallel
      const [storyTranslations, phraseTranslations] = await Promise.all([
        localizeStory(result),
        localizeLearningPhrase(phrase),
      ]);

      translations = storyTranslations;
      learningPhrase = phraseTranslations;
      console.log(`[storyController] Localized into ${Object.keys(translations).length} languages`);
    } catch (locErr) {
      // Don't fail the whole request if localization fails
      console.warn('[storyController] Localization failed:', locErr.message);
    }

    // ---- Save to database --------------------------------------------------
    let storyId = null;
    try {
      const saved = await saveStory(result, image, description);
      storyId = saved.id;
      console.log(`[storyController] Story saved with id=${storyId}`);
    } catch (dbErr) {
      // Don't fail the whole request if DB save fails
      console.warn('[storyController] Failed to save story to DB:', dbErr.message);
    }

    // ---- Return the generated story ----------------------------------------
    return res.status(200).json({ ...result, storyId, translations, learningPhrase });
  } catch (error) {
    console.error('[storyController] Error generating story:', error.message);

    return res.status(500).json({
      error: 'Failed to generate story. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

/**
 * Controller: Get all saved stories.
 */
export async function listStories(req, res) {
  try {
    const { getStories } = await import('../services/dbService.js');
    const stories = await getStories();
    return res.status(200).json(stories);
  } catch (error) {
    console.error('[storyController] Error listing stories:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve stories.' });
  }
}
