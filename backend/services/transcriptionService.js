const speech = require('@google-cloud/speech');
const fs = require('fs');
const fsp = require('fs').promises;
const config = require('../config');

let speechClient = null;
try {
  if (config.googleCloudKeyFile) {
    speechClient = new speech.SpeechClient({
      keyFilename: config.googleCloudKeyFile,
      projectId: config.googleCloudProjectId
    });
    console.log('Google Cloud Speech client initialized successfully');
  } else {
    console.warn('Warning: GOOGLE_CLOUD_KEY_FILE not found. Transcription will not work.');
  }
} catch (error) {
  console.error('Failed to initialize Google Cloud Speech client:', error);
}

const transcriptionService = {
  async transcribeAudio(audioFilePath, transcriptionId, language = 'en') {
    const startTime = Date.now();
    
    try {
      console.log(`Starting transcription for file: ${audioFilePath} in language: ${language}`);

      if (!speechClient) {
        throw new Error('Google Cloud Speech client not configured.');
      }

      await fsp.stat(audioFilePath);

      const audioBytes = await fsp.readFile(audioFilePath);

      const request = {
        audio: {
          content: audioBytes.toString('base64'),
        },
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: this.getLanguageCode(language),
          alternativeLanguageCodes: this.getAlternativeLanguages(language),
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
          enableSpeakerDiarization: true,
          diarizationSpeakerCount: 2,
          model: 'latest_long',
          useEnhanced: true,
        },
      };

      const [response] = await speechClient.recognize(request);
      
      if (!response.results || response.results.length === 0) {
        throw new Error('No transcription results returned');
      }

      const processingTime = Date.now() - startTime;
      console.log(`Transcription completed in ${processingTime}ms for ID: ${transcriptionId}`);

      const transcriptionText = response.results
        .map(result => result.alternatives[0].transcript)
        .join(' ');

      const segments = this.extractSpeakerSegments(response.results);

      return {
        text: transcriptionText,
        language: response.results[0]?.languageCode || this.getLanguageCode(language),
        segments: segments,
        metadata: {
          model: 'google-speech-to-text',
          processingTime,
          confidence: response.results[0]?.alternatives[0]?.confidence || 0.9,
          speakerCount: segments.length > 0 ? Math.max(...segments.map(s => s.speaker || 0)) + 1 : 1,
          detectedLanguage: response.results[0]?.languageCode,
          requestedLanguage: language
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Transcription failed after ${processingTime}ms:`, error);

      if (error.code) {
        switch (error.code) {
          case 3:
            throw new Error('Invalid audio file format or configuration.');
          case 7:
            throw new Error('Invalid Google Cloud credentials.');
          case 8:
            throw new Error('Google Cloud API quota exceeded.');
          case 13:
            throw new Error('Google Cloud internal error.');
          default:
            throw new Error(`Google Cloud Speech API Error (Code ${error.code}): ${error.message}`);
        }
      }
      
      throw new Error(`Transcription failed: ${error.message}`);
    } finally {
      await this.cleanupAudioFile(audioFilePath);
    }
  },

  extractSpeakerSegments(results) {
    const segments = [];
    
    results.forEach(result => {
      if (result.alternatives && result.alternatives[0]) {
        const alternative = result.alternatives[0];
        
        if (alternative.words) {
          let currentSpeaker = null;
          let currentSegment = {
            text: '',
            startTime: 0,
            endTime: 0,
            speaker: 0
          };
          
          alternative.words.forEach((word, index) => {
            const speakerTag = word.speakerTag || 0;
            
            if (currentSpeaker !== speakerTag) {
              if (currentSegment.text.trim()) {
                segments.push({ ...currentSegment });
              }
              
              currentSpeaker = speakerTag;
              currentSegment = {
                text: word.word,
                startTime: parseFloat(word.startTime?.seconds || 0) + parseFloat(word.startTime?.nanos || 0) / 1e9,
                endTime: parseFloat(word.endTime?.seconds || 0) + parseFloat(word.endTime?.nanos || 0) / 1e9,
                speaker: speakerTag
              };
            } else {
              currentSegment.text += ' ' + word.word;
              currentSegment.endTime = parseFloat(word.endTime?.seconds || 0) + parseFloat(word.endTime?.nanos || 0) / 1e9;
            }
          });
          
          if (currentSegment.text.trim()) {
            segments.push(currentSegment);
          }
        } else {
          segments.push({
            text: alternative.transcript,
            startTime: 0,
            endTime: 0,
            speaker: 0
          });
        }
      }
    });
    
    return segments;
  },

  getLanguageCode(language) {
    const languageMap = {
      'en': 'en-US',
      'hi': 'hi-IN',
      'bn': 'bn-IN',
      'te': 'te-IN',
      'mr': 'mr-IN',
      'ta': 'ta-IN',
      'gu': 'gu-IN',
      'kn': 'kn-IN'
    };
    return languageMap[language] || 'en-US';
  },

  getAlternativeLanguages(language) {
    const alternativeMap = {
      'en': ['en-US', 'en-GB'],
      'hi': ['hi-IN', 'hi'],
      'bn': ['bn-IN', 'bn-BD'],
      'te': ['te-IN'],
      'mr': ['mr-IN'],
      'ta': ['ta-IN', 'ta-LK'],
      'gu': ['gu-IN'],
      'kn': ['kn-IN']
    };
    return alternativeMap[language] || ['en-US'];
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