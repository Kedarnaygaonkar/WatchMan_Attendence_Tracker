import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface ISociety extends Document {
  agency_id: mongoose.Types.ObjectId;
  name: string;
  address: string;
  contact_person?: string;
  contact_phone?: string;
  latitude: number;
  longitude: number;
  geofence_radius: number;
  required_guards: number;
  is_active: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const societySchema = new Schema<ISociety>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    contact_person: { type: String },
    contact_phone: { type: String },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    geofence_radius: { type: Number, default: 100 },
    required_guards: { type: Number, default: 1 },
    is_active: { type: Boolean, default: true },
    notes: { type: String },
  },
  { timestamps: true }
);

societySchema.plugin(toJSON);

// Indexes
societySchema.index({ agency_id: 1 });

export const Society = mongoose.model<ISociety>('Society', societySchema);
