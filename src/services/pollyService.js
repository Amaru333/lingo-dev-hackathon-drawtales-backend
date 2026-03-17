import { PollyClient, SynthesizeSpeechCommand, DescribeVoicesCommand } from '@aws-sdk/client-polly';

/**
 * Map our app's locales to specific high-quality Polly voices when we know them.
 * This acts as a preferred fallback cache.
 */
const VOICE_MAP_CACHE = {
  en: { voiceId: 'Matthew', engine: 'neural' },
  es: { voiceId: 'Lupe', engine: 'neural' },   // US Spanish
  fr: { voiceId: 'Lea', engine: 'neural' },    // French
  hi: { voiceId: 'Aditi', engine: 'standard' } // Hindi
};

/**
 * Normalize app locales (often BCP-47 like `hi-IN`, `ar-SA`) into a stable
 * Polly lookup key. We prefer base language tags because Polly voice IDs are
 * enough to synthesize, and it avoids dialect mismatches.
 */
function normalizeLocaleForPolly(locale) {
  if (!locale || typeof locale !== 'string') return '';
  const trimmed = locale.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();

  // Special case: if app sends `zh-*`, Polly's language codes are typically `cmn-*`.
  // Keep region/script when provided (e.g. zh-CN -> cmn-cn) for best matching.
  if (lower === 'zh' || lower.startsWith('zh-')) {
    return `cmn${lower.slice(2)}`;
  }

  return lower;
}

/**
 * Initialize the AWS Polly client
 */
function getPollyClient() {
  const region = process.env.AWS_REGION || 'us-east-1';
  
  const clientConfig = { region };

  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return new PollyClient(clientConfig);
}

/**
 * Helper to convert Web Stream (from AWS SDK) to Buffer
 */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Find the best AWS Polly voice for a given locale (e.g. 'kn', 'es-US', 'fr')
 */
async function getVoiceForLocale(client, locale) {
  const normalizedLocale = normalizeLocaleForPolly(locale);
  if (!normalizedLocale) return null;

  // 1. Check our hardcoded cache first for speed on common languages
  if (VOICE_MAP_CACHE[normalizedLocale]) {
    return VOICE_MAP_CACHE[normalizedLocale];
  }
  // Also try base-language cache (e.g. `hi-IN` -> `hi`) so we don't fail on dialect tags.
  const normalizedBaseLocale = normalizedLocale.split('-')[0];
  if (normalizedBaseLocale && VOICE_MAP_CACHE[normalizedBaseLocale]) {
    return VOICE_MAP_CACHE[normalizedBaseLocale];
  }

  try {
    // 2. We need to format the language code for AWS (they expect things like pt-BR, or en-GB. But also accept just un-prefixed languages)
    const command = new DescribeVoicesCommand({});
    const response = await client.send(command);
    
    const targetLocale = normalizedLocale;
    const baseLocale = normalizedBaseLocale;

    // Try finding an exact or dialect match first (e.g. 'es-MX' matches 'es-MX')
    let matchingVoice = response.Voices.find(voice => 
      voice.LanguageCode.toLowerCase() === targetLocale ||
      voice.LanguageCode.toLowerCase().startsWith(targetLocale)
    );

    // Fall back to just matching the base language (e.g. 'ar-BH' falls back to 'ar', which matches 'arb')
    if (!matchingVoice) {
      matchingVoice = response.Voices.find(voice => 
        voice.LanguageCode.toLowerCase().startsWith(baseLocale)
      );
    }

    if (matchingVoice) {
      // Cache it for next time
      const engine = matchingVoice.SupportedEngines.includes('neural') ? 'neural' : 'standard';
      const voiceConfig = { voiceId: matchingVoice.Id, engine };
      VOICE_MAP_CACHE[normalizedLocale] = voiceConfig;
      return voiceConfig;
    }
    
    return null; // No voice found
  } catch (err) {
    console.error(`[pollyService] Failed to describe voices: ${err.message}`);
    return null;
  }
}

/**
 * Synthesize text into speech using AWS Polly and return as base64.
 * 
 * @param {string} text - The text to synthesize
 * @param {string} locale - 'en', 'es', 'fr', 'hi', 'kn', etc
 * @returns {Promise<string>} Base64 encoded audio (MP3)
 */
export async function synthesizeTextToAudio(text, locale) {
  if (!text) {
    throw new Error('Text is required for synthesis');
  }

  const client = getPollyClient();
  const normalizedLocale = normalizeLocaleForPolly(locale);
  const voiceConfig = await getVoiceForLocale(client, normalizedLocale);

  if (!voiceConfig) {
    throw new Error(
      `AWS Polly does not support voice synthesis for the language code: ${locale} (normalized: ${normalizedLocale})`
    );
  }

  try {
    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: voiceConfig.voiceId,
      Engine: voiceConfig.engine
    });

    const response = await client.send(command);
    
    // AWS SDK v3 returns the audio stream in the AudioStream property
    const audioBuffer = await streamToBuffer(response.AudioStream);
    const base64Audio = audioBuffer.toString('base64');
    
    return `data:audio/mp3;base64,${base64Audio}`;
  } catch (error) {
    console.error(`[pollyService] Voice synthesis failed for locale: ${locale}`, error.message);
    throw new Error('Failed to synthesize audio');
  }
}
