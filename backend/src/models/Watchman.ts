import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface IWatchman extends Document {
  agency_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  employee_id: string;
  full_name: string;
  phone: string;
  emergency_contact?: string;
  address?: string;
  joining_date?: Date;
  profile_photo_url?: string;
  wing?: string;
  /** 128-element face embedding from face-api.js */
  face_descriptor?: number[];
  /** Whether the watchman has completed face registration */
  face_registered: boolean;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

const watchmanSchema = new Schema<IWatchman>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    employee_id: { type: String, required: true },
    full_name: { type: String, required: true },
    phone: { type: String, required: true },
    emergency_contact: { type: String },
    address: { type: String },
    joining_date: { type: Date },
    profile_photo_url: { type: String },
    wing: { type: String },
    face_descriptor: { type: [Number], default: undefined },
    face_registered: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
    },
  },
  { timestamps: true }
);

watchmanSchema.plugin(toJSON);

// Indexes
watchmanSchema.index({ agency_id: 1, employee_id: 1 }, { unique: true });
watchmanSchema.index({ user_id: 1 });

export const Watchman = mongoose.model<IWatchman>('Watchman', watchmanSchema);
