import { Router } from 'express';
import { generateStory, listStories, getStory, synthesizeAudio, translateStory } from '../controllers/storyController.js';

const router = Router();

/**
 * POST /api/generate-story
 * Body: { image: string, description?: string }
 * Response: { title, pages, characters, objects, storyId }
 */
router.post('/generate-story', generateStory);

/**
 * GET /api/stories
 * Returns all saved stories (most recent first).
 */
router.get('/stories', listStories);

/**
 * GET /api/story/:id
 * Returns a specific story by ID.
 */
router.get('/story/:id', getStory);

/**
 * POST /api/synthesize
 * Body: { text: string, locale: string }
 * Response: { audio: string }
 */
router.post('/synthesize', synthesizeAudio);
router.post('/story/:id/translate', translateStory);

export default router;
