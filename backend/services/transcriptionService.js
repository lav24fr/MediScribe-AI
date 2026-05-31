const Groq = require('groq-sdk');
const fs = require('fs');
const fsp = require('fs').promises;
const config = require('../config');

// Polyfill for File object in Node < 20 (required by Groq SDK for file uploads)
if (typeof File === 'undefined') {
  globalThis.File = require('node:buffer').File;
}

let groq = null;
try {
  if (config.groqApiKey) {
    groq = new Groq({ apiKey: config.groqApiKey });
    console.log('Groq client initialized successfully for transcription');
  } else {
    console.warn('Warning: GROQ_API_KEY not found. Transcription will not work.');
  }
} catch (error) {
  console.error('Failed to initialize Groq client:', error);
}

const transcriptionService = {
  async transcribeAudio(audioFilePath, transcriptionId, language = 'en') {
    const startTime = Date.now();
    
    try {
      console.log(`Starting transcription for file: ${audioFilePath} in language: ${language}`);

      if (!groq) {
        throw new Error('Groq client not configured.');
      }

      await fsp.stat(audioFilePath);

      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-large-v3',
        language: this.getGroqLanguageCode(language),
        response_format: 'verbose_json',
      });
      
      let finalText = transcription.text;
      
      // Post-process with LLM for diarization if it's not a live chunk
      if (!String(transcriptionId).startsWith('live_') && finalText.trim().length > 0) {
        try {
          console.log(`Starting LLM diarization post-processing for ID: ${transcriptionId}`);
          const prompt = `You are an expert medical transcriptionist. The following text is a raw medical consultation transcript without speaker labels.
Please restructure and rewrite the text clearly as a dialogue by identifying the speakers. 
Format the output by prefixing each spoken part with 'Doctor:' or 'Patient:'.

CRITICAL INSTRUCTION: Return ONLY the raw formatted dialogue text. Do NOT include any explanations, notes, thought process, or introductory/concluding text. Do not comment on the conversation. Start immediately with the dialogue.

Transcript: ${finalText}`;
          
          const diarizeResponse = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile',
          });
          
          if (diarizeResponse.choices && diarizeResponse.choices.length > 0) {
            finalText = diarizeResponse.choices[0].message.content;
            console.log(`Diarization completed for ID: ${transcriptionId}`);
          }
        } catch (llmError) {
          console.error(`Diarization failed for ID: ${transcriptionId}, falling back to raw text:`, llmError);
        }
      }

      const processingTime = Date.now() - startTime;
      console.log(`Transcription completed in ${processingTime}ms for ID: ${transcriptionId}`);

      const segments = transcription.segments ? transcription.segments.map(seg => ({
        text: seg.text,
        startTime: seg.start,
        endTime: seg.end,
        speaker: 0 // Whisper doesn't natively do diarization out of the box
      })) : [{
        text: finalText,
        startTime: 0,
        endTime: 0,
        speaker: 0
      }];

      return {
        text: finalText,
        language: transcription.language || this.getGroqLanguageCode(language),
        segments: segments,
        metadata: {
          model: 'whisper-large-v3',
          processingTime,
          confidence: 0.9,
          speakerCount: 1,
          detectedLanguage: transcription.language,
          requestedLanguage: language
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Transcription failed after ${processingTime}ms:`, error);
      throw new Error(`Transcription failed: ${error.message}`);
    } finally {
      await this.cleanupAudioFile(audioFilePath);
    }
  },

  getGroqLanguageCode(language) {
    const languageMap = {
      'en': 'en',
      'hi': 'hi',
      'bn': 'bn',
      'te': 'te',
      'mr': 'mr',
      'ta': 'ta',
      'gu': 'gu',
      'kn': 'kn'
    };
    return languageMap[language] || 'en';
  },

  async cleanupAudioFile(filePath) {
    try {
      await fsp.unlink(filePath);
      console.log(`Cleaned up audio file: ${filePath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`Failed to cleanup audio file: ${filePath}`, error);
      }
    }
  },
  
  async startStreamTranscription(audioStream, sessionId) {
    console.log(`Starting stream transcription for session: ${sessionId}`);
    
    return {
      streamId: `stream_${sessionId}_${Date.now()}`,
      status: 'active',
    };
  },
};

module.exports = transcriptionService;