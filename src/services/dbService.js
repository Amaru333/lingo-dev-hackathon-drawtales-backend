import pg from 'pg';

const { Pool } = pg;

let pool = null;

/**
 * Get/create the PostgreSQL connection pool.
 * Reads DATABASE_URL from .env or falls back to individual PG_ vars.
 */
function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (connectionString) {
      pool = new Pool({ connectionString });
    } else {
      pool = new Pool({
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432', 10),
        database: process.env.PG_DATABASE || 'storybook',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
      });
    }
  }
  return pool;
}

/**
 * Initialize the stories table if it doesn't exist.
 */
export async function initDatabase() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS stories (
      id            SERIAL PRIMARY KEY,
      title         TEXT NOT NULL,
      characters    JSONB DEFAULT '[]',
      objects       JSONB DEFAULT '[]',
      pages         JSONB DEFAULT '[]',
      drawing_image TEXT,
      description   TEXT DEFAULT '',
      translations  JSONB DEFAULT '{}',
      learning_phrase JSONB DEFAULT '{}',
      created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Migrate existing tables that might not have the new columns yet
  try {
    await db.query(`ALTER TABLE stories ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}';`);
    await db.query(`ALTER TABLE stories ADD COLUMN IF NOT EXISTS learning_phrase JSONB DEFAULT '{}';`);
  } catch (err) {
    console.warn('Could not alter stories table for translations', err);
  }

  console.log('📦 Database: stories table ready');
}

/**
 * Save a generated story to the database.
 *
 * @param {object} story - The generated story data
 * @param {string} drawingImage - Base64 data-URL of the child's drawing
 * @param {string} description - Text description the child provided
 * @param {object} translations - Localized story objects keyed by locale
 * @param {object} learningPhrase - Localized learning phrase keyed by locale
 * @returns {Promise<object>} The saved story row with its id
 */
export async function saveStory(story, drawingImage = '', description = '', translations = {}, learningPhrase = {}) {
  const db = getPool();

  // We initially stripped base64 illustration data from pages to save space,
  // but we need to keep them so they can be viewed when sharing the story link.
  const pagesForStorage = story.pages.map((p) => ({
    text: p.text,
    imagePrompt: p.imagePrompt,
    illustration: p.illustration,
  }));

  const result = await db.query(
    `INSERT INTO stories (title, characters, objects, pages, drawing_image, description, translations, learning_phrase)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, title, created_at`,
    [
      story.title,
      JSON.stringify(story.characters),
      JSON.stringify(story.objects),
      JSON.stringify(pagesForStorage),
      drawingImage,
      description,
      JSON.stringify(translations),
      JSON.stringify(learningPhrase),
    ]
  );

  return result.rows[0];
}

/**
 * Retrieve all saved stories (most recent first).
 */
export async function getStories(limit = 20) {
  const db = getPool();
  const result = await db.query(
    `SELECT id, title, characters, objects, pages, description, translations, learning_phrase, created_at
     FROM stories
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Retrieve a single story by ID.
 */
export async function getStoryById(id) {
  const db = getPool();
  const result = await db.query(
    `SELECT * FROM stories WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update the translations and learning phrase map of an existing story.
 */
export async function updateStoryTranslations(id, newTranslations, newLearningPhrase) {
  const db = getPool();
  
  const result = await db.query(
    `UPDATE stories 
     SET translations = $1, learning_phrase = $2
     WHERE id = $3
     RETURNING id`,
    [
      JSON.stringify(newTranslations),
      JSON.stringify(newLearningPhrase),
      id
    ]
  );
  return result.rows[0];
}
