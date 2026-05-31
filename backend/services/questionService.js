const Groq = require('groq-sdk');
const Session = require('../models/session');
const config = require('../config');
const graphService = require('./graphService');

let groq = null;
try {
  if (config.groqApiKey) {
    groq = new Groq({ apiKey: config.groqApiKey });
    console.log('Groq client initialized for question service');
  } else {
    console.warn('Warning: GROQ_API_KEY not found. Question generation will not work.');
  }
} catch (error) {
  console.error('Failed to initialize Groq client for questions:', error);
}

const questionService = {
  async generateReflexiveQuestions(sessionId, transcriptionText) {
    const startTime = Date.now();
    try {
      console.log(`Starting question generation for session: ${sessionId}`);
      if (!groq) throw new Error('Groq API not configured for question generation.');
      const session = await Session.findById(sessionId).populate('transcriptions').populate('patient').exec(); 
      if (!session) throw new Error('Session not found for question generation');

      const completedTranscriptions = session.transcriptions.filter(t => t.status === 'completed');
      if (!completedTranscriptions || completedTranscriptions.length === 0) throw new Error('No completed transcriptions found');
      const combinedTranscriptionText = completedTranscriptions.map(t => t.transcriptionText).join('\n\n');

      let patientContext = '';
      if (session.patient && session.patient.patientId) {
        patientContext = await graphService.retrievePatientContext(session.patient.patientId);
        console.log(`Retrieved ${patientContext.length > 0 ? 'context' : 'no context'} from KG for RAG.`);
      }

      const clinicalQuestions = await this.generateClinicalQuestions(combinedTranscriptionText, patientContext);
      const followUpQuestions = await this.generateFollowUpQuestions(combinedTranscriptionText, patientContext);
      const differentialQuestions = await this.generateDifferentialQuestions(combinedTranscriptionText, patientContext);

      const processingTime = Date.now() - startTime;
      console.log(`Question generation completed in ${processingTime}ms for session: ${sessionId}`);

      return {
        clinical: clinicalQuestions,
        followUp: followUpQuestions,
        differential: differentialQuestions,
        metadata: {
          model: 'llama-3.3-70b-versatile',
          processingTime,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`Question generation failed:`, error);
      throw error;
    }
  },

  async generateClinicalQuestions(transcriptionText, patientContext = '') {
    const contextSection = patientContext.trim() ? `PATIENT HISTORY CONTEXT (from Knowledge Graph):\n${patientContext}\n\n` : '';
    const prompt = `${contextSection}Based on this medical consultation transcript, and considering the patient's history, generate important clinical questions that should be asked to better understand the patient's *current* condition.
    Return a JSON object with a single field "questions" containing an array of objects.
    Each object in the "questions" array must have fields: question, category, priority (1-5), rationale.
    
    Transcript: ${transcriptionText.substring(0, 3000)}
    
    Response (JSON only):`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(response.choices[0].message.content);
      return parsed.questions || [];
    } catch (error) {
      console.error('Clinical questions generation failed:', error);
      return [{ question: "What other symptoms is the patient experiencing?", category: "symptom_assessment", priority: 3, rationale: "Unable to generate specific questions automatically" }];
    }
  },

  async generateFollowUpQuestions(transcriptionText, patientContext = '') {
    const contextSection = patientContext.trim() ? `PATIENT HISTORY CONTEXT (from Knowledge Graph):\n${patientContext}\n\n` : '';
    const prompt = `${contextSection}Based on this medical consultation, and considering the patient's existing chronic conditions and past treatments, generate important follow-up questions for the patient's next visit or ongoing care.
    Return a JSON object with a single field "questions" containing an array of objects.
    Each object in the "questions" array must have fields: question, category, timeframe, importance.
    
    Transcript: ${transcriptionText.substring(0, 3000)}
    
    Response (JSON only):`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(response.choices[0].message.content);
      return parsed.questions || [];
    } catch (error) {
      console.error('Follow-up questions generation failed:', error);
      return [{ question: "How is the patient responding to the current treatment plan?", category: "treatment_response", timeframe: "short_term", importance: "medium" }];
    }
  },

  async generateDifferentialQuestions(transcriptionText, patientContext = '') {
    const contextSection = patientContext.trim() ? `PATIENT HISTORY CONTEXT (from Knowledge Graph):\n${patientContext}\n\n` : '';
    const prompt = `${contextSection}Based on this medical consultation, and keeping in mind the patient's known diagnoses and past symptoms, generate questions that would help differentiate between possible *new* diagnoses or rule out serious conditions.
    Return a JSON object with a single field "questions" containing an array of objects.
    Each object in the "questions" array must have fields: question, purpose, urgency, diagnostic_value.
    
    Transcript: ${transcriptionText.substring(0, 3000)}
    
    Response (JSON only):`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(response.choices[0].message.content);
      return parsed.questions || [];
    } catch (error) {
      console.error('Differential questions generation failed:', error);
      return [{ question: "Are there any other conditions that could explain these symptoms?", purpose: "Consider alternative diagnoses", urgency: "routine", diagnostic_value: "medium" }];
    }
  },

  async generatePatientEducationQuestions(transcriptionText) {
    const prompt = `Based on this consultation, generate questions that would help educate the patient about their condition and improve their understanding.
    Return a JSON object with a single field "questions" containing an array of objects.
    Each object in the "questions" array must have fields: question, educational_goal, patient_benefit.
    
    Transcript: ${transcriptionText.substring(0, 3000)}
    
    Response (JSON only):`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(response.choices[0].message.content);
      return parsed.questions || [];
    } catch (error) {
      console.error('Patient education questions generation failed:', error);
      return [{ question: "Do you have any questions about your condition or treatment?", educational_goal: "Ensure patient understanding", patient_benefit: "Improved treatment compliance" }];
    }
  }
};

module.exports = questionService;
