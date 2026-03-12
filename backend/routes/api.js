const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const transcriptionController = require('../controllers/transcriptionController');
const sessionController = require('../controllers/sessionController');
const summaryController = require('../controllers/summaryController');
const questionController = require('../controllers/questionController');

const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  duration: (process.env.RATE_LIMIT_WINDOW || 15) * 60,
});

const rateLimitMiddleware = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 1,
    });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'audio/wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/webm',
    'audio/ogg'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only audio files are allowed.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
  }
});

router.use(rateLimitMiddleware);

router.get('/health', (req, res) => {
  res.json({ 
    status: 'API OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});


router.post('/transcribe/upload', 
  upload.single('audio'), 
  transcriptionController.uploadAudio
);

router.get('/transcribe/:transcriptionId', 
  transcriptionController.getTranscription
);

router.get('/sessions/:sessionId/transcriptions', 
  transcriptionController.getSessionTranscriptions
);

router.post('/transcribe/stream', 
  transcriptionController.startStreamTranscription
);

router.put('/transcribe/:transcriptionId', 
  transcriptionController.updateTranscription
);

router.delete('/transcribe/:transcriptionId', 
  transcriptionController.deleteTranscription
);

router.post('/sessions', 
  sessionController.createSession
);

router.get('/sessions/:sessionId', 
  sessionController.getSession
);

router.get('/sessions', 
  sessionController.getAllSessions
);

router.put('/sessions/:sessionId', 
  sessionController.updateSession
);

router.patch('/sessions/:sessionId/end', 
  sessionController.endSession
);

router.delete('/sessions/:sessionId', 
  sessionController.deleteSession
);

router.get('/sessions/:sessionId/stats', 
  sessionController.getSessionStats
);

router.post('/sessions/:sessionId/summary', 
  summaryController.generateSummary
);

router.get('/summaries/:summaryId', 
  summaryController.getSummary
);

router.get('/sessions/:sessionId/summary', 
  summaryController.getSessionSummary
);

router.put('/summaries/:summaryId', 
  summaryController.updateSummary
);

router.delete('/summaries/:summaryId', 
  summaryController.deleteSummary
);

router.get('/summaries/:summaryId/export/:format', 
  summaryController.exportSummary
);

router.post('/sessions/:sessionId/questions', 
  questionController.generateQuestions
);

router.post('/sessions/:sessionId/questions/:type', 
  questionController.generateSpecificQuestions
);

router.get('/questions/categories', 
  questionController.getQuestionCategories
);

router.get('/patients/:patientId', 
  async (req, res) => {
    res.json({ 
      message: 'Patient routes not implemented yet',
      patientId: req.params.patientId 
    });
  }
);

router.get('/analytics/transcriptions', 
  async (req, res) => {
    res.json({ 
      message: 'Analytics routes not implemented yet' 
    });
  }
);

router.get('/analytics/usage', 
  async (req, res) => {
    res.json({ 
      message: 'Usage analytics not implemented yet' 
    });
  }
);
          
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'Audio file must be smaller than 50MB'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Unexpected file',
        message: 'Only one audio file is allowed'
      });
    }
  }
  
  if (error.message === 'Invalid file type. Only audio files are allowed.') {
    return res.status(400).json({
      error: 'Invalid file type',
      message: 'Only audio files (WAV, MP3, MP4, M4A, WebM, OGG) are allowed'
    });
  }
  
  next(error);
});

module.exports = router;