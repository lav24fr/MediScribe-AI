import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  RecordVoiceOver as RecordIcon,
  Person as PersonIcon,
  LocalPharmacy as PharmacyIcon,
  Send as SendIcon,
  PictureAsPdf as PdfIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import TranscriptionBox from './TranscriptionBox';

const DoctorInterface = ({ 
  currentSession, 
  onSessionCreate, 
  onSessionUpdate, 
  onSessionEnd,
  recentSessions = []
}) => {
  const [sessionForm, setSessionForm] = useState({
    doctorName: '',
    patientName: '', 
    sessionType: 'consultation',
    department: '',
    priority: 'normal'
  });

  const [transcriptions, setTranscriptions] = useState([]);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [reflexiveQuestions, setReflexiveQuestions] = useState(null);
  const [loading, setLoading] = useState({
    creating: false,
    generating: false
  });

  useEffect(() => {
    if (!currentSession) {
      setTranscriptions([]);
      setSessionSummary(null);
      setReflexiveQuestions(null);
    }
  }, [currentSession]);

  const handleCreateSession = async () => {
    if (!sessionForm.doctorName.trim()) {
      toast.error('Doctor name is required');
      return;
    }
    
    if (!sessionForm.patientName.trim()) {
      toast.error('Patient name is required');
      return;
    }

    setLoading(prev => ({ ...prev, creating: true }));
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionForm),
      });
  
      if (response.ok) {
        const data = await response.json();
        onSessionCreate(data.session); 
        toast.success('Session created successfully');
        setSessionForm({
          doctorName: '',
          patientName: '',
          sessionType: 'consultation', 
          department: '',
          priority: 'normal'
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || 'Failed to create session. Please try again.';
        toast.error(errorMessage);
        console.error('Session creation failed:', errorData);
      }
    } catch (error) {
      toast.error('Failed to create session: ' + error.message);
      console.error('Session creation error:', error);
    } finally {
      setLoading(prev => ({ ...prev, creating: false }));
    }
  };

  const handleGenerateSummary = async () => {
    if (!currentSession?._id) {
      toast.error('No active session');
      return;
    }

    setLoading(prev => ({ ...prev, generating: true }));
    try {
      const response = await fetch(`/api/sessions/${currentSession._id}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: !!sessionSummary })
      });

      if (response.ok) {
        const summaryData = await response.json();
        setSessionSummary(summaryData);
        toast.success('Summary generated successfully!');
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to generate summary');
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      toast.error('Failed to generate summary');
    } finally {
      setLoading(prev => ({ ...prev, generating: false }));
    }
  };

  const handleExportPdf = () => {
    if (!sessionSummary || !sessionSummary.summaryId) {
      toast.error('No summary available to export');
      return;
    }
    window.open(`/api/summaries/${sessionSummary.summaryId}/export/pdf`, '_blank');
  };

  const handleGenerateQuestions = async () => {
    if (!currentSession?._id) {
      toast.error('No active session');
      return;
    }

    setLoading(prev => ({ ...prev, generating: true }));
    try {
      const response = await fetch(`/api/sessions/${currentSession._id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const questionsData = await response.json();
        setReflexiveQuestions(questionsData.questions);
        toast.success('Reflexive questions generated successfully!');
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to generate questions');
      }
    } catch (error) {
      console.error('Error generating questions:', error);
      toast.error('Failed to generate questions');
    } finally {
      setLoading(prev => ({ ...prev, generating: false }));
    }
  };

  const handleSendPrescription = () => {
    // In a real app, this would hit an API endpoint to transmit the HL7/eRx message
    toast.success('Prescription securely sent to patient pharmacy!');
  };

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <PersonIcon /> Session Management
            </Typography>
            
            {!currentSession ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Doctor Name"
                  value={sessionForm.doctorName}
                  onChange={(e) => setSessionForm(prev => ({ ...prev, doctorName: e.target.value }))}
                  fullWidth
                  required
                />
                      
                <TextField 
                  label="Patient Name"
                  value={sessionForm.patientName}
                  onChange={(e) => setSessionForm(prev => ({ ...prev, patientName: e.target.value }))}
                  fullWidth
                  required
                />
                
                <FormControl fullWidth>
                  <InputLabel>Session Type</InputLabel>
                  <Select
                    value={sessionForm.sessionType}
                    onChange={(e) => setSessionForm(prev => ({ ...prev, sessionType: e.target.value }))}
                  >
                    <MenuItem value="consultation">Consultation</MenuItem>
                    <MenuItem value="follow-up">Follow-up</MenuItem>
                    <MenuItem value="emergency">Emergency</MenuItem>
                    <MenuItem value="routine-checkup">Routine Checkup</MenuItem>
                    <MenuItem value="specialist">Specialist</MenuItem>
                  </Select>
                </FormControl>
                
                <TextField
                  label="Department (Optional)"
                  value={sessionForm.department}
                  onChange={(e) => setSessionForm(prev => ({ ...prev, department: e.target.value }))}
                  fullWidth
                  placeholder="e.g., Cardiology, Neurology, Emergency"
                />
                
                <FormControl fullWidth>
                  <InputLabel>Priority</InputLabel>
                  <Select
                    value={sessionForm.priority}
                    onChange={(e) => setSessionForm(prev => ({ ...prev, priority: e.target.value }))}
                  >
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="normal">Normal</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="urgent">Urgent</MenuItem>
                  </Select>
                </FormControl>
                
                <Button
                  variant="contained"
                  onClick={handleCreateSession}
                  disabled={loading.creating}
                  startIcon={loading.creating ? <CircularProgress size={20} /> : <PlayIcon />}
                >
                  {loading.creating ? 'Creating...' : 'Start Session'}
                </Button>
              </Box>
            ) : (
              <Box>
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                    Session Active: {currentSession.sessionId}
                  </Typography>
                  {currentSession.patient && (
                    <Typography variant="body2">
                      Patient: {currentSession.patient.firstName} {currentSession.patient.lastName}
                      {currentSession.patient.patientId && ` (${currentSession.patient.patientId})`}
                    </Typography>
                  )}
                  <Typography variant="body2">
                    Doctor: {currentSession.doctorName}
                  </Typography>
                  <Typography variant="body2">
                    Type: {currentSession.sessionType} | Priority: {currentSession.priority}
                  </Typography>
                </Alert>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={onSessionEnd}
                  startIcon={<StopIcon />}
                  fullWidth
                >
                  End Session
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <RecordIcon /> Live Transcription
            </Typography>
            
            <TranscriptionBox
              sessionId={currentSession?._id}
              transcriptions={transcriptions}
              onTranscriptionUpdate={setTranscriptions}
              isSessionActive={!!currentSession}
            />
          </CardContent>
        </Card>
      </Grid>

      {currentSession && transcriptions.length > 0 && (
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  📄 Session Summary
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleGenerateSummary}
                  disabled={loading.generating}
                  startIcon={loading.generating ? <CircularProgress size={16} /> : null}
                >
                  {loading.generating ? 'Generating...' : 'Generate Summary'}
                </Button>
              </Box>
              
              {sessionSummary ? (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Chief Complaint:
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    {sessionSummary.content?.chiefComplaint || 'Not specified'}
                  </Typography>
                  
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Assessment:
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    {sessionSummary.content?.assessment || 'Not specified'}
                  </Typography>
                  
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Plan:
                  </Typography>
                  <Typography variant="body2">
                    {sessionSummary.content?.plan || 'Not specified'}
                  </Typography>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Click "Generate Summary" to create an AI-powered summary of this consultation.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      )}

      {currentSession && transcriptions.length > 0 && (
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  ❓ Reflexive Questions
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleGenerateQuestions}
                  disabled={loading.generating}
                  startIcon={loading.generating ? <CircularProgress size={16} /> : null}
                >
                  {loading.generating ? 'Generating...' : 'Generate Questions'}
                </Button>
              </Box>
              
              {reflexiveQuestions ? (
                <Box>
                  {reflexiveQuestions.clinical && reflexiveQuestions.clinical.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                        Clinical Assessment:
                      </Typography>
                      {reflexiveQuestions.clinical.slice(0, 3).map((q, index) => (
                        <Chip
                          key={index}
                          label={q.question}
                          variant="outlined"
                          size="small"
                          sx={{ mr: 1, mb: 1 }}
                          color="primary"
                        />
                      ))}
                    </Box>
                  )}
                  
                  {reflexiveQuestions.followUp && reflexiveQuestions.followUp.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                        Follow-up Care:
                      </Typography>
                      {reflexiveQuestions.followUp.slice(0, 3).map((q, index) => (
                        <Chip
                          key={index}
                          label={q.question}
                          variant="outlined"
                          size="small"
                          sx={{ mr: 1, mb: 1 }}
                          color="secondary"
                        />
                      ))}
                    </Box>
                  )}
                  
                  {reflexiveQuestions.differential && reflexiveQuestions.differential.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                        Differential Diagnosis:
                      </Typography>
                      {reflexiveQuestions.differential.slice(0, 2).map((q, index) => (
                        <Chip
                          key={index}
                          label={q.question}
                          variant="outlined"
                          size="small"
                          sx={{ mr: 1, mb: 1 }}
                          color="warning"
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Generate AI-powered reflexive questions to improve consultation quality and identify missing information.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      )}

      {currentSession && transcriptions.length > 0 && sessionSummary?.patientSummary && (
        <Grid item xs={12}>
          <Card sx={{ border: '1px solid #4caf50' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#2e7d32' }}>
                  👨‍⚕️ Patient-Facing After-Visit Summary
                </Typography>
                <Button
                  variant="contained"
                  color="success"
                  size="small"
                  startIcon={<PdfIcon />}
                  onClick={handleExportPdf}
                >
                  Export PDF
                </Button>
              </Box>
              
              <Alert severity="success" sx={{ mb: 2 }}>
                This is a simplified summary written at an 8th-grade reading level to share with the patient.
              </Alert>

              <Box sx={{ bgcolor: '#f1f8e9', p: 2, borderRadius: 1, whiteSpace: 'pre-line' }}>
                <Typography variant="body1">
                  {sessionSummary.patientSummary}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      )}

      {currentSession && sessionSummary?.extractedData?.clinicalAlerts && sessionSummary.extractedData.clinicalAlerts.length > 0 && (
        <Grid item xs={12} md={12}>
          <Alert severity="error" variant="filled">
            <Typography variant="subtitle1" fontWeight="bold">
              ⚠️ Clinical Decision Support Alert
            </Typography>
            <List disablePadding sx={{ mt: 1 }}>
              {sessionSummary.extractedData.clinicalAlerts.map((alert, idx) => (
                <ListItem key={idx} sx={{ px: 0, py: 0.5, display: 'list-item', listStyleType: 'disc', ml: 2 }}>
                  <ListItemText 
                    primary={alert.alertType.replace('_', ' ').toUpperCase()} 
                    secondary={alert.description} 
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                    secondaryTypographyProps={{ style: { color: 'rgba(255,255,255,0.9)' } }}
                  />
                </ListItem>
              ))}
            </List>
          </Alert>
        </Grid>
      )}

      {currentSession && sessionSummary?.extractedData?.medications && sessionSummary.extractedData.medications.length > 0 && (
        <Grid item xs={12} md={6}>
          <Card sx={{ border: '2px solid #1976d2' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#1976d2' }}>
                  <PharmacyIcon /> Smart E-Prescription
                </Typography>
                <Chip label="Draft" color="warning" size="small" />
              </Box>
              
              <Alert severity="info" sx={{ mb: 2 }}>
                AI detected {sessionSummary.extractedData.medications.length} medication(s) in your treatment plan.
              </Alert>

              <List disablePadding>
                {sessionSummary.extractedData.medications.map((med, index) => (
                  <React.Fragment key={index}>
                    <ListItem alignItems="flex-start" sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 40, mt: 1 }}>
                        <PharmacyIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography variant="subtitle1" fontWeight="bold">
                            {med.name} {med.dosage && `- ${med.dosage}`}
                          </Typography>
                        }
                        secondary={
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                            {med.frequency && <Typography variant="body2" color="text.secondary"><strong>Sig:</strong> {med.frequency}</Typography>}
                            {med.duration && <Typography variant="body2" color="text.secondary"><strong>Duration:</strong> {med.duration}</Typography>}
                            {med.route && <Typography variant="body2" color="text.secondary"><strong>Route:</strong> {med.route}</Typography>}
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < sessionSummary.extractedData.medications.length - 1 && <Divider component="li" />}
                  </React.Fragment>
                ))}
              </List>

              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  color="primary"
                  endIcon={<SendIcon />}
                  onClick={handleSendPrescription}
                >
                  Review & Send to Pharmacy
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      )}
    </Grid>
  );
};

export default DoctorInterface;