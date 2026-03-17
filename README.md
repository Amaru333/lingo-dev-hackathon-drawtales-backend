<p align="center">
  <h1 align="center">DrawTales — Backend</h1>
  <p align="center">AI orchestration engine — turns a child's drawing into a localized, illustrated storybook using five services in a single request</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=flat&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=flat&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Google-Gemini%202.5%20Flash-4285F4?style=flat&logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/AWS-Nova%20Canvas%20%2B%20Polly-FF9900?style=flat&logo=amazonaws&logoColor=white" />
  <img src="https://img.shields.io/badge/Lingo.dev-Localization-7C3AED?style=flat" />
</p>

---

<p align="center">
  <a href="https://github.com/Amaru333/lingo-dev-hackathon-drawtales-frontend">
    <img src="https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=flat&logo=react" />
  </a>
  &nbsp;
  <a href="https://github.com/Amaru333/lingo-dev-hackathon-drawtales-backend">
    <img src="https://img.shields.io/badge/Backend-Node.js%20%2F%20Express-339933?style=flat&logo=node.js" />
  </a>
</p>

| Repository   | Link |
|---|---|
| **Frontend** | [github.com/Amaru333/lingo-dev-hackathon-drawtales-frontend](https://github.com/Amaru333/lingo-dev-hackathon-drawtales-frontend) |
| **Backend**  | [github.com/Amaru333/lingo-dev-hackathon-drawtales-backend](https://github.com/Amaru333/lingo-dev-hackathon-drawtales-backend) |

---

> The AI orchestration engine behind DrawTales. Turns a child's drawing into a localized, illustrated storybook using five services in a single request.

---

## Pipeline architecture

Every story generation request walks through four sequential stages:

```
Child's drawing (base64 PNG)
        │
        ▼
┌─────────────────────────┐
│  1. Gemini 2.5 Flash    │  Vision model — reads the drawing and produces
│     (Google AI)         │  a 2–3 sentence scene description
└────────────┬────────────┘
             │  scene description (text)
             ▼
┌─────────────────────────┐
│  2. Perplexity Sonar    │  Children's book author — writes a structured
│                         │  4-page storybook as JSON (title, pages,
│                         │  imagePrompts, characters, objects)
└────────────┬────────────┘
             │  story JSON
             ▼
┌─────────────────────────┐
│  3. Amazon Nova Canvas  │  Generates a watercolor illustration for each
│     (AWS Bedrock)       │  page from the imagePrompt. Runs sequentially
│                         │  with exponential backoff + content filter
│                         │  fallback to avoid rate limits.
└────────────┬────────────┘
             │  story + base64 illustrations
             ▼
┌─────────────────────────┐
│  4. Lingo.dev SDK       │  On-demand localization of the complete story
│  (localizeObject +      │  JSON into Spanish, French, Hindi, or any
│   localizeText)         │  other requested locale. Also localizes the
│                         │  extracted "Word of the Story" phrase.
└────────────┬────────────┘
             │  translated story
             ▼
┌─────────────────────────┐
│  5. AWS Polly           │  Text-to-speech synthesis for any page in the
│                         │  active language. Neural voices for EN/ES/FR,
│                         │  standard for HI. Auto-discovers voice by
│                         │  locale via DescribeVoices with caching.
└─────────────────────────┘
```

---

## How Lingo.dev is used

The Lingo.dev integration is in `src/services/localizationService.js`. It is **not** translating a static set of UI strings defined at build time. It receives a completely dynamic JSON object assembled from raw AI output and localizes it on the fly.

### Story localization — `lingo.localizeObject()`

The story's title and page texts are flattened into a single object:

```js
const contentToTranslate = {
  title: storyData.title,
  page_0: storyData.pages[0].text,
  page_1: storyData.pages[1].text,
  page_2: storyData.pages[2].text,
  page_3: storyData.pages[3].text,
};
```

This object is passed to `lingo.localizeObject()` with `sourceLocale: 'en'` and the requested `targetLocale`. The translated flat object is then reconstructed back into the story shape. Multiple locales are processed in parallel with `Promise.allSettled`.

### Phrase localization — `lingo.localizeText()`

A key phrase is extracted from the story text (heuristic: a sentence of 10–60 characters from the middle of the story). That phrase is then run through `lingo.localizeText()` per locale to produce the bilingual "Word of the Story" feature.

### On-demand + cached

Translations are only requested when a user selects a language. Once translated, the result is stored back into PostgreSQL with `updateStoryTranslations()`, so the same story is never translated twice for the same locale — saving Lingo.dev API calls and keeping the UX instant on repeat visits.

---

## API routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/generate-story` | Run the full AI pipeline. Returns story + storyId. |
| `GET` | `/api/story/:id` | Fetch a saved story by ID (includes cached translations). |
| `POST` | `/api/story/:id/translate` | On-demand translation for a given story + locale. |
| `POST` | `/api/synthesize` | TTS via AWS Polly. Returns base64 MP3. |
| `GET` | `/api/stories` | List all saved stories. |
| `GET` | `/health` | Health check. |

---

## Project structure

```
src/
├── index.js                      # Express server, CORS, middleware setup
├── routes/
│   └── storyRoutes.js            # Route definitions
├── controllers/
│   └── storyController.js        # Request handlers, orchestration logic
├── services/
│   ├── geminiService.js           # Gemini 2.5 Flash vision + Perplexity Sonar story gen + Bedrock illustration
│   ├── localizationService.js     # Lingo.dev SDK — localizeObject + localizeText
│   ├── pollyService.js            # AWS Polly TTS with voice discovery and caching
│   └── dbService.js               # PostgreSQL — save, fetch, and update stories
└── utils/
    └── imageUtils.js              # Base64 / data-URL helpers
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

```env
PORT=3001

# Google AI (Gemini)
GEMINI_API_KEY=your_gemini_api_key

# Perplexity AI
PERPLEXITY_API_KEY=your_perplexity_api_key

# AWS (Bedrock + Polly)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key

# Lingo.dev
LINGO_DEV_API_KEY=your_lingo_dev_api_key

# PostgreSQL (optional — stories still generate without it, just not saved)
DATABASE_URL=postgresql://user:password@localhost:5432/drawtales
# or use individual vars:
PGHOST=localhost
PGPORT=5432
PGDATABASE=drawtales
PGUSER=your_db_user
PGPASSWORD=your_db_password
```

### 3. Run

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:3001`. The database tables are created automatically on startup if they don't exist.

---

## AWS permissions required

The IAM user or role must have these permissions:

- `bedrock:InvokeModel` on `arn:aws:bedrock:*::foundation-model/amazon.nova-canvas-v1:0`
- `polly:SynthesizeSpeech`
- `polly:DescribeVoices`

---

## Notes on Bedrock image generation

Amazon Nova Canvas has strict content filters and rate limits. The service handles both:

- **Rate limits**: A 2-second base delay between page illustrations, plus exponential backoff (2s, 4s) on failure with up to 3 retries per page.
- **Content filter blocks**: If a prompt is rejected, the next retry automatically substitutes a safe fallback prompt so the story still renders rather than returning a null illustration.

This means a full 4-page story with illustrations takes approximately 30–45 seconds end-to-end.
