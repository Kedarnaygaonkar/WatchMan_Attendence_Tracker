import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface IShift extends Document {
  agency_id: mongoose.Types.ObjectId;
  name: string;
  shift_type: 'day' | 'night' | 'overtime';
  start_time: string; // "HH:MM" (optional/empty for overtime)
  end_time: string;   // "HH:MM" (optional/empty for overtime)
  duration_hours?: number; // for overtime (e.g. 3)
  is_overnight: boolean;
  late_threshold_minutes: number;
  allow_overtime: boolean;
  overtime_hours: number;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const shiftSchema = new Schema<IShift>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    name: { type: String, required: true },
    shift_type: { type: String, enum: ['day', 'night', 'overtime'], default: 'day' },
    start_time: { type: String, default: '' },
    end_time: { type: String, default: '' },
    duration_hours: { type: Number, default: 0 },
    is_overnight: { type: Boolean, default: false },
    late_threshold_minutes: { type: Number, default: 15 },
    allow_overtime: { type: Boolean, default: false },
    overtime_hours: { type: Number, default: 0, min: 0 },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

shiftSchema.plugin(toJSON);

// Indexes
shiftSchema.index({ agency_id: 1 });

export const Shift = mongoose.model<IShift>('Shift', shiftSchema);
