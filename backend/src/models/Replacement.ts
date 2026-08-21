import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface IReplacement extends Document {
  agency_id: mongoose.Types.ObjectId;
  original_watchman_id: mongoose.Types.ObjectId;
  replacement_watchman_id?: mongoose.Types.ObjectId;
  society_id: mongoose.Types.ObjectId;
  shift_id: mongoose.Types.ObjectId;
  original_assignment_id?: mongoose.Types.ObjectId;
  replacement_date: Date;
  reason?: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  created_by?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const replacementSchema = new Schema<IReplacement>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    original_watchman_id: { type: Schema.Types.ObjectId, ref: 'Watchman', required: true },
    replacement_watchman_id: { type: Schema.Types.ObjectId, ref: 'Watchman' },
    society_id: { type: Schema.Types.ObjectId, ref: 'Society', required: true },
    shift_id: { type: Schema.Types.ObjectId, ref: 'Shift', required: true },
    original_assignment_id: { type: Schema.Types.ObjectId, ref: 'Assignment' },
    replacement_date: { type: Date, required: true },
    reason: { type: String },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'cancelled'],
      default: 'pending',
    },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

replacementSchema.plugin(toJSON);

// Indexes
replacementSchema.index({ agency_id: 1 });
replacementSchema.index({ original_watchman_id: 1 });
replacementSchema.index({ replacement_watchman_id: 1 });

export const Replacement = mongoose.model<IReplacement>('Replacement', replacementSchema);
