import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface IAssignment extends Document {
  agency_id: mongoose.Types.ObjectId;
  watchman_id: mongoose.Types.ObjectId;
  society_id: mongoose.Types.ObjectId;
  shift_id: mongoose.Types.ObjectId;
  start_date: Date;
  end_date?: Date;
  is_active: boolean;
  notes?: string;
  created_by?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<IAssignment>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    watchman_id: { type: Schema.Types.ObjectId, ref: 'Watchman', required: true },
    society_id: { type: Schema.Types.ObjectId, ref: 'Society', required: true },
    shift_id: { type: Schema.Types.ObjectId, ref: 'Shift', required: true },
    start_date: { type: Date, required: true },
    end_date: { type: Date },
    is_active: { type: Boolean, default: true },
    notes: { type: String },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assignmentSchema.plugin(toJSON);

// Indexes
assignmentSchema.index({ agency_id: 1, watchman_id: 1, is_active: 1 }); // Optimized for watchman active assignment queries
assignmentSchema.index({ society_id: 1 });
assignmentSchema.index({ start_date: 1, end_date: 1 });

export const Assignment = mongoose.model<IAssignment>('Assignment', assignmentSchema);
