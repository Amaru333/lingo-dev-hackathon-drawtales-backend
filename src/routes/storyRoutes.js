import { Router } from 'express';
import { generateStory, listStories } from '../controllers/storyController.js';

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

export default router;
