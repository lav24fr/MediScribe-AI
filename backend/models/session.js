const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: false
  },
  doctorName: {
    type: String,
    required: true,
    trim: true
  },
  doctorId: {
    type: String,
    trim: true
  },
  sessionType: {
    type: String,
    enum: ['consultation', 'follow-up', 'emergency', 'routine-checkup', 'specialist'],
    default: 'consultation'
  },
  department: {
    type: String,
    trim: true
  },
  startTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled', 'paused'],
    default: 'active'
  },
  transcriptions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transcription'
  }],
  summary: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Summary'
  },
  symptoms: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Symptom'
  }],
  diagnosis: [{
    condition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Condition'
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100
    },
    notes: String
  }],
  prescriptions: [{
    medication: String,
    dosage: String,
    frequency: String,
    duration: String,
    instructions: String
  }],
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  notes: {
    type: String,
    trim: true
  },
  metadata: {
    recordingQuality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor']
    },
    backgroundNoise: {
      type: String,
      enum: ['none', 'minimal', 'moderate', 'high']
    },
    speakerCount: Number,
    language: {
      type: String,
      default: 'en'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

sessionSchema.index({ sessionId: 1 });
sessionSchema.index({ patient: 1 });
sessionSchema.index({ doctorId: 1 });
sessionSchema.index({ startTime: -1 });
sessionSchema.index({ status: 1 });

sessionSchema.virtual('calculatedDuration').get(function() {
  if (this.endTime && this.startTime) {
    return Math.round((this.endTime - this.startTime) / (1000 * 60));
  }
  return 0;
});

sessionSchema.pre('save', function(next) {
  if (this.endTime && this.startTime) {
    this.duration = Math.round((this.endTime - this.startTime) / (1000 * 60));
  }
  next();
});

sessionSchema.methods.endSession = function() {
  this.endTime = new Date();
  this.status = 'completed';
  this.duration = Math.round((this.endTime - this.startTime) / (1000 * 60));
  return this.save();
};

sessionSchema.statics.findActiveSessions = function() {
  return this.find({ status: 'active' }).populate('patient').populate('transcriptions');
};

sessionSchema.set('toJSON', {
  virtuals: true
});

module.exports = mongoose.model('Session', sessionSchema);