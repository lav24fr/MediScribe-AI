const neo4j = require('neo4j-driver');
const config = require('../config');

class GraphService {
  constructor() {
    if (!config.graphDb.uri) {
      console.warn('Neo4j connection not configured.');
      this.driver = null;
      return;
    }
    this.driver = neo4j.driver(
      config.graphDb.uri,
      neo4j.auth.basic(config.graphDb.user, config.graphDb.password)
    );
    this.checkConnection();
  }

  async checkConnection() {
    if (!this.driver) return false;
    try {
      await this.driver.verifyConnectivity();
      console.log('Neo4j connection verified successfully.');
      return true;
    } catch (error) {
      console.error('Neo4j connection failed:', error);
      return false;
    }
  }

  async close() {
    if (this.driver) {
      await this.driver.close();
    }
  }

  async buildKnowledgeGraph(sessionData, patientData, extractedData) {
    if (!this.driver) return;
    const session = this.driver.session();
    try {
      const { sessionId, doctorId, doctorName, patient, startTime } = sessionData;
      const patientId = patientData ? patientData.patientId : null;
      
      const txResult = await session.executeWrite(async tx => {
        const createSession = `
          MERGE (s:Session {sessionId: $sessionId})
          ON CREATE SET s.startTime = $startTime, s.status = 'completed'
          RETURN s
        `;
        await tx.run(createSession, { sessionId, startTime });

        const createDoctor = `
          MERGE (d:Doctor {doctorId: $doctorId})
          ON CREATE SET d.name = $doctorName
          MERGE (d)-[:CONDUCTED]->(s:Session {sessionId: $sessionId})
        `;
        await tx.run(createDoctor, { doctorId, doctorName, sessionId });
        
        if (patientId) {
          const createPatient = `
            MERGE (p:Patient {patientId: $patientId})
            ON CREATE SET p.firstName = $firstName, p.lastName = $lastName
            MERGE (p)-[:HAS_SESSION]->(s:Session {sessionId: $sessionId})
            MERGE (p)-[:CONSULTED]->(d:Doctor {doctorId: $doctorId})
          `;
          await tx.run(createPatient, {
            patientId,
            firstName: patientData.firstName,
            lastName: patientData.lastName,
            sessionId,
            doctorId
          });
        }
        
        for (const diag of extractedData.diagnoses) {
          const createDiagnosis = `
            MERGE (c:Condition {name: $name, icd10Code: $icd10Code})
            MERGE (s:Session {sessionId: $sessionId})-[:DIAGNOSED_WITH {confidence: $confidence}]->(c)
          `;
          await tx.run(createDiagnosis, {
            name: diag.condition,
            icd10Code: diag.icd10Code,
            confidence: diag.confidence,
            sessionId
          });
          if (patientId) {
            const createPatientDiagnosis = `
              MERGE (p:Patient {patientId: $patientId})
              MERGE (c:Condition {name: $name})
              MERGE (p)-[:HAS_DIAGNOSIS]->(c)
            `;
            await tx.run(createPatientDiagnosis, {
              patientId,
              name: diag.condition
            });
          }
        }
        
        for (const symp of extractedData.symptoms) {
          const createSymptom = `
            MERGE (y:Symptom {name: $name})
            MERGE (s:Session {sessionId: $sessionId})-[:NOTED_SYMPTOM]->(y)
          `;
          await tx.run(createSymptom, { name: symp, sessionId });
          if (patientId) {
            const createPatientSymptom = `
              MERGE (p:Patient {patientId: $patientId})
              MERGE (y:Symptom {name: $name})
              MERGE (p)-[:REPORTED_SYMPTOM]->(y)
            `;
            await tx.run(createPatientSymptom, { patientId, name: symp });
          }
        }
      });
      console.log(`Knowledge Graph updated for session ${sessionId}`);
    } catch (error) {
      console.error('Error building knowledge graph:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async retrievePatientContext(patientId) {
    if (!this.driver) return '';
    const session = this.driver.session();
    try {
      const query = `
        MATCH (p:Patient {patientId: $patientId})-[:HAS_SESSION]->(s:Session)
        OPTIONAL MATCH (p)-[:HAS_DIAGNOSIS]->(d:Condition)
        OPTIONAL MATCH (p)-[:REPORTED_SYMPTOM]->(y:Symptom)
        WITH p, collect(s.sessionId) AS sessions, collect(d.name) AS diagnoses, collect(y.name) AS symptoms
        RETURN p, sessions, diagnoses, symptoms
      `;
      const result = await session.run(query, { patientId });
      
      if (result.records.length === 0) {
        return '';
      }
      
      const record = result.records[0];
      const patient = record.get('p').properties;
      const sessions = record.get('sessions');
      const diagnoses = record.get('diagnoses');
      const symptoms = record.get('symptoms');
      
      let context = `Patient History Summary:\n`;
      context += `- Patient Name: ${patient.firstName} ${patient.lastName}\n`;
      context += `- Previous Sessions: ${sessions.join(', ')}\n`;
      context += `- Known Diagnoses: ${diagnoses.join(', ')}\n`;
      context += `- Reported Symptoms: ${symptoms.join(', ')}\n`;
          
      const recentSessionsQuery = `
        MATCH (p:Patient {patientId: $patientId})-[:HAS_SESSION]->(s:Session)
        WITH s ORDER BY s.startTime DESC LIMIT 3
        MATCH (s)-[:DIAGNOSED_WITH]->(c:Condition)
        OPTIONAL MATCH (s)-[:NOTED_SYMPTOM]->(y:Symptom)
        RETURN s.sessionId, s.startTime, collect(DISTINCT c.name) AS diagnoses, collect(DISTINCT y.name) AS symptoms
      `;
      const recentSessionsResult = await session.run(recentSessionsQuery, { patientId });
      
      if (recentSessionsResult.records.length > 0) {
        context += `\nRecent Consultation Details:\n`;
        recentSessionsResult.records.forEach(rec => {
          context += `- Session ID: ${rec.get('s.sessionId')} on ${rec.get('s.startTime')}\n`;
          context += `  - Diagnoses: ${rec.get('diagnoses').join(', ') || 'N/A'}\n`;
          context += `  - Symptoms: ${rec.get('symptoms').join(', ') || 'N/A'}\n`;
        });
      }
      
      return context;

    } catch (error) {
      console.error('Error retrieving patient context from knowledge graph:', error);
      return '';
    } finally {
      await session.close();
    }
  }
}

module.exports = new GraphService();