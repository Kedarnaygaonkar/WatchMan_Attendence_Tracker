import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface IGate extends Document {
  agency_id: mongoose.Types.ObjectId;
  society_id: mongoose.Types.ObjectId;
  name: string;          // e.g. "Main Gate", "North Entrance"
  qr_token: string;      // UUID embedded in the QR code URL
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const gateSchema = new Schema<IGate>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    society_id: { type: Schema.Types.ObjectId, ref: 'Society', required: true },
    name: { type: String, required: true },
    qr_token: { type: String, required: true, unique: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

gateSchema.plugin(toJSON);

// Indexes
gateSchema.index({ agency_id: 1, society_id: 1 });
gateSchema.index({ qr_token: 1 }, { unique: true });

export const Gate = mongoose.model<IGate>('Gate', gateSchema);
