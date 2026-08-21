import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface IShift extends Document {
  agency_id: mongoose.Types.ObjectId;
  name: string;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  is_overnight: boolean;
  late_threshold_minutes: number;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const shiftSchema = new Schema<IShift>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    name: { type: String, required: true },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    is_overnight: { type: Boolean, default: false },
    late_threshold_minutes: { type: Number, default: 15 },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

shiftSchema.plugin(toJSON);

// Indexes
shiftSchema.index({ agency_id: 1 });

export const Shift = mongoose.model<IShift>('Shift', shiftSchema);
