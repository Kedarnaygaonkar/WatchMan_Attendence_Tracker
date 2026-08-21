import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface IUser extends Document {
  agency_id?: mongoose.Types.ObjectId; // null for super_admin
  email: string;
  password_hash: string;
  role: 'super_admin' | 'agency_admin' | 'watchman';
  name: string;
  phone?: string;
  is_active: boolean;
  last_login?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency' },
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true, private: true },
    role: {
      type: String,
      enum: ['super_admin', 'agency_admin', 'watchman'],
      required: true,
    },
    name: { type: String, required: true },
    phone: { type: String },
    is_active: { type: Boolean, default: true },
    last_login: { type: Date },
  },
  { timestamps: true }
);

userSchema.plugin(toJSON);

// Indexes
userSchema.index({ agency_id: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
