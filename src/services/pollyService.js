import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';

/**
 * Map our app's locales to specific high-quality Polly voices.
 */
const VOICE_MAP = {
  en: { voiceId: 'Matthew', engine: 'neural' },
  es: { voiceId: 'Lupe', engine: 'neural' },   // US Spanish
  fr: { voiceId: 'Lea', engine: 'neural' },    // French
  hi: { voiceId: 'Aditi', engine: 'standard' } // Hindi (neural might not be available)
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
 * Synthesize text into speech using AWS Polly and return as base64.
 * 
 * @param {string} text - The text to synthesize
 * @param {string} locale - 'en', 'es', 'fr', 'hi'
 * @returns {Promise<string>} Base64 encoded audio (MP3)
 */
export async function synthesizeTextToAudio(text, locale) {
  if (!text) {
    throw new Error('Text is required for synthesis');
  }

  const client = getPollyClient();
  const voiceConfig = VOICE_MAP[locale] || VOICE_MAP['en'];

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
