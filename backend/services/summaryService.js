const Groq = require('groq-sdk');
const Session = require('../models/session');
const config = require('../config');
const graphService = require('./graphService');

let groq = null;
try {
  if (config.groqApiKey) {
    groq = new Groq({ apiKey: config.groqApiKey });
    console.log('Groq client initialized successfully for summary service');
  } else {
    console.warn('Warning: GROQ_API_KEY not found. Summary generation will not work.');
  }
} catch (error) {
  console.error('Failed to initialize Groq client:', error);
}

const summaryService = {
  async generateSummary(sessionId, summaryId) {
    const startTime = Date.now();
    try {
      console.log(`Starting summary generation for session: ${sessionId}`);
      const session = await Session.findById(sessionId).populate('transcriptions').populate('patient').exec();
      if (!session) throw new Error('Session not found');
      if (!session.transcriptions || session.transcriptions.length === 0) throw new Error('No transcriptions found for session');
      
      const transcriptionText = session.transcriptions
        .filter(t => t.status === 'completed')
        .map(t => t.transcriptionText)
        .join('\n\n');

      if (!transcriptionText.trim()) throw new Error('No completed transcriptions found');
      
      let patientContext = '';
      if (session.patient && session.patient.patientId) {
        patientContext = await graphService.retrievePatientContext(session.patient.patientId);
        console.log(`Retrieved ${patientContext.length > 0 ? 'context' : 'no context'} from KG for RAG.`);
      }

      const summaryContent = await this.generateStructuredSummary(transcriptionText, session, patientContext);
      const keyPoints = await this.extractKeyPoints(transcriptionText);
      const extractedData = await this.extractMedicalData(transcriptionText);
      const clinicalAlerts = await this.analyzeClinicalAlerts(extractedData.medications, patientContext, extractedData.allergies);
      extractedData.clinicalAlerts = clinicalAlerts;
      const patientSummary = await this.generatePatientSummary(transcriptionText);

      const processingTime = Date.now() - startTime;
      return {
        content: summaryContent,
        keyPoints,
        extractedData,
        patientSummary,
        metadata: {
          model: 'llama-3.3-70b-versatile',
          promptVersion: '1.0',
          processingTime,
          confidence: 85
        }
      };
    } catch (error) {
      console.error(`Summary generation failed:`, error);
      throw error;
    }
  },

  async generateStructuredSummary(transcriptionText, session, patientContext = '') {
    if (!groq) throw new Error('Groq API not configured.');
    const contextSection = patientContext.trim() ? `Patient's Clinical History (from RAG):\n${patientContext}\n\n` : '';
    const prompt = `${contextSection}You are a medical scribe. Create structured clinical documentation from this consultation transcript. Return your response as a valid JSON object with these fields (each field MUST be a plain string, do not use nested objects or arrays):
    - chiefComplaint: Main reason for the visit
    - historyOfPresentIllness: Detailed description of current symptoms
    - assessment: Clinical assessment and findings
    - plan: Treatment plan and next steps

    Transcript: ${transcriptionText.substring(0, 4000)}

    Response (JSON only):`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
      });
      const parsedResult = JSON.parse(response.choices[0].message.content);
      
      return {
        chiefComplaint: parsedResult.chiefComplaint || parsedResult.chief_complaint || '',
        historyOfPresentIllness: parsedResult.historyOfPresentIllness || parsedResult.history_of_present_illness || '',
        assessment: parsedResult.assessment || '',
        plan: parsedResult.plan || ''
      };
    } catch (error) {
      console.error('Structured summary generation failed:', error);
      throw new Error(`Summary generation failed: ${error.message}`);
    }
  },

  async extractKeyPoints(transcriptionText) {
    if (!groq) return [{ category: 'symptom', point: 'Patient presented with main symptoms', confidence: 80 }];
    const prompt = `Extract key medical points from this consultation transcript. 
    Return a JSON object with a single field "points" which is an array of objects.
    Each object in the "points" array must have fields: category, point, confidence.
    Categories MUST be one of: symptom, diagnosis, treatment, followup, medication, other.
    
    Transcript: ${transcriptionText.substring(0, 2000)}
    
    Response (JSON only):`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(response.choices[0].message.content);
      return parsed.points || [];
    } catch (error) {
      console.error('Key points extraction failed:', error);
      return [{ category: 'symptom', point: 'Unable to extract key points automatically', confidence: 0 }];
    }
  },

  async extractMedicalData(transcriptionText) {
    if (!groq) return { symptoms: [], diagnoses: [], medications: [], procedures: [], vitalSigns: {} };
    const prompt = `Extract structured medical data from this consultation transcript.
    Return a JSON object with these arrays of objects: 
    - symptoms: [{ name: string, severity: 'mild'|'moderate'|'severe', duration: string, onset: string }]
    - diagnoses: [{ condition: string, icd10Code: string, confidence: number }]
    - medications: [{ name: string, dosage: string, frequency: string, duration: string, route: string }]
    - procedures: [{ name: string, cptCode: string, description: string }]
    - allergies: [string] (an array of strings representing known patient allergies mentioned)
    Also include a vitalSigns object with any mentioned vital signs (bloodPressure, heartRate, temperature, respiratoryRate, oxygenSaturation, weight, height as strings).
    
    Transcript: ${transcriptionText.substring(0, 2000)}
    
    Response (JSON only):`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
      });
      const parsedData = JSON.parse(response.choices[0].message.content);
      return {
        symptoms: parsedData.symptoms || [],
        diagnoses: parsedData.diagnoses || [],
        medications: parsedData.medications || [],
        procedures: parsedData.procedures || [],
        vitalSigns: parsedData.vitalSigns || {},
        allergies: parsedData.allergies || []
      };
    } catch (error) {
      console.error('Medical data extraction failed:', error);
      return { symptoms: [], diagnoses: [], medications: [], procedures: [], vitalSigns: {}, allergies: [] };
    }
  },

  async analyzeClinicalAlerts(medications, patientContext, currentAllergies = []) {
    if (!groq || !medications || medications.length === 0) return [];
    
    const prompt = `You are a clinical decision support system. Evaluate the following newly prescribed medications against the patient's history AND current session allergies for potential conflicts.
    Patient History (from previous sessions):
    ${patientContext || 'No known patient history.'}
    
    Allergies Reported in Current Session:
    ${currentAllergies.length > 0 ? currentAllergies.join(', ') : 'None reported.'}
    
    Newly Prescribed Medications:
    ${JSON.stringify(medications)}
    
    Return a JSON object with a single field "alerts" containing an array of alert objects.
    If no conflicts, return an empty array.
    Each alert object MUST have:
    - alertType: exactly one of "drug_interaction", "allergy_conflict", or "contraindication"
    - description: string explaining the conflict
    - severity: exactly one of "low", "medium", or "high"
    
    Response (JSON only):`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
      });
      const parsedData = JSON.parse(response.choices[0].message.content);
      return parsedData.alerts || [];
    } catch (error) {
      console.error('Clinical alerts analysis failed:', error);
      return [];
    }
  },

  async generatePatientSummary(transcriptionText) {
    if (!groq) return "We were unable to automatically generate a patient summary at this time.";
    
    const prompt = `You are a helpful, empathetic medical scribe. Based on the following consultation transcript, write a simplified, patient-facing "After-Visit Summary".
    
    CRITICAL INSTRUCTIONS:
    - Write at an 8th-grade reading level.
    - DO NOT use complex medical jargon. If you must use a medical term, explain it simply.
    - Focus on exactly what the patient has, what the plan is, and what they need to do (e.g., "Take this pill twice a day with food", "Rest for 3 days").
    - Keep it concise, friendly, and easy to read (use short paragraphs or bullet points).
    
    Transcript:
    ${transcriptionText.substring(0, 4000)}
    
    Return a JSON object with a single field "patientSummary" containing the text.
    
    Response (JSON only):`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
      });
      const parsedData = JSON.parse(response.choices[0].message.content);
      return parsedData.patientSummary || "";
    } catch (error) {
      console.error('Patient summary generation failed:', error);
      return "An error occurred while generating the patient summary.";
    }
  }
};

module.exports = summaryService;
