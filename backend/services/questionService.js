const { GoogleGenerativeAI } = require('@google/generative-ai');
const Session = require('../models/session');
const config = require('../config');
const graphService = require('./graphService'); 

let genAI = null;
let model = null;
try {
  if (config.geminiApiKey) {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('Google Gemini client initialized for question service');
  } else {
    console.warn('Warning: GEMINI_API_KEY not found. Question generation will not work.');
  }
} catch (error) {
  console.error('Failed to initialize Google Gemini client for questions:', error);
}

const questionService = {
  async generateReflexiveQuestions(sessionId, transcriptionText) {
    const startTime = Date.now();
    
    try {
      console.log(`Starting question generation for session: ${sessionId}`);

      if (!model) {
        throw new Error('Gemini API not configured for question generation.');
      }

      const session = await Session.findById(sessionId)
        .populate('transcriptions')
        .populate('patient')
        .exec(); 
        
      if (!session) {
        throw new Error('Session not found for question generation');
      }

      const completedTranscriptions = session.transcriptions
        .filter(t => t.status === 'completed');
        
      if (!completedTranscriptions || completedTranscriptions.length === 0) {
        throw new Error('No completed transcriptions found');
      }
      
      const combinedTranscriptionText = completedTranscriptions
        .map(t => t.transcriptionText)
        .join('\n\n');


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
          model: 'gemini-1.5-flash',
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
    const contextSection = patientContext.trim() 
      ? `PATIENT HISTORY CONTEXT (from Knowledge Graph):\n${patientContext}\n\n` 
      : '';

    const prompt = `${contextSection}Based on this medical consultation transcript, and considering the patient's history, generate important clinical questions that should be asked to better understand the patient's *current* condition.
...
    Response (JSON array only):`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const jsonText = jsonMatch ? jsonMatch[0] : '[]';
      
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Clinical questions generation failed:', error);
      return [{
        question: "What other symptoms is the patient experiencing?",
        category: "symptom_assessment",
        priority: 3,
        rationale: "Unable to generate specific questions automatically"
      }];
    }
  },

  async generateFollowUpQuestions(transcriptionText, patientContext = '') {
    const contextSection = patientContext.trim() 
      ? `PATIENT HISTORY CONTEXT (from Knowledge Graph):\n${patientContext}\n\n` 
      : '';

    const prompt = `${contextSection}Based on this medical consultation, and considering the patient's existing chronic conditions and past treatments, generate important follow-up questions for the patient's next visit or ongoing care.
...
    Response (JSON array only):`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const jsonText = jsonMatch ? jsonMatch[0] : '[]';
      
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Follow-up questions generation failed:', error);
      return [{
        question: "How is the patient responding to the current treatment plan?",
        category: "treatment_response",
        timeframe: "short_term",
        importance: "medium"
      }];
    }
  },

  async generateDifferentialQuestions(transcriptionText, patientContext = '') {
    const contextSection = patientContext.trim() 
      ? `PATIENT HISTORY CONTEXT (from Knowledge Graph):\n${patientContext}\n\n` 
      : '';

    const prompt = `${contextSection}Based on this medical consultation, and keeping in mind the patient's known diagnoses and past symptoms, generate questions that would help differentiate between possible *new* diagnoses or rule out serious conditions.
...
    Response (JSON array only):`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const jsonText = jsonMatch ? jsonMatch[0] : '[]';
      
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Differential questions generation failed:', error);
      return [{
        question: "Are there any other conditions that could explain these symptoms?",
        purpose: "Consider alternative diagnoses",
        urgency: "routine",
        diagnostic_value: "medium"
      }];
    }
  },

  async generatePatientEducationQuestions(transcriptionText) {
    const prompt = `Based on this consultation, generate questions that would help educate the patient about their condition and improve their understanding.
...
    Response (JSON array only):`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const jsonText = jsonMatch ? jsonMatch[0] : '[]';
      
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Patient education questions generation failed:', error);
      return [{
        question: "Do you have any questions about your condition or treatment?",
        educational_goal: "Ensure patient understanding",
        patient_benefit: "Improved treatment compliance"
      }];
    }
  }
};

module.exports = questionService;
