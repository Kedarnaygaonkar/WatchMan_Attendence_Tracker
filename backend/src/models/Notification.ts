import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface INotification extends Document {
  agency_id?: mongoose.Types.ObjectId;
  user_id?: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  reference_id?: mongoose.Types.ObjectId;
  reference_type?: string;
  is_read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency' },
    user_id: { type: Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    reference_id: { type: Schema.Types.ObjectId },
    reference_type: { type: String },
    is_read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.plugin(toJSON);

// Indexes
notificationSchema.index({ agency_id: 1 });
notificationSchema.index({ user_id: 1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
