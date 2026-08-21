import mongoose, { Schema, Document } from 'mongoose';
import { toJSON } from './plugins/toJSON';

export interface IAuditLog extends Document {
  agency_id?: mongoose.Types.ObjectId;
  user_id?: mongoose.Types.ObjectId;
  action: string;
  entity_type: string;
  entity_id?: mongoose.Types.ObjectId;
  old_values?: any;
  new_values?: any;
  ip_address?: string;
  user_agent?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    agency_id: { type: Schema.Types.ObjectId, ref: 'Agency' },
    user_id: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    entity_type: { type: String, required: true },
    entity_id: { type: Schema.Types.ObjectId },
    old_values: { type: Schema.Types.Mixed },
    new_values: { type: Schema.Types.Mixed },
    ip_address: { type: String },
    user_agent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.plugin(toJSON);

// Indexes
auditLogSchema.index({ agency_id: 1 });
auditLogSchema.index({ entity_type: 1, entity_id: 1 });
auditLogSchema.index({ user_id: 1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
