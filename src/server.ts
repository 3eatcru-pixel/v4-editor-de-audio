import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Parse json body parameters for AI post requests
app.use(express.json());

/**
 * Handle Gemini-powered MIDI & step-sequencer pattern composition.
 */
app.post('/api/ai/compose', async (req, res) => {
  try {
    const { prompt, target } = req.body;
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY is not defined in user environments.' });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const userPrompt = typeof prompt === 'string' ? prompt : 'Generate a nice groove';
    const generationTarget = typeof target === 'string' ? target : 'both';

    const systemInstruction = `You are an expert MIDI composer, digital audio workstation beat maker, and electronic music producer.
Your task is to generate beautiful, highly cohesive, rhythmically accurate MIDI note sequences and drum step-sequencer grids based on the user's requested style, genre, or mood.

Timebase and constraints:
- 960 ticks equals 1 quarter note (Beat).
- A 4-bar progression of 16-step grid, where each step is a 1/16th note (240 ticks).
- Map 'pianoNotes' to pitches from C3 (MIDI note 48) up to C4 (MIDI note 60). Make a gorgeous melody or chord progression. Keep startTick and lengthTick aligned to clean multiples of 240 (e.g. 0, 240, 480, 960, 1920) for rhythmic accuracy.
- Map 'sequence' instruments (select from exactly: 'Kick', 'Snare', 'HiHat', 'Clap', 'Bass', 'Synth', 'Pad'). Provide exactly 16 boolean values for each instrument's 'steps' array (index 0 to 15 representing steps). Ensure the steps construct a professional groove matching the genre (e.g., four-on-the-floor kick for house, offbeat hi-hat, backbeat snare or clap on steps 4 and 12).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Create a musical composition with the following guidance: "${userPrompt}" for target: "${generationTarget}".`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bpm: { type: Type.INTEGER, description: 'Recommended tempo for this style (between 60 and 180).' },
            sequence: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  instrument: { type: Type.STRING },
                  steps: {
                    type: Type.ARRAY,
                    items: { type: Type.BOOLEAN }
                  }
                },
                required: ['instrument', 'steps']
              },
              description: 'Exactly 7 rows corresponding to Kick, Snare, HiHat, Clap, Bass, Synth, Pad steps.'
            },
            pianoNotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  note: { type: Type.INTEGER, description: 'MIDI Pitch index from 48 to 60.' },
                  startTick: { type: Type.INTEGER, description: 'Start position in tick count. Multiples of 240.' },
                  lengthTick: { type: Type.INTEGER, description: 'Length/duration of note in tick count (e.g. 240, 480).' },
                  velocity: { type: Type.INTEGER, description: 'Velocity/volume from 60 to 120.' }
                },
                required: ['note', 'startTick', 'lengthTick', 'velocity']
              },
              description: 'Array of melody/chords notes.'
            }
          },
          required: ['sequence', 'pianoNotes']
        }
      }
    });

    if (!response.text) {
      return res.status(500).json({ error: 'Empty response returned from Gemini.' });
    }

    const data = JSON.parse(response.text);
    return res.json(data);
  } catch (error: unknown) {
    console.error('Gemini composition failed:', error);
    const errMessage = error instanceof Error ? error.message : 'AI Generation process error';
    return res.status(500).json({ error: errMessage });
  }
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
