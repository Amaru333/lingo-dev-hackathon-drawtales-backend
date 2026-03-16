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
  // 1. Check our hardcoded cache first for speed on common languages
  if (VOICE_MAP_CACHE[locale]) {
    return VOICE_MAP_CACHE[locale];
  }

  try {
    // 2. We need to format the language code for AWS (they expect things like pt-BR, or en-GB. But also accept just un-prefixed languages)
    const command = new DescribeVoicesCommand({});
    const response = await client.send(command);
    
    const targetLocale = locale.toLowerCase();
    const baseLocale = targetLocale.split('-')[0];

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
      VOICE_MAP_CACHE[locale] = voiceConfig;
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
  const voiceConfig = await getVoiceForLocale(client, locale);

  if (!voiceConfig) {
    throw new Error(`AWS Polly does not support voice synthesis for the language code: ${locale}`);
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
